// SPDX-License-Identifier: AGPL-3.0-or-later
// Pages as images and images as pages. No DOM; MuPDF is passed in by the caller (engine.js).

import { groupFileName } from './pages.js';

export const DPI_MIN = 72;
export const DPI_MAX = 600;
/** Largest image per page (pixels); a larger page is rendered with a lower resolution (reported). */
export const MAX_PIXELS = 100e6;
export const PAPER = { A4: [595.28, 841.89], A3: [841.89, 1190.55] };
const MM = 72 / 25.4;

/**
 * Render pages to PNG or JPEG. Returns { files: [{ name, bytes }], reduced: [page numbers rendered below
 * the requested resolution] }. File names: `<base>_Seite-3.png`.
 */
export function renderPages(mupdf, doc, { pages, dpi = 150, format = 'png', quality = 85, base = 'Dokument', isCancelled, progress }) {
  const files = [];
  const reduced = [];
  const d = Math.max(DPI_MIN, Math.min(DPI_MAX, Math.round(dpi)));
  pages.forEach((index, k) => {
    if (isCancelled?.()) throw Object.assign(new Error('cancelled'), { code: 'cancelled' });
    const page = doc.loadPage(index);
    const [x0, y0, x1, y1] = page.getBounds();
    let z = d / 72;
    const px = (x1 - x0) * z * (y1 - y0) * z;
    if (px > MAX_PIXELS) {
      z *= Math.sqrt(MAX_PIXELS / px);
      reduced.push(index + 1);
    }
    // JPEG has no alpha: render on white
    const pix = page.toPixmap(mupdf.Matrix.scale(z, z), mupdf.ColorSpace.DeviceRGB, false, true);
    pix.setResolution(Math.round(z * 72), Math.round(z * 72));
    const bytes = format === 'jpg' ? pix.asJPEG(Math.max(10, Math.min(100, quality))) : pix.asPNG();
    files.push({ name: groupFileName(base, [index]).replace(/\.pdf$/, format === 'jpg' ? '.jpg' : '.png'), bytes: bytes.slice() });
    progress?.((k + 1) / pages.length);
  });
  return { files, reduced };
}

/**
 * Images (PNG / JPEG bytes) as pages. size: 'image' (the image's own size at its resolution, 96 dpi when it
 * has none), 'A4' or 'A3'; orientation: 'auto' (landscape for wide images), 'portrait', 'landscape';
 * marginMm: free border on paper sizes. Returns PDF bytes.
 */
export function imagesToPdf(mupdf, images, { size = 'A4', orientation = 'auto', marginMm = 10 } = {}) {
  const doc = new mupdf.PDFDocument();
  images.forEach((bytes, i) => {
    const img = new mupdf.Image(bytes);
    const [iw, ih] = [img.getWidth(), img.getHeight()];
    const res = (r) => (r > 1 && r < 10000 ? r : 96);
    const natural = [(iw / res(img.getXResolution())) * 72, (ih / res(img.getYResolution())) * 72];
    let pw;
    let ph;
    let box;
    if (size === 'image') {
      [pw, ph] = natural;
      box = [0, 0, pw, ph];
    } else {
      const [a, b] = PAPER[size] ?? PAPER.A4;
      const landscape = orientation === 'landscape' || (orientation === 'auto' && iw > ih);
      [pw, ph] = landscape ? [b, a] : [a, b];
      const m = Math.max(0, Math.min(marginMm * MM, Math.min(pw, ph) / 3));
      const k = Math.min((pw - 2 * m) / iw, (ph - 2 * m) / ih);
      const [w, h] = [iw * k, ih * k];
      box = [(pw - w) / 2, (ph - h) / 2, w, h];
    }
    const res2 = doc.newDictionary();
    const xo = doc.newDictionary();
    xo.put('Im0', doc.addImage(img));
    res2.put('XObject', xo);
    const [x, y, w, h] = box;
    const content = `q ${w} 0 0 ${h} ${x} ${ph - y - h} cm /Im0 Do Q`;
    doc.insertPage(i, doc.addPage([0, 0, pw, ph], 0, res2, content));
  });
  return doc.saveToBuffer('garbage=4,compress').asUint8Array().slice();
}

/** A blank document: one page A4 or A3, portrait or landscape. */
export function blankPdf(mupdf, { size = 'A4', orientation = 'portrait' } = {}) {
  const doc = new mupdf.PDFDocument();
  const [a, b] = PAPER[size] ?? PAPER.A4;
  const [w, h] = orientation === 'landscape' ? [b, a] : [a, b];
  doc.insertPage(0, doc.addPage([0, 0, w, h], 0, doc.newDictionary(), ''));
  return doc.saveToBuffer('garbage=4,compress').asUint8Array().slice();
}
