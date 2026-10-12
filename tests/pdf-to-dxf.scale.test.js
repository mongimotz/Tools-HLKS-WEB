// SPDX-License-Identifier: AGPL-3.0-or-later
// Phase 4: units and scale. The 100 mm control distance of lines.pdf is exactly 10 000 mm at 1:100,
// two-point calibration, units, origin; settings repair is idempotent.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeTransform, calibrate, scaleLabel, snapPoint, toDxfEntities, PT_MM } from '../tools/pdf-to-dxf/pipeline.js';
import { writeDxf } from '../tools/pdf-to-dxf/dxf.js';
import { createBackend } from '../tools/pdf-to-dxf/backend.js';
import { defaultSettings, normalizeInputs, applyPreset, presetOf, PRESETS, SCALES } from '../tools/pdf-to-dxf/defaults.js';
import { readDxf } from './helpers/dxf-reader.js';
import { loadFixture } from './helpers/truth.js';

const backend = await createBackend();
const { bytes, truth } = await loadFixture('lines');
backend.open(bytes);
const page = backend.extract(0);
const { p0, p1 } = truth.expect.control;

function controlLength(scale, unit) {
  const ents = toDxfEntities(page.entities, makeTransform({ scale, unit }));
  const dxf = readDxf(writeDxf({ entities: ents }, { units: unit }).bytes);
  assert.deepEqual(dxf.errors, []);
  const k = (PT_MM * scale) / { mm: 1, cm: 10, m: 1000 }[unit];
  const line = dxf.entities.find((e) => e.type === 'LINE' && Math.abs(e.pts[0] - p0[0] * k) < 1e-3 && Math.abs(e.pts[1] - p0[1] * k) < 1e-3);
  assert.ok(line, 'control line');
  return { len: Math.hypot(line.pts[2] - line.pts[0], line.pts[3] - line.pts[1]), dxf };
}

test('control distance: 100 mm on paper is 10 000 mm at 1:100', () => {
  const { len, dxf } = controlLength(100, 'mm');
  assert.ok(Math.abs(len - 10000) <= 0.01, `length ${len}`);
  assert.equal(dxf.header.$INSUNITS[0][1], '4');
});

test('control distance in cm and m, other scales', () => {
  const cm = controlLength(100, 'cm');
  assert.ok(Math.abs(cm.len - 1000) <= 0.001);
  assert.equal(cm.dxf.header.$INSUNITS[0][1], '5');
  const m = controlLength(100, 'm');
  assert.ok(Math.abs(m.len - 10) <= 0.00001);
  assert.equal(m.dxf.header.$INSUNITS[0][1], '6');
  for (const s of SCALES) assert.ok(Math.abs(controlLength(s, 'mm').len - 100 * s) <= 0.0001 * s, `1:${s}`);
});

// The fixture writes coordinates with 4 decimals, so the control line is 100 mm ± 0.00001 mm: tolerance 1e-4.
test('calibration: two points and a real length give the scale', () => {
  assert.ok(Math.abs(calibrate(p0[0], p0[1], p1[0], p1[1], 10000) - 100) < 1e-4);
  assert.ok(Math.abs(calibrate(p0[0], p0[1], p1[0], p1[1], 9870) - 98.7) < 1e-4);
  assert.equal(calibrate(1, 1, 1, 1, 100), null);
  assert.equal(calibrate(0, 0, 10, 0, 0), null);
  assert.equal(scaleLabel(100), '1:100');
  assert.equal(scaleLabel(98.71), '1:98.7');
  assert.equal(scaleLabel(NaN), '–');
});

test('snapping: clicks near a line end snap onto it', () => {
  const s = snapPoint(page.entities, p0[0] + 1.5, p0[1] - 1, 3);
  assert.deepEqual(s, [p0[0], p0[1]]);
  assert.equal(snapPoint(page.entities, 20, 20, 3), null);
  // calibrating with snapped points is exact even with sloppy clicks
  const a = snapPoint(page.entities, p0[0] + 2, p0[1] + 1, 4);
  const b = snapPoint(page.entities, p1[0] - 1, p1[1] + 2, 4);
  assert.ok(Math.abs(calibrate(a[0], a[1], b[0], b[1], 5000) - 50) < 1e-4);
});

test('origin: page corner or centre of the geometry', () => {
  const xf = makeTransform({ scale: 1, origin: 'center', bounds: [100, 200, 300, 400] });
  const [e] = toDxfEntities([{ kind: 'line', pts: Float64Array.of(200, 300, 300, 400), a: {} }], xf);
  assert.deepEqual(e.pts.map((v) => Math.round(v * 1e9) / 1e9), [0, 0, Math.round(100 * PT_MM * 1e9) / 1e9, Math.round(100 * PT_MM * 1e9) / 1e9]);
  const off = makeTransform({ scale: 1, offset: [1000, 0] });
  const [f] = toDxfEntities([{ kind: 'line', pts: Float64Array.of(0, 0, 1, 0), a: {} }], off);
  assert.ok(Math.abs(f.pts[0] - 1000 * PT_MM) < 1e-9);
});

test('settings: defaults, repair, idempotent, presets', () => {
  const d = defaultSettings();
  assert.deepEqual(normalizeInputs(d), d);
  assert.deepEqual(normalizeInputs(null), d);
  const broken = { scale: -5, unit: 'inch', version: 'R14', tol: { join: 'x' }, scan: { dpi: 9999 }, area: [5, 5, 1, 1], layersOff: ['A', 'A', 3], colorsOff: ['ff0000', 'red'], widthsOff: [35, 35, 999] };
  const once = normalizeInputs(broken);
  assert.deepEqual(normalizeInputs(once), once, 'idempotent');
  assert.equal(once.scale, 100);
  assert.equal(once.unit, 'mm');
  assert.equal(once.version, 'R2000');
  assert.equal(once.scan.dpi, 300);
  assert.equal(once.area, null);
  assert.deepEqual(once.layersOff, ['A']);
  assert.deepEqual(once.colorsOff, ['ff0000']);
  assert.deepEqual(once.widthsOff, [35]);
  for (const name of Object.keys(PRESETS)) {
    const s = applyPreset(d, name);
    assert.equal(s.preset, name);
    assert.equal(presetOf(s), name);
    assert.deepEqual(normalizeInputs(s), s);
  }
  assert.equal(applyPreset(d, 'compat').version, 'R12');
  assert.equal(applyPreset(d, 'compat').trueColor, false);
  assert.equal(normalizeInputs({ ...d, text: 'omit' }).preset, 'custom');
});
