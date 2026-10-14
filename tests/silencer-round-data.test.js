// SPDX-License-Identifier: AGPL-3.0-or-later
// These hashes cover every numeric table cell extracted from the owner's local PDFs.
// The source pages and dimension definitions are recorded in the circular data audit.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { ROUND_ROWS } from '../tools/silencer/data/round.js';

const audited = {
  'trox-ca': [52, 'f3d27b99f0b226c6b63ba8a2a0192c6c38488ddb7ace2830ed9f4f598af26d16'],
  'trox-ck': [81, '086d9a889aff2c01cbcc0def08fba66076b00e32740b2eba810c551c01b2fbc4'],
  'schako-rs-n': [196, 'aa6792feaa98355b7cbef286c88646dea787ba34e21c083f7fa2c7d6976329ae'],
  'schako-rs-m': [71, '0af9d28b52f5ee4e4c3f1d45e8b5e67770021a3cce6d872f3589bd22763d92d6'],
  'lindab-slu': [62, 'f59186b05becf353973aca72c5a3fe2f43cc9b719041f876f3d6338bfdd52458'],
};

for (const [series, [count, expected]] of Object.entries(audited)) {
  test(`${series}: all source table cells match the 2026-10-14 audit`, () => {
    const rows = ROUND_ROWS.filter((row) => row.series === series).sort((a, b) =>
      a.dn - b.dn || a.L - b.L || a.insulation - b.insulation || (a.core || 0) - (b.core || 0));
    assert.equal(rows.length, count);
    const cells = rows.map((row) => [
      row.dn, row.dIn, row.L, row.insulation, row.core, row.dOuter,
      row.dOuterMax, row.bodyLength, row.overallLength, row.de, row.dp, row.dpFromDn,
    ]);
    assert.equal(createHash('sha256').update(JSON.stringify(cells)).digest('hex'), expected);
  });
}

test('round dimensions distinguish order length, body length and overall length', () => {
  const row = (series, dn, L, insulation) => ROUND_ROWS.find((r) =>
    r.series === series && r.dn === dn && r.L === L && r.insulation === insulation);
  const ca = row('trox-ca', 200, 1000, 50);
  assert.deepEqual([ca.bodyLength, ca.overallLength, ca.dOuterMax], [880, 1000, 304]);
  const rs = row('schako-rs-n', 200, 950, 100);
  assert.deepEqual([rs.bodyLength, rs.overallLength, rs.dOuterMax], [950, 1050, 400]);
  const slu = row('lindab-slu', 200, 900, 50);
  assert.deepEqual([slu.bodyLength, slu.overallLength, slu.dOuter, slu.dOuterMax], [990, 1068, 300, 306]);
});

test('round source ambiguities retain their printed values with a notice', () => {
  for (const row of ROUND_ROWS.filter((r) => r.series === 'schako-rs-m' && r.dn === 1000)) {
    assert.equal(row.dIn, 989);
    assert.match(row.note, /989.*998.*ungeklärt/);
  }
  for (const row of ROUND_ROWS.filter((r) => r.series === 'lindab-slu' && r.L === 900 && r.dn >= 500)) {
    assert.equal(row.bodyLength, 600);
    assert.equal(row.overallLength, 600);
    assert.match(row.note, /Druckfehler/);
  }
});
