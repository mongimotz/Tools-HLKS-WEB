// SPDX-License-Identifier: AGPL-3.0-or-later
// Numerical fingerprints come from an independent extraction of the owner's PDFs,
// checked against complete page renders. See docs/dev/silencer/RECTANGULAR-AUDIT.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { SPLITTER_ROWS, SPLITTER_SERIES } from '../tools/silencer/data/splitter.js';
import { SCHAKO_FLOW_NOISE, SCHAKO_KF } from '../tools/silencer/data/flow-noise.js';

const row = (series, d, s, L) => SPLITTER_ROWS.find((entry) => entry.series === series && entry.d === d && entry.s === s && entry.L === L);

test('all published rectangular De, pressure values and bound signs match the supplied PDFs', () => {
  const expected = {
    'trox-xk': [71, '91d93fda7e284f41b711dae0290ecb1098423924df0a806463709863834925b4'],
    'trox-mk': [54, 'c1b25f61efe76962a29589050b64f4ee749a62c42d649ec9a586468b22f608cc'],
    'schako-mwk-ob': [90, 'ea598fb2ecc891b4ebf19d0cd0c466e55ea74fb3c28bd9ebf148403a222b6432'],
    'schako-mwk-mb': [90, 'e62ecef7dc1525cefc345df04200a1e39f472de40088475f87277af4cc257fd7'],
  };
  for (const [series, [count, digest]] of Object.entries(expected)) {
    const rows = SPLITTER_ROWS.filter((entry) => entry.series === series).sort((a, b) => a.d - b.d || a.L - b.L || a.s - b.s);
    const values = rows.map((entry) => [entry.d, entry.s, entry.L, entry.de, entry.dp.v, entry.dp.pa, entry.flags?.de ?? {}, entry.flags?.dp ?? {}]);
    assert.equal(rows.length, count, series);
    assert.equal(createHash('sha256').update(JSON.stringify(values)).digest('hex'), digest, series);
  }
});

test('Schako MB and LB preserve their distinct printed 7 m/s pressure at 100/100/2000', () => {
  for (const series of ['schako-mwk-ob', 'schako-mwk-ll']) {
    assert.equal(row(series, 100, 100, 2000).dp.pa[1], 10);
    assert.equal(row(series, 100, 100, 2000).flags.dp[7], '<');
  }
  for (const series of ['schako-mwk-mb', 'schako-mwk-lb']) {
    assert.equal(row(series, 100, 100, 2000).dp.pa[1], 13);
    assert.equal(row(series, 100, 100, 2000).flags.dp[7], undefined);
  }
});

test('Schako covered finishes use their published shared tables with independent row arrays', () => {
  for (const [covered, reference] of [['schako-mwk-ll', 'schako-mwk-ob'], ['schako-mwk-lb', 'schako-mwk-mb']]) {
    const rows = SPLITTER_ROWS.filter((entry) => entry.series === covered);
    assert.equal(rows.length, 90);
    for (const entry of rows) {
      const base = row(reference, entry.d, entry.s, entry.L);
      assert.deepEqual({ ...entry, series: reference }, base);
      assert.notEqual(entry.de, base.de);
      assert.notEqual(entry.dp.pa, base.dp.pa);
    }
  }
});

test('RIO and Schmidlin estimates cover only requested thicknesses and only exposed absorbers', () => {
  for (const [series, thicknesses] of [['prod-rio', [100, 160, 200]], ['prod-schmidlin', [100, 150, 200, 250, 300]]]) {
    assert.deepEqual(SPLITTER_SERIES.find((entry) => entry.id === series).thicknesses, thicknesses);
    const rows = SPLITTER_ROWS.filter((entry) => entry.series === series);
    assert.deepEqual([...new Set(rows.map((entry) => entry.d))], thicknesses);
    for (const entry of rows) {
      assert.equal(entry.estimated, true);
      assert.ok(entry.note.includes('Schätzung'));
      assert.ok(entry.estimateSources.length > 0);
      assert.ok(entry.estimateSources.every((reference) => ['trox-xk', 'schako-mwk-ob'].includes(reference)));
      assert.ok(entry.de.every((value) => Number.isInteger(value) && value >= 0 && value <= 50));
      assert.ok(entry.dp.pa.every((value) => Number.isFinite(value) && value > 0));
    }
  }
});

test('estimated octave losses use the conservative open-reference envelope and bounded thickness interpolation', () => {
  assert.deepEqual(row('prod-rio', 100, 100, 1000).de, [1, 3, 8, 18, 36, 33, 22, 13]);
  assert.deepEqual(row('prod-schmidlin', 150, 100, 1000).de, [1, 5, 12, 23, 38, 34, 23, 14]);
  assert.deepEqual(row('prod-rio', 160, 100, 1000).de, [1, 5, 12, 24, 38, 34, 23, 14]);
  assert.deepEqual(row('prod-schmidlin', 250, 100, 1000).de, [4, 9, 18, 29, 38, 30, 20, 16]);
  assert.deepEqual(row('prod-schmidlin', 250, 100, 1000).estimateSources, ['trox-xk']);
  assert.equal(row('prod-rio', 160, 100, 1000).dp.pa[4], 31.4);
  for (const rio of SPLITTER_ROWS.filter((entry) => entry.series === 'prod-rio' && [100, 200].includes(entry.d))) {
    const schmidlin = row('prod-schmidlin', rio.d, rio.s, rio.L);
    assert.deepEqual({ ...rio, series: schmidlin.series }, schmidlin);
  }
});

test('Schako plotted flow spectra retain every printed total and the unusual area corrections', () => {
  assert.deepEqual(SCHAKO_FLOW_NOISE.v, [10, 20]);
  assert.equal(SCHAKO_FLOW_NOISE.refArea, 1);
  assert.equal(SCHAKO_FLOW_NOISE.digitized, true);
  assert.deepEqual(SCHAKO_FLOW_NOISE.rows.map(({ d, s, lwa }) => [d, s, lwa]), [
    [100, 50, [43, 60]], [100, 100, [45, 60]], [200, 50, [46, 61]], [200, 100, [40, 58]], [200, 200, [41, 59]],
  ]);
  assert.deepEqual(SCHAKO_FLOW_NOISE.rows[2].lw, [[41, 42, 43, 44, 41, 36, 32, 28], [53, 54, 55, 55, 56, 52, 50, 48]]);
  assert.equal(SCHAKO_KF.kf[SCHAKO_KF.area.indexOf(0.4)], -5);
  assert.equal(SCHAKO_KF.kf[SCHAKO_KF.area.indexOf(4.1)], 6);
});
