// SPDX-License-Identifier: AGPL-3.0-or-later
// Document operations of the PDF-Editor on MuPDF.js (lib/vendor/mupdf, AGPL-3.0, loaded on demand with
// `await import()`). No DOM: runs in worker.js and in the Node tests. Each operation takes plain data and
// resolves { value, transfer }; errors are EngineError with a code that labels.js turns into German text.

import { sanitizeSvg, svgToPdf, SvgError } from './svg.js';
import { buildStampLibrary } from './stamps.js';

export class EngineError extends Error {
  /** code: 'damaged' | 'password' | 'empty' | 'not-svg' | 'cancelled' | 'input' | 'internal' */
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

  const ops = {
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
