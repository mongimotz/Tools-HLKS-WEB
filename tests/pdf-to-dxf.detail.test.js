// SPDX-License-Identifier: AGPL-3.0-or-later
// Phase 6: curves (arcs, circles, free curves), text, dashes, hatch heuristic, filters.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBackend } from '../tools/pdf-to-dxf/backend.js';
import { createService } from '../tools/pdf-to-dxf/convert.js';
import { defaultSettings, normalizeInputs } from '../tools/pdf-to-dxf/defaults.js';
import { fitArc, HATCH_LAYER, PT_MM, TEXT_HEIGHT_RATIO } from '../tools/pdf-to-dxf/pipeline.js';
import { readDxf } from './helpers/dxf-reader.js';
import { loadFixture } from './helpers/truth.js';

const svc = createService(await createBackend());

async function run(name, changes = {}) {
  const { bytes, truth } = await loadFixture(name);
  svc.open({ bytes });
  const s = normalizeInputs({ ...defaultSettings(), ...changes });
  return { truth, s, ...svc.processPage(0, s, {}) };
}

const dxfOf = (r) => {
  const dxf = readDxf(svc.buildDxf([r], r.s).bytes);
  assert.deepEqual(dxf.errors, []);
  return dxf;
};

const near = (a, b, tol) => Math.abs(a - b) <= tol;
const nearDeg = (a, b, tol) => Math.abs(((((a - b) % 360) + 540) % 360) - 180) <= tol;

test('curves: circle and arcs recognised, free curve and ellipse stay curves', async () => {
  const r = await run('curves');
  const circles = r.entities.filter((e) => e.kind === 'circle');
  const arcs = r.entities.filter((e) => e.kind === 'arc');
  assert.equal(circles.length, r.truth.expect.circles.length);
  for (const c of r.truth.expect.circles) assert.ok(circles.some((e) => near(e.cx, c.c[0], 0.01) && near(e.cy, c.c[1], 0.01) && near(e.r, c.r, 0.01)), `circle ${JSON.stringify(c)}`);
  assert.equal(arcs.length, r.truth.expect.arcs.length);
  for (const a of r.truth.expect.arcs) {
    assert.ok(
      arcs.some((e) => near(e.cx, a.c[0], 0.01) && near(e.cy, a.c[1], 0.01) && near(e.r, a.r, 0.01) && nearDeg(e.start, a.start, 0.05) && nearDeg(e.end, a.end, 0.05)),
      `arc ${JSON.stringify(a)}: ${JSON.stringify(arcs.map((e) => [e.cx, e.cy, e.r, e.start, e.end]))}`,
    );
  }
  const curves = r.entities.filter((e) => e.kind === 'polyline');
  assert.equal(curves.length, r.truth.expect.freeCurves, 'S curve and ellipse as polylines');
  const dxf = dxfOf(r);
  assert.equal(dxf.entities.filter((e) => e.type === 'CIRCLE').length, 1);
  assert.equal(dxf.entities.filter((e) => e.type === 'ARC').length, 3);
});

test('curves: splines on request, everything flattened without arcs', async () => {
  const sp = await run('curves', { curves: 'spline' });
  assert.equal(sp.entities.filter((e) => e.kind === 'cubic').length, 5, 'S curve (1) and ellipse (4) as Béziers');
  assert.equal(dxfOf(sp).entities.filter((e) => e.type === 'SPLINE').length, 5);
  const flat = await run('curves', { arcs: false });
  assert.ok(flat.entities.every((e) => e.kind === 'polyline' || e.kind === 'line'));
  // R12 never gets splines
  const r12 = await run('curves', { curves: 'spline', version: 'R12' });
  assert.ok(!r12.entities.some((e) => e.kind === 'cubic'));
});

test('arc fit: clockwise Bézier gives the same counter-clockwise arc; tolerance', () => {
  const k = (4 / 3) * Math.tan(Math.PI / 8);
  const r = 50;
  const cw = [0, r, k * r, r, r, k * r, r, 0]; // from 90° to 0°, clockwise
  const f = fitArc(cw, 0.05);
  assert.ok(f && !f.ccw);
  assert.ok(near(f.cx, 0, 1e-6) && near(f.cy, 0, 1e-6) && near(f.r, r, 1e-6));
  // a slightly flattened arc fails the fit
  const bad = [0, r, k * r * 1.3, r, r, k * r * 1.3, r, 0];
  assert.equal(fitArc(bad, 0.05), null);
});

test('text: position, height, rotation, umlauts; unmapped text as outline or omitted', async () => {
  const r = await run('text');
  const M = r.s.scale;
  const k = PT_MM * M;
  const dxf = dxfOf(r);
  const texts = dxf.entities.filter((e) => e.type === 'TEXT');
  for (const t of r.truth.expect.texts.filter((t) => !t.noUnicode)) {
    const hit = texts.find((e) => e.str === t.str);
    assert.ok(hit, t.str);
    assert.ok(Math.hypot(hit.x - t.pos[0] * k, hit.y - t.pos[1] * k) <= 0.5 * M, `${t.str}: position`);
    assert.ok(near(hit.height, t.height * TEXT_HEIGHT_RATIO * k, 0.001 * M), `${t.str}: height`);
    assert.ok(near(hit.rot, t.rot, 0.01), `${t.str}: rotation ${hit.rot}`);
  }
  // the text without Unicode becomes glyph outlines on PDF_TEXT, not a TEXT
  assert.equal(texts.length, 4);
  assert.ok(dxf.entities.some((e) => e.type === 'LWPOLYLINE' && e.layer === 'PDF_TEXT'));
  const omit = await run('text', { text: 'omit' });
  assert.equal(omit.entities.length, 0);
  const outline = await run('text', { text: 'outline' });
  assert.ok(outline.entities.every((e) => e.kind === 'polyline' && e.closed));
  assert.ok(outline.entities.length > 40);
});

test('dashes: solid with line type, or split into single dashes', async () => {
  const solid = await run('dash');
  const dxf = dxfOf(solid);
  assert.ok(dxf.ltypes.has('DASHED') && dxf.ltypes.has('DASHDOT'));
  assert.equal(dxf.entities.filter((e) => e.linetype === 'DASHED').length, 2, 'dashed line and dashed rectangle');
  assert.equal(dxf.entities.filter((e) => e.linetype === 'DASHDOT').length, 1);
  const exploded = await run('dash', { dashes: 'explode', join: false });
  for (const d of solid.truth.expect.dashed) {
    const pieces = exploded.entities.filter((e) => e.kind === 'line' && near(e.pts[1], d.y, 1e-6) && near(e.pts[3], d.y, 1e-6));
    assert.equal(pieces.length, d.pieces, `y ${d.y}`);
  }
  assert.ok(exploded.entities.every((e) => !e.a.dash));
});

test('hatch: lines on their own layer, outline stays; remove; keep', async () => {
  const r = await run('hatch');
  const hatch = r.entities.filter((e) => e.a.layer === HATCH_LAYER);
  assert.equal(hatch.length, r.truth.expect.hatchLines);
  assert.equal(r.stats.hatchLines, r.truth.expect.hatchLines);
  const outline = r.entities.find((e) => e.kind === 'polyline' && e.closed && e.a.source === 'stroke');
  assert.ok(outline && outline.a.layer !== HATCH_LAYER);
  assert.equal(outline.pts.length, 8);
  const removed = await run('hatch', { hatch: 'remove' });
  assert.equal(removed.entities.filter((e) => e.kind === 'line').length, 0);
  const kept = await run('hatch', { hatch: 'keep' });
  assert.equal(kept.entities.filter((e) => e.a.layer === HATCH_LAYER).length, 0);
});

test('hatch heuristic: fewer than 8 lines, or uneven spacing, is no hatch', async () => {
  const r = await run('lines');
  assert.equal(r.stats.hatchLines, 0);
  const d = await run('dupes');
  assert.equal(d.stats.hatchLines, 0);
});

test('filters: area, minimum length, layers, colours, widths', async () => {
  const all = await run('lines');
  const n = all.entities.length;
  const area = await run('lines', { area: [40, 590, 260, 710] });
  assert.equal(area.entities.length, 1, 'only the first rectangle');
  // lengths on paper: polyline 74.8 mm, diagonal 88.2 mm, control line 100 mm, rectangles 212 and 247 mm
  assert.equal((await run('lines', { minLengthMm: 99.5 })).entities.length, n - 2, 'control line stays');
  assert.equal((await run('lines', { minLengthMm: 100.5 })).entities.length, n - 3, 'control line goes');
  const red = all.layers.find((l) => l.rgb[0] === 255);
  const layersOff = await run('lines', { layersOff: [red.name] });
  assert.equal(layersOff.entities.length, n - 1);
  assert.equal(layersOff.layers.find((l) => l.name === red.name).off, true);
  const colorsOff = await run('lines', { colorsOff: ['0000ff'] });
  assert.equal(colorsOff.entities.length, n - 1);
  const widthsOff = await run('lines', { widthsOff: [35] });
  assert.equal(widthsOff.entities.length, n - 2, 'red rectangle (1 pt) and control line (0.35 mm) both round to 0.35');
});
