// SPDX-License-Identifier: AGPL-3.0-or-later
// h,x diagram: process balances, input normalisation, PDF/CSV round trip, reference fixtures, diagram geometry.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

import * as P from '../tools/hx-diagram/psychro.js';
import { computeCalculation, computeProject, snapshotProjectOf, CALC_VERSION, autoLabels } from '../tools/hx-diagram/calc.js';
import { normalizeInputs, exampleInputs, emptyInputs, newBlock, TOOL_ID, INPUT_VERSION } from '../tools/hx-diagram/defaults.js';
import { buildChart, sheetMap, cleanRange, DEFAULT_RANGE } from '../tools/hx-diagram/chart.js';
import { buildReport, buildBlankSheet } from '../tools/hx-diagram/report.js';
import { buildCsv } from '../tools/hx-diagram/csv.js';
import { extractDataJson } from '../lib/core/pdf.js';
import { createEnvelope, parseEnvelope, checkCompatibility } from '../lib/core/envelope.js';
import { PDFDocument } from '../lib/vendor/pdf-lib/pdf-lib.esm.min.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (±${tol})`);
const site = { altitude: 0 };
const p = P.pressureAt(0);
const point = (id, t, phi, extra = {}) => ({ id, type: 'point', given: [{ key: 't', value: t }, { key: 'phi', value: phi }], ...extra });
const run = (blocks, flow = 3600) => computeCalculation(normalizeInputs({ calculations: [{ flow, blocks }] }).calculations[0], site);

test('heater keeps x, Q = ṁ Δh; power mode gives the same state', () => {
  const r = run([point('b1', 5, 80), { id: 'b2', type: 'heater', from: 'b1', mode: 't', t: 25 }]);
  const a = r.points.get('b1');
  const b = r.points.get('b2');
  near(b.state.x, a.state.x, 1e-12, 'x');
  near(b.state.t, 25, 1e-9, 't');
  const q = r.blocks.get('b2').values.q;
  near(q, (a.m * (b.state.h - a.state.h)) / 3600, 1e-9, 'Q');
  const r2 = run([point('b1', 5, 80), { id: 'b2', type: 'heater', from: 'b1', mode: 'q', q }]);
  near(r2.points.get('b2').state.t, 25, 1e-6, 't from Q');
});

test('mixing conserves mass and enthalpy', () => {
  const r = run([
    point('b1', -5, 80, { flow: 1000 }),
    point('b2', 22, 40, { flow: 3000 }),
    { id: 'b3', type: 'mix', from: 'b1', to: 'b2', mode: 'flows' },
  ]);
  const [a, c, m] = ['b1', 'b2', 'b3'].map((id) => r.points.get(id));
  near(m.m, a.m + c.m, 1e-9, 'mass');
  near(m.m * m.state.h, a.m * a.state.h + c.m * c.state.h, 1e-6, 'enthalpy');
  near(m.m * m.state.x, a.m * a.state.x + c.m * c.state.x, 1e-6, 'water');
  const share = run([point('b1', -5, 80), point('b2', 22, 40), { id: 'b3', type: 'mix', from: 'b1', to: 'b2', mode: 'share', share: 25 }]);
  near(share.points.get('b3').state.x, 0.25 * a.state.x + 0.75 * c.state.x, 1e-9, 'share');
});

test('heat recovery: both sides balance, condensate leaves the extract side at saturation', () => {
  const r = run([point('b1', -10, 80), point('b2', 22, 40), { id: 'b3', type: 'hrv', from: 'b1', to: 'b2', mode: 'sensible', eta: 80 }]);
  const [au, ab, zu, fo] = ['b1', 'b2', 'b3', 'b3.b'].map((id) => r.points.get(id));
  near(zu.state.t, -10 + 0.8 * 32, 1e-9, 'supply t');
  near(zu.state.x, au.state.x, 1e-12, 'supply x');
  const v = r.blocks.get('b3').values;
  near(au.m * (zu.state.h - au.state.h), ab.m * (ab.state.h - fo.state.h), 0.5, 'energy');
  assert.ok(v.condensate > 0, 'condensate');
  near(fo.state.x, fo.state.xs, 1e-9, 'saturated');
  near(ab.m * (ab.state.x - fo.state.x) / 1000, v.condensate, 1e-6, 'water');
  assert.ok(r.issues.some((i) => i.code === 'frost') === fo.state.t < 0);
});

test('cooler: dry above the dew point, wet towards the coil point with condensate', () => {
  const dry = run([point('b1', 30, 30), { id: 'b2', type: 'cooler', from: 'b1', mode: 't', t: 20, ts: 15 }]);
  near(dry.points.get('b2').state.x, dry.points.get('b1').state.x, 1e-9, 'dry x');
  assert.equal(dry.blocks.get('b2').values.wet, false);
  const wet = run([point('b1', 30, 50), { id: 'b2', type: 'cooler', from: 'b1', mode: 't', t: 16, ts: 8 }]);
  const [a, b] = [wet.points.get('b1'), wet.points.get('b2')];
  near(b.state.t, 16, 1e-6, 't');
  assert.ok(b.state.x < a.state.x, 'dehumidified');
  const c = { x: P.xSat(8, p), h: P.hUnsat(8, P.xSat(8, p)) };
  const slope = (q) => (q.h - a.state.h) / (q.x - a.state.x);
  near(slope(b.state), slope(c), 1e-6, 'on the line to the coil point');
  near(-wet.blocks.get('b2').values.water, (a.m * (a.state.x - b.state.x)) / 1000, 1e-9, 'condensate');
  assert.equal(run([point('b1', 30, 50), { id: 'b2', type: 'cooler', from: 'b1', t: 6, ts: 8 }]).issues[0].code, 'below-surface');
});

test('steam humidifier: nearly isothermal, water and enthalpy', () => {
  const r = run([point('b1', 22, 20), { id: 'b2', type: 'steam', from: 'b1', mode: 'x', x: 8, ts: 100 }]);
  const [a, b] = [r.points.get('b1'), r.points.get('b2')];
  near(b.state.x, 8, 1e-9, 'x');
  assert.ok(b.state.t - a.state.t > 0 && b.state.t - a.state.t < 1.5, 'small temperature rise');
  near(b.state.h - a.state.h, ((8 - a.state.x) / 1000) * (2501 + 1.86 * 100), 1e-6, 'Δh');
  const phi = run([point('b1', 22, 20), { id: 'b2', type: 'steam', from: 'b1', mode: 'phi', phi: 50 }]);
  near(phi.points.get('b2').state.phi, 0.5, 1e-6, 'phi target');
});

test('adiabatic humidifier: about constant h, efficiency to saturation', () => {
  const r = run([point('b1', 30, 30), { id: 'b2', type: 'adiabatic', from: 'b1', mode: 'eta', eta: 100 }]);
  const [a, b] = [r.points.get('b1'), r.points.get('b2')];
  near(b.state.t, a.state.tw, 0.01, 'reaches the wet bulb');
  near(b.state.phi, 1, 1e-6, 'saturated');
  near(b.state.h - a.state.h, ((b.state.x - a.state.x) / 1000) * 4.19 * a.state.tw, 1e-6, 'Δh = Δx h_w');
});

test('missing inputs and flows give notices, not exceptions', () => {
  const r = run([{ id: 'b1', type: 'heater', from: 'b9', t: 20 }, point('b2', 20, null)], null);
  assert.ok(r.issues.some((i) => i.code === 'input-missing'));
  assert.ok(r.issues.some((i) => i.code === 'missing'));
  const nf = run([point('b1', 5, 50), { id: 'b2', type: 'heater', from: 'b1', t: 20 }], null);
  assert.equal(nf.blocks.get('b2').values.q, null);
  assert.ok(nf.issues.some((i) => i.code === 'flow-missing' && i.severity === 'info'));
});

test('labels: own label, else the running number', () => {
  const blocks = normalizeInputs({ calculations: [{ blocks: [point('b1', 1, 1, { label: 'AU' }), point('b2', 1, 1), { id: 'b3', type: 'hrv', from: 'b1', to: 'b2', label2: 'FO' }] }] }).calculations[0].blocks;
  assert.deepEqual([...autoLabels(blocks).values()], ['AU', '2', '3', 'FO']);
});

test('normalizeInputs is idempotent and never throws', () => {
  for (const raw of [undefined, null, 42, 'x', [], { calculations: 'x' }, { calculations: [{ blocks: [null, 1, { type: 'nope' }, { type: 'mix', share: '5' }] }] }, exampleInputs()]) {
    const once = normalizeInputs(raw);
    assert.deepEqual(normalizeInputs(JSON.parse(JSON.stringify(once))), once);
  }
  const ids = normalizeInputs({ calculations: [{ blocks: [{ id: 'b1' }, { id: 'b1' }, { id: 'zz' }] }] }).calculations[0].blocks.map((b) => b.id);
  assert.equal(new Set(ids).size, 3);
});

test('new blocks take the last points as inputs', () => {
  const blocks = exampleInputs().calculations[0].blocks;
  assert.equal(newBlock('heater', blocks).from, 'b5');
  const mix = newBlock('mix', blocks);
  assert.deepEqual([mix.from, mix.to], ['b4', 'b5']);
  assert.equal(newBlock('point', blocks, { t: 10, x: 5 }).given[1].value, 5);
});

test('example: no errors, plausible powers', () => {
  const result = computeProject(exampleInputs());
  for (const r of result.calculations.values()) assert.deepEqual(r.issues.filter((i) => i.severity === 'error'), []);
  const winter = result.calculations.get('c1');
  assert.ok(winter.blocks.get('b4').values.q > 0 && winter.blocks.get('b5').values.water > 0);
  assert.ok(result.calculations.get('c2').blocks.get('b4').values.q < 0);
});

test('diagram geometry: mapping round trip, 0 °C isotherm horizontal, items inside the sheet', () => {
  const chart = buildChart(P.pressureAt(500));
  const { map } = chart;
  const [X, Y] = map.pt(7, 22);
  const back = map.fromSheet([X, Y]);
  near(back.x, 7, 1e-9, 'x');
  near(back.h, P.hUnsat(22, 7), 1e-9, 'h');
  near(map.pt(0, 0)[1], map.pt(15, 0)[1], 1e-9, '0 °C horizontal');
  for (const it of chart.items) {
    for (const [x, y] of it.k === 'text' ? [it.at] : it.k === 'line' ? [it.a, it.b] : it.pts) {
      assert.ok(x >= -0.5 && x <= chart.width + 0.5 && y >= -0.5 && y <= chart.height + 0.5, `${it.k} ${it.text ?? ''} at ${x}, ${y}`);
    }
  }
  assert.equal(sheetMap(P.pressureAt(0)).width, chart.width);
});

test('every diagram line keeps its property, at any altitude, range and size', () => {
  const cases = [
    [0, DEFAULT_RANGE, { width: 900, height: 1000, font: 11 }],
    [500, DEFAULT_RANGE, { width: 560, height: 760, font: 7.5 }],
    [1500, { tMin: 5, tMax: 40, xMin: 4, xMax: 18 }, { width: 1200, height: 700, font: 11 }],
    [3000, { tMin: -30, tMax: 30, xMin: 0, xMax: 30 }, { width: 600, height: 900, font: 11 }],
    [2000, { tMin: 18, tMax: 24, xMin: 6, xMax: 9 }, { width: 800, height: 800, font: 11 }],
  ];
  for (const [altitude, range, box] of cases) {
    const p = P.pressureAt(altitude);
    const chart = buildChart(p, range, box);
    const { map } = chart;
    const seen = new Set();
    for (const it of chart.items) {
      if (!it.q) continue;
      seen.add(it.q);
      for (const at of it.k === 'line' ? [it.a, it.b] : it.pts) {
        const { x, h } = map.fromSheet(at);
        const t = (h - 2.501 * x) / (1.006 + 0.00186 * x);
        const msg = `${altitude} m, ${it.q} = ${it.v}`;
        if (it.q === 'x') near(x, it.v, 1e-3, msg);
        else if (it.q === 'h') near(h, it.v, 1e-2, msg);
        else if (it.q === 't') near(t, it.v, 1e-2, msg);
        else if (it.q === 'phi') near(P.pdFromX(x, p) / P.pws(t, p), it.v, 2e-3, msg);
        else if (it.q === 'rho') near(P.density(t, x, p), it.v, 2e-4, msg);
        if (it.q !== 'x' && it.q !== 'h') assert.ok(x <= P.xSat(t, p) + 1e-2, `${msg}: unsaturated`);
      }
    }
    for (const q of ['h', 'phi', 't', 'x']) assert.ok(seen.has(q), `${altitude} m: ${q} lines`);
    // the saturation curve ends at saturation: phi = 100 % is drawn and isotherms stop on it
    const r = cleanRange(range);
    const satVisible = P.xSat(r.tMin, p) < r.xMax;
    assert.equal(!!chart.items.find((it) => it.q === 'phi' && it.v === 1), satVisible, `${altitude} m: saturation line drawn when in range`);
  }
});

test('lines move with the pressure: saturation x grows with altitude', () => {
  const at = (altitude) => {
    const chart = buildChart(P.pressureAt(altitude));
    const iso = chart.items.find((it) => it.q === 't' && it.v === 20);
    return chart.map.fromSheet(iso.b).x; // the 20 °C isotherm ends on the saturation line
  };
  near(at(0), P.xSat(20, P.pressureAt(0)), 1e-3, 'sea level');
  near(at(2000), P.xSat(20, P.pressureAt(2000)), 1e-3, '2000 m');
  assert.ok(at(2000) > at(0) * 1.2);
  // ICAO standard atmosphere at 1500 m (ASHRAE Fundamentals, table 1): 84.556 kPa
  near(P.pressureAt(1500), 84556, 5, 'pressure at 1500 m');
});

test('range: invalid input falls back, limits apply', () => {
  assert.deepEqual(cleanRange({ tMin: 30, tMax: 10 }), { ...DEFAULT_RANGE, xMin: 0, xMax: 20 });
  assert.deepEqual(cleanRange({ tMin: -100, tMax: 200, xMin: -3, xMax: 500 }), { tMin: -50, tMax: 80, xMin: 0, xMax: 100 });
  assert.deepEqual(normalizeInputs({}).calculations[0].range, DEFAULT_RANGE);
});

// ---- files -----------------------------------------------------------------------------------

const project = { name: 'Testprojekt Ä/Ö/Ü', number: 'P-42', author: 'Test', date: '2026-10-21' };

async function exportPdf(doc) {
  const result = computeProject(doc.inputs);
  const env = createEnvelope({ tool: TOOL_ID, version: INPUT_VERSION, calcVersion: CALC_VERSION, project: doc.project, inputs: doc.inputs, snapshot: snapshotProjectOf(result) });
  return buildReport(doc, result, env);
}

test('PDF round trip keeps project and inputs identical; one sheet and one table page per calculation', async () => {
  const doc = { project, inputs: exampleInputs() };
  doc.inputs.calculations[0].blocks[0].label = 'Ä<&>';
  const pdf = await exportPdf(doc);
  assert.equal((await PDFDocument.load(pdf)).getPageCount(), 4);
  const env = parseEnvelope(await extractDataJson(pdf));
  assert.deepEqual(checkCompatibility(env, { tool: TOOL_ID, version: INPUT_VERSION, calcVersion: CALC_VERSION }), []);
  assert.deepEqual({ project: env.project, inputs: normalizeInputs(env.inputs) }, doc);
  assert.deepEqual(env.snapshot, snapshotProjectOf(computeProject(doc.inputs)));
});

test('empty project and blank sheet export', async () => {
  assert.equal((await PDFDocument.load(await exportPdf({ project, inputs: emptyInputs() }))).getPageCount(), 2);
  const blank = await PDFDocument.load(await buildBlankSheet({ altitude: 1200 }));
  assert.equal(blank.getPageCount(), 1);
  assert.equal(await extractDataJson(await blank.save()), null);
});

test('CSV: every point and process of every calculation', () => {
  const inputs = exampleInputs();
  const csv = buildCsv({ project, inputs });
  const lines = csv.trim().split('\r\n');
  const result = computeProject(inputs);
  const expected = inputs.calculations.reduce((n, c) => n + result.calculations.get(c.id).points.size + c.blocks.filter((b) => b.type !== 'point').length, 1);
  assert.equal(lines.length, expected);
  assert.ok(csv.startsWith('﻿'));
  assert.ok(csv.includes('"Winter";"Zustand";"AU"'));
});

test('reference PDFs of the current calculation version reproduce their snapshot', async () => {
  const dir = new URL('./fixtures/', import.meta.url);
  const files = (await readdir(dir)).filter((f) => f.startsWith(`${TOOL_ID}_`) && f.endsWith('.pdf'));
  assert.ok(files.length > 0, 'at least one fixture (npm run fixtures)');
  for (const f of files) {
    const env = parseEnvelope(await extractDataJson(new Uint8Array(await readFile(new URL(f, dir)))));
    if (env.version !== INPUT_VERSION || env.calcVersion !== CALC_VERSION) continue;
    assert.deepEqual(snapshotProjectOf(computeProject(normalizeInputs(env.inputs))), env.snapshot, f);
  }
});
