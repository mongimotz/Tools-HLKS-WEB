// Silencer calculation (tools/silencer/calc.js) and input schema (defaults.js). Reference values: docs/silencer-plan.md
// section 8; hand calculations are given next to each expectation.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CALC_VERSION,
  compute,
  sumLevels,
  aWeighted,
  flowNoise,
  roomTerm,
  absorptionArea,
  splitterSilencer,
  roundSilencer,
  lookupRow,
  rowCopy,
  staleRows,
  snapshotOf,
  rectChoices,
  roundChoices,
  snapRect,
  snapRound,
  proposeSilencer,
  PROPOSE_DEFAULTS,
} from '../tools/silencer/calc.js';
import {
  normalizeInputs,
  exampleInputs,
  emptyInputs,
  newStrand,
  TOOL_ID,
  INPUT_VERSION,
  autoNumbers,
  isAutoNumbered,
  branchDepths,
  insertAfter,
  insertBefore,
  branchFrom,
  removeElement,
  moveElement,
  setPredecessor,
  duplicateStrand,
  normalizeElement,
} from '../tools/silencer/defaults.js';
import { createEnvelope, parseEnvelope, checkCompatibility } from '../lib/core/envelope.js';
import { frictionFactor } from '../lib/core/air.js';

const near = (actual, expected, tol, msg = '') =>
  assert.ok(Math.abs(actual - expected) <= tol, `${msg} expected ${expected} ± ${tol}, got ${actual}`);
const nearAll = (actual, expected, tol, msg = '') => expected.forEach((e, i) => near(actual[i], e, tol, `${msg}[${i}]`));

/** One strand from a list of elements (chain unless `after` is given). */
function strandOf(elements, { flow = null, density = 1.2 } = {}) {
  const els = elements.map((e, i) => ({ id: `e${i + 1}`, after: i ? `e${i}` : null, ...e }));
  return normalizeInputs({ density, strands: [{ id: 'st1', flow, elements: els }] });
}
const resultOf = (inputs, id) => compute(inputs).strands[0].elements.get(id);
const codes = (r) => r.issues.map((i) => i.code);

const rect = (spec, extra = {}) => ({ type: 'silencer', kind: 'rect', rect: spec, ...extra });
const round = (spec, extra = {}) => ({ type: 'silencer', kind: 'round', round: spec, ...extra });

// ---- 1. Kilian chain --------------------------------------------------------------------

test('1. Kilian chain: spectrum, L_WA and L_pA of the Excel sheet', () => {
  const inputs = exampleInputs();
  const s = compute(inputs).strands[0];
  const last = s.elements.get('e4');
  nearAll(last.lwOut, [69.24, 56.75, 42.53, 36.01, 32.0, 28.02, 28.15, 37.18], 0.01, 'L_W');
  near(last.lwaOut, 46.38, 0.01, 'L_WA');
  const rec = s.elements.get('e5');
  near(rec.lpa, 32.37, 0.01, 'L_pA (r = 2 m, Q = 2, no room)');
  assert.equal(rec.area, null);
});

test('levels: energetic sum and A-weighting', () => {
  near(sumLevels([60, 60]), 63.01, 0.01);
  assert.equal(sumLevels([-Infinity, -Infinity]), -Infinity);
  near(aWeighted([0, 0, 0, 0, 80, 0, 0, 0]), 80, 1e-3);
});

// ---- 2. database splitter ----------------------------------------------------------------

test('2. Trox XK 200/100/1500, n = 4, H = 1000, 10’000 m³/h', () => {
  const row = rowCopy(lookupRow('rect', { series: 'trox-xk', d: 200, s: 100, L: 1500 }), 'rect');
  const r = splitterSilencer({ row, n: 4, H: 1000, flow: 10000, density: 1.2 });
  assert.equal(r.B, 1200);
  near(r.v, 6.944, 0.001, 'v_s'); // 10000 / 3600 / (4 · 0.1 · 1.0)
  assert.deepEqual(r.de, [5, 12, 22, 44, 50, 46, 30, 19]);
  near(r.zeta, 0.6525, 1e-4, 'ζ'); // 14 / (0.6 · 6²) = 0.6481 … 40 / (0.6 · 10²) = 0.6667, linear in v
  near(r.dp, 18.9, 0.05, 'Δp');
  near(r.lwaFlow, 35.35, 0.01, 'L_WA,flow'); // 31 + 7 · lg(6.944/6) / lg(8/6) + 10 · lg 1.2
  nearAll(r.lwFlow, [39.3, 33.3, 34.3, 33.3, 30.3, 27.3, 21.3, 17.3], 0.06, 'L_W,flow');
});

test('2b. the same silencer as an element: installation factor and net effect', () => {
  const spec = { series: 'trox-xk', d: 200, s: 100, L: 1500, n: 4, H: 1000 };
  const lw = [90, 90, 90, 90, 90, 90, 90, 90];
  const duct = resultOf(strandOf([{ type: 'source', lw }, rect(spec)], { flow: 10000 }), 'e2');
  const outlet = resultOf(strandOf([{ type: 'source', lw }, rect(spec, { install: 'freeOutlet' })], { flow: 10000 }), 'e2');
  near(outlet.dp / duct.dp, 1.3, 1e-9, 'free outlet');
  assert.ok(duct.row && duct.row.dataVersion);
  // (L − D_e) ⊕ L_W,flow per octave
  duct.lwOut.forEach((l, i) => near(l, sumLevels([90 - duct.de[i], duct.lwFlow[i]]), 1e-9));
});

// ---- 3. branch split -----------------------------------------------------------------------

test('3. branch split: 6000 → 2000 m³/h gives −4.77 dB in every octave', () => {
  const lw = [80, 80, 80, 80, 80, 80, 80, 80];
  const inputs = normalizeInputs({
    strands: [
      {
        id: 'st1',
        flow: 6000,
        elements: [
          { id: 'e1', after: null, type: 'source', lw },
          { id: 'e2', after: 'e1', type: 'component', flow: 2000 },
          { id: 'e3', after: 'e1', type: 'component', flow: 4000 },
          { id: 'e4', after: 'e1', type: 'component', split: -10 },
        ],
      },
    ],
  });
  const s = compute(inputs).strands[0];
  near(s.elements.get('e2').split, -4.77, 0.005);
  nearAll(s.elements.get('e2').lwOut, new Array(8).fill(75.23), 0.005);
  near(s.elements.get('e3').split, -1.76, 0.005);
  assert.equal(s.elements.get('e4').split, -10, 'manual value wins');
  assert.equal(s.elements.get('e4').flow, 6000, 'inherited flow');
  // 2000 + 4000 = 6000: no continuity warning; e4 has a manual split: no hint.
  assert.deepEqual(s.issues, []);
});

test('branch without own flow is flagged; flows above the feeder are flagged', () => {
  const inputs = normalizeInputs({
    strands: [
      {
        id: 'st1',
        flow: 1000,
        elements: [
          { id: 'e1', after: null, type: 'source', lw: [80] },
          { id: 'e2', after: 'e1', type: 'component', flow: 800 },
          { id: 'e3', after: 'e1', type: 'component', flow: 700 },
          { id: 'e4', after: 'e1', type: 'component' },
        ],
      },
    ],
  });
  const s = compute(inputs).strands[0];
  assert.deepEqual(codes(s.elements.get('e1')), ['flow-continuity']);
  assert.deepEqual(codes(s.elements.get('e4')), ['split-missing']);
});

// ---- 4. receiver ------------------------------------------------------------------------------

test('4. receiver with room term: A = 20 m², r = 1 m, Q = 2 → −4.45 dB', () => {
  near(roomTerm({ r: 1, q: 2, area: 20 }), -4.45, 0.005); // 10 · lg(2/(4π) + 4/20)
  near(roomTerm({ r: 2, q: 2, area: null }), -14.0, 0.005); // free field, 10 · lg(2/(16π))
  near(absorptionArea({ volume: 100, reverb: 0.815 }), 20, 1e-9); // 0.163 · 100 / 0.815
  assert.equal(absorptionArea({ area: 12, volume: 100, reverb: 0.815 }), 12, 'A given wins');

  const lw = [60, 60, 60, 60, 60, 60, 60, 60];
  const inputs = strandOf([{ type: 'source', lw }, { type: 'receiver', r: 1, q: 2, volume: 100, reverb: 0.815, basis: 'manual', target: 50 }]);
  const rec = resultOf(inputs, 'e2');
  nearAll(rec.lp, new Array(8).fill(55.55), 0.005);
  near(rec.lpa, aWeighted(rec.lp), 1e-9);
  assert.equal(rec.status, 'over');
  assert.deepEqual(codes(rec), ['target-exceeded']);
});

test('receiver status is judged on the shown value (one decimal)', () => {
  // L_pA = 35.04 → shown 35.0 → meets a target of 35.
  const lw = [null, null, null, null, 35.04 + 14.0024, null, null, null];
  const rec = resultOf(strandOf([{ type: 'source', lw }, { type: 'receiver', r: 2, q: 2, basis: 'manual', target: 35 }]), 'e2');
  near(rec.lpa, 35.04, 0.01);
  assert.equal(rec.status, 'ok');
});

// ---- targets ------------------------------------------------------------------------------------

/** Receiver at r = 2 m, Q = 2 in free field behind a source that gives L_pA = lpa (1000 Hz only). */
function receiverWith(lpa, receiver) {
  const lw = [null, null, null, null, lpa - roomTerm({ r: 2, q: 2 }), null, null, null];
  return resultOf(strandOf([{ type: 'source', lw }, { type: 'receiver', r: 2, q: 2, ...receiver }]), 'e2');
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
  const flat = receiverWith(30, { basis: 'room', room: { type: '1.01' } });
  assert.deepEqual(flat.issues.map((i) => i.code), ['room-note', 'target-exceeded'], 'footnote of table 12');
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
  const t = receiverWith(32.37, { basis: 'lsv', lsv: { es: 2, k2: 2, hoursNight: 6 } });
  near(t.checks[1].level, 41.36, 0.005);

  // Immissionsgrenzwert, business room (+5 dB in ES I to III), no operation at night
  const b = receiverWith(52, { basis: 'lsv', lsv: { es: 3, limit: 'immission', business: true, hoursNight: 0 } });
  assert.deepEqual(b.checks.map((c) => [c.period, c.limit]), [['day', 70]]);
  assert.equal(b.status, 'ok');
  const iv = receiverWith(52, { basis: 'lsv', lsv: { es: 4, business: true } });
  assert.deepEqual(iv.checks.map((c) => c.limit), [65, 55], 'no bonus in ES IV');
  assert.equal(iv.status, 'over');
  assert.deepEqual(iv.issues.map((i) => [i.code, i.period]), [['target-exceeded', 'night']]);
});

test('manual target and the example: the worst check gives the status of the file', () => {
  const m = receiverWith(40, { basis: 'manual', target: 40 });
  assert.equal(m.status, 'ok');
  assert.deepEqual(receiverWith(40, { basis: 'manual', target: null }).checks, []);
  const res = compute(exampleInputs());
  assert.deepEqual([res.worst.elementId, res.worst.target, res.worst.status], ['e5', 28, 'over']);
});

// ---- 5. pressure loss models --------------------------------------------------------------------

test('5a. dpModel duct: Trox CA 200/1000 like a straight duct', () => {
  const row = rowCopy(lookupRow('round', { series: 'trox-ca', dn: 200, L: 1000, insulation: 50 }), 'round');
  const r = roundSilencer({ row, flow: 1000, density: 1.2 });
  near(r.v, 8.842, 0.001, 'v'); // 1000 / 3600 / (π/4 · 0.2²)
  // Re = 8.842 · 0.2 / (1.813e-5 / 1.2) = 1.17e5, k/d = 0.15/200 → λ ≈ 0.021 (Moody; Haaland 0.0207)
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
  // flow noise with v in the free cross-section π/4 · 0.25² − 0.1 · 0.25 = 0.02409 m², A = π/4 · 0.25²
  near(r.aFree, 0.024087, 1e-6);
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
  const slow = splitterSilencer({ row, n: 4, H: 1000, flow: 3000, density: 1.2 });
  near(slow.zeta, 14 / (0.6 * 36), 1e-9);
  const fast = splitterSilencer({ row, n: 4, H: 1000, flow: 30000, density: 1.2 });
  near(fast.zeta, 78 / (0.6 * 196), 1e-9);
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

test('warnings: velocity, Δp, flow noise margin, Trox height, source note, edge gap', () => {
  const lw = [80, 80, 80, 80, 80, 80, 80, 80];
  // 200/50/1500, n = 2, H = 600 at 9000 m³/h: v_s = 9000 / 3600 / (2 · 0.05 · 0.6) = 41.7 m/s
  const fast = resultOf(strandOf([{ type: 'source', lw }, rect({ series: 'trox-xk', d: 200, s: 50, L: 1500, n: 2, H: 600, B: 600 })], { flow: 9000 }), 'e2');
  assert.deepEqual(new Set(codes(fast)), new Set(['velocity-high', 'dp-high', 'flow-noise', 'height-dp', 'edge-gap']));
  near(fast.v, 41.67, 0.01);

  const noted = resultOf(strandOf([{ type: 'source', lw }, rect({ series: 'schako-mwk-ob', d: 100, s: 50, L: 2000, n: 4, H: 1000 })], { flow: 3000 }), 'e2');
  assert.ok(codes(noted).includes('row-note'));
  assert.match(noted.issues.find((i) => i.code === 'row-note').note, /250 Hz/);

  const quiet = resultOf(strandOf([{ type: 'source', lw }, rect({ series: 'trox-xk', d: 200, s: 100, L: 1500, n: 4, H: 1000 })], { flow: 10000 }), 'e2');
  assert.deepEqual(codes(quiet), []);
});

test('missing data: no row, no geometry, no flow, no source', () => {
  const lw = [80, 80, 80, 80, 80, 80, 80, 80];
  const noRow = resultOf(strandOf([{ type: 'source', lw }, rect({ series: 'trox-xk', d: 200, s: 90, L: 1500, n: 4, H: 1000 })], { flow: 1000 }), 'e2');
  assert.deepEqual(codes(noRow), ['row-missing']);
  assert.deepEqual(noRow.lwOut, lw, 'no row: no effect');

  const noN = resultOf(strandOf([{ type: 'source', lw }, rect({ series: 'trox-xk', d: 200, s: 100, L: 1500, H: 1000 })], { flow: 1000 }), 'e2');
  assert.deepEqual(codes(noN), ['geometry-missing']);
  assert.deepEqual(noN.de, [5, 12, 22, 44, 50, 46, 30, 19], 'D_e does not depend on n');

  const noFlow = resultOf(strandOf([{ type: 'source', lw }, rect({ series: 'trox-xk', d: 200, s: 100, L: 1500, n: 4, H: 1000 })]), 'e2');
  assert.deepEqual(codes(noFlow), ['flow-missing']);
  assert.equal(noFlow.lwFlow, null);

  const s = compute(strandOf([{ type: 'component', lw }, { type: 'receiver' }])).strands[0];
  assert.deepEqual(codes(s.elements.get('e1')), ['root-not-source']);
  assert.deepEqual(codes(s.elements.get('e2')), ['receiver-incomplete']);
});

test('manual silencer: D_e above 50 dB is flagged, empty cells are 0 dB / no noise', () => {
  const lw = [80, 80, 80, 80, 80, 80, 80, 80];
  const r = resultOf(strandOf([{ type: 'source', lw }, { type: 'silencer', kind: 'manual', manual: { de: [10, 55], dp: 120 } }]), 'e2');
  assert.deepEqual(new Set(codes(r)), new Set(['de-cap', 'dp-high']));
  assert.deepEqual(r.lwOut, [70, 25, 80, 80, 80, 80, 80, 80]);
  assert.equal(r.lwaFlow, null);
});

// ---- strands, tree, worst receiver -------------------------------------------------------------------

test('strands are independent; the worst receiver of the file is the one furthest over its target', () => {
  const inputs = exampleInputs(); // office, minimum requirement 28 dB(A): 32.4 → 4.4 over
  const second = newStrand(inputs, { name: 'Abluft' });
  second.elements[0].lw = [70, 70, 70, 70, 70, 70, 70, 70];
  Object.assign(second.elements[1], { r: 1, q: 2, basis: 'manual', target: 70 }); // well below
  inputs.strands.push(second);
  const res = compute(normalizeInputs(inputs));
  near(res.strands[0].elements.get('e5').lpa, 32.37, 0.01, 'unchanged by the second strand');
  assert.deepEqual([res.worst.strandId, res.worst.elementId, res.worst.status], ['st1', 'e5', 'over']);
  assert.equal(res.strands[1].worstId, second.elements[1].id);
});

test('cycles and unknown predecessors are cut instead of crashing', () => {
  const inputs = normalizeInputs({
    strands: [
      {
        id: 'st1',
        elements: [
          { id: 'e1', after: null, type: 'source', lw: [80] },
          { id: 'e2', after: 'e3', type: 'component' },
          { id: 'e3', after: 'e2', type: 'component' },
          { id: 'e4', after: 'nope', type: 'component' },
        ],
      },
    ],
  });
  const s = compute(inputs).strands[0];
  assert.equal(s.order.length, 4);
  assert.ok(s.issues.some((i) => i.code === 'cycle'));
  assert.ok(s.issues.some((i) => i.code === 'after-missing'));
});

test('empty document computes without errors', () => {
  const res = compute(emptyInputs());
  assert.equal(res.strands.length, 1);
  assert.equal(res.worst, null);
  assert.deepEqual(res.issues.map((i) => i.code), ['lw-missing', 'receiver-incomplete']);
});

// ---- stored data rows --------------------------------------------------------------------------------

test('database silencer keeps its stored row; changed data is reported, not used', () => {
  const inputs = strandOf([{ type: 'source', lw: [90, 90, 90, 90, 90, 90, 90, 90] }, rect({ series: 'trox-xk', d: 200, s: 100, L: 1500, n: 4, H: 1000 })], { flow: 10000 });
  const el = inputs.strands[0].elements[1];
  assert.deepEqual(el.row.de, [5, 12, 22, 44, 50, 46, 30, 19]);
  assert.deepEqual(staleRows(inputs), []);

  // A file saved with other data: the stored values are used and the difference is reported.
  const old = structuredClone(inputs);
  old.strands[0].elements[1].row.de = [1, 1, 1, 1, 1, 1, 1, 1];
  old.strands[0].elements[1].row.dataVersion = '2020-01-01';
  const back = normalizeInputs(JSON.parse(JSON.stringify(old)));
  assert.deepEqual(back.strands[0].elements[1].row.de, [1, 1, 1, 1, 1, 1, 1, 1]);
  assert.equal(back.strands[0].elements[1].row.dataVersion, '2020-01-01');
  assert.deepEqual(resultOf(back, 'e2').de, [1, 1, 1, 1, 1, 1, 1, 1]);
  assert.deepEqual(staleRows(back), [{ strandId: 'st1', elementId: 'e2', missing: false }]);

  // A new selection takes the row from the current data.
  back.strands[0].elements[1].rect.L = 2000;
  const sel = normalizeInputs(back);
  assert.equal(sel.strands[0].elements[1].row.L, 2000);
  assert.deepEqual(staleRows(sel), []);
});

test('selects offer only existing rows; a changed selection snaps to the nearest one', () => {
  const c = rectChoices({ series: 'schako-mwk-ob', d: 100, s: 70, L: 1000 });
  assert.deepEqual(c.d, [100, 200]);
  assert.deepEqual(c.s, [50, 60, 70, 80, 90, 100]);
  assert.ok(c.L.includes(1000));
  // Trox XK has no s = 60 for d = 100: nearest gap, the other keys stay
  assert.deepEqual(snapRect({ series: 'trox-xk', d: 100, s: 60, L: 1000, n: 3, H: 800, B: null }), { series: 'trox-xk', d: 100, s: 50, L: 1000, n: 3, H: 800, B: null });
  assert.equal(snapRect({ series: 'nope', d: 200, s: 100, L: 1000 }).series, 'trox-xk');
  // round: CK has two splitter widths per size, CA none
  assert.deepEqual(roundChoices({ series: 'trox-ck', dn: 315, L: 1000, insulation: 50, core: 50 }).core, [50, 100]);
  const ca = snapRound({ series: 'trox-ca', dn: 300, L: 1200, insulation: 50, core: 100 });
  assert.deepEqual([ca.dn, ca.L, ca.core], [315, 1000, null]);
  assert.ok(lookupRow('round', ca));
});

// ---- 6. proposal -------------------------------------------------------------------------------------

/** Fan 85 … 90 dB, 20’000 m³/h, one silencer to search, receiver at 3 m with a target of 40 dB(A). */
function proposalCase(propose, { flow = 20000, kind = 'rect' } = {}) {
  return normalizeInputs({
    strands: [
      {
        id: 'st1',
        flow,
        elements: [
          { id: 'e1', after: null, type: 'source', lw: [85, 88, 90, 88, 85, 82, 78, 74] },
          { id: 'e2', after: 'e1', type: 'silencer', kind, rect: { series: 'trox-xk', d: 200, s: 100, L: 1500, n: 4, H: 1000 }, round: { series: 'trox-ca', dn: 315, L: 1000, insulation: 50 }, propose: { active: true, ...propose } },
          { id: 'e3', after: 'e2', type: 'receiver', r: 3, q: 2, basis: 'manual', target: 40 },
        ],
      },
    ],
  });
}

test('6. proposal: narrow gaps that would meet the target are rejected for their flow noise; ranked by Δp', () => {
  const r = proposeSilencer(proposalCase({ H: 1000, bMax: 1500 }), 'st1', 'e2');
  assert.equal(r.tried, 305, 'one candidate per data row');
  assert.ok(r.fitting.length >= 1);
  for (const c of r.fitting) {
    assert.ok(c.v <= PROPOSE_DEFAULTS.vMax && c.dp <= PROPOSE_DEFAULTS.dpMax, 'limits');
    assert.ok(c.noiseMargin >= 10, 'flow noise margin');
    assert.ok(c.spec.n * (c.spec.d + c.spec.s) <= 1500, 'B max');
    assert.ok(c.margin > -0.05, 'target');
  }
  r.fitting.forEach((c, i) => i && assert.ok(c.dp >= r.fitting[i - 1].dp, 'ranked by Δp'));
  // Trox MK 100/50/3000 (n = 10, v_s = 11.1 m/s) leaves more margin at the receiver than the winner,
  // but its flow noise is only 5.4 dB below the level after it: rejected.
  const narrow = r.all.find((c) => c.spec.series === 'trox-mk' && c.spec.d === 100 && c.spec.s === 50 && c.spec.L === 3000);
  assert.equal(narrow.spec.n, 10);
  assert.ok(narrow.margin > r.fitting[0].margin);
  near(narrow.noiseMargin, 5.4, 0.05);
  assert.equal(narrow.ok, false);
  assert.equal(r.closest, null);
});

test('proposal: without B max the most compact fitting n per row; round by dn range; nothing fits → closest', () => {
  const compact = proposeSilencer(proposalCase({ H: 1000 }), 'st1', 'e2');
  for (const c of compact.fitting.slice(0, 10)) {
    const smaller = { ...c.spec, n: c.spec.n - 1 };
    if (smaller.n < 1) continue;
    const again = proposeSilencer(proposalCase({ H: 1000, bMax: smaller.n * (c.spec.d + c.spec.s), series: c.spec.series, lMax: c.spec.L }), 'st1', 'e2');
    const same = again.all.find((x) => x.spec.d === c.spec.d && x.spec.s === c.spec.s && x.spec.L === c.spec.L);
    assert.equal(same.ok, false, `${c.spec.series} ${c.spec.d}/${c.spec.s}/${c.spec.L}: n − 1 must not fit`);
  }
  const round = proposeSilencer(proposalCase({ dnMin: 400, dnMax: 630, series: 'trox-ca' }, { flow: 6000, kind: 'round' }), 'st1', 'e2');
  assert.ok(round.tried > 0);
  for (const c of round.all) assert.ok(c.spec.series === 'trox-ca' && c.spec.dn >= 400 && c.spec.dn <= 630);
  const none = proposeSilencer(proposalCase({ H: 1000, bMax: 600 }), 'st1', 'e2');
  assert.equal(none.fitting.length, 0);
  assert.ok(none.closest);
});

test('only one element is searched at a time', () => {
  const inputs = proposalCase({ H: 1000 });
  inputs.strands[0].elements.splice(2, 0, normalizeElement({ id: 'e4', after: 'e2', type: 'silencer', propose: { active: true } }));
  inputs.strands[0].elements[3].after = 'e4';
  const n = normalizeInputs(inputs);
  assert.deepEqual(n.strands[0].elements.filter((e) => e.propose?.active).map((e) => e.id), ['e2']);
});

// ---- structure editing ---------------------------------------------------------------------------------

const shape = (strand) => strand.elements.map((e) => `${e.nr}:${e.type[0]}<${e.after ? strand.elements.find((x) => x.id === e.after).nr : '-'}`).join(' ');

test('structure: insert, branch, numbers, depth, move and remove keep a valid tree', () => {
  const inputs = exampleInputs(); // 1 source, 2 silencer, 3 component, 4 silencer, 5 receiver
  const s = inputs.strands[0];
  assert.ok(isAutoNumbered(s.elements));
  const b = branchFrom(inputs, s, 'e2', 'component', { flow: 2000 });
  branchFrom(inputs, s, b.id, 'receiver');
  assert.equal(shape(s), '1:s<- 2:s<1 3:c<2 4:s<3 5:r<4 2.1:c<2 2.2:r<2.1');
  assert.deepEqual([...branchDepths(s.elements).values()], [0, 0, 0, 0, 0, 1, 1]);
  // a second branch from 2 continues the counter of 2
  branchFrom(inputs, s, 'e2', 'receiver');
  assert.equal(shape(s), '1:s<- 2:s<1 3:c<2 4:s<3 5:r<4 2.1:c<2 2.2:r<2.1 2.3:r<2');
  // insert after 2: everything after 2 (main path and both branches) follows the new element
  insertAfter(inputs, s, 'e2', 'silencer');
  assert.equal(shape(s), '1:s<- 2:s<1 3:s<2 4:c<3 5:s<4 6:r<5 3.1:c<3 3.2:r<3.1 3.3:r<3');
  // insert before the receiver at the end
  insertBefore(inputs, s, 'e5', 'component');
  assert.equal(shape(s), '1:s<- 2:s<1 3:s<2 4:c<3 5:s<4 6:c<5 7:r<6 3.1:c<3 3.2:r<3.1 3.3:r<3');
  // move up / down along the path; a branch start cannot move up
  assert.ok(moveElement(s, 'e3', -1)); // the VAV before the new silencer
  assert.equal(shape(s), '1:s<- 2:s<1 3:c<2 4:s<3 5:s<4 6:c<5 7:r<6 4.1:c<4 4.2:r<4.1 4.3:r<4');
  assert.equal(moveElement(s, b.id, -1), false);
  assert.equal(moveElement(s, s.elements.find((e) => e.nr === '4').id, 1), false, 'branch point has several successors');
  // remove: the successors move to the predecessor
  removeElement(s, s.elements.find((e) => e.nr === '4').id);
  assert.equal(shape(s), '1:s<- 2:s<1 3:c<2 4:s<3 5:c<4 6:r<5 3.1:c<3 3.2:r<3.1 3.3:r<3');
  assert.deepEqual(normalizeInputs(JSON.parse(JSON.stringify(inputs))), inputs);
});

test('structure: a new predecessor makes the element (with its subtree) a branch there', () => {
  const inputs = exampleInputs();
  const s = inputs.strands[0];
  assert.ok(setPredecessor(s, 'e4', 'e2')); // silencer 2 and the receiver now branch off after silencer 1
  assert.equal(shape(s), '1:s<- 2:s<1 3:c<2 2.1:s<2 2.2:r<2.1');
  assert.equal(setPredecessor(s, 'e2', 'e5'), false, 'not onto its own subtree');
  assert.ok(setPredecessor(s, 'e4', 'e3')); // back: continuation after the VAV
  assert.equal(shape(s), '1:s<- 2:s<1 3:c<2 4:s<3 5:r<4');
});

test('structure: own numbers stay, new elements get none', () => {
  const inputs = exampleInputs();
  const s = inputs.strands[0];
  s.elements[1].nr = 'SD1';
  const el = insertAfter(inputs, s, 'e2', 'component');
  assert.equal(el.nr, '');
  assert.equal(s.elements[1].nr, 'SD1');
  assert.equal(autoNumbers(s.elements).get(el.id), '3');
});

test('duplicate strand: new ids, same structure and results', () => {
  const inputs = exampleInputs();
  const copy = duplicateStrand(inputs, inputs.strands[0]);
  inputs.strands.push(copy);
  const ids = inputs.strands.flatMap((x) => x.elements.map((e) => e.id));
  assert.equal(new Set(ids).size, ids.length);
  const res = compute(normalizeInputs(inputs));
  near(res.strands[1].elements.get(copy.elements[4].id).lpa, 32.37, 0.01);
});

// ---- schema and envelope --------------------------------------------------------------------------------

test('normalizeInputs is idempotent and repairs ids', () => {
  for (const inputs of [exampleInputs(), emptyInputs(), strandOf([rect({ series: 'trox-mk', d: 100, s: 50, L: 1000, n: 6, H: 900 }), round({ series: 'trox-ck', dn: 315, L: 1000, insulation: 50, core: 100 })])]) {
    assert.deepEqual(normalizeInputs(JSON.parse(JSON.stringify(inputs))), inputs);
  }
  const fixed = normalizeInputs({
    strands: [
      { id: 'st1', elements: [{ id: 'e1', type: 'source' }, { id: 'e1', type: 'receiver', q: 3 }] },
      { id: 'st1', elements: [{ type: 'bogus' }] },
    ],
  });
  assert.deepEqual(fixed.strands.map((s) => s.id), ['st1', 'st2']);
  assert.deepEqual(fixed.strands.flatMap((s) => s.elements.map((e) => e.id)), ['e1', 'e2', 'e3']);
  assert.equal(fixed.strands[0].elements[1].q, 2, 'Q outside 1, 2, 4, 8');
  assert.equal(fixed.strands[1].elements[0].type, 'source');
  assert.equal(fixed.density, 1.2);
});

test('envelope round trip keeps the inputs and the snapshot', () => {
  const inputs = exampleInputs();
  const project = { name: 'Beispiel Kilian', number: '', author: '', date: '2026-10-12' };
  const env = createEnvelope({ tool: TOOL_ID, version: INPUT_VERSION, calcVersion: CALC_VERSION, project, inputs, snapshot: snapshotOf(compute(inputs)) });
  const back = parseEnvelope(JSON.stringify(env));
  assert.deepEqual(checkCompatibility(back, { tool: TOOL_ID, version: INPUT_VERSION, calcVersion: CALC_VERSION }), []);
  const again = normalizeInputs(back.inputs);
  assert.deepEqual(again, inputs);
  assert.deepEqual(snapshotOf(compute(again)), back.snapshot);
  assert.equal(back.snapshot.worst.lpa, 32.375);
});
