// SPDX-License-Identifier: AGPL-3.0-or-later
// Write reference PDFs to tests/fixtures/. Include the input version when calculations have tabs.
//   npm run fixtures
// The regression tests re-import every fixture and compare the recalculated result with the
// snapshot stored inside it. Never overwrite old fixtures; add new ones with a new file name.

import { writeFile, mkdir, access } from 'node:fs/promises';

import { createEnvelope } from '../lib/core/envelope.js';
import * as ductCalc from '../tools/duct-pressure-loss/calc.js';
import * as ductDefaults from '../tools/duct-pressure-loss/defaults.js';
import { buildReport as ductReport } from '../tools/duct-pressure-loss/report.js';
import * as sizingCalc from '../tools/duct-sizing/calc.js';
import * as sizingDefaults from '../tools/duct-sizing/defaults.js';
import { buildReport as sizingReport } from '../tools/duct-sizing/report.js';
import * as silencerCalc from '../tools/silencer/calc.js';
import * as silencerDefaults from '../tools/silencer/defaults.js';
import { buildReport as silencerReport } from '../tools/silencer/report.js';

const dir = new URL('../tests/fixtures/', import.meta.url);
await mkdir(dir, { recursive: true });

const tools = [
  {
    calc: ductCalc,
    defaults: ductDefaults,
    report: ductReport,
    cases: {
      example: { project: { name: 'Beispiel', number: 'FX-1', author: 'Fixture', date: '2026-10-06' }, inputs: ductDefaults.exampleInputs() },
      multiple: { project: { name: 'Zwei Anlagen', number: 'FX-7', author: 'Fixture', date: '2026-10-14' }, inputs: pressureCalculations() },
      excel: {
        project: { name: 'Excel-Vorlage Zeile 1', number: 'FX-2', author: 'Fixture', date: '2026-10-06' },
        inputs: ductDefaults.normalizeInputs({
          calculations: [{
            id: 'c1',
            system: { name: 'Vergleich Excel', altitude: 540, temperature: 21, humidity: 0, availablePressure: 500 },
            sections: [{ id: 's1', nr: '1', shape: 'rect', width: 800, height: 400, material: 'galvanized', flow: 6000, length: 10, zetaExtra: 0.6 }],
          }],
        }),
      },
    },
  },
  {
    calc: sizingCalc,
    defaults: sizingDefaults,
    report: sizingReport,
    cases: {
      example: { project: { name: 'Beispiel', number: 'FX-3', author: 'Fixture', date: '2026-10-11' }, inputs: sizingDefaults.exampleInputs() },
      multiple: { project: { name: 'Zwei Kanalberechnungen', number: 'FX-8', author: 'Fixture', date: '2026-10-14' }, inputs: sizingCalculations() },
      stages: {
        project: { name: 'Betriebsstufen, ohne Runden', number: 'FX-4', author: 'Fixture', date: '2026-10-11' },
        inputs: sizingDefaults.normalizeInputs({
          calculations: [{
            id: 'c1',
            system: { simple: false, hours: 4410, stages: [{ flow: 100, hours: 3000 }, { flow: 50, hours: 4000 }], exponent: 1.5, rectStep: 0 },
            name: 'Abluft Nachweis',
            current: { flow: 3000, shape: 'rect', mode: 'check', width: 600, height: 250 },
            positions: [
              { id: 'p1', flow: 12000, shape: 'rect', mode: 'size', ratio: 3 },
              { id: 'p2', flow: 12000, shape: 'oval', mode: 'size', ratio: 4 },
              { id: 'p3', flow: 450, shape: 'round', mode: 'size' },
              { id: 'p4', flow: 3000, shape: 'oval', mode: 'height', height: 250 },
            ],
          }],
        }),
      },
    },
  },
  {
    calc: silencerCalc,
    defaults: silencerDefaults,
    report: silencerReport,
    cases: {
      example: { project: { name: 'Beispiel', number: 'FX-5', author: 'Fixture', date: '2026-10-12' }, inputs: silencerDefaults.exampleInputs() },
      paths: { project: { name: 'Drei Wege, Datenbank, LSV', number: 'FX-6', author: 'Fixture', date: '2026-10-13' }, inputs: silencerPaths() },
    },
  },
];

function pressureCalculations() {
  const inputs = ductDefaults.exampleInputs();
  const copy = structuredClone(inputs.calculations[0]);
  copy.id = 'c2';
  copy.system.name = 'Abluft Büro';
  copy.system.direction = 'extract';
  copy.system.availablePressure = 250;
  for (const section of copy.sections) section.flow *= 0.6;
  inputs.calculations.push(copy);
  return ductDefaults.normalizeInputs(inputs);
}

function sizingCalculations() {
  const inputs = sizingDefaults.exampleInputs();
  const copy = structuredClone(inputs.calculations[0]);
  copy.id = 'c4';
  copy.name = 'Hauptleitung einfach';
  copy.system.simple = true;
  copy.positions = [];
  inputs.calculations.push(copy);
  return sizingDefaults.normalizeInputs(inputs);
}

/** Silencer case 2: supply to two rooms with database silencers and branches, exhaust in dB(A) with LSV day and night. */
function silencerPaths() {
  const fan = { type: 'source', name: 'Monoblock Zuluft', lw: [80, 82, 84, 86, 84, 80, 76, 70] };
  const central = { type: 'silencer', name: 'SD Zentrale', kind: 'rect', install: 'freeOutlet', rect: { series: 'trox-xk', d: 200, s: 100, L: 1500, B: 1200, H: 1000 } };
  return silencerDefaults.normalizeInputs({
    paths: [
      {
        id: 'w1',
        name: 'Zuluft Büro',
        flow: 8000,
        rows: [
          { id: 'r1', ...fan },
          { id: 'r2', ...central },
          { id: 'r3', type: 'branch', name: 'Abzweig Büro', flow: 5000 },
          { id: 'r4', type: 'source', name: 'VAV Büro', lw: [62, 58, 54, 50, 48, 46, 42, 38] },
          { id: 'r5', type: 'silencer', name: 'SD Büro', kind: 'round', round: { series: 'schako-rs-n', dn: 500, L: 950, insulation: 100 } },
        ],
        receiver: { name: 'Büro', r: 1.5, q: 2, volume: 120, reverb: 0.6, basis: 'room', room: { type: '3.01' } },
      },
      {
        id: 'w2',
        name: 'Zuluft Sitzung',
        flow: 8000,
        rows: [
          { id: 'r6', ...fan },
          { id: 'r7', ...central },
          { id: 'r8', type: 'branch', name: 'Abzweig Sitzung', flow: 3000 },
          { id: 'r9', type: 'silencer', name: 'SD Sitzung', kind: 'round', round: { series: 'trox-ck', dn: 315, L: 1500, insulation: 100, core: 100 } },
          { id: 'r10', type: 'loss', name: 'Bogen', d: [0, 1, 2, 3, 3, 3, 3, 3] },
        ],
        receiver: { name: 'Sitzungszimmer', r: 2, q: 2, area: 25, basis: 'manual', target: 32 },
      },
      {
        id: 'w3',
        name: 'Fortluft',
        flow: 7500,
        rows: [
          { id: 'r11', type: 'source', name: 'Monoblock Fortluft', unit: 'dBA', lw: [53, 65, 74, 81, 82, 79, 75, 67] },
          { id: 'r12', type: 'silencer', name: 'SD Fortluft', kind: 'rect', rect: { series: 'schako-mwk-ob', d: 200, s: 100, L: 2000, B: 1200, H: 900 } },
          { id: 'r13', type: 'loss', name: 'Mündung', d: [10, 6, 3, 1, 0, 0, 0, 0] },
        ],
        receiver: { name: 'Nachbar Fenster', r: 12, q: 2, basis: 'lsv', lsv: { es: 2, k2: 2, hoursNight: 4 } },
      },
    ],
  });
}

for (const { calc, defaults, report, cases } of tools) {
  for (const [name, doc] of Object.entries(cases)) {
    const schema = calc.computeProject ? `_input-${defaults.INPUT_VERSION}` : '';
    const file = new URL(`${defaults.TOOL_ID}${schema}_calc-${calc.CALC_VERSION}_${name}.pdf`, dir);
    const exists = await access(file).then(() => true, () => false);
    if (exists) {
      console.log(`skip (exists): ${file.pathname}`);
      continue;
    }
    const result = (calc.computeProject ?? calc.compute)(doc.inputs);
    const env = createEnvelope({
      tool: defaults.TOOL_ID,
      version: defaults.INPUT_VERSION,
      calcVersion: calc.CALC_VERSION,
      project: doc.project,
      inputs: doc.inputs,
      snapshot: (calc.snapshotProjectOf ?? calc.snapshotOf)(result),
    });
    await writeFile(file, await report(doc, result, env));
    console.log(`wrote ${file.pathname}`);
  }
}
