// SPDX-License-Identifier: AGPL-3.0-or-later
// OCR recognizer for Node tests: the vendored tesseract core (lib/vendor/tesseract/core) run directly, with
// the same models and settings as tesseract.js in the editor's worker (deu+eng, LSTM, automatic layout).
// tesseract.js itself needs a browser worker; the core file is CommonJS, so it is evaluated as such.

import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const VENDOR = new URL('../../lib/vendor/tesseract/', import.meta.url);
export const CORE = new URL('core/tesseract-core-simd-lstm.wasm.js', VENDOR);
export const LANGS = ['deu', 'eng'].map((l) => new URL(`lang/${l}.traineddata.gz`, VENDOR));

let factory = null;

async function loadCore() {
  if (factory) return factory;
  const path = fileURLToPath(CORE);
  const module = { exports: {} };
  // eslint-disable-next-line no-new-func
  new Function('module', 'exports', 'require', '__filename', '__dirname', await readFile(path, 'utf8'))(module, module.exports, createRequire(path), path, dirname(path));
  return (factory = module.exports);
}

/** Same interface as ocr.js `tesseractRecognizer()`: { recognize(png) → hOCR, terminate() }. */
export async function nodeRecognizer() {
  const M = await (await loadCore())();
  for (const url of LANGS) M.FS.writeFile(`/${url.pathname.split('/').pop().replace(/\.gz$/, '')}`, gunzipSync(await readFile(url)));
  const api = new M.TessBaseAPI();
  if (api.Init(null, 'deu+eng', 1) === -1) throw new Error('tesseract init failed');
  api.SetVariable('tessedit_pageseg_mode', '3');
  return {
    async recognize(png) {
      M.FS.writeFile('/input', png);
      api.SetImageFile(1, 0);
      api.Recognize(null);
      return api.GetHOCRText();
    },
    terminate() {
      api.End();
    },
  };
}
