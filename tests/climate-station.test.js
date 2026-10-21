// SPDX-License-Identifier: AGPL-3.0-or-later
// Klimastation: station data (SIA 2028 table 1), traced regions, coordinates, ranking, search, state.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  wgs84ToLv95, lv95ToWgs84, parseCoordinates, regionAt, inRegion, rankStations, searchPlaces, fold, copyRow, COPY_COLUMNS, DEFAULT_WEIGHTS,
} from '../tools/climate-station/calc.js';
import { normalizeInputs, defaultInputs, toUrlParams, fromUrlParams } from '../tools/climate-station/defaults.js';

const load = async (name) => JSON.parse(await readFile(new URL(`../tools/climate-station/data/${name}`, import.meta.url), 'utf8'));
const { stations, regions: regionNames } = await load('stations.json');
const { regions, outline, borders, lakes, rivers } = await load('regions.json');
const { places } = await load('places.json');
const byId = new Map(stations.map((s) => [s.id, s]));

// Table 1b of SIA 2028: stations per climate region.
const TABLE_1B = {
  1: ['BAS', 'RUE'], 2: ['CDF', 'FRE'], 3: ['GUT', 'STG', 'SHA', 'KLO', 'SMA'], 4: ['BER', 'BUS', 'WYN'], 5: ['GVE', 'NEU', 'PAY', 'PUY'],
  6: ['GLA', 'VAD'], 7: ['ALT', 'ENG', 'LUZ'], 8: ['ABO', 'AIG', 'INT'], 9: ['CHU', 'DAV', 'DIS'], 10: ['MVE', 'SIO', 'ULR', 'ZER'],
  11: ['SAM', 'SCU'], 12: ['GSB', 'OTL', 'LUG', 'MAG', 'PIO', 'ROB', 'SBE'],
};

test('stations: 40 stations, regions as in table 1b, LV95 from the listed degrees and minutes', () => {
  assert.equal(stations.length, 40);
  assert.equal(regionNames.length, 12);
  for (const [region, ids] of Object.entries(TABLE_1B)) for (const id of ids) assert.equal(byId.get(id)?.region, Number(region), id);
  assert.deepEqual(byId.get('RUE').lat, [47, 26], 'Rünenberg: 47° 26′ (46° 26′ in table 1a is a misprint)');
  for (const s of stations) {
    const { e, n } = wgs84ToLv95(s.lat[0] + s.lat[1] / 60, s.lon[0] + s.lon[1] / 60);
    assert.ok(Math.abs(e - s.e) <= 1 && Math.abs(n - s.n) <= 1, `${s.id}: LV95`);
    assert.ok(s.height > 150 && s.height < 2500, `${s.id}: height`);
  }
});

test('coordinates: LV95 ↔ WGS84 round trip within a few metres, swisstopo reference point', () => {
  const bern = wgs84ToLv95(46 + 57 / 60 + 3.9 / 3600, 7 + 26 / 60 + 19.1 / 3600); // old observatory Bern
  assert.ok(Math.abs(bern.e - 2600000) < 5 && Math.abs(bern.n - 1200000) < 5, JSON.stringify(bern));
  for (const [e, n] of [[2635345, 1244330], [2500000, 1118000], [2830000, 1170000]]) {
    const { lat, lon } = lv95ToWgs84(e, n);
    const back = wgs84ToLv95(lat, lon);
    assert.ok(Math.hypot(back.e - e, back.n - n) < 5, `${e}/${n}`);
  }
});

test('coordinates typed into the search', () => {
  assert.deepEqual(parseCoordinates("2'635'345 / 1'244'330"), { e: 2635345, n: 1244330, system: 'LV95' });
  assert.deepEqual(parseCoordinates('1244330 2635345'), { e: 2635345, n: 1244330, system: 'LV95' });
  assert.deepEqual(parseCoordinates('2635345,1244330'), { e: 2635345, n: 1244330, system: 'LV95' });
  assert.deepEqual(parseCoordinates('635345 244330'), { e: 2635345, n: 1244330, system: 'LV03' });
  const wgs = parseCoordinates('47.35, 7.90');
  assert.equal(wgs.system, 'WGS84');
  assert.deepEqual(parseCoordinates('7.90 47.35'), wgs);
  assert.equal(parseCoordinates('4600'), null);
  assert.equal(parseCoordinates('Bahnhofstrasse 12 4600'), null);
  assert.equal(parseCoordinates('0 0'), null);
});

test('regions: traced map has 12 regions, outline and lakes; every station lies in its region', () => {
  assert.deepEqual(regions.map((r) => r.id), [...Array(12).keys()].map((i) => i + 1));
  assert.ok(outline.length === 1 && borders.length > 20 && lakes.length > 10 && rivers.length > 20);
  for (const line of [...outline, ...borders, ...lakes, ...rivers]) for (const [e, n] of line) assert.ok(e > 2470000 && e < 2850000 && n > 1060000 && n < 1310000);
  for (const r of regions) assert.ok(inRegion(r, ...r.label), `label of region ${r.id} inside`);
  for (const s of stations) {
    const at = regionAt(regions, s.e, s.n);
    assert.equal(at.id, s.region, `${s.id}: region ${s.region}, found ${at.id} (${Math.round(at.distance)} m outside)`);
    assert.ok(at.inside, `${s.id}: inside`);
  }
});

test('regions: every locality of the directory gets a region near the map', () => {
  let outside = 0;
  for (const [plz, name, , canton, e, n] of places) {
    const at = regionAt(regions, e, n);
    assert.ok(at.id >= 1 && at.id <= 12, `${plz} ${name}`);
    if (!at.inside) {
      outside++;
      assert.ok(at.distance < (canton === 'FL' ? 12000 : 8000), `${plz} ${name} ${canton}: ${Math.round(at.distance)} m outside`);
    }
  }
  assert.ok(outside / places.length < 0.03, `${outside} of ${places.length} outside the traced regions`);
});

test('regions: sample places', () => {
  const region = (e, n) => regionAt(regions, e, n).id;
  assert.equal(region(2635345, 1244330), 4); // Olten
  assert.equal(region(2683000, 1248000), 3); // Zürich
  assert.equal(region(2600000, 1200000), 4); // Bern
  assert.equal(region(2593000, 1120000), 10); // Sion
  assert.equal(region(2717000, 1096000), 12); // Lugano
  assert.equal(region(2783000, 1187000), 9); // Davos
  assert.equal(region(2787000, 1152000), 11); // St. Moritz
  assert.equal(region(2611000, 1267000), 1); // Basel
  assert.equal(region(2538000, 1152000), 5); // Lausanne
});

test('ranking: Olten 4600 at 396 m → Buchs-Aarau, Wynau, Rünenberg', () => {
  const site = { e: 2635345, n: 1244330, height: 396, region: 4 };
  const r = rankStations(stations, site, DEFAULT_WEIGHTS);
  assert.deepEqual(r.slice(0, 3).map((x) => x.station.id), ['BUS', 'WYN', 'RUE']);
  assert.equal(r[0].distance.toFixed(1), '13.9');
  assert.equal(r[0].dh, -9);
  assert.equal(r[1].distance.toFixed(1), '14.4');
  assert.equal(r[2].distance.toFixed(1), '9.6');
  assert.equal(r[2].dh, 214);
  assert.equal(r[2].sameRegion, false);
  assert.ok(Math.abs(r[2].score - (9.6 + 21.4 + 20)) < 0.1);
  // Without a height the height term drops out.
  const flat = rankStations(stations, { ...site, height: null });
  assert.equal(flat[0].dh, null);
  assert.equal(flat[0].station.id, 'BUS');
  // Without the region penalty Rünenberg (9.6 km) is still behind, because of its height.
  assert.equal(rankStations(stations, site, { height: 10, region: 0 })[0].station.id, 'BUS');
  assert.equal(rankStations(stations, site, { height: 0, region: 0 })[0].station.id, 'RUE');
});

test('place search: postcode, names without accents, municipality', () => {
  assert.equal(places.length > 4000, true);
  assert.deepEqual(searchPlaces(places, '4600')[0], { plz: 4600, name: 'Olten', municipality: 'Olten', canton: 'SO', e: 2635345, n: 1244330 });
  assert.equal(searchPlaces(places, 'olten')[0].name, 'Olten');
  assert.equal(searchPlaces(places, 'zurich')[0].name, 'Zürich');
  assert.equal(searchPlaces(places, 'geneve')[0].name, 'Genève');
  assert.equal(searchPlaces(places, '9490')[0].canton, 'FL');
  assert.ok(searchPlaces(places, '8').length <= 8);
  assert.deepEqual(searchPlaces(places, ''), []);
  assert.equal(fold(' Neuchâtel '), 'neuchatel');
});

test('copy row: tab separated in the documented column order', () => {
  const site = { e: 2635345, n: 1244330, height: 396, label: 'Olten SO' };
  const pick = rankStations(stations, { ...site, region: 4 })[0];
  const row = copyRow({ site, region: 4, pick });
  assert.equal(row.split('\t').length, COPY_COLUMNS.length);
  assert.equal(row, 'Olten SO\t2635345\t1244330\t396\t4\tBuchs-Aarau\tBUS\t387\t13.9\t-9');
});

test('state: normalizeInputs is idempotent, never throws, URL round trip', () => {
  for (const raw of [null, 1, 'x', {}, { site: { e: 'a' } }, { site: { e: 1, n: 1 } }, { weights: { height: -5, region: 1e9 } }, defaultInputs()]) {
    const a = normalizeInputs(raw);
    assert.deepEqual(normalizeInputs(JSON.parse(JSON.stringify(a))), a);
  }
  assert.deepEqual(normalizeInputs({ weights: { height: -5, region: 1e9 } }).weights, { height: 0, region: 500 });
  const inputs = normalizeInputs({ site: { e: 2635345.4, n: 1244330, label: 'Olten SO', source: 'place', height: 400, heightSource: 'manual' }, station: 'WYN' });
  assert.equal(inputs.site.e, 2635345);
  const params = toUrlParams(inputs);
  assert.equal(params.toString(), 'e=2635345&n=1244330&h=400&st=WYN&q=Olten+SO');
  const back = fromUrlParams(`?${params}`);
  assert.equal(back.site.height, 400);
  assert.equal(back.site.heightSource, 'manual');
  assert.equal(back.station, 'WYN');
  assert.equal(fromUrlParams('?e=1&n=2'), null);
  assert.equal(fromUrlParams(''), null);
  assert.equal(normalizeInputs({ station: 'bus' }).station, null);
});
