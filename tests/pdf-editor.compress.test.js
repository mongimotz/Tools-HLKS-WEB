// SPDX-License-Identifier: AGPL-3.0-or-later
// PDF-Editor compression and flattening: never a larger file; downsampling only where it saves; flatten
// removes annotations and form fields as objects but keeps how the page looks.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as mupdf from '../lib/vendor/mupdf/mupdf.js';
import { createEngine } from '../tools/pdf-editor/engine.js';
import { compressPdf } from '../tools/pdf-editor/compress.js';

const ROOT = new URL('../', import.meta.url);
const readAsset = async (p) => new Uint8Array(await readFile(new URL(p, ROOT)));
const fixture = (name) => readAsset(`tests/fixtures/pdf-editor/${name}`);
const { ops } = await createEngine({ readAsset });

/** Grey raster of a page (for comparing looks). */
function raster(bytes, page = 0, scale = 0.5) {
  const pix = mupdf.Document.openDocument(bytes, 'application/pdf').loadPage(page).toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceGray, false);
  return { w: pix.getWidth(), h: pix.getHeight(), px: pix.getPixels().slice() };
}
const diff = (a, b) => {
  let d = 0;
  for (let i = 0; i < a.px.length; i++) d += Math.abs(a.px[i] - b.px[i]);
  return d / a.px.length;
};

/** A PDF with one large photo-like RGB image on an A4 page: smooth shapes plus sensor noise, like a photo. */
function photoPdf(px = 3600) {
  const pix = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, px, px], false);
  const p = pix.getPixels();
  let s = 7;
  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      const base = 128 + 70 * Math.sin(x / 90) * Math.cos(y / 140);
      for (let c = 0; c < 3; c++) {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        p[(y * px + x) * 3 + c] = Math.max(0, Math.min(255, base + c * 20 + ((s >> 16) % 24) - 12));
      }
    }
  }
  const doc = new mupdf.PDFDocument();
  const res = doc.newDictionary();
  const xo = doc.newDictionary();
  xo.put('Im0', doc.addImage(new mupdf.Image(pix)));
  res.put('XObject', xo);
  doc.insertPage(0, doc.addPage([0, 0, 595, 842], 0, res, 'q 500 0 0 500 47 171 cm /Im0 Do Q'));
  return doc.saveToBuffer('compress').asUint8Array().slice();
}

test('compress never returns a larger file', async () => {
  for (const name of ['plan.pdf', 'scan.pdf', 'embedpdf-annotated.pdf']) {
    const bytes = await fixture(name);
    const r = compressPdf(mupdf, bytes, { dpi: 150 });
    assert.ok(r.after <= r.before, `${name}: ${r.after} ≤ ${r.before}`);
    assert.ok(r.bytes.length <= bytes.length);
    if (!r.smaller) assert.equal(r.bytes, bytes, `${name}: original kept`);
  }
});

test('compress: large images are downsampled to the target resolution over the page', async () => {
  const bytes = photoPdf();
  const r = compressPdf(mupdf, bytes, { dpi: 150, quality: 70 });
  assert.equal(r.images, 1);
  assert.ok(r.smaller && r.after < r.before / 2, `${r.before} → ${r.after}`);
  const doc = new mupdf.PDFDocument(r.bytes);
  const xo = doc.loadPage(0).getObject().get('Resources', 'XObject', 'Im0');
  const img = doc.loadImage(xo);
  assert.equal(Math.max(img.getWidth(), img.getHeight()), Math.ceil(150 * (842 / 72)), 'longest side = 150 dpi over the page height');
  assert.ok(diff(raster(bytes), raster(r.bytes)) < 12, 'looks the same');
  const none = compressPdf(mupdf, bytes, { dpi: null });
  assert.equal(none.images, 0);
  const keep = compressPdf(mupdf, r.bytes, { dpi: 300 });
  assert.equal(keep.images, 0, 'an image below the target stays');
});

test('flatten removes annotations and form fields as objects but keeps their look', async () => {
  for (const name of ['plan.pdf', 'embedpdf-annotated.pdf']) {
    const bytes = await fixture(name);
    const before = new mupdf.PDFDocument(bytes);
    const count = (doc) => Array.from({ length: doc.countPages() }, (_, i) => doc.loadPage(i).getAnnotations().length + doc.loadPage(i).getWidgets().length).reduce((a, b) => a + b, 0);
    assert.ok(count(before) > 0, `${name} has annotations`);
    const { value } = await ops.flatten({ bytes, annotations: true, fields: true });
    const after = new mupdf.PDFDocument(value);
    assert.equal(count(after), 0, `${name}: no annotation objects left`);
    for (let i = 0; i < Math.min(2, after.countPages()); i++) assert.ok(diff(raster(bytes, i), raster(value, i)) < 2, `${name} page ${i + 1} looks the same`);
  }
  const only = await ops.flatten({ bytes: await fixture('plan.pdf'), annotations: true, fields: false });
  const doc = new mupdf.PDFDocument(only.value);
  assert.equal(doc.loadPage(0).getAnnotations().length, 0);
  assert.equal(doc.loadPage(1).getWidgets().length, 2, 'form fields stay');
});
