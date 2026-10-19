// SPDX-License-Identifier: AGPL-3.0-or-later
// PDF-Editor engine: opens normal, rotated, cropped, encrypted and damaged files; every document tool makes a
// file that reopens in MuPDF and pdf-lib.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as mupdf from '../lib/vendor/mupdf/mupdf.js';
import { PDFDocument } from '../lib/vendor/pdf-lib/pdf-lib.esm.min.js';
import { createEngine } from '../tools/pdf-editor/engine.js';
import { unzip } from '../tools/pdf-editor/zip.js';

const ROOT = new URL('../', import.meta.url);
const readAsset = async (p) => new Uint8Array(await readFile(new URL(p, ROOT)));
const fixture = (name) => readAsset(`tests/fixtures/pdf-editor/${name}`);
const { ops } = await createEngine({ readAsset });

/** A PDF result reopens without repair in MuPDF (with `password`) and in pdf-lib; returns the page count. */
async function reopens(bytes, password) {
  const doc = new mupdf.PDFDocument(bytes);
  if (password) assert.ok(doc.authenticatePassword(password), 'password accepted');
  assert.equal(doc.wasRepaired(), false, 'no repair');
  const n = doc.countPages();
  for (let i = 0; i < n; i++) doc.loadPage(i).toStructuredText();
  const pl = await PDFDocument.load(bytes, { ignoreEncryption: !!password });
  assert.equal(pl.getPageCount(), n);
  return n;
}

test('engine opens normal, rotated, cropped files; encrypted needs its password; damaged is repaired', async () => {
  for (const name of ['plan.pdf', 'rotated.pdf', 'cropped.pdf']) {
    const { value } = await ops.flatten({ bytes: await fixture(name), annotations: false, fields: false });
    assert.equal(await reopens(value), 3, name);
  }
  await assert.rejects(ops.flatten({ bytes: await fixture('encrypted.pdf') }), (e) => e.code === 'password');
  await assert.rejects(ops.flatten({ bytes: await fixture('encrypted.pdf'), password: 'falsch' }), (e) => e.code === 'password');
  const { value } = await ops.flatten({ bytes: await fixture('encrypted.pdf'), password: 'geheim', annotations: false, fields: false });
  assert.ok(value.length > 1000);
  const repaired = await ops.repair({ bytes: await fixture('damaged.pdf') });
  assert.equal(repaired.value.repaired, true);
  assert.ok((await reopens(repaired.value.bytes)) >= 1);
  await assert.rejects(ops.repair({ bytes: new TextEncoder().encode('kein pdf') }), (e) => ['damaged', 'empty'].includes(e.code));
});

test('every document tool makes a file that reopens in MuPDF and pdf-lib', async () => {
  const plan = await fixture('plan.pdf');
  const rotated = await fixture('rotated.pdf');
  const png = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, 40, 20], false);
  png.clear(200);
  const image = png.asPNG().slice();
  const results = {
    split: (await ops.split({ bytes: plan, mode: 'range', range: '2-3', name: 'Plan.pdf' })).value.files[0].bytes,
    pageNumbers: (await ops.pageNumbers({ bytes: rotated, pages: { mode: 'all' } })).value,
    headerFooter: (await ops.headerFooter({ bytes: plan, pages: { mode: 'odd' }, slots: { footerRight: '{n}' } })).value,
    watermarkText: (await ops.watermark({ bytes: rotated, pages: { mode: 'all' }, text: 'Entwurf', tile: true })).value,
    watermarkImage: (await ops.watermark({ bytes: plan, pages: { mode: 'current', current: 1 }, image, opacity: 0.5 })).value,
    imagesToPdf: (await ops.imagesToPdf({ images: [image, image], size: 'A4' })).value,
    flatten: (await ops.flatten({ bytes: plan, annotations: true, fields: true })).value,
    compress: (await ops.compress({ bytes: plan, dpi: 150 })).value.bytes,
    passwordSet: (await ops.password({ bytes: plan, userPassword: 'abc', ownerPassword: 'def' })).value,
    blank: (await ops.blank({ size: 'A3', orientation: 'landscape' })).value,
    outline: (await ops.writeOutline({ bytes: plan, items: [{ title: 'Grundriss', page: 0, level: 0 }, { title: 'Protokoll', page: 1, level: 1 }] })).value,
  };
  for (const [tool, bytes] of Object.entries(results)) {
    await reopens(bytes, tool === 'passwordSet' ? 'abc' : undefined).catch((e) => assert.fail(`${tool}: ${e.message}`));
  }
  assert.equal(new mupdf.PDFDocument(results.split).countPages(), 2);
  assert.equal(new mupdf.PDFDocument(results.imagesToPdf).countPages(), 2);
  const blank = mupdf.Document.openDocument(results.blank, 'application/pdf').loadPage(0).getBounds();
  assert.deepEqual([Math.round(blank[2]), Math.round(blank[3])], [1191, 842]);
  const images = (await ops.toImages({ bytes: plan, pages: { mode: 'range', range: '1-2' }, dpi: 72, format: 'jpg', name: 'Plan.pdf' })).value;
  const entries = unzip(images.files[0].bytes);
  assert.deepEqual(entries.map((e) => e.name), ['Plan_Seite-1.jpg', 'Plan_Seite-2.jpg']);
  const jpg = new mupdf.Image(entries[0].bytes);
  assert.deepEqual([jpg.getWidth(), jpg.getHeight()], [1191, 842]);
  const one = (await ops.toImages({ bytes: plan, pages: { mode: 'current', current: 2 }, dpi: 150, format: 'png', name: 'Plan.pdf' })).value;
  assert.equal(one.files[0].name, 'Plan_Seite-3.png');
});

test('outline: written as a tree, read back flat', async () => {
  const items = [
    { title: 'Grundriss', page: 0, level: 0 },
    { title: 'Lüftung', page: 0, level: 1 },
    { title: 'Abnahme', page: 1, level: 0 },
    { title: 'Text', page: 2, level: 1 },
    { title: 'Anhang', page: 2, level: 0 },
  ];
  const { value } = await ops.writeOutline({ bytes: await fixture('plan.pdf'), items });
  const read = (await ops.readOutline({ bytes: value })).value;
  assert.deepEqual(read, items);
  const cleared = (await ops.writeOutline({ bytes: value, items: [] })).value;
  assert.deepEqual((await ops.readOutline({ bytes: cleared })).value, []);
});

test('images to PDF: paper size, orientation from the image, margin', async () => {
  const wide = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, 300, 100], false);
  wide.clear(0);
  const { value } = await ops.imagesToPdf({ images: [wide.asPNG().slice()], size: 'A4', orientation: 'auto', marginMm: 10 });
  const [, , w, h] = mupdf.Document.openDocument(value, 'application/pdf').loadPage(0).getBounds();
  assert.ok(w > h, 'landscape for a wide image');
  wide.setResolution(300, 300);
  const own = (await ops.imagesToPdf({ images: [wide.asPNG().slice()], size: 'image' })).value;
  const b = mupdf.Document.openDocument(own, 'application/pdf').loadPage(0).getBounds();
  assert.deepEqual([Math.round(b[2]), Math.round(b[3])], [72, 24], '300 × 100 px at 300 dpi');
});
