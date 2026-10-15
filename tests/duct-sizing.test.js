// SPDX-License-Identifier: AGPL-3.0-or-later
// Duct sizing (Kanalrechner): SIA 382/1 tables 49 and 50, sizing modes, PDF round trip and reference PDFs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

import {
  compute,
  computeProject,
  snapshotProjectOf,
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
  calculationInputs,
  newCalculation,
  nextCalculationId,
} from '../tools/duct-sizing/defaults.js';
import { drawingScale, sizeForDrawn, FRAME, FULL_SIZE } from '../tools/duct-sizing/drawing.js';
import { buildReport } from '../tools/duct-sizing/report.js';
import { buildCsv } from '../tools/duct-sizing/csv.js';
import { extractDataJson, isPdf } from '../lib/core/pdf.js';
import { createEnvelope, parseEnvelope, checkCompatibility } from '../lib/core/envelope.js';
import { DocumentStore } from '../lib/core/store.js';
import { PDFDocument } from '../lib/vendor/pdf-lib/pdf-lib.esm.min.js';

const close = (actual, expected, tol, msg) => assert.ok(Math.abs(actual - expected) <= tol, `${msg ?? ''} expected ${expected}, got ${actual}`);

const T49 = defaultVelocityLimits();
const T50 = defaultReductionFactors();

/** One position with the given fields; SIA method (not the simple mode) unless stated. */
function one(position, system = {}) {
  const inputs = normalizeInputs({ calculations: [{ system: { simple: false, hours: 2000, ...system }, current: { ratio: null, ...position } }] });
  return compute(calculationInputs(inputs)).current;
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
  const inputs = calculationInputs(normalizeInputs({ calculations: [{ system: { simple: false, hours: 9000, stages: [{ flow: 100, hours: 9000 }] } }] }));
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
  const empty = compute(calculationInputs(emptyInputs()));
  assert.equal(empty.current.diameter, 300); // 1000 m³/h, simple mode: 4 m/s, 297 mm needed
  assert.equal(empty.positions.size, 0);
});

test('example: no warnings, aspect warning beyond 1/5', () => {
  const res = compute(calculationInputs(exampleInputs()));
  const all = [...res.issues, ...res.current.issues, ...[...res.positions.values()].flatMap((r) => r.issues)];
  assert.equal(all.filter((i) => i.severity !== 'info').length, 0);
  const r = one({ flow: 5000, shape: 'rect', mode: 'size', ratio: 8 });
  assert.ok(r.issues.some((i) => i.code === 'ratio-high'));
  const flat = one({ shape: 'rect', mode: 'check', flow: 3000, width: 1840, height: 80 });
  assert.deepEqual(flat.issues.filter((i) => i.code.startsWith('ratio')).map((i) => [i.code, i.clamped]), [['ratio-high', 10]], 'one note beyond Tab. 50');
});

test('normalizeInputs is idempotent and fixes modes that do not fit the shape', () => {
  const once = normalizeInputs(exampleInputs());
  assert.deepEqual(normalizeInputs(JSON.parse(JSON.stringify(once))), once);
  const fixed = calculationInputs(normalizeInputs({ calculations: [{ positions: [{ id: 'current', shape: 'round', mode: 'height' }] }] }));
  assert.equal(fixed.positions[0].mode, 'size');
  assert.notEqual(fixed.positions[0].id, 'current');
});

test('independent calculations isolate operating data and pins while catalogues stay shared', () => {
  const inputs = exampleInputs();
  const duplicate = structuredClone(inputs.calculations[0]);
  duplicate.id = nextCalculationId(inputs.calculations);
  inputs.calculations.push(duplicate);
  const first = calculationInputs(inputs, 'c1');
  const second = calculationInputs(inputs, duplicate.id);
  const original = structuredClone(inputs.calculations[0]);
  second.current.flow = 18000;
  second.system.simple = true;
  second.system.stages[0].hours = 7000;
  second.positions = [];
  assert.deepEqual(inputs.calculations[0], original);
  assert.notDeepEqual(compute(first).current.diameter, compute(second).current.diameter);
  assert.equal(second.catalogs, first.catalogs);
  second.settings = { roughness: 0.8, temperature: 30 };
  assert.equal(first.settings, inputs.settings);
  const before = computeProject(inputs);
  first.catalogs.velocityLimits.forEach((r) => { r.v2000 = 1; r.v4000 = 1; r.v8000 = 1; });
  const after = computeProject(inputs);
  for (const id of ['c1', duplicate.id]) assert.ok(after.calculations.get(id).current.diameter > before.calculations.get(id).current.diameter);
});

test('collection normalisation repairs duplicate ids and safely handles foreign and old inputs', () => {
  for (const raw of [null, 42, 'other', [], { current: { flow: 5800 }, system: null }, { catalogs: { velocityLimits: 42, reductionFactors: [null] } }]) {
    const normalized = normalizeInputs(raw);
    assert.equal(normalized.calculations.length, 1);
    assert.deepEqual(normalizeInputs(normalized), normalized);
    assert.doesNotThrow(() => computeProject(normalized));
  }
  const normalized = normalizeInputs({ calculations: [null, { id: 'c1' }, { id: 'c1', positions: [null, { id: 'current' }] }] });
  assert.equal(new Set(normalized.calculations.map((c) => c.id)).size, 3);
  assert.deepEqual(normalizeInputs(normalized), normalized);
});

test('calculation deletion and edits are restored by the document history', () => {
  const inputs = exampleInputs();
  inputs.calculations.splice(1);
  inputs.calculations.push(newCalculation('c2'));
  const store = new DocumentStore({ inputs });
  inputs.calculations[1].name = 'Abluft';
  store.commit();
  inputs.calculations.splice(1, 1);
  store.commit();
  assert.equal(store.doc.inputs.calculations.length, 1);
  assert.equal(store.undo(), true);
  assert.equal(store.doc.inputs.calculations[1].name, 'Abluft');
  assert.equal(store.redo(), true);
  assert.equal(store.doc.inputs.calculations.length, 1);
});

test('printed positions: the pins, plus the input panel if it is not pinned', () => {
  const inputs = calculationInputs(exampleInputs());
  assert.equal(printedPositions(inputs).length, inputs.positions.length);
  inputs.current.flow = 6000;
  const list = printedPositions(inputs);
  assert.equal(list.length, inputs.positions.length + 1);
  assert.equal(list.at(-1).id, 'current');
});

// ---- files -------------------------------------------------------------------------

const project = { name: 'Testprojekt Ä/Ö/Ü', number: 'P-7', author: 'Test', date: '2026-10-11' };

async function exportPdf(doc) {
  const result = computeProject(doc.inputs);
  const env = createEnvelope({ tool: TOOL_ID, version: INPUT_VERSION, calcVersion: CALC_VERSION, project: doc.project, inputs: doc.inputs, snapshot: snapshotProjectOf(result) });
  return buildReport(doc, result, env);
}

async function importPdf(bytes) {
  assert.ok(isPdf(bytes));
  const env = parseEnvelope(await extractDataJson(bytes));
  assert.deepEqual(checkCompatibility(env, { tool: TOOL_ID, version: INPUT_VERSION, calcVersion: CALC_VERSION }), []);
  return { env, doc: { project: env.project, inputs: normalizeInputs(env.inputs) } };
}

test('drawing grows with the duct, keeps the aspect ratio and inverts for dragging', () => {
  const drawn = (shape, dims) => (dims.width ?? dims.diameter) * drawingScale(shape, dims);
  let last = 0;
  for (const d of [80, 100, 200, 400, 800, 1600, FULL_SIZE]) {
    const now = drawn('round', { diameter: d });
    assert.ok(now > last, `Ø ${d} larger than the one before`);
    last = now;
  }
  close(drawn('round', { diameter: 80 }), FRAME.maxH * Math.sqrt(80 / FULL_SIZE), 1e-9, 'Ø 80 still legible');
  close(drawn('round', { diameter: FULL_SIZE }), FRAME.maxH, 1e-9, 'largest fills the frame');
  close(drawn('rect', { width: 500, height: 500 }), drawn('round', { diameter: 500 }), 1e-9, 'square like the circle');
  close(drawn('rect', { width: 10000, height: 1000 }), FRAME.maxW, 1e-9, 'oversize fits');
  for (const [kind, dims, target] of [['width', { width: 650, height: 375 }, { width: 300, height: 0 }], ['height', { width: 650, height: 375 }, { width: 0, height: 150 }], ['both', { width: 650, height: 375 }, { width: 320, height: 160 }]]) {
    const back = sizeForDrawn('rect', kind, target, dims);
    const s = drawingScale('rect', back);
    if (kind !== 'height') close(back.width * s, target.width, 1e-6, `${kind}: width`);
    if (kind !== 'width') close(back.height * s, target.height, 1e-6, `${kind}: height`);
  }
  const d = sizeForDrawn('round', 'diameter', { width: 150 }, { diameter: 400 }).diameter;
  close(d * drawingScale('round', { diameter: d }), 150, 1e-6, 'diameter');
  close(sizeForDrawn('rect', 'width', { width: 5000 }, { width: 650, height: 375 }).width, (FULL_SIZE * FRAME.maxW) / FRAME.maxH, 1, 'stops at the frame');
});

test('PDF round trip keeps project and inputs identical', async () => {
  const inputs = exampleInputs();
  const view = calculationInputs(inputs);
  view.system.hours = 3480; // from the stages
  inputs.calculations[0].name = 'Sonderzeichen: Ø × ≤ ² ³ ° “Zitat” <tag> & ;';
  const second = newCalculation('c4');
  second.name = 'Abluft Sitzung';
  second.current.flow = 9000;
  second.system.simple = false;
  second.system.hours = 8000;
  inputs.calculations.push(second);
  const doc = { project, inputs };
  const { doc: back1 } = await importPdf(await exportPdf(doc));
  assert.deepEqual(back1, doc);
  const { doc: back2, env } = await importPdf(await exportPdf(back1));
  assert.deepEqual(back2, doc);
  assert.deepEqual(env.snapshot, snapshotProjectOf(computeProject(doc.inputs)));
});

test('CSV export has one line per printed position plus header', () => {
  const inputs = exampleInputs();
  const csv = buildCsv({ project, inputs });
  const positions = inputs.calculations.reduce((n, c) => n + printedPositions(calculationInputs(inputs, c.id)).length, 0);
  assert.equal(csv.trim().split('\r\n').length, positions + 1);
  assert.ok(csv.startsWith('﻿'));
});

test('all calculations are named in CSV and saved in separate PDF sections', async () => {
  const inputs = normalizeInputs({ calculations: [
    { id: 'c1', name: 'Zuluft', current: { flow: 1000 } },
    { id: 'c2', name: 'Abluft', current: { flow: 9000 } },
  ] });
  const csv = buildCsv({ project, inputs });
  const lines = csv.trim().split('\r\n');
  assert.equal(lines.length, 3);
  assert.ok(lines[0].includes('"Berechnung"'));
  assert.ok(lines[1].startsWith('"Zuluft";'));
  assert.ok(lines[2].startsWith('"Abluft";'));
  assert.ok(lines[1].includes(';1000;'));
  assert.ok(lines[2].includes(';9000;'));
  const staleInputs = normalizeInputs({ calculations: [{ id: 'c1', name: 'Alt', current: { flow: 500 } }] });
  const staleResult = computeProject(staleInputs);
  const staleEnvelope = createEnvelope({
    tool: TOOL_ID,
    version: INPUT_VERSION,
    calcVersion: CALC_VERSION,
    project: { ...project, name: 'Alter Projektname' },
    inputs: staleInputs,
    snapshot: snapshotProjectOf(staleResult),
  });
  const bytes = await buildReport({ project, inputs }, staleResult, staleEnvelope);
  const pdf = await PDFDocument.load(bytes);
  assert.ok(pdf.getPageCount() >= inputs.calculations.length);
  const { env } = await importPdf(bytes);
  assert.deepEqual(env.project, project, 'the report embeds the current project rather than a stale envelope');
  assert.deepEqual(env.inputs, inputs, 'the report embeds all authoritative calculations');
  assert.deepEqual(env.snapshot, snapshotProjectOf(computeProject(inputs)), 'the report recalculates every embedded snapshot');
  assert.equal(env.snapshot.calculations.length, 2);
  assert.notEqual(env.snapshot.calculations[0].current.size[0], env.snapshot.calculations[1].current.size[0]);
});

test('fixture PDFs still import and reproduce their snapshot', async () => {
  const dir = new URL('./fixtures/', import.meta.url);
  const files = (await readdir(dir)).filter((f) => f.startsWith(`${TOOL_ID}_`) && f.endsWith('.pdf'));
  assert.ok(files.length > 0, 'at least one fixture (npm run fixtures)');
  let currentFixtures = 0;
  for (const f of files) {
    const env = parseEnvelope(await extractDataJson(new Uint8Array(await readFile(new URL(f, dir)))));
    if (env.version !== INPUT_VERSION) continue; // Beta schema changes do not migrate old fixtures.
    currentFixtures++;
    checkCompatibility(env, { tool: TOOL_ID, version: INPUT_VERSION, calcVersion: CALC_VERSION });
    const snap = snapshotProjectOf(computeProject(normalizeInputs(env.inputs)));
    if (env.calcVersion !== CALC_VERSION) continue;
    assert.deepEqual(snap, env.snapshot, `${f}: result changed (calc ${env.calcVersion} → ${CALC_VERSION})`);
  }
  assert.ok(currentFixtures > 0, 'at least one fixture uses the current input schema (npm run fixtures)');
});
