// SPDX-License-Identifier: AGPL-3.0-or-later
// Vendored third-party code of the PDF-Editor: EmbedPDF and tesseract.js are complete, pinned, licensed,
// patched as documented, and fetch nothing from outside the site at runtime.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { posix } from 'node:path';

const ROOT = new URL('../', import.meta.url);
const EMBED = new URL('lib/vendor/embedpdf/', ROOT);
const TESS = new URL('lib/vendor/tesseract/', ROOT);

async function listFiles(dir, prefix = '') {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.isDirectory()) out.push(...(await listFiles(new URL(`${e.name}/`, dir), `${prefix}${e.name}/`)));
    else out.push(`${prefix}${e.name}`);
  }
  return out;
}

const REFS = [
  /(?:^|[\s;}])(?:import|export)\s[^'"`;]*?from\s*["'](\.{1,2}\/[^"']+)["']/gm,
  /\bimport\s*\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g,
  /new URL\(\s*["'](\.{1,2}\/[^"']+)["']\s*,\s*import\.meta\.url\s*\)/g,
];

/** Runtime loads from a fixed absolute URL: imports, workers, fetches, `new URL("https://…")`. */
const REMOTE = [
  /\bimport\s*\(\s*["'`]https?:/,
  /\bfrom\s*["']https?:/,
  /\bfetch\(\s*["'`]https?:/,
  /new\s+(?:URL|Worker)\(\s*["'`]https?:/,
  /\bimportScripts\(\s*["'`]https?:/,
];

test('EmbedPDF: pinned version, license, patch list, no source maps', async () => {
  const version = (await readFile(new URL('VERSION', EMBED), 'utf8')).trim();
  assert.match(version, /^3\.0\.0-next\.\d+$/);
  const license = await readFile(new URL('LICENSE', EMBED), 'utf8');
  assert.match(license, /Apache License\s+Version 2\.0/);
  const patches = await readFile(new URL('PATCHES.md', EMBED), 'utf8');
  assert.ok(patches.includes(`@embedpdf/viewer@${version}`), 'PATCHES.md names the version');
  const files = await listFiles(EMBED);
  assert.ok(!files.some((f) => f.endsWith('.map')), 'no source maps');
  for (const f of files) assert.ok((await stat(new URL(f, EMBED))).size < 100 * 1024 * 1024, `${f} < 100 MB`);
});

test('EmbedPDF: every module the snippet entry reaches is vendored, and nothing else', async () => {
  const files = new Set(await listFiles(EMBED));
  const seen = new Set();
  const missing = [];
  async function walk(path) {
    if (seen.has(path)) return;
    seen.add(path);
    if (!files.has(path)) return void missing.push(path);
    if (!path.endsWith('.js')) return;
    const src = await readFile(new URL(path, EMBED), 'utf8');
    for (const re of REFS) for (const m of src.matchAll(re)) await walk(posix.normalize(posix.join(posix.dirname(path), m[1])));
  }
  await walk('embedpdf.js');
  assert.deepEqual(missing, []);
  const extra = [...files].filter((f) => !seen.has(f) && !['LICENSE', 'VERSION', 'PATCHES.md'].includes(f));
  assert.deepEqual(extra, [], 'files the viewer never loads');
  for (const f of ['embedpdf.wasm', 'embedpdf-worker.js', 'encoder-worker.js']) assert.ok(seen.has(f), f);
});

test('EmbedPDF: no runtime loads from absolute URLs (no CDN)', async () => {
  for (const f of (await listFiles(EMBED)).filter((p) => p.endsWith('.js'))) {
    const src = await readFile(new URL(f, EMBED), 'utf8');
    for (const re of REMOTE) assert.doesNotMatch(src, re, `${f}: ${re}`);
  }
});

test('EmbedPDF: the colour swatch patch is in place', async () => {
  const patches = await readFile(new URL('PATCHES.md', EMBED), 'utf8');
  const file = patches.match(/`swatches` in `([^`]+)`/)?.[1];
  assert.ok(file, 'patch listed');
  const src = await readFile(new URL(file, EMBED), 'utf8');
  assert.match(src, /^\/\/ Modified by HLKS-Tools/);
  assert.match(src, /globalThis\.HLKS_ANNOT_SWATCHES \?\? \[/);
});

test('Swiss German overrides cover every German viewer string with ß', async () => {
  const files = await listFiles(new URL('chunks/', EMBED));
  let de = null;
  for (const f of files.filter((n) => n.startsWith('de-'))) {
    const mod = await import(new URL(`chunks/${f}`, EMBED));
    if (mod.de?.translations) de = mod.de;
  }
  assert.ok(de, 'German translations found');
  const { SWISS_DE } = await import('../tools/pdf-editor/viewer-strings.js');
  const expected = {};
  (function collect(node, prefix) {
    for (const [key, value] of Object.entries(node)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (typeof value === 'string' && value.includes('ß')) expected[path] = value.replaceAll('ß', 'ss');
      else if (value && typeof value === 'object') collect(value, path);
    }
  })(de.translations, '');
  assert.deepEqual(SWISS_DE, expected, 'run node scripts/vendor-embedpdf.mjs');
});

test('an EmbedPDF export reopens without repair in MuPDF and pdf-lib, with every annotation type', async () => {
  // Saved from the viewer in the stage 1 spike (docs/dev/pdf-editor/PROGRESS.md): one of each annotation
  // type, three measurements after calibration, a stamp from an imported library, two form fields.
  const bytes = await readFile(new URL('tests/fixtures/pdf-editor/embedpdf-annotated.pdf', ROOT));
  const mupdf = await import('../lib/vendor/mupdf/mupdf.js');
  const doc = mupdf.Document.openDocument(bytes, 'application/pdf').asPDF();
  assert.equal(doc.wasRepaired(), false);
  const page = doc.loadPage(0);
  const kinds = page.getAnnotations().map((a) => {
    const it = a.getObject().get('IT');
    return it.isNull() ? a.getType() : `${a.getType()}/${it.asName()}`;
  });
  for (const k of ['Square', 'Circle', 'Line', 'Polygon', 'PolyLine', 'Ink', 'FreeText/FreeText', 'FreeText/FreeTextCallout', 'Text', 'Highlight', 'Underline', 'StrikeOut', 'Squiggly', 'Stamp', 'Line/LineDimension', 'Polygon/PolygonDimension', 'PolyLine/PolyLineDimension']) {
    assert.ok(kinds.includes(k), k);
  }
  const cloud = page.getAnnotations().find((a) => a.getType() === 'Polygon' && !a.getObject().get('BE').isNull());
  assert.equal(cloud.getObject().get('BE').get('S').asName(), 'C', 'cloudy border');
  assert.deepEqual(page.getWidgets().map((w) => w.getFieldType()).sort(), ['checkbox', 'text']);
  const vp = page.getObject().get('VP').get(0).get('Measure');
  assert.equal(vp.get('Subtype').asName(), 'RL', 'page scale stored in the PDF');

  const { PDFDocument } = await import('../lib/vendor/pdf-lib/pdf-lib.esm.min.js');
  const pl = await PDFDocument.load(bytes);
  assert.equal(pl.getPage(0).node.Annots().size(), kinds.length + 2);
  assert.deepEqual(pl.getForm().getFields().map((f) => f.getName()).sort(), ['Bemerkung', 'Geprueft']);
});

test('tesseract.js: pinned versions, licenses, the files OCR loads and nothing else', async () => {
  const version = await readFile(new URL('VERSION', TESS), 'utf8');
  assert.match(version, /^tesseract\.js \d+\.\d+\.\d+\ntesseract\.js-core \d+\.\d+\.\d+\ntessdata_fast [\d.]+ [0-9a-f]{40} \(deu, eng\)\n$/);
  for (const f of ['LICENSE', 'core/LICENSE', 'lang/LICENSE']) assert.match(await readFile(new URL(f, TESS), 'utf8'), /Apache License\s+Version 2\.0/, f);
  const files = (await listFiles(TESS)).sort();
  assert.deepEqual(files, [
    'LICENSE', 'VERSION',
    'core/LICENSE', 'core/tesseract-core-lstm.wasm.js', 'core/tesseract-core-simd-lstm.wasm.js',
    'lang/LICENSE', 'lang/deu.traineddata.gz', 'lang/eng.traineddata.gz',
    'tesseract.esm.min.js', 'tesseract.min.js.LICENSE.txt', 'worker.min.js', 'worker.min.js.LICENSE.txt',
  ]);
  for (const f of files.filter((n) => n.endsWith('.gz'))) {
    const b = await readFile(new URL(f, TESS));
    assert.ok(b[0] === 0x1f && b[1] === 0x8b, `${f} is gzip`);
  }
});

test('tesseract.js: OCR passes every path, so the CDN defaults in the library are never used', async () => {
  // tesseract.js falls back to cdn.jsdelivr.net for the worker, the core and the models; ocr.js sets all three
  const src = await readFile(new URL('tools/pdf-editor/ocr.js', ROOT), 'utf8');
  for (const key of ['workerPath', 'corePath', 'langPath']) assert.match(src, new RegExp(`${key}: url\\(`), key);
  assert.match(src, /workerPath: url\('worker\.min\.js'\)/);
  assert.match(src, /corePath: url\(`core\/tesseract-core-\$\{simd \? 'simd-' : ''\}lstm\.wasm\.js`\)/);
  assert.match(src, /langPath: url\('lang'\)/);
  assert.match(src, /cacheMethod: 'none'/);
  assert.match(src, /OCR_LANGS = 'deu\+eng'/);
  for (const f of ['tesseract.esm.min.js', 'worker.min.js']) {
    const lib = await readFile(new URL(f, TESS), 'utf8');
    for (const re of REMOTE) assert.doesNotMatch(lib, re, `${f}: ${re}`);
  }
});
