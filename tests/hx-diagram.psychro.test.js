// SPDX-License-Identifier: AGPL-3.0-or-later
// Moist air state functions of the h,x diagram: reference values and round trips of every property pair.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as P from '../tools/hx-diagram/psychro.js';

const p0 = 101325;
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (±${tol})`);

test('saturation pressure matches ASHRAE table values', () => {
  near(P.ps(20), 2339.3, 0.5, 'ps(20)');
  near(P.ps(0.01), 611.66, 0.2, 'ps(0.01)');
  near(P.ps(-10), 259.9, 0.3, 'ps(-10) over ice');
  near(P.ps(50), 12352, 5, 'ps(50)');
});

test('standard atmosphere and the sheet at 500 m', () => {
  near(P.pressureAt(0), 101325, 0.01, 'sea level');
  near(P.pressureAt(500) / 100, 954.6, 0.1, '500 m in mbar');
});

test('20 °C / 50 % at sea level', () => {
  const x = P.xPhi(20, 0.5, p0);
  near(x, 7.29, 0.02, 'x');
  const s = P.stateTX(20, x, p0);
  near(s.h, 38.6, 0.1, 'h');
  near(s.td, 9.3, 0.1, 'dew point');
  near(s.tw, 13.8, 0.15, 'wet bulb');
  near(s.rho, 1.199, 0.002, 'density');
});

test('every pair of properties returns the same state', () => {
  const p = P.pressureAt(500);
  for (const [t, phi] of [[22, 0.45], [-8, 0.8], [32, 0.4], [5, 0.95]]) {
    const ref = P.stateTX(t, P.xPhi(t, phi, p), p);
    for (let i = 0; i < P.KEYS.length; i++) {
      for (let j = i + 1; j < P.KEYS.length; j++) {
        const a = P.KEYS[i];
        const b = P.KEYS[j];
        const r = P.stateFrom({ [a]: ref[a], [b]: ref[b] }, p);
        if ((a === 'x' && b === 'td') || (a === 'h' && b === 'tw')) {
          assert.equal(r.error, 'pair-invalid', `${a}+${b}`);
          continue;
        }
        assert.ok(r.state, `${a}+${b} at ${t} °C: ${r.error}`);
        near(r.state.t, t, 0.01, `${a}+${b} t`);
        near(r.state.x, ref.x, 0.005, `${a}+${b} x`);
      }
    }
  }
});

test('fog region: liquid water above saturation, enthalpy continues', () => {
  const p = p0;
  const xs = P.xSat(10, p);
  const s = P.stateTX(10, xs + 2, p);
  near(s.fog, 2, 1e-9, 'fog');
  assert.equal(s.phi, 1);
  near(s.h, P.hUnsat(10, xs) + 0.002 * 4.19 * 10, 1e-9, 'h with liquid water');
  near(P.tFromHX(s.h, s.x, p), 10, 1e-6, 't from h, x in fog');
});

test('missing or impossible input', () => {
  assert.equal(P.stateFrom({ t: 20 }, p0).error, 'missing');
  assert.equal(P.stateFrom({ t: 20, phi: 1.5 }, p0).error, 'no-solution');
  assert.equal(P.stateFrom({ x: 5, td: 3 }, p0).error, 'pair-invalid');
});
