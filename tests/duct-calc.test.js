import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  compute,
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
import { normalizeInputs, exampleInputs, emptyInputs, ROUND_DIAMETERS } from '../tools/duct-pressure-loss/defaults.js';

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
  const inputs = normalizeInputs({
    system: { altitude: 540, temperature: 21, humidity: 0 },
    sections: [{ id: 's1', shape: 'rect', width: 800, height: 400, material: 'galvanized', flow: 6000, length: 10, zetaExtra: 0.6 }],
  });
  const r = compute(inputs).sections.get('s1');
  close(r.dh, 0.5333333, 1e-6, 'dh');
  close(r.velocity, 5.2083333, 1e-6, 'v');
  close(r.lambda, 0.018056733, 1e-2, 'lambda');
  close(r.gradient, 0.51753064, 1e-2, 'R');
  close(r.dpFittings, 9.1716372, 3e-3, 'Z');
  close(r.dp, 14.346944, 1e-2, 'dp');
});

test('input version 1: the friction method is dropped', () => {
  const v1 = { system: { frictionMethod: 'zanke', altitude: 540 }, sections: [] };
  const inputs = normalizeInputs(v1);
  assert.equal('frictionMethod' in inputs.system, false);
  assert.equal(inputs.system.altitude, 540);
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
  const inputs = exampleInputs();
  const res = compute(inputs);
  assert.deepEqual(res.path, ['s1', 's2', 's3', 's4']);
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
  const inputs = exampleInputs();
  inputs.sections.find((s) => s.id === 's6').flow = 3000; // s1 = 6000, children 4000 + 3000
  const res = compute(inputs);
  assert.ok(res.issues.some((i) => i.code === 'flow-continuity' && i.sectionId === 's1'));
});

test('velocity warning above the limit', () => {
  const inputs = exampleInputs();
  inputs.sections[0].width = 400; // 6000 m³/h in 400 × 400
  const res = compute(inputs);
  assert.ok(res.issues.some((i) => i.code === 'velocity-high' && i.sectionId === 's1'));
});

test('cycles and unknown parents are cut instead of crashing', () => {
  const sections = [
    { id: 'a', parent: 'b' },
    { id: 'b', parent: 'a' },
    { id: 'c', parent: 'zzz' },
  ];
  const tree = resolveTree(sections);
  assert.equal(tree.order.length, 3);
  assert.ok(tree.issues.some((i) => i.code === 'cycle'));
  assert.ok(tree.issues.some((i) => i.code === 'parent-missing'));
});

test('empty document computes without errors', () => {
  const res = compute(emptyInputs());
  assert.equal(res.totals.critical, 0);
  assert.equal(res.sections.size, 1);
});

test('normalizeInputs is idempotent', () => {
  const once = normalizeInputs(exampleInputs());
  const twice = normalizeInputs(JSON.parse(JSON.stringify(once)));
  assert.deepEqual(twice, once);
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
