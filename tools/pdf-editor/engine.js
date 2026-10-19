// SPDX-License-Identifier: AGPL-3.0-or-later
// Document operations of the PDF-Editor on MuPDF.js (lib/vendor/mupdf, AGPL-3.0, loaded on demand with
// `await import()`). No DOM: runs in worker.js and in the Node tests. Each operation takes plain data and
// resolves { value, transfer }; errors are EngineError with a code that labels.js turns into German text.

import { sanitizeSvg, svgToPdf, SvgError } from './svg.js';
import { buildStampLibrary } from './stamps.js';
import { parseRanges, everyN, oddEven, groupFileName, extractPages, addPageNumbers, addHeaderFooter, addWatermark } from './pages.js';
import { renderPages, imagesToPdf, blankPdf } from './images.js';
import { flatten, compressPdf, COMPACT } from './compress.js';
import { zip } from './zip.js';

/** Permission bits of the PDF /P entry (ISO 32000-1, table 22); the reserved bits are set. */
export const PERMISSION_BITS = { print: 4 | 2048, modify: 8 | 1024, copy: 16 | 512, annotate: 32, forms: 256 };
const P_NONE = -3904;

export class EngineError extends Error {
  /** code: 'damaged' | 'password' | 'empty' | 'range' | 'image' | 'not-svg' | 'cancelled' | 'input' | 'internal' */
  constructor(code, message = code) {
    super(message);
    this.name = 'EngineError';
    this.code = code;
  }
}

let mupdfModule = null;

/** Load MuPDF once (10 MB of WebAssembly, only when a document tool runs). */
export async function loadMupdf() {
  mupdfModule ??= await import('../../lib/vendor/mupdf/mupdf.js');
  return mupdfModule;
}

const FONT_FILES = { regular: 'assets/fonts/pdf/sans-400.ttf', semibold: 'assets/fonts/pdf/sans-600.ttf' };

/**
 * The engine. `readAsset(path)` reads a site file (relative to the site root) as bytes: fetch in the worker,
 * the file system in Node. Fonts are read on first use.
 */
export async function createEngine({ readAsset }) {
  const mupdf = await loadMupdf();
  let fonts = null;
  const getFonts = async () => (fonts ??= { regular: await readAsset(FONT_FILES.regular), semibold: await readAsset(FONT_FILES.semibold) });
  const done = (bytes) => ({ value: bytes, transfer: [bytes.buffer] });
  const doneFiles = (files, extra = {}) => ({ value: { files, ...extra }, transfer: files.map((f) => f.bytes.buffer) });
  const cancelled = (ctx) => {
    if (ctx?.isCancelled?.()) throw new EngineError('cancelled');
  };

  /** Open bytes as a PDFDocument (password when needed). */
  const open = (bytes, password) => {
    let doc;
    try {
      doc = new mupdf.PDFDocument(bytes);
    } catch {
      throw new EngineError('damaged');
    }
    if (doc.needsPassword() && !(password && doc.authenticatePassword(password))) throw new EngineError('password');
    if (doc.countPages() < 1) throw new EngineError('empty');
    return doc;
  };
  /** Page indices from a selection: { mode: 'all' | 'range' | 'odd' | 'even' | 'current', range, current }. */
  const select = (doc, sel = {}) => {
    const total = doc.countPages();
    if (sel.mode === 'range') {
      const r = parseRanges(sel.range, total);
      if (r.errors.length || !r.pages.length) throw new EngineError('range', r.errors.join(', '));
      return r.pages;
    }
    if (sel.mode === 'odd' || sel.mode === 'even') return oddEven(sel.mode, total);
    if (sel.mode === 'current') return [Math.max(0, Math.min(total - 1, sel.current ?? 0))];
    return Array.from({ length: total }, (_, i) => i);
  };
  const save = (doc) => doc.saveToBuffer(COMPACT).asUint8Array().slice();

  const ops = {
    /** Split or extract: { bytes, mode: 'range' | 'groups' | 'every' | 'each' | 'odd' | 'even', range, n, single, name }. */
    async split({ bytes, password, mode = 'range', range = '', n = 1, single = false, name }, ctx) {
      const doc = open(bytes, password);
      const total = doc.countPages();
      let groups;
      if (mode === 'every') groups = everyN(n, total);
      else if (mode === 'each') groups = everyN(1, total);
      else if (mode === 'odd' || mode === 'even') groups = [oddEven(mode, total)];
      else {
        const r = parseRanges(range, total);
        if (r.errors.length || !r.pages.length) throw new EngineError('range', r.errors.join(', '));
        groups = mode === 'groups' ? r.groups : [r.pages];
      }
      if (single) groups = [groups.flat()];
      const files = groups.map((g, i) => {
        cancelled(ctx);
        ctx?.progress?.((i + 1) / groups.length);
        return { name: groupFileName(name, g), bytes: extractPages(mupdf, doc, g) };
      });
      return doneFiles(files.length > 1 ? [{ name: `${String(name ?? 'Dokument').replace(/\.pdf$/i, '')}_Seiten.zip`, bytes: zip(files) }] : files);
    },

    async pageNumbers({ bytes, password, pages, ...options }) {
      const doc = open(bytes, password);
      addPageNumbers(mupdf, doc, await getFonts(), { ...options, pages: select(doc, pages) });
      return done(save(doc));
    },

    async headerFooter({ bytes, password, pages, ...options }) {
      const doc = open(bytes, password);
      addHeaderFooter(mupdf, doc, await getFonts(), { ...options, pages: select(doc, pages) });
      return done(save(doc));
    },

    async watermark({ bytes, password, pages, ...options }) {
      const doc = open(bytes, password);
      try {
        addWatermark(mupdf, doc, await getFonts(), { ...options, pages: select(doc, pages) });
      } catch (e) {
        throw e instanceof EngineError ? e : new EngineError('image', String(e?.message ?? e));
      }
      return done(save(doc));
    },

    /** Pages as PNG / JPEG: one file, or a ZIP for several. */
    async toImages({ bytes, password, pages, dpi, format, quality, name }, ctx) {
      const doc = open(bytes, password);
      const base = String(name ?? 'Dokument').replace(/\.pdf$/i, '');
      const { files, reduced } = renderPages(mupdf, doc, { pages: select(doc, pages), dpi, format, quality, base, isCancelled: ctx?.isCancelled, progress: ctx?.progress });
      return doneFiles(files.length > 1 ? [{ name: `${base}_Bilder.zip`, bytes: zip(files) }] : files, { reduced });
    },

    async imagesToPdf({ images, size, orientation, marginMm }) {
      try {
        return done(imagesToPdf(mupdf, images, { size, orientation, marginMm }));
      } catch (e) {
        throw new EngineError('image', String(e?.message ?? e));
      }
    },

    async flatten({ bytes, password, annotations, fields }) {
      return done(flatten(mupdf, open(bytes, password), { annotations, fields }));
    },

    async compress({ bytes, password, dpi, quality }, ctx) {
      open(bytes, password);
      const r = compressPdf(mupdf, bytes, { dpi, quality, password, isCancelled: ctx?.isCancelled });
      const out = r.bytes === bytes ? bytes.slice() : r.bytes;
      return { value: { ...r, bytes: out }, transfer: [out.buffer] };
    },

    /** Set an open and/or permission password (AES-256), or remove protection (`remove`, with the password). */
    async password({ bytes, password, remove = false, userPassword = '', ownerPassword = '', permissions = {} }) {
      const doc = open(bytes, password);
      if (remove) return done(doc.saveToBuffer(`${COMPACT},encrypt=none`).asUint8Array().slice());
      if (!userPassword && !ownerPassword) throw new EngineError('input');
      let p = P_NONE;
      for (const [k, bit] of Object.entries(PERMISSION_BITS)) if (permissions[k] !== false) p |= bit;
      const esc = (s) => String(s).replace(/,/g, '');
      if (/[,]/.test(userPassword + ownerPassword)) throw new EngineError('input', 'comma');
      const opts = [`encrypt=aes-256`, `user-password=${esc(userPassword)}`, `owner-password=${esc(ownerPassword || userPassword)}`, `permissions=${p}`];
      // no object streams: readers that check permissions without the password still parse the file
      return done(doc.saveToBuffer(`garbage=4,compress,${opts.join(',')}`).asUint8Array().slice());
    },

    /** The outline (bookmarks) as a flat list [{ title, page, level }]. */
    async readOutline({ bytes, password }) {
      const doc = open(bytes, password);
      const out = [];
      const walk = (items, level) => {
        for (const it of items ?? []) {
          let page = -1;
          try {
            page = it.page ?? doc.resolveLink(it.uri);
          } catch {
            /* external link */
          }
          out.push({ title: it.title ?? '', page, level });
          walk(it.down, level + 1);
        }
      };
      walk(doc.loadOutline(), 0);
      return { value: out };
    },

    /** Replace the outline with a flat list [{ title, page (0-based), level }]. */
    async writeOutline({ bytes, password, items }) {
      const doc = open(bytes, password);
      const it = doc.outlineIterator();
      while (it.item()) it.delete();
      const total = doc.countPages();
      // build depth-first: insert at the current position, go down for children, up after them
      const clean = items.filter((x) => x.title?.trim()).map((x, i, arr) => ({ ...x, level: Math.max(0, Math.min(x.level, i ? arr[i - 1].level + 1 : 0)) }));
      const root = doc.outlineIterator();
      let depth = 0;
      for (let i = 0; i < clean.length; i++) {
        const { title, page, level } = clean[i];
        while (depth > level) {
          root.up();
          root.next();
          depth--;
        }
        root.insert({ title: title.trim(), uri: doc.formatLinkURI(new mupdf.LinkDestination(0, Math.max(0, Math.min(total - 1, page)), 'Fit')), open: true });
        if (clean[i + 1]?.level > level) {
          root.prev();
          root.down();
          depth++;
        }
      }
      return done(save(doc));
    },

    /** Repair: MuPDF reads what it can of a damaged file and writes it new. */
    async repair({ bytes }) {
      const doc = open(bytes);
      return { value: { bytes: save(doc), repaired: doc.wasRepaired() } };
    },

    async blank({ size, orientation }) {
      return done(blankPdf(mupdf, { size, orientation }));
    },

    /** One SVG (sanitised) as a one-page PDF: an own symbol. */
    async svgPage({ svg }) {
      try {
        return done(svgToPdf(mupdf, sanitizeSvg(svg), { fonts: await getFonts() }));
      } catch (e) {
        throw new EngineError(e instanceof SvgError ? 'not-svg' : 'internal', String(e?.message ?? e));
      }
    },

    /** The stamp library PDF (stamps.js) for the settings' name, today's date and the own stamps. */
    async stampLibrary({ templates, own, values, colors, source }) {
      const f = await getFonts();
      const semibold = new mupdf.Font('PlexSemibold', f.semibold);
      const measure = (text) => [...text].reduce((s, c) => s + semibold.advanceGlyph(Math.max(0, semibold.encodeCharacter(c.codePointAt(0))), 0), 0);
      return done(buildStampLibrary(mupdf, { templates, own, values, colors, fonts: f, source, measure }));
    },
  };
  return { mupdf, ops };
}
