// SPDX-License-Identifier: AGPL-3.0-or-later
// Page adjustments of the PDF-Editor on MuPDF.js: crop (crop box by margins, by content or reset) and deskew
// (straighten scanned pages). No DOM: runs in the worker and in the Node tests. The pixel analysis
// (contentBounds, detectSkew) works on plain grey arrays and is tested without MuPDF.

const MM = 72 / 25.4;
/** Smallest page side after cropping (points). */
export const MIN_SIDE = 36;
/** Deskew searches ±MAX_SKEW degrees; smaller angles than MIN_SKEW are left alone. */
export const MAX_SKEW = 10;
export const MIN_SKEW = 0.05;

const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
function invert([a, b, c, d, e, f]) {
  const det = a * d - b * c;
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const num = (v) => {
  const r = Math.round(v * 1e5) / 1e5;
  return Object.is(r, -0) ? '0' : String(r);
};

// ---- pixel analysis (pure) -----------------------------------------------------------------------------

/**
 * The bounding box [x0, y0, x1, y1] (pixels, x1/y1 exclusive) of the pixels darker than `threshold` in a grey
 * image (`pixels` with `stride` bytes per row), or null for a blank page. Single specks are ignored: a row or
 * column counts only with at least `minCount` dark pixels.
 */
export function contentBounds(pixels, width, height, stride = width, { threshold = 240, minCount = 2 } = {}) {
  const rows = new Uint32Array(height);
  const cols = new Uint32Array(width);
  for (let y = 0; y < height; y++) {
    const o = y * stride;
    for (let x = 0; x < width; x++) {
      if (pixels[o + x] < threshold) {
        rows[y]++;
        cols[x]++;
      }
    }
  }
  const first = (a) => a.findIndex((n) => n >= minCount);
  const lastOf = (a) => {
    for (let i = a.length - 1; i >= 0; i--) if (a[i] >= minCount) return i;
    return -1;
  };
  const y0 = first(rows);
  const x0 = first(cols);
  if (y0 < 0 || x0 < 0) return null;
  return [x0, y0, lastOf(cols) + 1, lastOf(rows) + 1];
}

/**
 * The skew of text lines in a grey image, in degrees: positive when the lines fall to the right (the page is
 * turned clockwise as shown). Projection profile: the dark pixels are projected across the line direction for
 * each candidate angle; the sharpest profile (largest sum of squared bin counts) wins. Coarse search in 0.2°
 * steps over ±`max`, then 0.02° around the best. Resolves null when there is too little ink to tell.
 */
export function detectSkew(pixels, width, height, stride = width, { threshold = 128, max = MAX_SKEW, maxPoints = 250000 } = {}) {
  let count = 0;
  for (let y = 0; y < height; y++) {
    const o = y * stride;
    for (let x = 0; x < width; x++) if (pixels[o + x] < threshold) count++;
  }
  if (count < 200 || count > width * height * 0.6) return null; // blank, or a dark photo
  const step = Math.max(1, Math.ceil(count / maxPoints));
  const n = Math.ceil(count / step);
  const xs = new Float32Array(n);
  const ys = new Float32Array(n);
  let k = 0;
  let i = 0;
  for (let y = 0; y < height; y++) {
    const o = y * stride;
    for (let x = 0; x < width; x++) {
      if (pixels[o + x] < threshold && i++ % step === 0 && k < n) {
        xs[k] = x;
        ys[k++] = y;
      }
    }
  }
  const reach = Math.ceil(Math.hypot(width, height));
  const bins = new Uint32Array(2 * reach + 2);
  const score = (deg) => {
    const r = (deg * Math.PI) / 180;
    const s = Math.sin(r);
    const c = Math.cos(r);
    bins.fill(0);
    for (let j = 0; j < k; j++) bins[(ys[j] * c - xs[j] * s + reach) | 0]++;
    let sum = 0;
    for (let j = 0; j < bins.length; j++) sum += bins[j] * bins[j];
    return sum;
  };
  const search = (from, to, by, best) => {
    for (let a = from; a <= to + 1e-9; a += by) {
      const v = score(a);
      if (v > best.v) Object.assign(best, { a, v });
    }
    return best;
  };
  const coarse = search(-max, max, 0.2, { a: 0, v: score(0) });
  const fine = search(coarse.a - 0.2, coarse.a + 0.2, 0.02, { ...coarse });
  return Math.round(fine.a * 100) / 100;
}

// ---- MuPDF ---------------------------------------------------------------------------------------------

/** Render a page grey, at most `maxSide` pixels on its longer side. Resolves { pixels, width, height, stride, scale, x, y }. */
function greyPage(mupdf, page, { maxSide = 1600, dpi = 150, extras = true } = {}) {
  const [x0, y0, x1, y1] = page.getBounds();
  const scale = Math.min(dpi / 72, maxSide / Math.max(1, x1 - x0, y1 - y0));
  const pix = page.toPixmap([scale, 0, 0, scale, 0, 0], mupdf.ColorSpace.DeviceGray, false, extras);
  try {
    return { pixels: pix.getPixels().slice(), width: pix.getWidth(), height: pix.getHeight(), stride: pix.getStride(), scale, x: pix.getX(), y: pix.getY() };
  } finally {
    pix.destroy?.();
  }
}

/** Set the crop box of a page from a rect in visual coordinates (MuPDF maps it to PDF user space). */
function setVisualCrop(page, rect) {
  page.setPageBox('CropBox', rect);
}

/**
 * Crop pages. `mode`: 'margins' (top, right, bottom, left in mm, as the page is shown), 'auto' (to the content,
 * plus `padding` mm) or 'reset' (crop box back to the media box). Resolves the number of changed pages; pages
 * that would get smaller than MIN_SIDE throw `{ code: 'crop', page }`; blank pages stay as they are in 'auto'.
 */
export function cropPages(mupdf, doc, { pages, mode = 'margins', top = 0, right = 0, bottom = 0, left = 0, padding = 3 }, ctx = {}) {
  let changed = 0;
  pages.forEach((index, at) => {
    if (ctx.isCancelled?.()) throw Object.assign(new Error('cancelled'), { code: 'cancelled' });
    ctx.progress?.((at + 1) / pages.length);
    const page = doc.loadPage(index);
    if (mode === 'reset') {
      const obj = page.getObject();
      if (!obj.get('CropBox').isNull()) {
        obj.delete('CropBox');
        changed++;
      }
      return;
    }
    const b = page.getBounds();
    let r;
    if (mode === 'auto') {
      const g = greyPage(mupdf, page);
      const c = contentBounds(g.pixels, g.width, g.height, g.stride);
      if (!c) return;
      const pad = padding * MM;
      const toPt = (v, o) => (v + o) / g.scale;
      r = [toPt(c[0], g.x) - pad, toPt(c[1], g.y) - pad, toPt(c[2], g.x) + pad, toPt(c[3], g.y) + pad];
      r = [Math.max(b[0], r[0]), Math.max(b[1], r[1]), Math.min(b[2], r[2]), Math.min(b[3], r[3])];
      if (r[2] - r[0] < MIN_SIDE || r[3] - r[1] < MIN_SIDE) return; // a speck: leave the page
      if (r.every((v, i) => Math.abs(v - b[i]) < 0.5)) return;
    } else {
      r = [b[0] + left * MM, b[1] + top * MM, b[2] - right * MM, b[3] - bottom * MM];
      if (r[2] - r[0] < MIN_SIDE || r[3] - r[1] < MIN_SIDE) throw Object.assign(new Error('crop'), { code: 'crop', page: index + 1 });
      if (!(left || right || top || bottom)) return;
    }
    setVisualCrop(page, r);
    changed++;
  });
  return changed;
}

/** Turn the page content by `deg` degrees counter-clockwise (as shown) around the page centre. */
export function rotateContent(doc, page, deg) {
  const [x0, y0, x1, y1] = page.getBounds();
  const toUser = invert(page.getTransform());
  const [cx, cy] = apply(toUser, (x0 + x1) / 2, (y0 + y1) / 2);
  const r = (deg * Math.PI) / 180;
  const m = mul([1, 0, 0, 1, cx, cy], mul([Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0], [1, 0, 0, 1, -cx, -cy]));
  const obj = page.getObject();
  const contents = obj.get('Contents');
  const list = doc.newArray();
  list.push(doc.addStream(`q ${m.map(num).join(' ')} cm\n`, doc.newDictionary()));
  if (contents.isArray()) for (let i = 0; i < contents.length; i++) list.push(contents.get(i));
  else if (!contents.isNull()) list.push(contents);
  list.push(doc.addStream('\nQ\n', doc.newDictionary()));
  obj.put('Contents', list);
}

/**
 * Deskew pages: `angle` null detects the skew of each page (detectSkew on the page content without
 * annotations), a number turns every page by it (degrees, positive = counter-clockwise). Resolves
 * { pages: changed count, angles: [{ page, angle }] }.
 */
export function deskewPages(mupdf, doc, { pages, angle = null }, ctx = {}) {
  const angles = [];
  pages.forEach((index, at) => {
    if (ctx.isCancelled?.()) throw Object.assign(new Error('cancelled'), { code: 'cancelled' });
    ctx.progress?.((at + 1) / pages.length);
    const page = doc.loadPage(index);
    let a = angle;
    if (a === null) {
      const g = greyPage(mupdf, page, { extras: false, maxSide: 2000 });
      const skew = detectSkew(g.pixels, g.width, g.height, g.stride);
      if (skew === null || Math.abs(skew) >= MAX_SKEW) return;
      a = skew; // lines falling to the right: turn back counter-clockwise
    }
    if (Math.abs(a) < MIN_SKEW) return;
    rotateContent(doc, page, a);
    angles.push({ page: index + 1, angle: a });
  });
  return { pages: angles.length, angles };
}
