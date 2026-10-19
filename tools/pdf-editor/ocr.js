// SPDX-License-Identifier: AGPL-3.0-only
// Ported from BentoPDF src/js/utils/hocr-transform.ts and src/js/utils/ocr.ts at d6537217e69e1ea9be83648287401f8b56630f51
// OCR of the PDF-Editor: pages without text (or chosen pages) are rendered by MuPDF at 300 dpi, read by
// tesseract.js (deu+eng, LSTM) and get an invisible text layer (render mode 3, IBM Plex Sans, each word
// stretched to its box), so search, selection and highlight work on scans. No DOM: runs in the editor's
// worker and in Node tests. Changes against BentoPDF: hOCR read with regular expressions (a worker has no
// DOMParser), MuPDF instead of pdf.js and pdf-lib, horizontal scaling (Tz) instead of a fitted font size,
// the layer is added to the existing pages (no copy into a new file), rotated pages and vertical lines.

import { overlayWriter } from './pages.js';

export const OCR_DPI = 300;
export const OCR_LANGS = 'deu+eng';
/** Pages larger than this at 300 dpi are rendered smaller (tesseract's memory in the browser). */
const MAX_PIXELS = 40e6;
/** tesseract page segmentation: automatic (3), like the tesseract command line; plans and letters both work. */
const PSM_AUTO = '3';

// ---- hOCR ---------------------------------------------------------------------------------------------------

const NUM = '(-?\\d+(?:\\.\\d+)?)';
const BBOX = new RegExp(`bbox\\s+${NUM}\\s+${NUM}\\s+${NUM}\\s+${NUM}`);
const BASELINE = /baseline\s+([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)/;
const TEXTANGLE = /textangle\s+([-+]?\d*\.?\d+)/;
const LINE_CLASSES = new Set(['ocr_line', 'ocr_textfloat', 'ocr_header', 'ocr_caption']);
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

const bbox = (title) => {
  const m = title.match(BBOX);
  return m ? { x0: +m[1], y0: +m[2], x1: +m[3], y1: +m[4] } : null;
};
const decode = (s) =>
  s
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) =>
      e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENTITIES[e.toLowerCase()] ?? m),
    )
    .normalize('NFKC')
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .trim();

/**
 * Lines and words of one hOCR page, in image pixels (origin top left, y down):
 * { width, height, lines: [{ bbox, baseline: { slope, intercept }, angle, words: [{ text, bbox, conf }] }] }.
 */
export function parseHocr(hocr) {
  const page = { width: 0, height: 0, lines: [] };
  let line = null;
  const open = /<(\w+)\b([^>]*)>/g;
  for (let m; (m = open.exec(hocr)); ) {
    const attrs = m[2];
    const cls = attrs.match(/class=(['"])(.*?)\1/)?.[2].split(/\s+/) ?? [];
    const title = attrs.match(/title=(['"])(.*?)\1/)?.[2] ?? '';
    if (cls.includes('ocr_page')) {
      const b = bbox(title);
      if (b) [page.width, page.height] = [b.x1 - b.x0, b.y1 - b.y0];
    } else if (cls.some((c) => LINE_CLASSES.has(c))) {
      const b = bbox(title);
      if (!b) continue;
      const base = title.match(BASELINE);
      line = { bbox: b, baseline: { slope: base ? +base[1] || 0 : 0, intercept: base ? +base[2] || 0 : 0 }, angle: +(title.match(TEXTANGLE)?.[1] ?? 0) || 0, words: [] };
      page.lines.push(line);
    } else if (cls.includes('ocrx_word')) {
      const b = bbox(title);
      const end = hocr.indexOf('</span>', open.lastIndex);
      const text = decode(hocr.slice(open.lastIndex, end < 0 ? undefined : end));
      if (!b || !text) continue;
      if (!line) {
        line = { bbox: { ...b }, baseline: { slope: 0, intercept: 0 }, angle: 0, words: [] };
        page.lines.push(line);
      }
      line.words.push({ text, bbox: b, conf: +(title.match(/x_wconf\s+(\d+)/)?.[1] ?? 0) });
    }
  }
  page.lines = page.lines.filter((l) => l.words.length);
  return page;
}

// ---- text layer ---------------------------------------------------------------------------------------------

/**
 * Where each word goes, in image pixels: { text, x, y (baseline start), size, angle (degrees,
 * counter-clockwise), length (along the baseline) }, plus the gaps between words as spaces, so copied text
 * keeps them. Lines turned by 90°, 180° or 270° (`textangle`) are placed along their box.
 */
export function placeWords(page) {
  const out = [];
  for (const line of page.lines) {
    const turn = ((Math.round(line.angle / 90) % 4) + 4) % 4; // 0, 1 (90° ccw), 2, 3
    const { x0, y0, x1, y1 } = line.bbox;
    const across = turn % 2 ? x1 - x0 : y1 - y0; // line thickness
    // upright lines: the font size reaches from the baseline to the top of the line (BentoPDF)
    const size = turn === 0 ? Math.max(1, across + line.baseline.intercept) : Math.max(1, across * 0.8);
    const desc = turn === 0 ? -line.baseline.intercept : across * 0.2;
    const slope = turn === 0 ? line.baseline.slope : 0;
    const angle = turn * 90 - (Math.atan(slope) * 180) / Math.PI;
    const words = line.words; // in reading order
    const at = (w) => {
      const b = w.bbox;
      if (turn === 0) return { x: b.x0, y: y1 - desc + slope * (b.x0 - x0), length: b.x1 - b.x0 };
      if (turn === 1) return { x: b.x1 - desc, y: b.y1, length: b.y1 - b.y0 };
      if (turn === 2) return { x: b.x1, y: b.y0 + desc, length: b.x1 - b.x0 };
      return { x: b.x0 + desc, y: b.y0, length: b.y1 - b.y0 };
    };
    words.forEach((w, i) => {
      const p = at(w);
      out.push({ text: w.text, size, angle, ...p });
      const next = words[i + 1];
      if (!next) return;
      const q = at(next);
      const gap = Math.hypot(q.x - p.x, q.y - p.y) - p.length;
      if (gap > 0) {
        const r = (angle * Math.PI) / 180;
        out.push({ text: ' ', size, angle, x: p.x + Math.cos(r) * p.length, y: p.y - Math.sin(r) * p.length, length: gap });
      }
    });
  }
  return out;
}

/** Pages whose text MuPDF cannot extract (scans): 0-based indices. */
export function pagesWithoutText(doc) {
  const out = [];
  for (let i = 0; i < doc.countPages(); i++) {
    const text = doc.loadPage(i).toStructuredText().asText();
    if (!text.trim()) out.push(i);
  }
  return out;
}

/** A page rendered for OCR: grey PNG at 300 dpi (less for very large pages) and its scale (pixels per point). */
export function renderForOcr(mupdf, doc, index) {
  const page = doc.loadPage(index);
  const [bx0, by0, bx1, by1] = page.getBounds();
  let z = OCR_DPI / 72;
  const px = (bx1 - bx0) * (by1 - by0) * z * z;
  if (px > MAX_PIXELS) z *= Math.sqrt(MAX_PIXELS / px);
  const pix = page.toPixmap(mupdf.Matrix.scale(z, z), mupdf.ColorSpace.DeviceGray, false, true);
  const dpi = Math.round(z * 72);
  pix.setResolution(dpi, dpi);
  return { png: pix.asPNG().slice(), zoom: z, width: bx1 - bx0, height: by1 - by0 };
}

/**
 * OCR `indices` of an open PDFDocument and add the invisible text layer. `recognizer`: { recognize(png) →
 * hOCR string }. ctx: { isCancelled, progress(0…1) }. Returns { pages, words }.
 */
export async function ocrPages(mupdf, doc, fonts, recognizer, indices, ctx = {}) {
  const writer = overlayWriter(mupdf, doc, fonts);
  let words = 0;
  for (let k = 0; k < indices.length; k++) {
    if (ctx.isCancelled?.()) throw Object.assign(new Error('cancelled'), { code: 'cancelled' });
    ctx.progress?.(k / indices.length);
    const { png, zoom } = renderForOcr(mupdf, doc, indices[k]);
    const hocr = await recognizer.recognize(png, (p) => ctx.progress?.((k + Math.max(0, Math.min(1, p))) / indices.length));
    const parsed = parseHocr(hocr);
    const page = writer.page(indices[k]);
    // hOCR pixels → visual page points (the rendering is the page as shown: rotation and crop box applied)
    const k2 = parsed.width > 0 ? page.width / parsed.width : 1 / zoom;
    for (const w of placeWords(parsed)) {
      page.text(w.text, { x: w.x * k2, y: w.y * k2, size: w.size * k2, angle: w.angle, fit: w.length * k2, baseline: true, invisible: true });
      if (w.text !== ' ') words++;
    }
    page.done();
  }
  ctx.progress?.(1);
  return { pages: indices.length, words };
}

// ---- tesseract.js in the editor's worker ------------------------------------------------------------------------

const VENDOR = '../../lib/vendor/tesseract/';

/** A tiny WebAssembly module with one SIMD instruction (from wasm-feature-detect, Apache-2.0). */
const SIMD_PROBE = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);

/**
 * The recognizer of the browser: tesseract.js (lib/vendor/tesseract, loaded here on the first OCR) with its
 * own worker, the core with or without SIMD, and the deu + eng models, all from this site.
 */
export async function tesseractRecognizer() {
  const { default: Tesseract } = await import('../../lib/vendor/tesseract/tesseract.esm.min.js');
  const url = (p) => new URL(`${VENDOR}${p}`, import.meta.url).href;
  const simd = (() => {
    try {
      return WebAssembly.validate(SIMD_PROBE);
    } catch {
      return false;
    }
  })();
  let onPage = null;
  const worker = await Tesseract.createWorker(OCR_LANGS, Tesseract.OEM.LSTM_ONLY, {
    workerPath: url('worker.min.js'),
    corePath: url(`core/tesseract-core-${simd ? 'simd-' : ''}lstm.wasm.js`),
    langPath: url('lang'),
    gzip: true,
    cacheMethod: 'none', // the models come from this site (and the browser cache), not from IndexedDB
    workerBlobURL: false,
    logger: (m) => {
      if (m.status === 'recognizing text') onPage?.(m.progress ?? 0);
    },
  });
  await worker.setParameters({ tessedit_pageseg_mode: PSM_AUTO });
  return {
    async recognize(png, progress) {
      onPage = progress;
      try {
        return (await worker.recognize(png, {}, { hocr: true, text: false, blocks: false })).data.hocr ?? '';
      } finally {
        onPage = null;
      }
    },
    terminate: () => worker.terminate(),
  };
}
