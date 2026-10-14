// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  compute,
  computeProject,
  snapshotProjectOf,
  frictionFactor,
  airDensity,
  atmosphericPressure,
  dynamicViscosity,
  velocityLimit,
  transitionLoss,
  suggestDimensions,
  resolveTree,
  branchLevel,
} from '../tools/duct-pressure-loss/calc.js';
import { normalizeInputs, calculationInputs, calculationLabel, duplicateCalculation, newCalculation, exampleInputs, emptyInputs, ROUND_DIAMETERS } from '../tools/duct-pressure-loss/defaults.js';
import { DocumentStore } from '../lib/core/store.js';
import { numberParts, sortedSections } from '../tools/duct-pressure-loss/network.js';

const close = (actual, expected, relTol, msg) => {
  const rel = Math.abs(actual - expected) / Math.abs(expected);
  assert.ok(rel <= relTol, `${msg ?? ''} expected ${expected}, got ${actual} (rel. diff ${rel.toExponential(2)})`);
};

test('air properties at sea level, 20 °C, dry', () => {
  close(atmosphericPressure(0), 101325, 1e-9);
  close(airDensity(20, 101325, 0), 1.2041, 1e-3, 'density');
  close(dynamicViscosity(20), 1.813e-5, 5e-3, 'viscosity');
});

test('humidity lowers the density slightly', () => {
  const dry = airDensity(25, 101325, 0);
  const humid = airDensity(25, 101325, 80);
  assert.ok(humid < dry);
  assert.ok(dry - humid < 0.02);
});

test('Colebrook matches Moody reference values', () => {
  close(frictionFactor(1e5, 0.001), 0.02218, 5e-3, 'rough');
  close(frictionFactor(1e5, 0), 0.01799, 5e-3, 'smooth');
  close(frictionFactor(1e6, 0.0001), 0.01344, 5e-3, 'large Re');
});

test('Colebrook solution satisfies its own equation', () => {
  for (const Re of [5e3, 2e4, 1e5, 5e5, 2e6]) {
    for (const rr of [0, 1e-5, 1e-4, 1e-3, 5e-3]) {
      const l = frictionFactor(Re, rr);
      const rhs = -2 * Math.log10(rr / 3.71 + 2.51 / (Re * Math.sqrt(l)));
      close(1 / Math.sqrt(l), rhs, 1e-9, `Re=${Re} rr=${rr}`);
    }
  }
});

test('laminar flow uses 64/Re', () => {
  assert.equal(frictionFactor(1000, 0.001), 0.064);
});

test('Excel reference row (dry air) is reproduced within 1 %', () => {
  // Original Excel sheet (DRUCKVERLUSTBERECHNUNG_VEREINFACHT.xlsx, not in the repo), row 5. Excel uses the explicit
  // approximation of Zanke for λ (Colebrook here: −0.7 %) and a slightly different barometric formula
  // (95 163 Pa instead of 95 003 Pa at 540 m), hence the tolerance.
  const inputs = calculationInputs(normalizeInputs({ calculations: [{
    system: { altitude: 540, temperature: 21, humidity: 0 },
    sections: [{ id: 's1', nr: '1', shape: 'rect', width: 800, height: 400, material: 'galvanized', flow: 6000, length: 10, zetaExtra: 0.6 }],
  }] }));
  const r = compute(inputs).sections.get('s1');
  close(r.dh, 0.5333333, 1e-6, 'dh');
  close(r.velocity, 5.2083333, 1e-6, 'v');
  close(r.lambda, 0.018056733, 1e-2, 'lambda');
  close(r.gradient, 0.51753064, 1e-2, 'R');
  close(r.dpFittings, 9.1716372, 3e-3, 'Z');
  close(r.dp, 14.346944, 1e-2, 'dp');
});

test('beta schema ignores old single-network data without throwing', () => {
  const old = { system: { frictionMethod: 'zanke', altitude: 1000 }, sections: [{ id: 'legacy' }] };
  const inputs = normalizeInputs(old);
  assert.equal(inputs.calculations.length, 1);
  assert.equal('system' in inputs, false);
  assert.equal(calculationInputs(inputs).system.altitude, 540);
  assert.equal(calculationInputs(inputs).sections.some((section) => section.id === 'legacy'), false);
});

test('velocity limit table', () => {
  const table = [{ below: 1000, vmax: 3 }, { below: 2000, vmax: 4 }, { below: null, vmax: 7 }];
  assert.equal(velocityLimit(500, table), 3);
  assert.equal(velocityLimit(1000, table), 4);
  assert.equal(velocityLimit(50000, table), 7);
  assert.equal(velocityLimit(0, table), null);
});

test('transition loss: Borda-Carnot for expansion, zero for equal velocity', () => {
  close(transitionLoss({ vUp: 6, vDown: 3, areaUp: 1, areaDown: 2, density: 1.2 }), 0.6 * 9, 1e-12);
  assert.equal(transitionLoss({ vUp: 4, vDown: 4, areaUp: 1, areaDown: 1, density: 1.2 }), 0);
  assert.ok(transitionLoss({ vUp: 3, vDown: 6, areaUp: 2, areaDown: 1, density: 1.2 }) > 0);
});

test('example network: cumulative sums, critical path and throttling', () => {
  const inputs = calculationInputs(exampleInputs());
  const res = compute(inputs);
  assert.deepEqual(res.path, ['s1', 's2', 's3', 's4']);
  // The former explicit-parent example has the same topology and numerical results.
  close(res.totals.critical, 148.17414248970397, 1e-12);
  close(res.totals.required, 162.99155673867438, 1e-12);
  // cumulative = sum of section losses along the path
  const sum = res.path.reduce((a, id) => a + res.sections.get(id).dp, 0);
  close(res.totals.critical, sum, 1e-12);
  close(res.totals.friction + res.totals.fittings + res.totals.components, sum, 1e-12);
  // throttling: critical end 0, others positive and consistent
  for (const id of res.terminals) {
    const r = res.sections.get(id);
    close(r.throttle + r.cum, res.totals.critical, 1e-9);
    assert.ok(r.throttle >= 0);
  }
  assert.equal(res.sections.get('s4').throttle, 0);
  close(res.totals.required, res.totals.critical * 1.1, 1e-12);
  assert.equal(res.issues.filter((i) => i.severity !== 'info').length, 0);
});

test('flow continuity warning when branches carry more than the feeder', () => {
  const inputs = calculationInputs(exampleInputs());
  inputs.sections.find((s) => s.id === 's6').flow = 3000; // s1 = 6000, children 4000 + 3000
  const res = compute(inputs);
  assert.ok(res.issues.some((i) => i.code === 'flow-continuity' && i.sectionId === 's1'));
});

test('velocity warning above the limit', () => {
  const inputs = calculationInputs(exampleInputs());
  inputs.sections[0].width = 400; // 6000 m³/h in 400 × 400
  const res = compute(inputs);
  assert.ok(res.issues.some((i) => i.code === 'velocity-high' && i.sectionId === 's1'));
});

test('section numbers sort by numeric segments without mutating the source', () => {
  const sections = ['10', '1.10', '2', '1.2', '1'].map((nr) => ({ id: `s-${nr}`, nr }));
  const order = sections.map((section) => section.nr);
  assert.deepEqual(sortedSections(sections).map((section) => section.nr), ['1', '1.2', '1.10', '2', '10']);
  assert.deepEqual(sections.map((section) => section.nr), order);
  assert.deepEqual(resolveTree(sections).order, ['s-1', 's-1.2', 's-1.10', 's-2', 's-10']);
});

test('dotted sections are siblings beneath their exact prefix, including nested branches', () => {
  const sections = ['2', '1.2.1', '1.2', '1', '1.1'].map((nr) => ({ id: nr, nr }));
  const tree = resolveTree(sections);
  assert.deepEqual([...tree.parent], [['1', null], ['1.1', '1'], ['1.2', '1'], ['1.2.1', '1.2'], ['2', '1']]);
  assert.deepEqual(tree.children.get('1'), ['1.1', '1.2', '2']);
  assert.deepEqual(tree.children.get('1.2'), ['1.2.1']);
  assert.deepEqual(tree.order, ['1', '1.1', '1.2', '1.2.1', '2']);
  assert.deepEqual(tree.issues, []);
  assert.equal(tree.invalid.size, 0);
});

test('main numbers connect across gaps and deleting a main section keeps the main continuation', () => {
  const sections = ['10', '3.1', '3', '1'].map((nr) => ({ id: nr, nr }));
  const before = resolveTree(sections);
  assert.equal(before.parent.get('1'), null);
  assert.equal(before.parent.get('3'), '1');
  assert.equal(before.parent.get('10'), '3');
  assert.equal(before.parent.get('3.1'), '3');
  const after = resolveTree(sections.filter((section) => section.id !== '3'));
  assert.equal(after.parent.get('10'), '1');
  assert.ok(after.issues.some((issue) => issue.sectionId === '3.1' && issue.code === 'number-parent-missing' && issue.parentNumber === '3'));
  assert.equal(after.invalid.has('3.1'), true);
  assert.equal(after.invalid.has('10'), false);
});

test('stale explicit parents cannot change numbered topology or survive normalisation', () => {
  const sections = [{ id: 'a', nr: '1', parent: 'b' }, { id: 'b', nr: '2', parent: 'a' }, { id: 'c', nr: '1.1', parent: 'missing' }];
  const tree = resolveTree(sections);
  assert.equal(tree.parent.get('a'), null);
  assert.equal(tree.parent.get('b'), 'a');
  assert.equal(tree.parent.get('c'), 'a');
  assert.deepEqual(tree.issues, []);
  const inputs = normalizeInputs({ calculations: [{ sections }] });
  assert.ok(calculationInputs(inputs).sections.every((section) => !Object.hasOwn(section, 'parent')));
  assert.deepEqual(normalizeInputs(JSON.parse(JSON.stringify(inputs))), inputs);
});

test('every duplicate number and its ambiguous direct children are reported', () => {
  const sections = [{ id: 'a', nr: '1' }, { id: 'b', nr: '1' }, { id: 'c', nr: '1.1' }, { id: 'd', nr: '1.1.1' }, { id: 'e', nr: '2' }];
  const tree = resolveTree(sections);
  assert.deepEqual(tree.issues.filter((issue) => issue.code === 'number-duplicate').map((issue) => issue.sectionId), ['a', 'b']);
  assert.ok(tree.issues.some((issue) => issue.sectionId === 'c' && issue.code === 'number-parent-ambiguous' && issue.parentNumber === '1'));
  assert.ok(tree.issues.some((issue) => issue.sectionId === 'e' && issue.code === 'number-parent-ambiguous' && issue.parentNumber === '1'));
  assert.equal(tree.invalid.has('d'), true, 'a nested child cannot become a valid network through its invalid prefix');
  assert.equal(tree.order.length, sections.length);
  assert.equal(new Set(tree.order).size, sections.length);
});

test('blank, malformed and missing-prefix numbers remain visible and cannot form valid branches', () => {
  const malformed = ['', ' ', '0', '01', '1.0', '1.01', '1.', '.1', '1..2', '-1', '1e2', '1.2x', '9007199254740992'];
  const sections = malformed.map((nr, index) => ({ id: `bad${index}`, nr }));
  sections.push({ id: 'orphan', nr: '3.2' }, { id: 'child', nr: '3.2.1' }, { id: 'main', nr: '1' });
  const tree = resolveTree(sections);
  assert.equal(tree.order.length, sections.length);
  for (const section of sections.filter((section) => section.id !== 'main')) assert.equal(tree.invalid.has(section.id), true, section.nr);
  assert.ok(tree.issues.some((issue) => issue.sectionId === 'bad0' && issue.code === 'number-missing'));
  assert.ok(tree.issues.some((issue) => issue.sectionId === 'bad2' && issue.code === 'number-invalid'));
  assert.ok(tree.issues.some((issue) => issue.sectionId === 'orphan' && issue.code === 'number-parent-missing' && issue.parentNumber === '3'));
  assert.deepEqual(numberParts(' 1.10.2 '), [1, 10, 2]);
  for (const nr of malformed) assert.equal(numberParts(nr), null, nr);
});

test('normalised input and calculated results ignore incoming array order', () => {
  const inputs = exampleInputs();
  const expected = snapshotProjectOf(computeProject(inputs));
  inputs.calculations[0].sections.reverse();
  assert.deepEqual(snapshotProjectOf(computeProject(inputs)), expected);
  const normalised = normalizeInputs(inputs);
  assert.deepEqual(normalised.calculations[0].sections.map((section) => section.nr), ['1', '1.1', '2', '2.1', '3', '4']);
  assert.deepEqual(normalizeInputs(JSON.parse(JSON.stringify(normalised))), normalised);
});

test('numbering errors remain visible without contributing a disconnected critical path', () => {
  const inputs = calculationInputs(exampleInputs());
  const before = compute(inputs);
  const orphan = { ...structuredClone(inputs.sections[0]), id: 'orphan', nr: '9.1', components: [{ name: 'Unverbunden', dp: 999 }] };
  const descendant = { ...structuredClone(orphan), id: 'orphan-child', nr: '9.1.1', components: [{ name: 'Unverbunden', dp: 2000 }] };
  inputs.sections.push(orphan, descendant);
  const after = compute(inputs);
  assert.equal(after.sections.get(orphan.id).status, 'incomplete');
  assert.equal(after.sections.get(descendant.id).status, 'incomplete');
  assert.ok(after.issues.some((issue) => issue.sectionId === orphan.id && issue.code === 'number-parent-missing'));
  assert.deepEqual(after.path, before.path);
  assert.deepEqual(after.totals, before.totals);
  assert.equal(after.terminals.includes(descendant.id), false);
});

test('empty document computes without errors', () => {
  const res = compute(calculationInputs(emptyInputs()));
  assert.equal(res.totals.critical, 0);
  assert.equal(res.sections.size, 1);
});

test('normalizeInputs is idempotent', () => {
  const once = normalizeInputs(exampleInputs());
  const twice = normalizeInputs(JSON.parse(JSON.stringify(once)));
  assert.deepEqual(twice, once);
});

test('calculation copies have independent systems and networks with shared catalogues', () => {
  const inputs = exampleInputs();
  const original = inputs.calculations[0];
  const copy = duplicateCalculation(inputs.calculations, original.id);
  inputs.calculations.push(copy);
  const first = calculationInputs(inputs, original.id);
  const second = calculationInputs(inputs, copy.id);
  assert.notEqual(original.id, copy.id);
  assert.deepEqual(second.sections, first.sections);
  second.sections[0].components[0].dp = 999;
  second.sections[0].flow = 12000;
  second.system.temperature = 5;
  assert.equal(first.sections[0].components[0].dp, 30);
  assert.equal(first.sections[0].flow, 6000);
  assert.equal(first.system.temperature, 21);
  assert.equal(first.catalogs, second.catalogs);
  assert.equal(first.settings, second.settings);
});

test('project results and snapshots cover every independent network', () => {
  const inputs = exampleInputs();
  const copy = duplicateCalculation(inputs.calculations, inputs.calculations[0].id);
  copy.sections[0].width = 200;
  inputs.calculations.push(copy);
  const results = computeProject(inputs);
  assert.equal(results.calculations.size, 2);
  assert.notEqual(results.calculations.get(copy.id).totals.required, results.calculations.get(inputs.calculations[0].id).totals.required);
  assert.ok(results.issues.some((issue) => issue.calcId === copy.id && issue.code === 'velocity-high'));
  assert.equal(results.issues.some((issue) => issue.calcId === inputs.calculations[0].id && issue.code === 'velocity-high'), false);
  const snapshot = snapshotProjectOf(results);
  assert.deepEqual(snapshot.calculations.map((calculation) => calculation.id), inputs.calculations.map((calculation) => calculation.id));
  assert.equal(snapshot.calculations.length, 2);
  const before = [...results.calculations].map(([id, result]) => [id, result.totals.required]);
  inputs.catalogs.materials.find((material) => material.id === 'galvanized').roughness = 2;
  const after = computeProject(inputs);
  for (const [id, required] of before) assert.notEqual(after.calculations.get(id).totals.required, required);
});

test('calculation names and ids survive normalisation and undoable removal', () => {
  const inputs = emptyInputs();
  inputs.calculations.push(newCalculation(inputs.calculations));
  assert.equal(calculationLabel(inputs, inputs.calculations[0].id), 'Berechnung 1');
  assert.equal(calculationLabel(inputs, inputs.calculations[1].id), 'Berechnung 2');
  inputs.calculations[1].system.name = 'Abluft';
  assert.equal(calculationLabel(inputs, inputs.calculations[1].id), 'Abluft');
  const before = structuredClone(inputs);
  const store = new DocumentStore({ inputs });
  store.doc.inputs.calculations.splice(0, 1);
  store.commit();
  assert.equal(store.doc.inputs.calculations.length, 1);
  assert.ok(store.undo());
  assert.deepEqual(store.doc.inputs, before);
  assert.equal(store.doc.inputs.calculations.length, 2);
});

test('foreign project data and duplicate ids normalise without throwing', () => {
  for (const raw of [null, [], 'foreign', { calculations: [null, { id: 'x', sections: [null, { id: 's1' }, { id: 's1', fittings: [null], components: [null] }] }, { id: 'x' }], catalogs: { materials: 'foreign' } }]) {
    const inputs = normalizeInputs(raw);
    assert.deepEqual(normalizeInputs(inputs), inputs);
    assert.ok(inputs.calculations.length > 0);
    assert.equal(new Set(inputs.calculations.map((calculation) => calculation.id)).size, inputs.calculations.length);
    for (const calculation of inputs.calculations) {
      assert.equal(new Set(calculation.sections.map((section) => section.id)).size, calculation.sections.length);
    }
    assert.doesNotThrow(() => computeProject(inputs));
  }
});

test('branch level follows the section number', () => {
  assert.equal(branchLevel('4'), 0);
  assert.equal(branchLevel(' 2.1 '), 1);
  assert.equal(branchLevel('2.1.3'), 2);
  assert.equal(branchLevel(''), 0);
  assert.equal(branchLevel(null), 0);
});

test('round suggestions use the Lindab diameters', () => {
  const s = suggestDimensions({ flow: 2000, vmax: 4, diameters: ROUND_DIAMETERS });
  assert.ok(ROUND_DIAMETERS.includes(s.round.diameter));
  assert.equal(s.round.diameter, 450); // needs 420.5 mm
});

test('dimension suggestions keep the velocity limit', () => {
  const s = suggestDimensions({ flow: 6000, vmax: 6, height: 400, diameters: ROUND_DIAMETERS });
  const v = (areaMm2) => 6000 / 3600 / (areaMm2 / 1e6);
  assert.ok(v((Math.PI * s.round.diameter ** 2) / 4) <= 6);
  assert.ok(v(s.rect.width * s.rect.height) <= 6);
  assert.ok(s.rect.width / s.rect.height <= 2);
  assert.equal(s.rectKeepHeight.height, 400);
  assert.ok(v(s.rectKeepHeight.width * 400) <= 6);
});
