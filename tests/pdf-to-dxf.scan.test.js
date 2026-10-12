// SPDX-License-Identifier: AGPL-3.0-or-later
// Phase 8: scanned PDFs. scan_clean: ≥ 90 % of the truth lines found within 1 mm on paper. scan_dirty
// (1.5° skew, grey background, noise, specks, JPEG): skew corrected to < 0.2°, ≥ 70 % found.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBackend } from '../tools/pdf-to-dxf/backend.js';
import { createService } from '../tools/pdf-to-dxf/convert.js';
import { defaultSettings, normalizeInputs } from '../tools/pdf-to-dxf/defaults.js';
import { vectorizeScan, binarize, removeSpecks, estimateSkew, thin, contours, distanceTransform } from '../tools/pdf-to-dxf/scan.js';
import { readDxf } from './helpers/dxf-reader.js';
import { loadFixture } from './helpers/truth.js';
import { scanScore } from './helpers/scan-score.js';

const backend = await createBackend();
const MM = 72 / 25.4;

async function scan(name, options = {}, dpi = 300) {
  const { bytes, truth } = await loadFixture(name);
  backend.open(bytes);
  const page = backend.getPageInfo(0);
  const raster = backend.renderPage(0, dpi);
  return { truth, r: vectorizeScan(raster, page, options) };
}

test('scan_clean: ≥ 90 % of the lines within 1 mm, no skew', async () => {
  const { truth, r } = await scan('scan_clean');
  const s = scanScore(r.lines, truth.expect.lines, MM);
  assert.ok(Math.abs(r.skewDeg) < 0.2, `skew ${r.skewDeg}`);
  assert.ok(s.ratio >= 0.9, `found ${s.found}/${s.total}`);
});

test('scan_dirty: skew corrected (< 0.2° left), ≥ 70 % of the lines within 1 mm', async () => {
  const { truth, r } = await scan('scan_dirty');
  assert.ok(Math.abs(r.skewDeg - truth.expect.skewDeg) < 0.2, `skew ${r.skewDeg}, truth ${truth.expect.skewDeg}`);
  const s = scanScore(r.lines, truth.expect.lines, MM);
  assert.ok(s.ratio >= 0.7, `found ${s.found}/${s.total}`);
  assert.ok(r.lines.length < 3 * truth.expect.lines.length, `few extra pieces: ${r.lines.length}`);
});

test('scan at 200 and 600 dpi, and outline mode', async () => {
  for (const dpi of [200, 600]) {
    const { truth, r } = await scan('scan_dirty', {}, dpi);
    assert.ok(scanScore(r.lines, truth.expect.lines, MM).ratio >= 0.7, `${dpi} dpi`);
  }
  const { truth, r } = await scan('scan_clean', { mode: 'outline' });
  assert.ok(r.lines.every((l) => l.closed));
  assert.ok(scanScore(r.lines, truth.expect.lines, MM).ratio >= 0.9, 'outline');
});

test('line widths are measured (thick walls, thin lines)', async () => {
  const { r } = await scan('scan_clean');
  const widthsMm = r.lines.map((l) => l.widthPt / MM);
  assert.ok(widthsMm.some((w) => w > 0.6 && w < 0.85), 'outer walls about 0.71 mm');
  assert.ok(widthsMm.some((w) => w > 0.1 && w < 0.3), 'thin lines about 0.18–0.25 mm');
});

test('service: scan only on request, own layers, calibration hint, valid DXF', async () => {
  const svc = createService(backend);
  const { bytes } = await loadFixture('scan_dirty');
  svc.open({ bytes });
  const off = svc.process({ settings: { ...defaultSettings() } }, {}).value;
  assert.equal(off.scanned, true);
  assert.ok(off.warnings.some((w) => w.code === 'scan'));
  assert.equal(off.buckets.length, 0);
  const s = normalizeInputs({ ...defaultSettings(), scanOn: true });
  const on = svc.process({ settings: s }, {}).value;
  assert.ok(on.layers.length >= 2 && on.layers.every((l) => l.name.startsWith('SCAN_')), on.layers.map((l) => l.name).join());
  assert.ok(on.warnings.some((w) => w.code === 'calibrate'));
  assert.ok(on.warnings.some((w) => w.code === 'skew' && Math.abs(w.count - 1.5) < 0.2));
  const calibrated = svc.process({ settings: { ...s, calibrated: true } }, {}).value;
  assert.ok(!calibrated.warnings.some((w) => w.code === 'calibrate'));
  const dxf = readDxf(svc.export({ settings: s, name: 'scan_dirty.pdf' }, {}).value.files[0].bytes);
  assert.deepEqual(dxf.errors, []);
  const segments = dxf.entities.reduce((n, e) => n + (e.pts ? e.pts.length / 2 - (e.closed ? 0 : 1) : 0), 0);
  assert.ok(segments >= 18, `segments ${segments}`);
});

// ---- the image steps on synthetic images ------------------------------------------------------------

function image(w, h, fill = 220) {
  return { w, h, data: new Uint8Array(w * h).fill(fill) };
}

function rect(img, x0, y0, x1, y1, v = 30) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) img.data[y * img.w + x] = v;
}

test('threshold: grey background stays white, ink is found', () => {
  const img = image(80, 60, 190);
  for (let i = 0; i < img.data.length; i++) img.data[i] += (i * 7919) % 11; // texture
  rect(img, 10, 20, 70, 23);
  const bin = binarize(img.data, img.w, img.h, { win: 21 });
  let ink = 0;
  for (const v of bin) ink += v;
  assert.equal(ink, 60 * 3);
});

test('specks: small blobs go, lines stay', () => {
  const img = image(60, 60);
  rect(img, 5, 5, 55, 8);
  rect(img, 30, 30, 32, 32);
  const bin = binarize(img.data, 60, 60, { win: 15 });
  assert.equal(removeSpecks(bin, 60, 60, 5), 1);
  assert.equal(bin[31 * 60 + 31], 0);
  assert.equal(bin[6 * 60 + 30], 1);
});

test('skew: a rotated frame gives its angle', () => {
  const w = 400;
  const h = 300;
  const bin = new Uint8Array(w * h);
  const a = (2 * Math.PI) / 180; // 2° counter-clockwise (y up)
  const put = (x, y) => {
    // rotate about the centre; image y is down
    const dx = x - w / 2;
    const dy = h / 2 - y;
    const rx = dx * Math.cos(a) - dy * Math.sin(a) + w / 2;
    const ry = h / 2 - (dx * Math.sin(a) + dy * Math.cos(a));
    const ix = Math.round(rx);
    const iy = Math.round(ry);
    if (ix >= 0 && iy >= 0 && ix < w && iy < h) bin[iy * w + ix] = 1;
  };
  for (let x = 60; x <= 340; x += 0.5) for (const y of [60, 61, 240, 241]) put(x, y);
  for (let y = 60; y <= 240; y += 0.5) for (const x of [60, 61, 340, 341]) put(x, y);
  assert.ok(Math.abs(estimateSkew(bin, w, h) - 2) < 0.15);
});

test('thinning keeps a one-pixel line; distance transform; outlines are closed', () => {
  const w = 40;
  const h = 20;
  const bin = new Uint8Array(w * h);
  for (let y = 8; y < 13; y++) for (let x = 5; x < 35; x++) bin[y * w + x] = 1;
  const d = distanceTransform(bin, w, h);
  assert.ok(Math.abs(d[10 * w + 20] - 3) < 0.01, `centre distance ${d[10 * w + 20]}`);
  const rings = contours(bin, w, h);
  assert.equal(rings.length, 1);
  thin(bin, w, h);
  let n = 0;
  let rows = new Set();
  for (let i = 0; i < bin.length; i++) if (bin[i]) {
    n++;
    rows.add(Math.floor(i / w));
  }
  assert.ok(n >= 20 && n <= 32, `skeleton pixels ${n}`);
  assert.ok(rows.size <= 3);
});
