// SPDX-License-Identifier: AGPL-3.0-only
// Ported from BentoPDF src/js/utils/split-pdf-helpers.ts and src/js/utils/pdf-operations.ts at d6537217e69e1ea9be83648287401f8b56630f51
// Page selection and page overlays of the PDF-Editor: range parser (with open ranges and error reporting),
// split groups, file names, templates; extract pages; text and image overlays on pages (page numbers,
// header and footer, watermark) in IBM Plex Sans, upright on rotated and cropped pages. No DOM; MuPDF is
// passed in by the caller (engine.js). Changes against BentoPDF: open ranges (`8-`, `-3`), invalid parts are
// reported instead of skipped silently, German file names, MuPDF instead of pdf-lib, text in Plex.

import { plexText } from './svg.js';

// ---- page selection -------------------------------------------------------------------------------------

/**
 * Parse `1-3, 5, 8-` (also `-3`, `;` as separator) for a document of `total` pages.
 * Returns { pages: sorted unique indices (0-based), groups: indices per part in input order, errors: parts
 * that are not valid }. An empty input selects every page.
 */
export function parseRanges(input, total) {
  const text = String(input ?? '').trim();
  if (!text) {
    const all = Array.from({ length: total }, (_, i) => i);
    return { pages: all, groups: [all], errors: [] };
  }
  const groups = [];
  const errors = [];
  const set = new Set();
  for (const raw of text.split(/[,;]/)) {
    const part = raw.trim();
    if (!part) continue;
    const m = part.match(/^(\d*)\s*[-–]\s*(\d*)$/);
    let start;
    let end;
    if (m && (m[1] || m[2])) {
      start = m[1] ? Number(m[1]) : 1;
      end = m[2] ? Number(m[2]) : total;
    } else if (/^\d+$/.test(part)) {
      start = end = Number(part);
    } else {
      errors.push(part);
      continue;
    }
    if (start < 1 || end > total || start > end) {
      errors.push(part);
      continue;
    }
    const group = [];
    for (let i = start; i <= end; i++) group.push(i - 1);
    groups.push(group);
    group.forEach((i) => set.add(i));
  }
  return { pages: [...set].sort((a, b) => a - b), groups, errors };
}

/** Groups of `n` pages each (the last may be shorter). */
export function everyN(n, total) {
  const step = Math.max(1, Math.floor(n));
  const groups = [];
  for (let i = 0; i < total; i += step) groups.push(Array.from({ length: Math.min(step, total - i) }, (_, k) => i + k));
  return groups;
}

/** Odd (1, 3, …) or even (2, 4, …) pages. */
export function oddEven(choice, total) {
  return Array.from({ length: total }, (_, i) => i).filter((i) => (choice === 'even' ? (i + 1) % 2 === 0 : (i + 1) % 2 === 1));
}

/** File name of a group of pages: `Plan_Seite-3.pdf`, `Plan_Seiten-1-3.pdf` (range), `Plan_Seiten-1,3,5.pdf` (list). */
export function groupFileName(base, group) {
  const stem = String(base ?? 'Dokument').replace(/\.pdf$/i, '');
  const nums = group.map((i) => i + 1);
  const contiguous = nums.every((n, k) => k === 0 || n === nums[k - 1] + 1);
  if (nums.length === 1) return `${stem}_Seite-${nums[0]}.pdf`;
  return `${stem}_Seiten-${contiguous ? `${nums[0]}-${nums.at(-1)}` : nums.slice(0, 8).join(',') + (nums.length > 8 ? ',…' : '')}.pdf`;
}

/** Placeholders of page numbers, header and footer: {n}, {total}, {datei}, {datum}. */
export function fillTemplate(template, { n, total, datei = '', datum = '' }) {
  return String(template ?? '')
    .replace(/\{n\}/g, String(n))
    .replace(/\{total\}/g, String(total))
    .replace(/\{datei\}/g, datei)
    .replace(/\{datum\}/g, datum);
}

// ---- layout ---------------------------------------------------------------------------------------------

/** Margins of text near the page edge: 4 % of the side, at least 8 pt, at most 40 pt (BentoPDF). */
export function margins(width, height) {
  const m = (side) => Math.max(8, Math.min(40, side * 0.04));
  return { x: m(width), y: m(height) };
}

export const POSITIONS = ['top-left', 'top-center', 'top-right', 'middle-left', 'center', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right'];

/**
 * Top-left corner (visual, y down) of a text box `w` × `h` at a named position on a page `width` × `height`,
 * kept inside the page (BentoPDF's safe margins).
 */
export function placeBox(position, width, height, w, h, margin = margins(width, height)) {
  const mx = Math.max(margin.x, Math.min(w / 2 + 3, width / 2));
  const my = Math.max(margin.y, 3);
  const [v, hz] = position === 'center' ? ['middle', 'center'] : position.split('-');
  const x = hz === 'left' ? mx : hz === 'right' ? width - mx - w : (width - w) / 2;
  const y = v === 'top' ? my : v === 'bottom' ? height - my - h : (height - h) / 2;
  return { x: Math.max(3, Math.min(width - w - 3, x)), y: Math.max(3, Math.min(height - h - 3, y)) };
}

const MAX_TILES = 1500;

/** Centres of a tiled watermark (BentoPDF computeTileCenters): a rotated grid covering the page. */
export function tileCenters({ pageWidth, pageHeight, itemWidth, itemHeight, angle, gapX = 0.25, gapY = 0.75 }) {
  if (!(pageWidth > 0 && pageHeight > 0 && itemWidth > 0 && itemHeight > 0) || !Number.isFinite(angle)) return [];
  const rad = (angle * Math.PI) / 180;
  const [ux, uy, vx, vy] = [Math.cos(rad), Math.sin(rad), -Math.sin(rad), Math.cos(rad)];
  let stepX = Math.max(itemWidth * (1 + Math.max(0, gapX)), 1);
  let stepY = Math.max(itemHeight * (1 + Math.max(0, gapY)), 1);
  const density = (pageWidth * pageHeight) / (stepX * stepY);
  if (density > MAX_TILES) {
    const k = Math.sqrt(density / MAX_TILES);
    stepX *= k;
    stepY *= k;
  }
  const [cx, cy] = [pageWidth / 2, pageHeight / 2];
  const reach = Math.hypot(pageWidth, pageHeight) / 2 + Math.hypot(itemWidth, itemHeight) / 2;
  const hx = (Math.abs(ux) * itemWidth + Math.abs(vx) * itemHeight) / 2;
  const hy = (Math.abs(uy) * itemWidth + Math.abs(vy) * itemHeight) / 2;
  const iMax = Math.ceil(reach / stepX);
  const jMax = Math.ceil(reach / stepY);
  const out = [];
  for (let j = -jMax; j <= jMax; j++) {
    for (let i = -iMax; i <= iMax; i++) {
      const x = cx + i * stepX * ux + j * stepY * vx;
      const y = cy + i * stepX * uy + j * stepY * vy;
      if (x + hx < 0 || x - hx > pageWidth || y + hy < 0 || y - hy > pageHeight) continue;
      out.push({ x, y });
      if (out.length >= MAX_TILES * 2) return out;
    }
  }
  return out;
}

// ---- matrices ---------------------------------------------------------------------------------------------

const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
function invert([a, b, c, d, e, f]) {
  const det = a * d - b * c;
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}
const num = (v) => {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
};
const mat = (m) => m.map(num).join(' ');
const hexColor = (hex) => [1, 3, 5].map((i) => parseInt(String(hex).slice(i, i + 2), 16) / 255 || 0);

// ---- MuPDF: extract, overlays ------------------------------------------------------------------------------

/** A new PDF with the pages `indices` (0-based, in this order) of `src` (bytes or PDFDocument). */
export function extractPages(mupdf, src, indices) {
  const from = src instanceof Uint8Array || src instanceof ArrayBuffer ? new mupdf.PDFDocument(src) : src;
  const doc = new mupdf.PDFDocument();
  indices.forEach((index, at) => doc.graftPage(at, from, index));
  return doc.saveToBuffer('garbage=4,compress').asUint8Array().slice();
}

/**
 * Draws onto pages of an open PDFDocument. `begin(doc)` prepares shared resources; `page(index)` returns an
 * object to add text and images in visual page coordinates (points, origin top left, y down, as the viewer
 * shows the page: rotation and crop box applied).
 */
export function overlayWriter(mupdf, doc, fonts) {
  const plex = fonts ? plexText(mupdf, fonts) : null;
  const fontRefs = {};
  const alphaRefs = new Map();
  const fontRef = (bold) => (fontRefs[bold ? 'F2' : 'F1'] ??= doc.addFont(plex.font(bold ? 'F2' : 'F1')));
  const alphaRef = (a) => {
    const k = num(a);
    if (!alphaRefs.has(k)) {
      const d = doc.newDictionary();
      d.put('Type', doc.newName('ExtGState'));
      d.put('ca', doc.newReal(Number(k)));
      d.put('CA', doc.newReal(Number(k)));
      alphaRefs.set(k, doc.addObject(d));
    }
    return alphaRefs.get(k);
  };
  const measure = (text, size, bold) => plex.encode(text, bold).width * size;
  const images = new Map(); // bytes → image object, once per document
  const imageRef = (bytes) => {
    if (!images.has(bytes)) images.set(bytes, doc.addImage(new mupdf.Image(bytes)));
    return images.get(bytes);
  };

  return {
    measure,
    page(index) {
      const page = doc.loadPage(index);
      const obj = page.getObject();
      const [x0, y0, x1, y1] = page.getBounds();
      const toUser = invert(page.getTransform()); // visual → PDF user space
      const ops = [];
      const res = { Font: {}, ExtGState: {}, XObject: {} };
      let n = 0;
      const alpha = (a) => {
        if (a >= 1) return '';
        const name = `HLKSa${num(a).replace('.', '_')}`;
        res.ExtGState[name] = alphaRef(a);
        return `/${name} gs `;
      };
      return {
        width: x1 - x0,
        height: y1 - y0,
        /** Text with its top-left corner at (x, y), or centred on (x, y) and turned by `angle` degrees (counter-clockwise). */
        text(str, { x, y, size = 10, bold = false, color = '#000000', opacity = 1, angle = 0, center = false }) {
          if (!str) return;
          const { hex, width } = plex.encode(str, bold);
          const name = bold ? 'HLKSF2' : 'HLKSF1';
          res.Font[name] = fontRef(bold);
          const w = width * size;
          const cap = 0.7 * size;
          const rad = (angle * Math.PI) / 180;
          const u = [Math.cos(rad), -Math.sin(rad)]; // baseline direction (visual)
          const up = [-Math.sin(rad), -Math.cos(rad)]; // glyph up (visual)
          let ox;
          let oy;
          if (center) {
            ox = x - (w / 2) * u[0] - (cap / 2) * up[0];
            oy = y - (w / 2) * u[1] - (cap / 2) * up[1];
          } else {
            ox = x;
            oy = y + cap; // baseline below the top edge
          }
          ops.push(`q ${alpha(opacity)}${hexColor(color).map(num).join(' ')} rg BT /${name} ${num(size)} Tf ${mat([u[0], u[1], up[0], up[1], ox, oy])} Tm <${hex}> Tj ET Q`);
        },
        /** An image (bytes) of `w` × `h` points centred on (cx, cy), turned by `angle` degrees. */
        image(bytes, { cx, cy, w, h, angle = 0, opacity = 1 }) {
          const name = `HLKSi${n++}`;
          res.XObject[name] = imageRef(bytes);
          const rad = (angle * Math.PI) / 180;
          const m = mul([1, 0, 0, 1, cx, cy], mul([Math.cos(rad), -Math.sin(rad), Math.sin(rad), Math.cos(rad), 0, 0], [w, 0, 0, -h, -w / 2, h / 2]));
          ops.push(`q ${alpha(opacity)}${mat(m)} cm /${name} Do Q`);
        },
        /** Write the collected drawing into the page (the old content is wrapped in q … Q). */
        done() {
          if (!ops.length) return;
          let resources = obj.getInheritable('Resources');
          if (resources.isNull()) resources = doc.newDictionary();
          else if (!resources.isIndirect()) resources = resources.resolve();
          obj.put('Resources', resources);
          for (const [kind, entries] of Object.entries(res)) {
            const names = Object.keys(entries);
            if (!names.length) continue;
            let dict = resources.get(kind);
            if (dict.isNull()) {
              dict = doc.newDictionary();
              resources.put(kind, dict);
            }
            for (const nm of names) dict.put(nm, entries[nm]);
          }
          const contents = obj.get('Contents');
          const list = doc.newArray();
          list.push(doc.addStream('q\n', doc.newDictionary()));
          if (contents.isArray()) for (let i = 0; i < contents.length; i++) list.push(contents.get(i));
          else if (!contents.isNull()) list.push(contents);
          list.push(doc.addStream(`Q\nq ${mat(toUser)} cm\n${ops.join('\n')}\nQ\n`, doc.newDictionary()));
          obj.put('Contents', list);
        },
      };
    },
  };
}

/** Page numbers: template with {n} and {total}, numbering starts at `start` on the first selected page. */
export function addPageNumbers(mupdf, doc, fonts, { pages, template = '{n}', position = 'bottom-center', start = 1, size = 10, color = '#000000' }) {
  const w = overlayWriter(mupdf, doc, fonts);
  const total = pages.length + start - 1;
  pages.forEach((index, k) => {
    const p = w.page(index);
    const text = fillTemplate(template, { n: start + k, total });
    const box = placeBox(position, p.width, p.height, w.measure(text, size), size);
    p.text(text, { ...box, size, color });
    p.done();
  });
}

/** Header and footer: left, centre and right text with {n}, {total}, {datei}, {datum}. */
export function addHeaderFooter(mupdf, doc, fonts, { pages, slots, size = 9, color = '#000000', datei = '', datum = '' }) {
  const w = overlayWriter(mupdf, doc, fonts);
  const total = doc.countPages();
  for (const index of pages) {
    const p = w.page(index);
    for (const [slot, template] of Object.entries(slots)) {
      const text = fillTemplate(template, { n: index + 1, total, datei, datum });
      if (!text.trim()) continue;
      const pos = { headerLeft: 'top-left', headerCenter: 'top-center', headerRight: 'top-right', footerLeft: 'bottom-left', footerCenter: 'bottom-center', footerRight: 'bottom-right' }[slot];
      if (!pos) continue;
      p.text(text, { ...placeBox(pos, p.width, p.height, w.measure(text, size), size), size, color });
    }
    p.done();
  }
}

/**
 * Watermark: text (Plex semibold) or an image, turned by `angle`, with `opacity`, at a named position or
 * tiled over the page. Image size: `scale` × the page's shorter side.
 */
export function addWatermark(mupdf, doc, fonts, { pages, text = '', image = null, size = 48, color = '#d42a20', opacity = 0.3, angle = 45, position = 'center', tile = false, scale = 0.4 }) {
  const w = overlayWriter(mupdf, doc, fonts);
  let imgSize = null;
  if (image) {
    const im = new mupdf.Image(image);
    imgSize = { iw: im.getWidth(), ih: im.getHeight() };
  }
  for (const index of pages) {
    const p = w.page(index);
    let iw;
    let ih;
    if (image) {
      const k = (Math.min(p.width, p.height) * scale) / Math.max(imgSize.iw, imgSize.ih);
      [iw, ih] = [imgSize.iw * k, imgSize.ih * k];
    } else {
      [iw, ih] = [w.measure(text, size, true), size * 0.7];
    }
    // tileCenters works y up (like the PDF); the page here is y down, so the grid turns the other way
    const centers = tile
      ? tileCenters({ pageWidth: p.width, pageHeight: p.height, itemWidth: iw, itemHeight: ih, angle: -angle })
      : (() => {
          const b = placeBox(position, p.width, p.height, iw, ih);
          return [{ x: b.x + iw / 2, y: b.y + ih / 2 }];
        })();
    for (const c of centers) {
      if (image) p.image(image, { cx: c.x, cy: c.y, w: iw, h: ih, angle, opacity });
      else p.text(text, { x: c.x, y: c.y, size, bold: true, color, opacity, angle, center: true });
    }
    p.done();
  }
}
