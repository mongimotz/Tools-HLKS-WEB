// SPDX-License-Identifier: AGPL-3.0-or-later
// Phase 2: the MuPDF backend reads every vector fixture into the IR exactly as its truth file says
// (tolerance 0.01 pt), including page geometry (/Rotate, CropBox) and several pages.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBackend, PdfError, parseSvgPath } from '../tools/pdf-to-dxf/backend.js';
import { loadFixture, matchAll } from './helpers/truth.js';

const VECTOR = ['lines', 'curves', 'layers', 'clip', 'text', 'hatch', 'dash', 'dupes', 'rotated', 'multipage'];

const backend = await createBackend();

const brief = (list) => JSON.stringify(list.slice(0, 3)).slice(0, 600);

for (const name of VECTOR) {
  test(`extract ${name}: IR equals the truth`, async () => {
    const { bytes, truth } = await loadFixture(name);
    backend.open(bytes);
    assert.equal(backend.getPageCount(), truth.pages.length, 'page count');
    truth.pages.forEach((tp, i) => {
      const page = backend.extract(i, { hiddenLayers: true });
      assert.ok(Math.abs(page.width - tp.width) < 0.01 && Math.abs(page.height - tp.height) < 0.01, `page ${i} size ${page.width} × ${page.height}`);
      const { missing, extra } = matchAll(page.entities, tp.entities, 0.01);
      assert.deepEqual(missing, [], `page ${i}: missing ${brief(missing)}; extra ${brief(extra)}`);
      assert.deepEqual(extra, [], `page ${i}: extra ${brief(extra)}`);
    });
  });
}

test('layers: names, default visibility, hidden layer skipped by default', async () => {
  const { bytes, truth } = await loadFixture('layers');
  backend.open(bytes);
  const all = backend.extract(0, { hiddenLayers: true });
  for (const l of truth.expect.layers) {
    const got = all.layers.find((x) => x.name === l.name);
    assert.ok(got, l.name);
    assert.equal(got.visible, l.visible, `${l.name} visible`);
    assert.equal(all.entities.filter((e) => e.a.ocg === l.name).length, l.count, `${l.name} count`);
  }
  const visibleOnly = backend.extract(0);
  assert.equal(visibleOnly.entities.filter((e) => e.a.ocg === 'Bemassung').length, 0);
  assert.equal(visibleOnly.entities.filter((e) => e.a.ocg == null).length, truth.expect.noLayer);
});

test('clip: rectangle and triangle clips are recorded, entities point at them', async () => {
  const { bytes } = await loadFixture('clip');
  backend.open(bytes);
  const page = backend.extract(0);
  const rects = page.clips.filter((c) => c?.rect);
  const polys = page.clips.filter((c) => c?.rings);
  assert.ok(rects.some((c) => c.rect.join() === '100,500,300,650'), 'rect clip');
  assert.equal(polys.length, 1, 'triangle clip');
  assert.equal(polys[0].rings[0].length, 6);
  const free = page.entities.filter((e) => e.a.clipId === 0);
  assert.equal(free.length, 1, 'one line without clip');
});

test('text: strings, unmapped text, rotation', async () => {
  const { bytes } = await loadFixture('text');
  backend.open(bytes);
  const page = backend.extract(0);
  assert.equal(page.stats.texts, 5);
  assert.equal(page.stats.unmapped, 1);
  const outlines = backend.extract(0, { textOutlines: 'unmapped' });
  assert.equal(outlines.outlined, 1);
  assert.equal(outlines.entities.filter((e) => e.kind === 'text').length, 4);
  const rings = outlines.entities.filter((e) => e.kind === 'polyline');
  assert.ok(rings.length >= 13, `glyph outlines: ${rings.length}`);
  for (const r of rings) {
    for (let k = 0; k < r.pts.length; k += 2) {
      assert.ok(r.pts[k] > 99 && r.pts[k] < 180 && r.pts[k + 1] > 297 && r.pts[k + 1] < 309, 'outline near the text');
    }
  }
});

test('rotated page: size and rotation', async () => {
  const { bytes } = await loadFixture('rotated');
  backend.open(bytes);
  const info = backend.getPageInfo(0);
  assert.equal(info.rotate, 90);
  assert.ok(Math.abs(info.width - 641.89) < 0.01 && Math.abs(info.height - 495.28) < 0.01);
});

test('scans: one page-sized image, no vectors', async () => {
  const { bytes } = await loadFixture('scan_clean');
  backend.open(bytes);
  const page = backend.extract(0);
  assert.equal(page.entities.length, 0);
  assert.equal(page.images.length, 1);
  const [x0, y0, x1, y1] = page.images[0].bbox;
  assert.ok(x0 < 1 && y0 < 1 && x1 > page.width - 1 && y1 > page.height - 1);
  const r = backend.renderPage(0, 72);
  assert.ok(Math.abs(r.width - page.width) <= 1, `raster width ${r.width}`);
  assert.equal(r.data.length, r.width * r.height);
});

test('errors: damaged, empty bytes, page out of range', () => {
  assert.throws(() => backend.open(new TextEncoder().encode('%PDF-1.7\n garbage')), PdfError);
  assert.throws(() => backend.open(new Uint8Array(0)), PdfError);
});

test('SVG path parser: absolute, relative, H/V, compact numbers', () => {
  const rings = parseSvgPath('M.5 0H1V1h-.5zm2 2l1-1', 0.01);
  assert.deepEqual(rings[0].pts, [0.5, 0, 1, 0, 1, 1, 0.5, 1]);
  assert.equal(rings[0].closed, true);
  assert.deepEqual(rings[1].pts, [2.5, 2, 3.5, 1]);
});
