// SPDX-License-Identifier: AGPL-3.0-or-later
// Phase 5: structure. PDF layers become DXF layers (hidden ones only on request), clip paths are applied,
// duplicates are removed and segments joined, fills are kept as outline, ignored or hatched.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBackend } from '../tools/pdf-to-dxf/backend.js';
import { createService } from '../tools/pdf-to-dxf/convert.js';
import { defaultSettings, normalizeInputs } from '../tools/pdf-to-dxf/defaults.js';
import { layerNameFor, dedupeSegments, joinSegments } from '../tools/pdf-to-dxf/pipeline.js';
import { toPlain, attrs as makeAttrs } from '../tools/pdf-to-dxf/ir.js';
import { readDxf } from './helpers/dxf-reader.js';
import { loadFixture, matchAll } from './helpers/truth.js';

const svc = createService(await createBackend());

async function run(name, changes = {}, page = 0) {
  const { bytes, truth } = await loadFixture(name);
  svc.open({ bytes });
  const s = normalizeInputs({ ...defaultSettings(), page, ...changes });
  return { truth, s, ...svc.processPage(page, s, {}) };
}

const geometryOnly = (list) => list.map(({ kind, pts, closed }) => ({ kind, pts, ...(closed !== undefined ? { closed } : {}) }));

test('layers: PDF layer names, hidden layer only on request, other content by colour and width', async () => {
  const off = await run('layers');
  const names = off.layers.map((l) => l.name);
  assert.ok(names.includes('Waende') && names.includes('Moebel'));
  assert.ok(!names.includes('Bemassung'));
  assert.equal(off.layers.find((l) => l.name === 'Waende').count, 2);
  assert.equal(off.layers.find((l) => l.name === 'Moebel').count, 2);
  assert.ok(names.includes('PDF_RGB_0-0-0_0.18'), names.join());

  const on = await run('layers', { hiddenLayers: true });
  const bem = on.layers.find((l) => l.name === 'Bemassung');
  assert.equal(bem.count, 3);
  assert.equal(bem.visible, false);
  assert.equal(bem.pdf, true);
  // exact geometry, layer by layer
  const { missing, extra } = matchAll(
    on.entities,
    on.truth.pages[0].entities.map((e) => ({ ...e, source: undefined, lineWidthPt: undefined })),
    0.01,
    { loose: true },
  );
  assert.deepEqual(missing, []);
  assert.deepEqual(extra, []);
});

test('layer modes without PDF layers', () => {
  const e = { kind: 'line', a: makeAttrs({ rgb: [255, 0, 0], lineWidthPt: 1 }) };
  assert.equal(layerNameFor(e, 'single'), 'PDF');
  assert.equal(layerNameFor(e, 'color'), 'PDF_RGB_255-0-0');
  assert.equal(layerNameFor(e, 'width'), 'PDF_0.35');
  assert.equal(layerNameFor(e, 'colorWidth'), 'PDF_RGB_255-0-0_0.35');
  assert.equal(layerNameFor({ kind: 'polyline', a: makeAttrs({ rgb: [9, 9, 9], source: 'fill' }) }, 'colorWidth'), 'PDF_RGB_9-9-9_FILL');
  assert.equal(layerNameFor({ kind: 'text', a: makeAttrs({ source: 'text' }) }, 'colorWidth'), 'PDF_TEXT');
  assert.equal(layerNameFor({ kind: 'line', a: makeAttrs({ ocg: 'Wände' }) }, 'single'), 'Wände');
});

test('clip: exactly the clipped geometry; "ignore" keeps everything', async () => {
  const r = await run('clip');
  const { missing, extra } = matchAll(r.entities, r.truth.expect.clipped, 0.01, { loose: true, attrs: false });
  assert.deepEqual(missing, []);
  assert.deepEqual(extra, []);
  const ignored = await run('clip', { clip: 'ignore' });
  assert.equal(ignored.entities.length, r.truth.pages[0].entities.length);
});

test('dupes: no duplicates, collinear pieces merged, loose segments joined', async () => {
  const r = await run('dupes');
  const { missing, extra } = matchAll(r.entities, r.truth.expect.result, 0.01, { loose: true, attrs: false });
  assert.deepEqual(missing, []);
  assert.deepEqual(extra, [], JSON.stringify(geometryOnly(extra)));
  assert.equal(r.entities.length, r.truth.expect.result.length);
  // count: every segment once
  const segs = new Set();
  for (const e of r.entities) {
    const p = e.pts;
    const m = p.length / 2;
    const n = e.closed ? m : m - 1;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % m;
      const a = `${p[2 * i]},${p[2 * i + 1]}`;
      const b = `${p[2 * j]},${p[2 * j + 1]}`;
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      assert.ok(!segs.has(key), `duplicate ${key}`);
      segs.add(key);
    }
  }
  // the stroke wins over the fill outline
  const rect = r.entities.find((e) => e.closed && e.pts.includes(600));
  assert.equal(rect.a.source, 'stroke');
});

test('dedupe off and join off keep the raw pieces', async () => {
  const r = await run('dupes', { dedupe: false, join: false, hatch: 'keep' });
  assert.equal(r.entities.length, r.truth.pages[0].entities.length);
});

test('dedupe: partly overlapping pieces of different colours keep their own parts', () => {
  const black = makeAttrs({ rgb: [0, 0, 0], lineWidthPt: 1, layer: 'L' });
  const red = makeAttrs({ rgb: [255, 0, 0], lineWidthPt: 1, layer: 'L' });
  const segs = { n: 2, xy: Float64Array.of(0, 0, 100, 0, 50, 0, 150, 0), attr: Int32Array.of(0, 1) };
  const { segs: out } = dedupeSegments(segs, [black, red], 0.01);
  const pieces = [];
  for (let i = 0; i < out.n; i++) pieces.push([...out.xy.subarray(4 * i, 4 * i + 4)].map((v) => Math.round(v * 1e6) / 1e6).concat(out.attr[i]));
  pieces.sort((p, q) => p[0] - q[0]);
  assert.deepEqual(pieces, [
    [0, 0, 50, 0, 0],
    [50, 0, 150, 0, 1], // the red line is painted later and wins where both are
  ]);
  const joined = joinSegments(out, [black, red], 0.01);
  assert.equal(joined.length, 2, 'different colours do not join');
});

test('fills: outline (default), ignore, hatch in the DXF', async () => {
  const outline = await run('hatch', { hatch: 'keep' });
  const fill = outline.entities.find((e) => e.a.source === 'fill');
  assert.ok(fill && fill.kind === 'polyline' && fill.closed);
  assert.equal(fill.pts.length, 6);
  const ignore = await run('hatch', { fills: 'ignore' });
  assert.ok(!ignore.entities.some((e) => e.a.source === 'fill'));
  const s = normalizeInputs({ ...defaultSettings(), fills: 'hatch' });
  const dxf = readDxf(svc.buildDxf([svc.processPage(0, s, {})], s).bytes);
  assert.deepEqual(dxf.errors, []);
  assert.equal(dxf.entities.filter((e) => e.type === 'HATCH').length, 1);
});

test('rectangle drawn as fill and outline comes out once, as a closed polyline', async () => {
  const r = await run('dupes');
  const closed = r.entities.filter((e) => e.kind === 'polyline' && e.closed);
  assert.equal(closed.length, 2);
  assert.ok(closed.every((e) => toPlain(e).pts.length === 4));
});
