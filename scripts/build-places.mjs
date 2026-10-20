// SPDX-License-Identifier: AGPL-3.0-or-later
// Builds tools/climate-station/data/places.json from the official directory of towns and cities of swisstopo
// (Amtliches Ortschaftenverzeichnis, CSV in LV95: https://www.swisstopo.admin.ch, "AMTOVZ_CSV_LV95.csv").
//
//   node scripts/build-places.mjs AMTOVZ_CSV_LV95.csv
//
// One entry per locality (PLZ + Zusatzziffer): the row of the municipality with the largest share of addresses.
// Liechtenstein has no canton in the file and gets "FL".

import { readFile, writeFile, stat } from 'node:fs/promises';

const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/build-places.mjs AMTOVZ_CSV_LV95.csv');
  process.exit(1);
}

const lines = (await readFile(file, 'utf8')).replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
const head = lines.shift().split(';');
const col = (name) => {
  const i = head.indexOf(name);
  if (i < 0) throw new Error(`column ${name} missing`);
  return i;
};
const C = {
  name: col('Ortschaftsname'), plz: col('PLZ4'), extra: col('Zusatzziffer'), town: col('Gemeindename'),
  canton: col('Kantonskürzel'), share: col('Adressenanteil'), e: col('E'), n: col('N'),
};

const best = new Map();
for (const line of lines) {
  const f = line.split(';');
  const key = `${f[C.plz]}-${f[C.extra]}`;
  const share = parseFloat(f[C.share]);
  const prev = best.get(key);
  if (prev && prev.share >= share) continue;
  best.set(key, {
    share,
    row: [Number(f[C.plz]), f[C.name], f[C.town] === f[C.name] ? '' : f[C.town], f[C.canton] || 'FL', Math.round(Number(f[C.e])), Math.round(Number(f[C.n]))],
  });
}

const rows = [...best.values()].map((b) => b.row).sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1], 'de'));
const out = `{
  "source": "Amtliches Ortschaftenverzeichnis, swisstopo, Datei vom ${(await stat(file)).mtime.toISOString().slice(0, 10)}. Je Ortschaft die Gemeinde mit dem grössten Adressanteil.",
  "fields": ["plz", "name", "municipality (empty = name)", "canton", "e", "n"],
  "places": [
${rows.map((r) => `    ${JSON.stringify(r)}`).join(',\n')}
  ]
}
`;
await writeFile(new URL('../tools/climate-station/data/places.json', import.meta.url), out);
console.log(`${rows.length} places, ${Math.round(out.length / 1024)} KB`);
