// SPDX-License-Identifier: AGPL-3.0-or-later
// MuPDF.js loads from lib/vendor/mupdf/ in Node, and the test corpus is complete.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';

const FIX = new URL('./fixtures/pdf-to-dxf/', import.meta.url);
const CORPUS = ['lines', 'curves', 'layers', 'clip', 'text', 'hatch', 'dash', 'dupes', 'rotated', 'multipage', 'scan_clean', 'scan_dirty'];

test('MuPDF loads from lib/vendor/mupdf and reads a PDF', async () => {
  const mupdf = await import('../lib/vendor/mupdf/mupdf.js');
  const doc = mupdf.Document.openDocument(await readFile(new URL('multipage.pdf', FIX)), 'application/pdf');
  assert.equal(doc.countPages(), 3);
});

test('vendored files are small enough for GitHub and carry a license', async () => {
  const dir = new URL('../lib/vendor/mupdf/', import.meta.url);
  const files = await readdir(dir);
  for (const f of ['mupdf.js', 'mupdf-wasm.js', 'mupdf-wasm.wasm', 'LICENSE']) assert.ok(files.includes(f), f);
  for (const f of files) assert.ok((await stat(new URL(f, dir))).size < 100 * 1024 * 1024, `${f} < 100 MB`);
  const attrs = await readFile(new URL('../.gitattributes', import.meta.url), 'utf8');
  assert.doesNotMatch(attrs, /filter=lfs/, 'no Git LFS: GitHub Pages does not serve LFS files');
});

test('every corpus PDF has its truth file', async () => {
  for (const name of CORPUS) {
    const pdf = await readFile(new URL(`${name}.pdf`, FIX));
    assert.equal(new TextDecoder().decode(pdf.subarray(0, 5)), '%PDF-', name);
    const truth = JSON.parse(await readFile(new URL(`${name}.truth.json`, FIX), 'utf8'));
    assert.equal(truth.name, name);
    assert.ok(truth.pages.length >= 1, `${name}: pages`);
  }
});
