// SPDX-License-Identifier: AGPL-3.0-or-later
// Flatten and compress. No DOM; MuPDF is passed in by the caller (engine.js).
// Compression: clean up and compress objects (garbage collection, object streams, deflate) and, on request,
// downsample colour and grey images (8 bit) above a resolution to JPEG. Never returns a larger file.

/** Write flags for a compact save. */
export const COMPACT = 'garbage=4,compress,objstms';

/** Flatten annotations and/or form fields into the page content; their look stays, the objects go. */
export function flatten(mupdf, doc, { annotations = true, fields = true } = {}) {
  doc.bake(annotations, fields);
  return doc.saveToBuffer(COMPACT).asUint8Array().slice();
}

/** All image XObjects a page uses directly (name → indirect object), and the page size in inches. */
function pageImages(page) {
  const obj = page.getObject();
  const xobjects = obj.getInheritable('Resources').get('XObject');
  const out = [];
  if (!xobjects.isNull()) {
    xobjects.forEach((ref) => {
      if (ref.isIndirect() && ref.get('Subtype').asName?.() === 'Image') out.push(ref);
    });
  }
  const [x0, y0, x1, y1] = page.getBounds();
  return { refs: out, inches: [(x1 - x0) / 72, (y1 - y0) / 72] };
}

/**
 * Downsample images whose resolution over the page they are on exceeds `dpi` × 1.25. The resolution is
 * estimated against the page size (an image is never larger on the page than the page), so an image is
 * never made coarser than `dpi` where it is shown. 1-bit images (fax, JBIG2) and masks stay as they are.
 * Returns the number of images changed.
 */
export function downsampleImages(mupdf, doc, { dpi = 150, quality = 75, isCancelled } = {}) {
  const best = new Map(); // object number → { ref, needW, needH }
  const n = doc.countPages();
  for (let i = 0; i < n; i++) {
    const page = doc.loadPage(i);
    const { refs, inches } = pageImages(page);
    for (const ref of refs) {
      const key = ref.asIndirect();
      const cur = best.get(key) ?? { ref, maxInches: 0 };
      cur.maxInches = Math.max(cur.maxInches, Math.max(...inches));
      best.set(key, cur);
    }
  }
  let changed = 0;
  for (const { ref, maxInches } of best.values()) {
    if (isCancelled?.()) throw Object.assign(new Error('cancelled'), { code: 'cancelled' });
    const dict = ref.resolve();
    if (dict.get('ImageMask').asBoolean?.() || (dict.get('BitsPerComponent').asNumber?.() ?? 8) < 8) continue;
    let img;
    try {
      img = doc.loadImage(ref);
    } catch {
      continue;
    }
    const [w, h] = [img.getWidth(), img.getHeight()];
    const target = Math.ceil(dpi * maxInches); // pixels along the longer side at most needed
    if (Math.max(w, h) <= target * 1.25) continue;
    const k = target / Math.max(w, h);
    const [tw, th] = [Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))];
    // draw the image into a smaller pixmap (MuPDF filters while scaling)
    const cs = img.getColorSpace();
    const gray = cs && cs.getNumberOfComponents?.() === 1;
    const pix = new mupdf.Pixmap(gray ? mupdf.ColorSpace.DeviceGray : mupdf.ColorSpace.DeviceRGB, [0, 0, tw, th], false);
    pix.clear(255);
    const dev = new mupdf.DrawDevice(mupdf.Matrix.identity, pix);
    dev.fillImage(img, [tw, 0, 0, th, 0, 0], 1);
    dev.close();
    const jpeg = pix.asJPEG(quality);
    const smask = dict.get('SMask');
    const freshRef = doc.addImage(new mupdf.Image(jpeg));
    const fresh = freshRef.resolve();
    if (!smask.isNull()) fresh.put('SMask', smask); // keep transparency (the mask itself is not resized)
    // the image keeps its object number, so every page that uses it gets the smaller one
    ref.writeObject(fresh);
    ref.writeRawStream(freshRef.readRawStream());
    changed++;
  }
  return changed;
}

/**
 * Compress `bytes`. options: { dpi: null (no image change) | 150 | 200 | 300, quality }. Returns
 * { bytes, before, after, images, smaller }: the original bytes when the result is not smaller.
 */
export function compressPdf(mupdf, bytes, { dpi = null, quality = 75, password, isCancelled } = {}) {
  const doc = new mupdf.PDFDocument(bytes);
  if (doc.needsPassword() && !(password && doc.authenticatePassword(password))) throw Object.assign(new Error('password'), { code: 'password' });
  const images = dpi ? downsampleImages(mupdf, doc, { dpi, quality, isCancelled }) : 0;
  const out = doc.saveToBuffer(COMPACT).asUint8Array().slice();
  const smaller = out.length < bytes.length;
  return { bytes: smaller ? out : bytes, before: bytes.length, after: smaller ? out.length : bytes.length, images, smaller };
}
