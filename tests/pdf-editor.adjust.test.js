// SPDX-License-Identifier: AGPL-3.0-or-later
// PDF-Editor page adjustments: content bounds and skew detection on plain grey arrays; crop (margins, to the
// content, reset) on normal and rotated pages; deskew finds and removes a known skew.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as mupdf from '../lib/vendor/mupdf/mupdf.js';
import { contentBounds, detectSkew, cropPages, deskewPages } from '../tools/pdf-editor/adjust.js';
import { createEngine } from '../tools/pdf-editor/engine.js';

const ROOT = new URL('../', import.meta.url);
const readAsset = async (p) => new Uint8Array(await readFile(new URL(p, ROOT)));
const { ops } = await createEngine({ readAsset });
const MM = 72 / 25.4;

/** A grey image (255 = white) with text-like bars turned clockwise by `deg` (as shown). */
function bars(width, height, deg) {
  const px = new Uint8Array(width * height).fill(255);
  const t = Math.tan((deg * Math.PI) / 180);
  for (let line = 40; line < height - 40; line += 24) {
    for (let x = 30; x < width - 30; x++) {
      if (x % 28 > 22) continue; // word gaps
      const y0 = Math.round(line + x * t);
      for (let y = y0; y < y0 + 6; y++) if (y >= 0 && y < height) px[y * width + x] = 0;
    }
  }
  return px;
}

/** A one-page PDF with text-like bars turned clockwise by `deg` around the page centre, page /Rotate `rotate`. */
function skewedPdf(deg, rotate = 0) {
  const doc = new mupdf.PDFDocument();
  const r = (-deg * Math.PI) / 180;
  let s = `q ${Math.cos(r)} ${Math.sin(r)} ${-Math.sin(r)} ${Math.cos(r)} 297 421 cm\n`;
  for (let i = -12; i <= 12; i++) for (let w = -8; w < 8; w++) s += `${w * 28 + 2} ${i * 24} 22 6 re f\n`;
  doc.insertPage(-1, doc.addPage([0, 0, 595, 842], rotate, doc.newDictionary(), `${s}Q\n`));
  return doc;
}

test('contentBounds: box of the dark pixels, specks ignored, blank page null', () => {
  const w = 100;
  const h = 80;
  const px = new Uint8Array(w * h).fill(255);
  for (let y = 20; y < 50; y++) for (let x = 10; x < 70; x++) px[y * w + x] = 0;
  px[5 * w + 95] = 0; // a speck
  assert.deepEqual(contentBounds(px, w, h), [10, 20, 70, 50]);
  assert.equal(contentBounds(new Uint8Array(w * h).fill(255), w, h), null);
});

test('detectSkew: finds the angle of text lines within 0.1°, null without ink', () => {
  for (const deg of [-4, -1.5, 0, 0.7, 3]) {
    const a = detectSkew(bars(600, 500, deg), 600, 500);
    assert.ok(Math.abs(a - deg) <= 0.1, `${deg}: ${a}`);
  }
  assert.equal(detectSkew(new Uint8Array(100 * 100).fill(255), 100, 100), null);
});

test('cropPages: margins from the shown edges on rotated pages, to content, reset', () => {
  for (const rotate of [0, 90, 270]) {
    const doc = new mupdf.PDFDocument();
    doc.insertPage(-1, doc.addPage([0, 0, 595, 842], rotate, doc.newDictionary(), ''));
    assert.equal(cropPages(mupdf, doc, { pages: [0], mode: 'margins', top: 10, left: 20 }), 1);
    const [x0, y0, x1, y1] = doc.loadPage(0).getBounds();
    const [w, h] = rotate ? [842, 595] : [595, 842];
    assert.ok(Math.abs(x1 - x0 - (w - 20 * MM)) < 0.5 && Math.abs(y1 - y0 - (h - 10 * MM)) < 0.5, `rotate ${rotate}`);
    assert.equal(cropPages(mupdf, doc, { pages: [0], mode: 'reset' }), 1);
    assert.deepEqual(doc.loadPage(0).getBounds(), [0, 0, w, h]);
  }
  const doc = new mupdf.PDFDocument();
  doc.insertPage(-1, doc.addPage([0, 0, 595, 842], 90, doc.newDictionary(), '100 200 300 400 re f\n'));
  cropPages(mupdf, doc, { pages: [0], mode: 'auto', padding: 0 });
  const b = doc.loadPage(0).getBounds();
  assert.ok(Math.abs(b[2] - b[0] - 400) < 2 && Math.abs(b[3] - b[1] - 300) < 2, JSON.stringify(b)); // turned: 400 wide
  assert.throws(() => cropPages(mupdf, doc, { pages: [0], mode: 'margins', top: 200 }), (e) => e.code === 'crop');
});

test('deskewPages: a page skewed by 3° comes out straight, also with /Rotate 90', () => {
  for (const rotate of [0, 90]) {
    const doc = skewedPdf(3, rotate);
    const r = deskewPages(mupdf, doc, { pages: [0] });
    assert.equal(r.pages, 1);
    assert.ok(Math.abs(r.angles[0].angle - 3) <= 0.1, String(r.angles[0].angle));
    assert.equal(deskewPages(mupdf, doc, { pages: [0] }).pages, 0, `rotate ${rotate}: straight now`);
  }
});

test('engine crop and deskew: result reopens; nothing to do gives no bytes', async () => {
  const bytes = skewedPdf(2).saveToBuffer('compress').asUint8Array().slice();
  const d = await ops.deskew({ bytes: bytes.slice(), pages: { mode: 'all' } });
  assert.equal(d.value.pages, 1);
  assert.equal(new mupdf.PDFDocument(d.value.bytes).wasRepaired(), false);
  const none = await ops.deskew({ bytes: d.value.bytes.slice(), pages: { mode: 'all' } });
  assert.equal(none.value.bytes, null);
  const c = await ops.crop({ bytes: bytes.slice(), pages: { mode: 'current', current: 0 }, mode: 'auto', padding: 5 });
  assert.equal(c.value.pages, 1);
  await assert.rejects(ops.crop({ bytes: bytes.slice(), pages: { mode: 'all' }, mode: 'margins', top: 400 }), (e) => e.code === 'crop');
  assert.equal((await ops.crop({ bytes: bytes.slice(), pages: { mode: 'all' }, mode: 'reset' })).value.bytes, null);
});
