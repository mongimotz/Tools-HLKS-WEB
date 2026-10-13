// SPDX-License-Identifier: AGPL-3.0-or-later
// Silencer calculation (tools/silencer/calc.js) and input schema (defaults.js). Reference values: docs/silencer-plan.md
// section 8; hand calculations are given next to each expectation.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CALC_VERSION,
  A_WEIGHTING,
  compute,
  sumLevels,
  aWeighted,
  flowNoise,
  roomTerm,
  absorptionArea,
  splitterSilencer,
  splitterCount,
  roundSilencer,
  lookupRow,
  rowCopy,
  staleRows,
  snapshotOf,
  rectChoices,
  roundChoices,
  snapRect,
  snapRound,
  silencerVariants,
  fittingSplitterRows,
  VARIANT_LIMITS,
  GAP_TOLERANCE,
} from '../tools/silencer/calc.js';
import { normalizeInputs, exampleInputs, emptyInputs, newRow, newPath, duplicatePath, TOOL_ID, INPUT_VERSION } from '../tools/silencer/defaults.js';
import { rectFrontView, roundFrontView } from '../tools/silencer/drawing.js';
import { createEnvelope, parseEnvelope, checkCompatibility } from '../lib/core/envelope.js';
import { frictionFactor } from '../lib/core/air.js';

const near = (actual, expected, tol, msg = '') =>
  assert.ok(Math.abs(actual - expected) <= tol, `${msg} expected ${expected} ± ${tol}, got ${actual}`);
const nearAll = (actual, expected, tol, msg = '') => expected.forEach((e, i) => near(actual[i], e, tol, `${msg}[${i}]`));

/** One path from a list of rows (ids r1, r2 …) and a receiver. */
function pathOf(rows, { flow = null, receiver = {}, density = 1.2 } = {}) {
  return normalizeInputs({ density, paths: [{ id: 'w1', flow, rows: rows.map((r, i) => ({ id: `r${i + 1}`, ...r })), receiver }] });
}
const resultOf = (inputs) => compute(inputs).paths[0];
const rowResult = (inputs, id) => resultOf(inputs).rows.get(id);
const codes = (r) => r.issues.map((i) => i.code);

const flat = (v) => new Array(8).fill(v);
const rect = (spec, extra = {}) => ({ type: 'silencer', kind: 'rect', rect: spec, ...extra });
const round = (spec, extra = {}) => ({ type: 'silencer', kind: 'round', round: spec, ...extra });

// ---- 1. Kilian chain --------------------------------------------------------------------

test('1. Kilian chain: spectrum, L_WA and L_pA of the Excel sheet', () => {
  const p = compute(exampleInputs()).paths[0];
  // the sheet sums in dB and weights at the end; the tool runs in dB(A): same values plus A per octave
  nearAll(p.level.map((l, i) => l - A_WEIGHTING[i]), [69.24, 56.75, 42.53, 36.01, 32.0, 28.02, 28.15, 37.18], 0.01, 'L_W');
  near(p.lwa, 46.38, 0.01, 'L_WA');
  near(p.receiver.lpa, 32.37, 0.01, 'L_pA (r = 2 m, Q = 2, no room)');
  assert.equal(p.receiver.area, null);
});

test('levels: energetic sum and A-weighting', () => {
  near(sumLevels([60, 60]), 63.01, 0.01);
  assert.equal(sumLevels([-Infinity, -Infinity]), -Infinity);
  near(aWeighted([0, 0, 0, 0, 80, 0, 0, 0]), 80, 1e-3);
});

test('lines: one per operation, like the Excel sheet; dB lines get an A-weighting line', () => {
  const p = compute(exampleInputs()).paths[0];
  const kinds = p.lines.map((l) => `${l.rowId}:${l.kind}${l.op}`);
  assert.deepEqual(kinds, [
    'r1:source+', 'r1:aweight+',
    'r2:de−', 'r2:flow+', 'r2:aweight+',
    'r3:source+', 'r3:aweight+',
    'r4:de−', 'r4:flow+', 'r4:aweight+',
  ]);
  const src = p.lines[0];
  assert.deepEqual([src.unit, src.edit], ['dB', 'lw']);
  near(src.total, aWeighted([78, 85, 87, 89, 78, 79, 78, 74]), 1e-9, 'total of a row in dB(A)');
  assert.deepEqual(p.lines[1].values, A_WEIGHTING);
});

test('dB(A) input: the same source typed in dB(A) gives the same result, without an A-weighting line', () => {
  const lw = [78, 85, 87, 89, 78, 79, 78, 74];
  const inDb = resultOf(pathOf([{ type: 'source', lw, unit: 'dB' }], { receiver: { r: 2, q: 2 } }));
  const inDbA = resultOf(pathOf([{ type: 'source', lw: lw.map((l, i) => l + A_WEIGHTING[i]), unit: 'dBA' }], { receiver: { r: 2, q: 2 } }));
  near(inDbA.lwa, inDb.lwa, 1e-9);
  near(inDbA.receiver.lpa, inDb.receiver.lpa, 1e-9);
  assert.deepEqual(inDbA.lines.map((l) => l.kind), ['source']);
  // a manual silencer's flow noise in dB(A): also no A-weighting line
  const m = resultOf(pathOf([{ type: 'source', lw: flat(80) }, { type: 'silencer', kind: 'manual', manual: { de: flat(10), lwFlow: flat(40), unit: 'dBA' } }]));
  assert.deepEqual(m.lines.map((l) => l.kind), ['source', 'aweight', 'de', 'flow']);
  near(m.rows.get('r2').lwaFlow, sumLevels(flat(40)), 1e-9);
});

// ---- 2. database splitter ----------------------------------------------------------------

test('2. Trox XK 200/100/1500 in B 1200 × H 1000 (n = 4), 10’000 m³/h', () => {
  const row = rowCopy(lookupRow('rect', { series: 'trox-xk', d: 200, s: 100, L: 1500 }), 'rect');
  const r = splitterSilencer({ row, B: 1200, H: 1000, flow: 10000, density: 1.2 });
  assert.deepEqual([r.n, r.gap], [4, 100]);
  near(r.v, 6.944, 0.001, 'v_s'); // 10000 / 3600 / (4 · 0.1 · 1.0)
  assert.deepEqual(r.de, [5, 12, 22, 44, 50, 46, 30, 19]);
  near(r.zeta, 0.6525, 1e-4, 'ζ'); // 14 / (0.6 · 6²) = 0.6481 … 40 / (0.6 · 10²) = 0.6667, linear in v
  near(r.dp, 18.9, 0.05, 'Δp');
  near(r.lwaFlow, 35.35, 0.01, 'L_WA,flow'); // 31 + 7 · lg(6.944/6) / lg(8/6) + 10 · lg 1.2
  nearAll(r.lwFlow, [39.3, 33.3, 34.3, 33.3, 30.3, 27.3, 21.3, 17.3], 0.06, 'L_W,flow');
});

test('housing B: splitters evenly spaced, n = round(B / (d + s)), real gap s′ = B / n − d', () => {
  assert.equal(splitterCount(1200, 200, 100), 4);
  assert.equal(splitterCount(1150, 200, 100), 4); // 3.83 → 4, s′ = 87.5
  assert.equal(splitterCount(1000, 200, 100), 3); // 3.33 → 3, s′ = 133
  assert.equal(splitterCount(250, 200, 100), 1); // 0.83 → 1, s′ = 50
  assert.equal(splitterCount(200, 200, 100), 0, 'no room for a gap');
  const row = rowCopy(lookupRow('rect', { series: 'trox-xk', d: 200, s: 100, L: 1500 }), 'rect');
  const r = splitterSilencer({ row, B: 1150, H: 1000, flow: 10000, density: 1.2 });
  near(r.gap, 87.5, 1e-9);
  near(r.aFree, 0.35, 1e-9); // 4 · 0.0875 · 1.0 = B − n·d
  near(r.face, 1.15, 1e-9);
});

test('2b. the same silencer as a row: installation factor and net effect', () => {
  const spec = { series: 'trox-xk', d: 200, s: 100, L: 1500, B: 1200, H: 1000 };
  const duct = rowResult(pathOf([{ type: 'source', lw: flat(90), unit: 'dBA' }, rect(spec)], { flow: 10000 }), 'r2');
  const outlet = rowResult(pathOf([{ type: 'source', lw: flat(90), unit: 'dBA' }, rect(spec, { install: 'freeOutlet' })], { flow: 10000 }), 'r2');
  near(outlet.dp / duct.dp, 1.3, 1e-9, 'free outlet');
  assert.ok(duct.row && duct.row.dataVersion);
  // (L − D_e) ⊕ L_W,flow per octave, all in dB(A)
  duct.levelOut.forEach((l, i) => near(l, sumLevels([90 - duct.de[i], duct.lwFlow[i] + A_WEIGHTING[i]]), 1e-9));
  // the flow noise line is shown in dB(A)
  const line = resultOf(pathOf([{ type: 'source', lw: flat(90) }, rect(spec)], { flow: 10000 })).lines.find((l) => l.kind === 'flow');
  assert.equal(line.unit, 'dBA');
  near(line.total, duct.lwaFlow, 1e-9);
});

// ---- 3. branch split -----------------------------------------------------------------------

test('3. branch row: 6000 → 2000 m³/h gives −4.77 dB in every octave; the flow after it carries on', () => {
  const inputs = pathOf([{ type: 'source', lw: flat(80), unit: 'dBA' }, { type: 'branch', flow: 2000 }, rect({ series: 'trox-xk', d: 200, s: 100, L: 1500, B: 600, H: 600 })], { flow: 6000 });
  const p = resultOf(inputs);
  const b = p.rows.get('r2');
  near(b.dl, 4.77, 0.005);
  nearAll(b.levelOut, flat(75.23), 0.005);
  assert.equal(p.rows.get('r3').flow, 2000, 'the silencer after the branch sees 2000 m³/h');
  assert.deepEqual(p.lines.find((l) => l.kind === 'branch').values.map((v) => Math.round(v * 100) / 100), flat(4.77));

  const manual = rowResult(pathOf([{ type: 'source', lw: flat(80) }, { type: 'branch', dl: 10 }], { flow: 6000 }), 'r2');
  assert.equal(manual.dl, 10, 'a value typed in wins');
  assert.deepEqual(manual.issues, []);
});

test('branch without flows or with more flow after it is flagged', () => {
  assert.deepEqual(codes(rowResult(pathOf([{ type: 'source', lw: flat(80) }, { type: 'branch', flow: 2000 }]), 'r2')), ['branch-flow-missing']);
  const up = rowResult(pathOf([{ type: 'source', lw: flat(80) }, { type: 'branch', flow: 8000 }], { flow: 6000 }), 'r2');
  assert.deepEqual(codes(up), ['branch-flow']);
  assert.equal(up.dl, undefined);
});

test('loss row: subtracts D (a difference, the same in dB and dB(A))', () => {
  const p = resultOf(pathOf([{ type: 'source', lw: flat(80), unit: 'dBA' }, { type: 'loss', d: [10, 5] }]));
  assert.deepEqual(p.level, [70, 75, 80, 80, 80, 80, 80, 80]);
});

// ---- 4. receiver ------------------------------------------------------------------------------

test('4. receiver with room term: A = 20 m², r = 1 m, Q = 2 → −4.45 dB', () => {
  near(roomTerm({ r: 1, q: 2, area: 20 }), -4.45, 0.005); // 10 · lg(2/(4π) + 4/20)
  near(roomTerm({ r: 2, q: 2, area: null }), -14.0, 0.005); // free field, 10 · lg(2/(16π))
  near(absorptionArea({ volume: 100, reverb: 0.815 }), 20, 1e-9); // 0.163 · 100 / 0.815
  assert.equal(absorptionArea({ area: 12, volume: 100, reverb: 0.815 }), 12, 'A given wins');

  const p = resultOf(pathOf([{ type: 'source', lw: flat(60), unit: 'dBA' }], { receiver: { r: 1, q: 2, volume: 100, reverb: 0.815, basis: 'manual', target: 50 } }));
  nearAll(p.receiver.lp, flat(55.55), 0.005);
  near(p.receiver.lpa, sumLevels(p.receiver.lp), 1e-9);
  assert.equal(p.receiver.status, 'over');
  assert.deepEqual(p.issues.map((i) => i.code), ['target-exceeded']);
});

test('receiver status is judged on the shown value (one decimal)', () => {
  // L_pA = 35.04 → shown 35.0 → meets a target of 35.
  const lw = [null, null, null, null, 35.04 + 14.0024, null, null, null];
  const rc = resultOf(pathOf([{ type: 'source', lw, unit: 'dBA' }], { receiver: { r: 2, q: 2, basis: 'manual', target: 35 } })).receiver;
  near(rc.lpa, 35.04, 0.01);
  assert.equal(rc.status, 'ok');
});

// ---- targets ------------------------------------------------------------------------------------

/** Receiver at r = 2 m, Q = 2 in free field behind a source that gives L_pA = lpa (1000 Hz only). */
function receiverWith(lpa, receiver) {
  const lw = [null, null, null, null, lpa - roomTerm({ r: 2, q: 2 }), null, null, null];
  const p = resultOf(pathOf([{ type: 'source', lw, unit: 'dBA' }], { receiver: { r: 2, q: 2, ...receiver } }));
  return { ...p.receiver, issues: p.issues };
}

test('room target: SIA 2024 room use → noise sensitivity → SIA 181 L_H, or the SIA 2024 design value', () => {
  const office = receiverWith(30, { basis: 'room', room: { type: '3.01' } });
  assert.deepEqual([office.target, office.status], [28, 'over']); // Einzel-, Gruppenbüro: mittel, minimum requirement
  const raised = receiverWith(24, { basis: 'room', room: { type: '3.01', requirement: 'raised' } });
  assert.deepEqual([raised.target, raised.status], [25, 'ok']); // mittel, raised requirement
  near(raised.margin, 1, 1e-9);
  assert.equal(receiverWith(30, { basis: 'room', room: { type: '3.03' } }).target, 33, 'Sitzungszimmer: gering');
  assert.equal(receiverWith(30, { basis: 'room', room: { type: '8.01', requirement: 'design' } }).target, 25, 'Bettenzimmer: design value');
  assert.equal(receiverWith(30, { basis: 'room', room: { type: '4.01', requirement: 'design' } }).target, 28, 'no design value: minimum');
  assert.deepEqual(receiverWith(60, { basis: 'room', room: { type: '12.04' } }).checks, [], 'Nebenraum: no requirement');
  assert.deepEqual(receiverWith(60, { basis: 'room', room: { type: 'unknown' } }).checks, []);
  const home = receiverWith(30, { basis: 'room', room: { type: '1.01' } });
  assert.deepEqual(home.issues.map((i) => i.code), ['room-note', 'target-exceeded'], 'footnote of table 12');
});

test('SIA 2024 table 12: 45 room uses, continuous noise 33 (gering) / 28 (mittel) dB as in the table', () => {
  const { roomTypes, sensitivities } = normalizeInputs({}).catalogs;
  assert.equal(roomTypes.length, 45);
  const count = (s) => roomTypes.filter((t) => t.sensitivity === s).length;
  assert.deepEqual([count('medium'), count('low'), count('none')], [10, 28, 7]);
  assert.deepEqual(roomTypes.filter((t) => t.design != null).map((t) => [t.id, t.design]), [['1.01', 25], ['1.02', 25], ['2.01', 25], ['3.01', 25], ['8.01', 25]]);
  assert.deepEqual(sensitivities.map((s) => [s.id, s.min]), [['low', 33], ['medium', 28], ['high', 25]]);
});

test('LSV target: L_r = L_pA + K1 + K2 + K3 + 10·lg(t/12 h) against the limit of the zone, day and night', () => {
  // ES II, Planungswert 55 / 45; K1 = 5 by day, 10 at night (Anhang 6 Ziff. 33 Bst. d)
  const r = receiverWith(32.37, { basis: 'lsv', lsv: { es: 2 } });
  assert.deepEqual(r.checks.map((c) => [c.period, c.limit, c.status]), [['day', 55, 'ok'], ['night', 45, 'ok']]);
  near(r.checks[0].level, 37.37, 1e-9);
  near(r.checks[1].level, 42.37, 1e-9);
  assert.equal(r.governing.period, 'night');
  near(r.margin, 2.63, 1e-9);

  // K2 = 2 (weakly audible tone), 6 h at night: 32.37 + 10 + 2 + 10·lg(6/12) = 41.36
  near(receiverWith(32.37, { basis: 'lsv', lsv: { es: 2, k2: 2, hoursNight: 6 } }).checks[1].level, 41.36, 0.005);

  // Immissionsgrenzwert, business room (+5 dB in ES I to III), no operation at night
  const b = receiverWith(52, { basis: 'lsv', lsv: { es: 3, limit: 'immission', business: true, hoursNight: 0 } });
  assert.deepEqual(b.checks.map((c) => [c.period, c.limit]), [['day', 70]]);
  assert.equal(b.status, 'ok');
  const iv = receiverWith(52, { basis: 'lsv', lsv: { es: 4, business: true } });
  assert.deepEqual(iv.checks.map((c) => c.limit), [65, 55], 'no bonus in ES IV');
  assert.equal(iv.status, 'over');
  assert.deepEqual(iv.issues.map((i) => [i.code, i.period]), [['target-exceeded', 'night']]);
});

test('manual target and the example: the worst path gives the status of the file', () => {
  assert.equal(receiverWith(40, { basis: 'manual', target: 40 }).status, 'ok');
  assert.deepEqual(receiverWith(40, { basis: 'manual', target: null }).checks, []);
  const res = compute(exampleInputs());
  assert.equal(res.paths.length, 2);
  // Zuluft Büro: 32.4 > 28 (4.4 over); Zuluft Sitzung: further over its target of 33
  assert.deepEqual([res.worst.pathId, res.worst.target, res.worst.status], ['w2', 33, 'over']);
  near(res.paths[0].receiver.lpa, 32.37, 0.01, 'paths are independent');
});

// ---- 5. pressure loss models --------------------------------------------------------------------

test('5a. dpModel duct: Trox CA 200/1000 like a straight duct', () => {
  const row = rowCopy(lookupRow('round', { series: 'trox-ca', dn: 200, L: 1000, insulation: 50 }), 'round');
  const r = roundSilencer({ row, flow: 1000, density: 1.2 });
  near(r.v, 8.842, 0.001, 'v'); // 1000 / 3600 / (π/4 · 0.2²)
  near(r.lambda, frictionFactor((8.842 * 0.2 * 1.2) / 1.8134e-5, 0.00075), 1e-4, 'λ');
  near(r.lambda, 0.021, 0.0005, 'λ Moody');
  near(r.dp, 4.91, 0.01, 'Δp'); // 0.02094 · 1.0/0.2 · 0.6 · 8.842²
  assert.equal(r.lwFlow, null, 'no core, no flow noise');
});

test('5b. dpModel flow-points: Trox CK 250/1500, insulation 100, splitter 100', () => {
  const row = rowCopy(lookupRow('round', { series: 'trox-ck', dn: 250, L: 1500, insulation: 100, core: 100 }), 'round');
  const r = roundSilencer({ row, flow: 1000, density: 1.2 });
  // v_i = 700 and 1200 m³/h in π/4 · 0.25² → 3.961, 6.791 m/s; ζ_i = 44 / (0.6 · 3.961²) = 4.674, 127 / (0.6 · 6.791²) = 4.590
  near(r.zeta, 4.632, 0.001, 'mean ζ');
  near(r.dp, 89.0, 0.05, 'Δp'); // 4.632 · 0.6 · 5.659²
  near(r.aFree, 0.024087, 1e-6); // π/4 · 0.25² − 0.1 · 0.25
  near(r.v, 11.532, 0.001);
  near(r.lwaFlow, flowNoise(11.532, 0.049087).lwa, 0.01);
});

test('5c. dpModel velocity-table: Schako RS-N (free cross-section ød) and RS-M (minus the baffle)', () => {
  const rsn = rowCopy(lookupRow('round', { series: 'schako-rs-n', dn: 200, L: 950, insulation: 100 }), 'round');
  const flow = 9.5 * (Math.PI / 4) * 0.198 ** 2 * 3600; // v = 9.5 m/s in ød = 198 mm
  const n = roundSilencer({ row: rsn, flow, density: 1.2 });
  near(n.v, 9.5, 1e-9);
  near(n.zeta, 0.10144, 1e-5, 'ζ'); // 5 / (0.6 · 81) = 0.10288 … 6 / (0.6 · 100) = 0.1
  near(n.dp, 5.493, 0.001, 'Δp');
  assert.equal(n.lwFlow, null);

  const rsm = rowCopy(lookupRow('round', { series: 'schako-rs-m', dn: 400, L: 1450, insulation: 150 }), 'round');
  const m = roundSilencer({ row: rsm, flow: 3000, density: 1.2 });
  near(m.aFree, 0.10053, 1e-5, 'A_free'); // π/4 · 0.398² − 0.06 · 0.398
  near(m.v, 8.289, 0.001);
  near(m.zeta, 1.7209, 1e-4); // 65 / (0.6 · 64) = 1.6927 … 87 / (0.6 · 81) = 1.7901
  near(m.dp, 70.95, 0.01);
  assert.ok(m.lwaFlow > 0, 'core: flow noise');
});

test('ζ outside the table holds the end values', () => {
  const row = rowCopy(lookupRow('rect', { series: 'trox-xk', d: 200, s: 100, L: 1500 }), 'rect');
  near(splitterSilencer({ row, B: 1200, H: 1000, flow: 3000, density: 1.2 }).zeta, 14 / (0.6 * 36), 1e-9);
  near(splitterSilencer({ row, B: 1200, H: 1000, flow: 30000, density: 1.2 }).zeta, 78 / (0.6 * 196), 1e-9);
});

test('flow noise: table inside 4 … 20 m/s, own fit outside, continuous at the edges', () => {
  near(flowNoise(10, 1).lwa, 43, 1e-9);
  near(flowNoise(4, 1).lwa, 21, 1e-9);
  near(flowNoise(3.999, 1).lwa, 21, 0.5);
  near(flowNoise(20.001, 1).lwa, 60, 0.5);
  near(flowNoise(30, 2).lwa, -12.7 + 56 * Math.log10(30) + 10 * Math.log10(2), 1e-9);
  assert.equal(flowNoise(0, 1), null);
});

// ---- warnings -------------------------------------------------------------------------------------

test('warnings: velocity, Δp, flow noise margin, Trox height, source note, gap deviation', () => {
  const src = { type: 'source', lw: flat(80) };
  // 200/50/1500 in B 500 × H 600 (n = 2, s′ = 50) at 9000 m³/h: v_s = 9000 / 3600 / (2 · 0.05 · 0.6) = 41.7 m/s
  const fast = rowResult(pathOf([src, rect({ series: 'trox-xk', d: 200, s: 50, L: 1500, B: 500, H: 600 })], { flow: 9000 }), 'r2');
  assert.deepEqual(new Set(codes(fast)), new Set(['velocity-high', 'dp-high', 'flow-noise', 'height-dp']));
  near(fast.v, 41.67, 0.01);

  const noted = rowResult(pathOf([src, rect({ series: 'schako-mwk-ob', d: 100, s: 50, L: 2000, B: 600, H: 1000 })], { flow: 3000 }), 'r2');
  assert.ok(codes(noted).includes('row-note'));
  assert.match(noted.issues.find((i) => i.code === 'row-note').note, /250 Hz/);

  // B 1000 with 200/100: n = 3, s′ = 133 (33 % off): warning; B 1150: s′ = 87.5 (12.5 % off): info
  const wide = rowResult(pathOf([src, rect({ series: 'trox-xk', d: 200, s: 100, L: 1500, B: 1000, H: 1000 })], { flow: 10000 }), 'r2');
  assert.deepEqual(wide.issues.map((i) => [i.code, i.severity]), [['gap-deviation', 'warning']]);
  const close = rowResult(pathOf([src, rect({ series: 'trox-xk', d: 200, s: 100, L: 1500, B: 1150, H: 1000 })], { flow: 10000 }), 'r2');
  assert.deepEqual(close.issues.map((i) => [i.code, i.severity]), [['gap-deviation', 'info']]);

  const quiet = rowResult(pathOf([src, rect({ series: 'trox-xk', d: 200, s: 100, L: 1500, B: 1200, H: 1000 })], { flow: 10000 }), 'r2');
  assert.deepEqual(codes(quiet), []);
});

test('missing data: no row, no housing, too narrow, no flow, empty source, no distance', () => {
  const src = { type: 'source', lw: flat(80), unit: 'dBA' };
  const noRow = rowResult(pathOf([src, rect({ series: 'trox-xk', d: 200, s: 90, L: 1500, B: 1200, H: 1000 })], { flow: 1000 }), 'r2');
  assert.deepEqual(codes(noRow), ['row-missing']);
  assert.deepEqual(noRow.levelOut, flat(80), 'no row: no effect');

  const noB = rowResult(pathOf([src, rect({ series: 'trox-xk', d: 200, s: 100, L: 1500, H: 1000 })], { flow: 1000 }), 'r2');
  assert.deepEqual(codes(noB), ['geometry-missing']);
  assert.deepEqual(noB.de, [5, 12, 22, 44, 50, 46, 30, 19], 'D_e does not depend on the housing');

  const narrow = rowResult(pathOf([src, rect({ series: 'trox-xk', d: 200, s: 100, L: 1500, B: 150, H: 1000 })], { flow: 1000 }), 'r2');
  assert.deepEqual(codes(narrow), ['housing-small']);

  const noFlow = rowResult(pathOf([src, rect({ series: 'trox-xk', d: 200, s: 100, L: 1500, B: 1200, H: 1000 })]), 'r2');
  assert.deepEqual(codes(noFlow), ['flow-missing']);
  assert.equal(noFlow.lwFlow, null);

  const p = resultOf(pathOf([{ type: 'source' }]));
  assert.deepEqual(p.issues.map((i) => i.code), ['lw-missing', 'receiver-incomplete']);
});

test('manual silencer: D_e above 50 dB is flagged, empty cells are 0 dB / no noise', () => {
  const r = rowResult(pathOf([{ type: 'source', lw: flat(80), unit: 'dBA' }, { type: 'silencer', kind: 'manual', manual: { de: [10, 55], dp: 120 } }]), 'r2');
  assert.deepEqual(new Set(codes(r)), new Set(['de-cap', 'dp-high']));
  assert.deepEqual(r.levelOut, [70, 25, 80, 80, 80, 80, 80, 80]);
  assert.equal(r.lwaFlow, null);
});

test('empty document computes without errors', () => {
  const res = compute(emptyInputs());
  assert.equal(res.paths.length, 1);
  assert.equal(res.worst, null);
  assert.ok(res.issues.some((i) => i.code === 'lw-missing'));
  assert.ok(res.issues.some((i) => i.code === 'receiver-incomplete'));
});

// ---- stored data rows --------------------------------------------------------------------------------

test('database silencer keeps its stored row; changed data is reported, not used', () => {
  const inputs = pathOf([{ type: 'source', lw: flat(90) }, rect({ series: 'trox-xk', d: 200, s: 100, L: 1500, B: 1200, H: 1000 })], { flow: 10000 });
  const sd = inputs.paths[0].rows[1];
  assert.deepEqual(sd.row.de, [5, 12, 22, 44, 50, 46, 30, 19]);
  assert.deepEqual(staleRows(inputs), []);

  // A file saved with other data: the stored values are used and the difference is reported.
  const old = structuredClone(inputs);
  old.paths[0].rows[1].row.de = flat(1);
  old.paths[0].rows[1].row.dataVersion = '2020-01-01';
  const back = normalizeInputs(JSON.parse(JSON.stringify(old)));
  assert.deepEqual(back.paths[0].rows[1].row.de, flat(1));
  assert.equal(back.paths[0].rows[1].row.dataVersion, '2020-01-01');
  assert.deepEqual(rowResult(back, 'r2').de, flat(1));
  assert.deepEqual(staleRows(back), [{ pathId: 'w1', rowId: 'r2', missing: false }]);

  // A new selection takes the row from the current data.
  back.paths[0].rows[1].rect.L = 2000;
  const sel = normalizeInputs(back);
  assert.equal(sel.paths[0].rows[1].row.L, 2000);
  assert.deepEqual(staleRows(sel), []);
});

test('choices offer only existing rows; a changed selection snaps to the nearest one', () => {
  const c = rectChoices({ series: 'schako-mwk-ob', d: 100, s: 70, L: 1000 });
  assert.deepEqual(c.d, [100, 200]);
  assert.deepEqual(c.s, [50, 60, 70, 80, 90, 100]);
  assert.ok(c.L.includes(1000));
  // Trox XK has no s = 60 for d = 100: nearest gap, the housing stays
  assert.deepEqual(snapRect({ series: 'trox-xk', d: 100, s: 60, L: 1000, B: 800, H: 800 }), { series: 'trox-xk', d: 100, s: 50, L: 1000, B: 800, H: 800 });
  assert.equal(snapRect({ series: 'nope', d: 200, s: 100, L: 1000 }).series, 'trox-xk');
  // round: CK has two splitter widths per size, CA none
  assert.deepEqual(roundChoices({ series: 'trox-ck', dn: 315, L: 1000, insulation: 50, core: 50 }).core, [50, 100]);
  const ca = snapRound({ series: 'trox-ca', dn: 300, L: 1200, insulation: 50, core: 100 });
  assert.deepEqual([ca.dn, ca.L, ca.core], [315, 1000, null]);
  assert.ok(lookupRow('round', ca));
});

// ---- 6. variants ---------------------------------------------------------------------------------------

/** Fan 85 … 90 dB, 20’000 m³/h, one silencer in a housing, receiver at 3 m with a target of 40 dB(A). */
function variantCase(rectSpec, { flow = 20000, kind = 'rect', roundSpec = { series: 'trox-ca', dn: 315, L: 1000, insulation: 50 } } = {}) {
  return pathOf(
    [
      { type: 'source', lw: [85, 88, 90, 88, 85, 82, 78, 74] },
      { type: 'silencer', kind, rect: { series: 'trox-xk', d: 200, s: 100, L: 1500, ...rectSpec }, round: roundSpec },
    ],
    { flow, receiver: { r: 3, q: 2, basis: 'manual', target: 40 } },
  );
}

test('6. variants: one per d / s that fits the housing; shortest L that meets the target; ranked by Δp', () => {
  const inputs = variantCase({ series: 'trox-mk', B: 1500, H: 1000 });
  const v = silencerVariants(inputs, 'w1', 'r2');
  assert.equal(v.missing, null);
  assert.ok(v.list.length >= 3);
  const keys = v.list.map((c) => `${c.spec.d}/${c.n}`);
  assert.equal(new Set(keys).size, keys.length, 'one variant per d and n');
  for (const c of v.list) {
    assert.ok(Math.abs(c.gap - c.spec.s) <= GAP_TOLERANCE * c.spec.s + 1e-9, `${c.spec.d}/${c.spec.s}: s′ ${c.gap}`);
    near(c.n * (c.spec.d + c.gap), 1500, 1e-9, 'fills B');
  }
  const fitting = v.list.filter((c) => c.ok);
  assert.ok(fitting.length >= 1);
  for (const c of fitting) {
    assert.ok(c.v <= VARIANT_LIMITS.vMax && c.dp <= VARIANT_LIMITS.dpMax, 'limits');
    assert.ok(c.margin >= -0.05, 'target');
    // shortest length: one step shorter misses the target
    const shorter = rectChoices(c.spec).L.filter((L) => L < c.spec.L).pop();
    if (shorter) {
      const trial = structuredClone(inputs);
      Object.assign(trial.paths[0].rows[1].rect, { d: c.spec.d, s: c.spec.s, L: shorter });
      const rc = compute(normalizeInputs(trial)).paths[0].receiver;
      assert.equal(rc.status, 'over', `${c.spec.d}/${c.spec.s}/${shorter} should miss`);
    }
  }
  fitting.forEach((c, i) => i && assert.ok(c.dp >= fitting[i - 1].dp, 'ranked by Δp'));
  assert.ok(v.list.findIndex((c) => !c.ok) === -1 || v.list.findIndex((c) => !c.ok) >= fitting.length, 'fitting first');
});

test('variants: narrow gaps are rejected for their flow noise even when they meet the target', () => {
  // Trox MK 100/50/3000 in B 1500: n = 10, v_s = 11.1 m/s; it meets the target with 3.3 dB to spare, but its flow
  // noise is only 5.4 dB below the level after it (10 dB needed).
  const inputs = variantCase({ series: 'trox-mk', d: 100, s: 50, L: 3000, B: 1500, H: 1000 });
  const p = resultOf(inputs);
  const r = p.rows.get('r2');
  assert.equal(r.n, 10);
  near(r.v, 11.11, 0.01);
  near(p.receiver.margin, 3.32, 0.01);
  near(r.noiseMargin, 5.44, 0.01);
  assert.deepEqual(codes(r), ['flow-noise']);
  const v = silencerVariants(inputs, 'w1', 'r2');
  const narrow = v.list.find((c) => c.spec.d === 100 && c.spec.s === 50);
  assert.notEqual(narrow.spec.L, 3000, 'not offered at L 3000');
  assert.equal(narrow.ok, false);
  assert.ok(v.list[0].ok, 'a wider gap fits');
});

test('variants: missing housing or flow; round by dn; the stored row of a candidate is current', () => {
  assert.equal(silencerVariants(variantCase({ B: null, H: 1000 }), 'w1', 'r2').missing, 'geometry');
  assert.equal(silencerVariants(variantCase({ B: 1200, H: 1000 }, { flow: null }), 'w1', 'r2').missing, 'flow');
  const r = silencerVariants(variantCase({}, { kind: 'round', flow: 6000, roundSpec: { series: 'schako-rs-n', dn: 500, L: 950, insulation: 100 } }), 'w1', 'r2');
  assert.ok(r.list.length >= 1);
  for (const c of r.list) assert.equal(c.spec.dn, 500);
  assert.equal(new Set(r.list.map((c) => `${c.spec.insulation}/${c.spec.core}`)).size, r.list.length, 'one per insulation and core');
  assert.equal(silencerVariants(pathOf([{ type: 'silencer', kind: 'manual' }]), 'w1', 'r1'), null, 'manual: none');
});

test('fittingSplitterRows: per d and n only the gap closest to the real one', () => {
  const rows = fittingSplitterRows('trox-xk', 900);
  const d100 = rows.filter((r) => r.d === 100);
  // B 900, d 100: s 50 → n 6 (s′ 50); s 80 → n 5 (s′ 80); s 100 → n 4.5 → 5 (s′ 80): the same silencer as s 80 → dropped
  assert.deepEqual([...new Set(d100.map((r) => r.s))], [50, 80]);
});

// ---- front view ----------------------------------------------------------------------------------------

test('front view: housing to scale with n splitters, round with casing and core', () => {
  const row = rowCopy(lookupRow('rect', { series: 'trox-xk', d: 200, s: 100, L: 1500 }), 'rect');
  const r = splitterSilencer({ row, B: 1200, H: 600, flow: null, density: 1.2 });
  const svg = rectFrontView({ B: 1200, H: 600, d: 200 }, r);
  assert.equal(svg.match(/class="fv-splitter"/g).length, 4);
  const housing = /class="fv-housing" x="[\d.]+" y="[\d.]+" width="([\d.]+)" height="([\d.]+)"/.exec(svg);
  near(Number(housing[1]) / Number(housing[2]), 2, 0.02, 'aspect ratio B / H');
  assert.match(rectFrontView({ B: null, H: null, d: 200 }, null), /fv-empty/);
  const ck = rowCopy(lookupRow('round', { series: 'trox-ck', dn: 315, L: 1000, insulation: 50, core: 100 }), 'round');
  const rv = roundFrontView(ck);
  assert.equal(rv.match(/<circle/g).length, 4, 'casing and duct, each filled and outlined');
  assert.match(rv, /class="fv-splitter" x=/, 'core');
});

// ---- schema ---------------------------------------------------------------------------------------------

test('newRow, newPath, duplicatePath: unique ids in the whole file, same results', () => {
  const inputs = exampleInputs();
  const row = newRow(inputs, 'silencer');
  assert.equal(row.id, 'r9');
  assert.ok(row.row, 'a new silencer starts with an existing product');
  const p = newPath(inputs);
  assert.deepEqual([p.id, p.rows.length, p.rows[0].type], ['w3', 1, 'source']);
  const copy = duplicatePath(inputs, inputs.paths[1]);
  assert.equal(copy.id, 'w3');
  assert.deepEqual(copy.rows.map((r) => r.id), ['r9', 'r10', 'r11', 'r12']);
  inputs.paths.push(copy);
  const res = compute(normalizeInputs(inputs));
  near(res.paths[2].receiver.lpa, res.paths[1].receiver.lpa, 1e-9);
});

test('normalizeInputs is idempotent, repairs ids and does not throw on old or foreign data', () => {
  const inputs = exampleInputs();
  assert.deepEqual(normalizeInputs(JSON.parse(JSON.stringify(inputs))), inputs);
  const twice = normalizeInputs({ paths: [{ id: 'w1', rows: [{ id: 'x', type: 'source' }, { id: 'x', type: 'loss' }] }, { id: 'w1' }] });
  assert.deepEqual(twice.paths.map((p) => p.id), ['w1', 'w2']);
  assert.notEqual(twice.paths[0].rows[0].id, twice.paths[0].rows[1].id);
  // input version 1 (tree of strands) or garbage: an empty file, no exception (beta: no migration)
  for (const raw of [{ strands: [{ elements: [{ type: 'receiver' }] }] }, null, 42, { paths: 'x', catalogs: { roomTypes: 5 } }, { paths: [null, 7] }]) {
    const n = normalizeInputs(raw);
    assert.ok(n.paths.length >= 1);
    assert.deepEqual(normalizeInputs(JSON.parse(JSON.stringify(n))), n);
    compute(n);
  }
});

test('envelope round trip keeps the inputs and the snapshot', () => {
  const inputs = exampleInputs();
  const snapshot = snapshotOf(compute(inputs));
  assert.deepEqual(Object.keys(snapshot.paths), ['w1', 'w2']);
  near(snapshot.paths.w1.lpa, 32.37, 0.01);
  const env = createEnvelope({ tool: TOOL_ID, version: INPUT_VERSION, calcVersion: CALC_VERSION, project: { name: 'X' }, inputs, snapshot });
  const back = parseEnvelope(JSON.parse(JSON.stringify(env)));
  assert.deepEqual(checkCompatibility(back, { tool: TOOL_ID, version: INPUT_VERSION, calcVersion: CALC_VERSION }), []);
  assert.deepEqual(normalizeInputs(back.inputs), inputs);
  assert.deepEqual(snapshotOf(compute(normalizeInputs(back.inputs))), snapshot);
});
