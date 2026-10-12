// SPDX-License-Identifier: AGPL-3.0-or-later
// Integrity of the silencer data package (tools/silencer/data/). Guards the transcribed
// manufacturer tables against accidental edits. Spot values are checked against the sources.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  OCTAVES,
  SPLITTER_SERIES,
  SPLITTER_ROWS,
  ROUND_SERIES,
  ROUND_ROWS,
  TROX_FLOW_NOISE,
  TROX_FLOW_NOISE_FIT,
  FLOW_NOISE_SPECTRUM,
  SCHAKO_KF,
  A_WEIGHTING,
  ZETA_SPLITTER,
  INSTALL_FACTORS,
  LIMITS,
  SOURCES,
} from '../tools/silencer/data/index.js';

const sourceIds = new Set(SOURCES.map((s) => s.id));
const increasing = (xs) => xs.every((x, i) => i === 0 || x > xs[i - 1]);

test('row counts', () => {
  assert.equal(SPLITTER_ROWS.length, 305);
  assert.equal(ROUND_ROWS.length, 462);
  assert.deepEqual(OCTAVES, [63, 125, 250, 500, 1000, 2000, 4000, 8000]);
});

test('every insertion loss has 8 octave values between 0 and 50 dB', () => {
  for (const r of [...SPLITTER_ROWS, ...ROUND_ROWS]) {
    assert.equal(r.de.length, 8, JSON.stringify(r));
    for (const v of r.de) assert.ok(Number.isInteger(v) && v >= 0 && v <= 50, JSON.stringify(r));
  }
});

test('splitter rows: known series, unique geometry, gap-velocity Δp tables', () => {
  const series = new Set(SPLITTER_SERIES.map((s) => s.id));
  const keys = new Set();
  for (const r of SPLITTER_ROWS) {
    assert.ok(series.has(r.series), r.series);
    const key = `${r.series}|${r.d}|${r.s}|${r.L}`;
    assert.ok(!keys.has(key), `duplicate ${key}`);
    keys.add(key);
    assert.equal(r.dp.v.length, r.dp.pa.length, key);
    assert.ok(increasing(r.dp.v), key);
  }
});

test('round rows: known series, unique key, Δp shape matches dpModel', () => {
  const series = Object.fromEntries(ROUND_SERIES.map((s) => [s.id, s]));
  const keys = new Set();
  for (const r of ROUND_ROWS) {
    const s = series[r.series];
    assert.ok(s, r.series);
    const key = `${r.series}|${r.dn}|${r.L}|${r.insulation}|${r.core}`;
    assert.ok(!keys.has(key), `duplicate ${key}`);
    keys.add(key);
    assert.ok(s.insulations.includes(r.insulation), key);
    if (s.dpModel === 'duct') assert.equal(r.dp, null, key);
    if (s.dpModel === 'flow-points') {
      assert.equal(r.dp.q.length, r.dp.pa.length, key);
      assert.ok(increasing(r.dp.q), key);
    }
    if (s.dpModel === 'velocity-table') {
      assert.equal(r.dp.v.length, r.dp.pa.length, key);
      assert.ok(increasing(r.dp.v), key);
    }
    if (s.core) assert.ok(r.core > 0, key);
    else assert.equal(r.core, null, key);
  }
});

test('all referenced sources exist', () => {
  const refs = [
    ...SPLITTER_SERIES.flatMap((s) => s.sources),
    ...ROUND_SERIES.flatMap((s) => s.sources),
    TROX_FLOW_NOISE.source,
    TROX_FLOW_NOISE_FIT.source,
    FLOW_NOISE_SPECTRUM.source,
    SCHAKO_KF.source,
    INSTALL_FACTORS.source,
    ...Object.values(ZETA_SPLITTER).map((z) => z.source),
    ...Object.values(LIMITS).map((l) => l.source),
  ];
  for (const id of refs) assert.ok(sourceIds.has(id), id);
});

test('spot values match the sources', () => {
  const split = (series, d, s, L) => SPLITTER_ROWS.find((r) => r.series === series && r.d === d && r.s === s && r.L === L);
  const round = (series, dn, L, insulation) => ROUND_ROWS.filter((r) => r.series === series && r.dn === dn && r.L === L && r.insulation === insulation);

  const xk = split('trox-xk', 200, 100, 1000);
  assert.deepEqual(xk.de, [4, 9, 16, 32, 41, 35, 23, 16]);
  assert.deepEqual(xk.dp, { v: [6, 10, 14], pa: [13, 35, 69] });

  const ob = split('schako-mwk-ob', 200, 100, 1000);
  assert.deepEqual(ob.de, [2, 7, 15, 29, 40, 41, 26, 15]);
  assert.equal(ob.dp.pa[0], 12);

  const ck = round('trox-ck', 250, 1500, 100).find((r) => r.core === 100);
  assert.deepEqual(ck.de, [6, 16, 29, 50, 50, 50, 50, 48]);
  assert.deepEqual(ck.dp, { q: [700, 1200], pa: [44, 127] });

  assert.deepEqual(round('trox-ca', 100, 1000, 100)[0].de, [6, 16, 24, 35, 50, 50, 41, 24]);
  assert.deepEqual(round('lindab-slu', 200, 900, 50)[0].de, [2, 4, 11, 21, 37, 28, 16, 10]);

  const rsn = round('schako-rs-n', 200, 950, 100)[0];
  assert.deepEqual(rsn.de, [4, 10, 15, 24, 35, 41, 22, 13]);
  assert.deepEqual(rsn.dp.pa, [1, 2, 2, 3, 4, 5, 6, 7, 8, 10, 12]);

  const rsm = round('schako-rs-m', 400, 1450, 150)[0];
  assert.equal(rsm.core, 60);
  assert.deepEqual(rsm.de, [6, 17, 29, 50, 50, 50, 20, 12]);
  assert.deepEqual(rsm.dp.pa, [16, 27, 38, 52, 65, 87, 109, 133, 157, 192, 227]);
});

test('flow noise: fit within 0.5 dB of the Trox table, spectrum sums back to L_WA', () => {
  TROX_FLOW_NOISE.v.forEach((v, i) => {
    const fit = TROX_FLOW_NOISE_FIT.a + TROX_FLOW_NOISE_FIT.b * Math.log10(v);
    assert.ok(Math.abs(fit - TROX_FLOW_NOISE.lwa[i]) <= 0.5, `v = ${v}`);
  });
  const sum = 10 * Math.log10(FLOW_NOISE_SPECTRUM.dl.reduce((acc, dl, i) => acc + 10 ** ((dl + A_WEIGHTING[i]) / 10), 0));
  assert.ok(Math.abs(sum) <= 0.2, `A-weighted sum of the relative spectrum = ${sum.toFixed(2)} dB`);
});
