// Duct sizing (Kanalrechner): SIA 382/1 tables 49 and 50, sizing modes, PDF round trip and reference PDFs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

import {
  compute,
  snapshotOf,
  roundVelocityLimit,
  reductionFactor,
  stageHours,
  crossSection,
  snapDiameter,
  CALC_VERSION,
} from '../tools/duct-sizing/calc.js';
import {
  normalizeInputs,
  exampleInputs,
  emptyInputs,
  defaultVelocityLimits,
  defaultReductionFactors,
  printedPositions,
  TOOL_ID,
  INPUT_VERSION,
} from '../tools/duct-sizing/defaults.js';
import { buildReport } from '../tools/duct-sizing/report.js';
import { buildCsv } from '../tools/duct-sizing/csv.js';
import { extractDataJson, isPdf } from '../lib/core/pdf.js';
import { createEnvelope, parseEnvelope, checkCompatibility } from '../lib/core/envelope.js';

const close = (actual, expected, tol, msg) => assert.ok(Math.abs(actual - expected) <= tol, `${msg ?? ''} expected ${expected}, got ${actual}`);

const T49 = defaultVelocityLimits();
const T50 = defaultReductionFactors();

/** One position with the given fields; SIA method (not the simple mode) unless stated. */
function one(position, system = {}) {
  const inputs = normalizeInputs({ system: { simple: false, hours: 2000, ...system }, current: { ratio: null, ...position } });
  return compute(inputs).current;
}

test('table 49: rows by flow, the bound belongs to the next row', () => {
  assert.equal(roundVelocityLimit(30, 2000, T49), 2.5);
  assert.equal(roundVelocityLimit(999, 2000, T49), 3);
  assert.equal(roundVelocityLimit(1000, 2000, T49), 4);
  assert.equal(roundVelocityLimit(50000, 8000, T49), 5);
  assert.equal(roundVelocityLimit(0, 2000, T49), null);
});

test('table 49: hours interpolated between the columns, edge columns outside', () => {
  close(roundVelocityLimit(5800, 3000, T49), 5.75, 1e-12);
  close(roundVelocityLimit(5800, 6000, T49), 5, 1e-12);
  assert.equal(roundVelocityLimit(5800, 500, T49), 6);
  assert.equal(roundVelocityLimit(5800, 9000, T49), 4.5);
});

test('table 50: interpolated, oval starts at 1/2, edges are clamped', () => {
  close(reductionFactor('rect', 2.5, T50).factor, (0.914 + 0.876) / 2, 1e-12);
  assert.deepEqual(reductionFactor('oval', 1.4, T50), { factor: 0.933, clamped: 2 });
  assert.deepEqual(reductionFactor('rect', 12, T50), { factor: 0.714, clamped: 10 });
  assert.equal(reductionFactor('rect', 1, T50).factor, 0.941);
});

test('SIA 382/1 example: 5800 m³/h, 2740 h/a → 5.8 m/s round, 4.7 rect 1/5, 4.8 oval 1/5', () => {
  const v = roundVelocityLimit(5800, 2740, T49);
  assert.equal(Math.round(v * 10) / 10, 5.8);
  assert.equal(Math.round(v * reductionFactor('rect', 5, T50).factor * 10) / 10, 4.7);
  assert.equal(Math.round(v * reductionFactor('oval', 5, T50).factor * 10) / 10, 4.8);
  // with whole millimetres the rectangle 1/5 reaches its limit
  const r = one({ flow: 5800, shape: 'rect', mode: 'size', ratio: 5 }, { hours: 2740, rectStep: 0 });
  close(r.ratio, 5, 0.05);
  close(r.vmax, 4.73, 0.01);
  assert.ok(r.velocity <= r.vmax);
});

test('round sizing picks the smallest diameter of the series', () => {
  const r = one({ flow: 2000, shape: 'round', mode: 'size' });
  // 2000 m³/h → 5 m/s → 376 mm needed
  close(r.required.diameter, 376.2, 0.1);
  assert.equal(r.diameter, 400);
  assert.ok(r.velocity <= r.vmax);
  assert.deepEqual(snapDiameter(2100, [100, 2000]), { diameter: 2100, over: true });
});

test('non-round sizes keep the limit with the final aspect ratio', () => {
  for (const shape of ['rect', 'oval']) {
    for (const ratio of [1, 2, 3, 5, 8]) {
      for (const flow of [150, 900, 2500, 7000, 25000]) {
        for (const rectStep of [0, 10, 50, 100]) {
          const r = one({ flow, shape, mode: 'size', ratio }, { rectStep });
          assert.equal(r.status, 'ok', `${shape} 1/${ratio} ${flow}`);
          assert.ok(r.velocity <= r.vmax + 1e-9, `${shape} 1/${ratio} ${flow} grid ${rectStep}: ${r.velocity} > ${r.vmax}`);
          assert.ok(r.width >= r.height, 'B ≥ H');
          if (rectStep) assert.equal(r.width % rectStep, 0);
          // not more slender than asked, unless 1/n is already beyond 1/5
          assert.ok(r.ratio <= Math.max(ratio, 5) + 1e-9, `${shape} 1/${ratio}: got 1/${r.ratio}`);
        }
      }
    }
  }
});

test('fixed height: width is the smallest on the grid', () => {
  const r = one({ flow: 2900, shape: 'rect', mode: 'height', height: 300 }, { hours: 2740 });
  assert.equal(r.height, 300);
  assert.equal(r.width, 600);
  assert.ok(r.velocity <= r.vmax);
  const smaller = one({ flow: 2900, shape: 'rect', mode: 'check', width: 550, height: 300 }, { hours: 2740 });
  assert.ok(smaller.velocity > smaller.vmax);
  assert.ok(smaller.issues.some((i) => i.code === 'velocity-high'));
  assert.equal(smaller.needed.width, 600);
});

test('oval: geometry and a height too large for the flow', () => {
  const g = crossSection('oval', { width: 500, height: 200 });
  close(g.area, (Math.PI * 0.2 ** 2) / 4 + 0.2 * 0.3, 1e-12);
  close(g.dh, (4 * g.area) / (Math.PI * 0.2 + 0.6), 1e-12);
  const r = one({ flow: 500, shape: 'oval', mode: 'height', height: 500 });
  assert.ok(r.issues.some((i) => i.code === 'oval-round'));
  assert.equal(r.width, 500);
});

test('simple method: column 2000 h/a, no reduction factor', () => {
  const r = one({ flow: 5800, shape: 'rect', mode: 'size', ratio: 2 }, { simple: true, hours: 8000 });
  assert.equal(r.vmax, 6);
  assert.equal(r.factor, null);
});

test('full load hours from stages: exponent 2.5 or 1.5, rounded to 10 h', () => {
  const stages = [{ flow: 100, hours: 2500 }, { flow: 60, hours: 3500 }];
  assert.equal(stageHours(stages, 2.5).hours, 3480);
  assert.equal(stageHours(stages, 1.5).hours, 4130);
  assert.equal(stageHours(stages).total, 6000);
  // the estimate counts once its value is taken over as the hours
  const inputs = normalizeInputs({ system: { simple: false, hours: 9000, stages: [{ flow: 100, hours: 9000 }] } });
  const res = compute(inputs);
  assert.equal(res.stages.used, true);
  assert.ok(res.issues.some((i) => i.code === 'stages-long'));
  assert.ok(res.issues.some((i) => i.code === 'hours-high'));
  inputs.system.hours = 4000;
  assert.equal(compute(inputs).stages.used, false);
});

test('missing inputs are reported, not thrown', () => {
  assert.equal(one({ flow: null }).status, 'incomplete');
  assert.ok(one({ flow: 1000, shape: 'round', mode: 'check' }).issues.some((i) => i.code === 'dims-missing'));
  assert.ok(one({ flow: 1000, shape: 'oval', mode: 'check', width: 200, height: 300 }).issues.some((i) => i.code === 'oval-width'));
  assert.ok(one({ flow: 1000, shape: 'rect', mode: 'size', ratio: null }).issues.some((i) => i.code === 'ratio-missing'));
  const empty = compute(emptyInputs());
  assert.equal(empty.current.diameter, 300); // 1000 m³/h, simple mode: 4 m/s, 297 mm needed
  assert.equal(empty.positions.size, 0);
});

test('example: no warnings, aspect warning beyond 1/5', () => {
  const res = compute(exampleInputs());
  const all = [...res.issues, ...res.current.issues, ...[...res.positions.values()].flatMap((r) => r.issues)];
  assert.equal(all.filter((i) => i.severity !== 'info').length, 0);
  const r = one({ flow: 5000, shape: 'rect', mode: 'size', ratio: 8 });
  assert.ok(r.issues.some((i) => i.code === 'ratio-high'));
});

test('normalizeInputs is idempotent and fixes modes that do not fit the shape', () => {
  const once = normalizeInputs(exampleInputs());
  assert.deepEqual(normalizeInputs(JSON.parse(JSON.stringify(once))), once);
  const fixed = normalizeInputs({ positions: [{ id: 'current', shape: 'round', mode: 'height' }] });
  assert.equal(fixed.positions[0].mode, 'size');
  assert.notEqual(fixed.positions[0].id, 'current');
});

test('printed positions: the pins, plus the input panel if it is not pinned', () => {
  const inputs = exampleInputs();
  assert.equal(printedPositions(inputs).length, inputs.positions.length);
  inputs.current.flow = 6000;
  const list = printedPositions(inputs);
  assert.equal(list.length, inputs.positions.length + 1);
  assert.equal(list.at(-1).id, 'current');
});

// ---- files -------------------------------------------------------------------------

const project = { name: 'Testprojekt Ä/Ö/Ü', number: 'P-7', author: 'Test', date: '2026-10-11' };

async function exportPdf(doc) {
  const result = compute(doc.inputs);
  const env = createEnvelope({ tool: TOOL_ID, version: INPUT_VERSION, calcVersion: CALC_VERSION, project: doc.project, inputs: doc.inputs, snapshot: snapshotOf(result) });
  return buildReport(doc, result, env);
}

async function importPdf(bytes) {
  assert.ok(isPdf(bytes));
  const env = parseEnvelope(await extractDataJson(bytes));
  assert.deepEqual(checkCompatibility(env, { tool: TOOL_ID, version: INPUT_VERSION, calcVersion: CALC_VERSION }), []);
  return { env, doc: { project: env.project, inputs: normalizeInputs(env.inputs) } };
}

test('PDF round trip keeps project and inputs identical', async () => {
  const inputs = exampleInputs();
  inputs.system.hours = 3480; // from the stages
  inputs.current.note = 'Sonderzeichen: Ø × ≤ ² ³ ° “Zitat” <tag> & ;';
  const doc = { project, inputs };
  const { doc: back1 } = await importPdf(await exportPdf(doc));
  assert.deepEqual(back1, doc);
  const { doc: back2, env } = await importPdf(await exportPdf(back1));
  assert.deepEqual(back2, doc);
  assert.deepEqual(env.snapshot, snapshotOf(compute(doc.inputs)));
});

test('CSV export has one line per printed position plus header', () => {
  const inputs = exampleInputs();
  const csv = buildCsv({ project, inputs }, compute(inputs));
  assert.equal(csv.trim().split('\r\n').length, printedPositions(inputs).length + 1);
  assert.ok(csv.startsWith('﻿'));
});

test('fixture PDFs still import and reproduce their snapshot', async () => {
  const dir = new URL('./fixtures/', import.meta.url);
  const files = (await readdir(dir)).filter((f) => f.startsWith(`${TOOL_ID}_`) && f.endsWith('.pdf'));
  assert.ok(files.length > 0, 'at least one fixture (npm run fixtures)');
  for (const f of files) {
    const env = parseEnvelope(await extractDataJson(new Uint8Array(await readFile(new URL(f, dir)))));
    checkCompatibility(env, { tool: TOOL_ID, version: INPUT_VERSION, calcVersion: CALC_VERSION });
    const snap = snapshotOf(compute(normalizeInputs(env.inputs)));
    if (env.calcVersion !== CALC_VERSION) continue;
    assert.deepEqual(snap, env.snapshot, `${f}: result changed (calc ${env.calcVersion} → ${CALC_VERSION})`);
  }
});
