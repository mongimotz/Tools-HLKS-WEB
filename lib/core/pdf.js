// PDF export (visible report + embedded data.json) and import (read data.json back).
// Reports use the site fonts (sans for text, mono for numbers), embedded as subsets, and the
// light colours of assets/css/tokens.css.
// Works in the browser and in Node (tests). Load this module lazily: pdf-lib is large.

import {
  PDFDocument,
  rgb,
  PDFName,
  PDFDict,
  PDFArray,
  PDFRawStream,
  decodePDFRawStream,
} from '../vendor/pdf-lib/pdf-lib.esm.min.js';
import fontkit from '../vendor/fontkit/fontkit.esm.min.js';

export const ATTACHMENT_NAME = 'data.json';
export const A4_LANDSCAPE = [841.89, 595.28];
export const A4_PORTRAIT = [595.28, 841.89];

/**
 * Report colours: the light column of assets/css/tokens.css (the single source of all colours).
 * Filled by loadInk() before a report is drawn; report code reads INK.* inside its render callbacks.
 */
export const INK = {};
const INK_TOKENS = {
  strong: 'text-strong',
  text: 'text',
  muted: 'text-muted',
  border: 'border',
  sunken: 'surface-sunken',
  primary: 'primary',
  primarySubtle: 'primary-subtle',
  accent: 'accent',
  danger: 'danger',
  warning: 'warning',
  chart1: 'chart-1',
  chart2: 'chart-2',
  chart3: 'chart-3',
};

/** Light colour tokens from tokens.css text: the declarations before the first @media block. */
export function parseLightTokens(css) {
  const light = css.slice(0, css.indexOf('@media') >= 0 ? css.indexOf('@media') : undefined);
  const out = {};
  for (const m of light.matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})(?![0-9a-fA-F])/g)) out[m[1]] = m[2].toLowerCase();
  return out;
}

let inkPromise = null;
export function loadInk() {
  inkPromise ??= readAsset(new URL('../../assets/css/tokens.css', import.meta.url)).then((bytes) => {
    const tokens = parseLightTokens(new TextDecoder().decode(bytes));
    for (const [key, name] of Object.entries(INK_TOKENS)) {
      if (!tokens[name]) throw new Error(`Farbe fehlt in tokens.css: --${name}`);
      INK[key] = tokens[name];
    }
    return INK;
  });
  return inkPromise;
}

export function hexColor(c) {
  const n = parseInt(c.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

// ---- fonts ----------------------------------------------------------------------

// Built by scripts/build-fonts.py (generic names: the font family is set by the source files there).
const FONT_FILES = {
  regular: 'sans-400.ttf',
  bold: 'sans-600.ttf',
  mono: 'mono-400.ttf',
  monoBold: 'mono-600.ttf',
};

async function readAsset(url) {
  if (url.protocol === 'file:') {
    const { readFile } = await import('node:fs/promises');
    return new Uint8Array(await readFile(url));
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Datei fehlt: ${url.pathname} (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

let fontBytesPromise = null;
function loadFontBytes() {
  fontBytesPromise ??= Promise.all(
    Object.entries(FONT_FILES).map(async ([key, file]) => [key, await readAsset(new URL(`../../assets/fonts/pdf/${file}`, import.meta.url))]),
  ).then(Object.fromEntries);
  return fontBytesPromise;
}

// Characters to replace before drawing (no shaping in PDF output, or glyph missing).
const CHAR_FALLBACK = {
  '̇': '', // combining dot above (V̇): would not be positioned without shaping
  ' ': ' ',
  ' ': ' ',
  '\t': ' ',
  '▭': '[]',
  '◯': 'O',
  '⁻': '−',
  '‑': '-',
};

export class ReportWriter {
  static async create(doc, { pageSize = A4_LANDSCAPE, margin } = {}) {
    doc.registerFontkit(fontkit);
    const bytes = await loadFontBytes();
    const fonts = {};
    const glyphs = {};
    for (const [key, b] of Object.entries(bytes)) {
      fonts[key] = await doc.embedFont(b, { subset: true });
      glyphs[key] = new Set(fontkit.create(b).characterSet);
    }
    return new ReportWriter(doc, fonts, glyphs, pageSize, margin ?? { top: 58, right: 40, bottom: 46, left: 40 });
  }

  constructor(doc, fonts, glyphs, pageSize, margin) {
    this.doc = doc;
    this.fonts = fonts;
    this.glyphs = glyphs;
    this.pageSize = pageSize;
    this.pageW = pageSize[0];
    this.pageH = pageSize[1];
    this.margin = margin;
    this.pages = [];
    this.newPage();
  }

  get left() { return this.margin.left; }
  get right() { return this.pageW - this.margin.right; }
  get contentWidth() { return this.pageW - this.margin.left - this.margin.right; }
  get bottomLimit() { return this.pageH - this.margin.bottom; }

  newPage() {
    this.page = this.doc.addPage(this.pageSize);
    this.pages.push(this.page);
    this.y = this.margin.top;
  }

  /** Start a new page if fewer than h points are left. */
  ensure(h) {
    if (this.y + h > this.bottomLimit) this.newPage();
  }

  space(h) { this.y += h; }

  // ---- text ---------------------------------------------------------------

  /**
   * Split a string into runs per font. Mono has no Greek, so those characters fall back to Sans.
   * Characters missing everywhere become "?".
   */
  _runs(str, bold, mono) {
    const base = mono ? (bold ? 'monoBold' : 'mono') : bold ? 'bold' : 'regular';
    const fallback = bold ? 'bold' : 'regular';
    const runs = [];
    for (let ch of String(str ?? '')) {
      if (CHAR_FALLBACK[ch] !== undefined) ch = CHAR_FALLBACK[ch];
      if (!ch) continue;
      const cp = ch.codePointAt(0);
      let key = this.glyphs[base].has(cp) ? base : this.glyphs[fallback].has(cp) ? fallback : null;
      if (!key) {
        ch = '?';
        key = base;
      }
      const last = runs[runs.length - 1];
      if (last && last.key === key) last.text += ch;
      else runs.push({ key, text: ch });
    }
    return runs;
  }

  measure(str, size = 9, bold = false, mono = false) {
    let w = 0;
    for (const r of this._runs(str, bold, mono)) w += this.fonts[r.key].widthOfTextAtSize(r.text, size);
    return w;
  }

  fit(str, maxWidth, size = 9, bold = false, mono = false) {
    str = String(str ?? '');
    if (this.measure(str, size, bold, mono) <= maxWidth) return str;
    let s = str;
    while (s.length > 1 && this.measure(s + '…', size, bold, mono) > maxWidth) s = s.slice(0, -1);
    return s + '…';
  }

  /** Draw text with its baseline at y (measured from the top of the page). Returns the width. */
  text(str, x, y, { size = 9, bold = false, mono = false, color = INK.text, align = 'left', maxWidth } = {}) {
    if (str == null || str === '') return 0;
    if (maxWidth) str = this.fit(str, maxWidth, size, bold, mono);
    const w = this.measure(str, size, bold, mono);
    let cx = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
    const c = hexColor(color);
    for (const r of this._runs(str, bold, mono)) {
      const font = this.fonts[r.key];
      this.page.drawText(r.text, { x: cx, y: this.pageH - y, size, font, color: c });
      cx += font.widthOfTextAtSize(r.text, size);
    }
    return w;
  }

  /** Word-wrap text into lines that fit maxWidth. */
  wrap(str, maxWidth, size = 9, bold = false) {
    const lines = [];
    for (const para of String(str ?? '').split('\n')) {
      let line = '';
      for (const word of para.split(/\s+/)) {
        if (!word) continue;
        const next = line ? `${line} ${word}` : word;
        if (line && this.measure(next, size, bold) > maxWidth) {
          lines.push(line);
          line = word;
        } else line = next;
      }
      lines.push(line);
    }
    return lines;
  }

  paragraph(str, { size = 8.5, color = INK.text, lineHeight = size * 1.45, x = this.left, width = this.contentWidth, bold = false } = {}) {
    for (const line of this.wrap(str, width, size, bold)) {
      this.ensure(lineHeight);
      this.y += lineHeight;
      this.text(line, x, this.y - (lineHeight - size) / 2, { size, color, bold });
    }
  }

  heading(str, { size = 11, before = 14, after = 8, keepWith = 40 } = {}) {
    this.ensure(before + size + after + keepWith);
    this.y += (this.y === this.margin.top ? 0 : before) + size;
    this.text(str, this.left, this.y, { size, bold: true, color: INK.strong });
    this.y += after;
  }

  // ---- shapes -------------------------------------------------------------

  line(x1, y1, x2, y2, { color = INK.border, width = 0.5, dash } = {}) {
    this.page.drawLine({
      start: { x: x1, y: this.pageH - y1 },
      end: { x: x2, y: this.pageH - y2 },
      thickness: width,
      color: hexColor(color),
      dashArray: dash,
    });
  }

  rect(x, y, w, h, { fill, stroke, strokeWidth = 0.5 } = {}) {
    this.page.drawRectangle({
      x,
      y: this.pageH - y - h,
      width: w,
      height: h,
      color: fill ? hexColor(fill) : undefined,
      borderColor: stroke ? hexColor(stroke) : undefined,
      borderWidth: stroke ? strokeWidth : 0,
    });
  }

  polyline(points, { color = INK.chart1, width = 1.2 } = {}) {
    for (let i = 1; i < points.length; i++) {
      this.line(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1], { color, width });
    }
  }

  // ---- blocks -------------------------------------------------------------

  /** Grid of label/value pairs. */
  keyValues(pairs, { columns = 4, size = 8.5, rowHeight = 24 } = {}) {
    const colW = this.contentWidth / columns;
    for (let i = 0; i < pairs.length; i += columns) {
      this.ensure(rowHeight);
      const top = this.y;
      pairs.slice(i, i + columns).forEach(([label, value], j) => {
        const x = this.left + j * colW;
        this.text(label, x, top + 8, { size: 7, color: INK.muted, maxWidth: colW - 8 });
        this.text(value || '–', x, top + 8 + size + 4, { size, color: INK.strong, maxWidth: colW - 8 });
      });
      this.y += rowHeight;
    }
  }

  /**
   * Table with repeating header on page breaks.
   * columns: [{ label, unit, width, align, mono }], widths are scaled to the content width.
   * Right-aligned columns use the number font unless mono: false.
   * rows: arrays of strings or { text, bold, color }. rowStyle(i) → { bold, color, fill }.
   */
  table({ columns, rows, size = 7.5, rowHeight = 13, rowStyle }) {
    const total = columns.reduce((s, c) => s + c.width, 0);
    const scale = this.contentWidth / total;
    const cols = [];
    let cx = this.left;
    for (const c of columns) {
      const w = c.width * scale;
      cols.push({ ...c, x: cx, w, mono: c.mono ?? c.align === 'right' });
      cx += w;
    }
    const pad = 3;
    const headerH = columns.some((c) => c.unit) ? 22 : 14;

    const drawHeader = () => {
      const top = this.y;
      this.rect(this.left, top, this.contentWidth, headerH, { fill: INK.sunken });
      for (const c of cols) {
        const ax = c.align === 'right' ? c.x + c.w - pad : c.align === 'center' ? c.x + c.w / 2 : c.x + pad;
        this.text(c.label, ax, top + 9, { size: 7, bold: true, color: INK.strong, align: c.align, maxWidth: c.w - 2 * pad });
        if (c.unit) this.text(c.unit, ax, top + 18, { size: 6.5, color: INK.muted, align: c.align, maxWidth: c.w - 2 * pad });
      }
      this.y += headerH;
      this.line(this.left, this.y, this.right, this.y, { color: INK.muted, width: 0.6 });
    };

    this.ensure(headerH + rowHeight * 2);
    drawHeader();
    rows.forEach((row, i) => {
      if (this.y + rowHeight > this.bottomLimit) {
        this.newPage();
        drawHeader();
      }
      const style = rowStyle?.(i) ?? {};
      const top = this.y;
      if (style.fill) this.rect(this.left, top, this.contentWidth, rowHeight, { fill: style.fill });
      cols.forEach((c, j) => {
        const cell = row[j];
        if (cell == null || cell === '') return;
        const ax = c.align === 'right' ? c.x + c.w - pad : c.align === 'center' ? c.x + c.w / 2 : c.x + pad;
        const cellStyle = typeof cell === 'object' ? cell : { text: cell };
        this.text(cellStyle.text, ax, top + rowHeight / 2 + size * 0.36, {
          size,
          bold: cellStyle.bold ?? style.bold,
          mono: c.mono,
          color: cellStyle.color ?? style.color ?? INK.text,
          align: c.align,
          maxWidth: c.w - 2 * pad,
        });
      });
      this.y += rowHeight;
      this.line(this.left, this.y, this.right, this.y, { color: INK.border, width: 0.3 });
    });
  }

  /** Draw header/footer on every page once all content exists (page numbers need the total). */
  finish(decorate) {
    const total = this.pages.length;
    this.pages.forEach((page, i) => {
      this.page = page;
      decorate?.(this, i, total);
    });
  }
}

/**
 * Build a PDF report and attach the envelope as data.json.
 * render(writer) draws the visible pages; decorate(writer, pageIndex, pageCount) draws header/footer.
 */
export async function buildPdf({ envelope, title, subject, author, pageSize = A4_LANDSCAPE, render, decorate }) {
  await loadInk();
  const doc = await PDFDocument.create();
  const writer = await ReportWriter.create(doc, { pageSize });
  await render(writer);
  writer.finish(decorate);

  const now = new Date();
  const json = JSON.stringify(envelope, null, 2);
  await doc.attach(new TextEncoder().encode(json), ATTACHMENT_NAME, {
    mimeType: 'application/json',
    description: 'HLKS-Tools Eingabedaten',
    creationDate: now,
    modificationDate: now,
  });
  doc.setTitle(title, { showInWindowTitleBar: true });
  if (subject) doc.setSubject(subject);
  if (author) doc.setAuthor(author);
  doc.setKeywords(['hlks-tools', envelope.tool]);
  doc.setCreator('HLKS-Tools');
  doc.setProducer('HLKS-Tools (pdf-lib)');
  doc.setCreationDate(now);
  doc.setModificationDate(now);
  return doc.save();
}

/** List embedded files of a PDF as [{ name, bytes }]. */
export async function readAttachments(bytes) {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const names = doc.catalog.lookupMaybe(PDFName.of('Names'), PDFDict);
  const tree = names?.lookupMaybe(PDFName.of('EmbeddedFiles'), PDFDict);
  const files = [];
  if (!tree) return files;

  const visit = (node, depth = 0) => {
    if (depth > 32) return;
    const arr = node.lookupMaybe(PDFName.of('Names'), PDFArray);
    if (arr) {
      for (let i = 0; i + 1 < arr.size(); i += 2) {
        const key = arr.lookup(i);
        const spec = arr.lookup(i + 1);
        if (!(spec instanceof PDFDict)) continue;
        const ef = spec.lookupMaybe(PDFName.of('EF'), PDFDict);
        const stream = ef && (ef.lookup(PDFName.of('F')) ?? ef.lookup(PDFName.of('UF')));
        if (!(stream instanceof PDFRawStream)) continue;
        const name = typeof key?.decodeText === 'function' ? key.decodeText() : String(key);
        files.push({ name, bytes: decodePDFRawStream(stream).decode() });
      }
    }
    const kids = node.lookupMaybe(PDFName.of('Kids'), PDFArray);
    if (kids) for (let i = 0; i < kids.size(); i++) visit(kids.lookup(i, PDFDict), depth + 1);
  };
  visit(tree);
  return files;
}

/** Return the embedded data.json text of a HLKS-Tools PDF, or null. */
export async function extractDataJson(bytes) {
  const files = await readAttachments(bytes);
  const file = files.find((f) => f.name === ATTACHMENT_NAME) ?? files.find((f) => /\.json$/i.test(f.name));
  return file ? new TextDecoder('utf-8').decode(file.bytes) : null;
}

export function isPdf(bytes) {
  return bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // %PDF
}
