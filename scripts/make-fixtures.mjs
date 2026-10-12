// Write reference PDFs to tests/fixtures/. Run once per calculation version and commit the result:
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
      excel: {
        project: { name: 'Excel-Vorlage Zeile 1', number: 'FX-2', author: 'Fixture', date: '2026-10-06' },
        inputs: ductDefaults.normalizeInputs({
          system: { name: 'Vergleich Excel', altitude: 540, temperature: 21, humidity: 0, availablePressure: 500 },
          sections: [{ id: 's1', nr: '1', shape: 'rect', width: 800, height: 400, material: 'galvanized', flow: 6000, length: 10, zetaExtra: 0.6 }],
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
      stages: {
        project: { name: 'Betriebsstufen, ohne Runden', number: 'FX-4', author: 'Fixture', date: '2026-10-11' },
        inputs: sizingDefaults.normalizeInputs({
          system: { simple: false, hours: 4410, stages: [{ flow: 100, hours: 3000 }, { flow: 50, hours: 4000 }], exponent: 1.5, rectStep: 0 },
          current: { note: 'Abluft Nachweis', flow: 3000, shape: 'rect', mode: 'check', width: 600, height: 250 },
          positions: [
            { id: 'p1', note: 'Abluft Hauptleitung', flow: 12000, shape: 'rect', mode: 'size', ratio: 3 },
            { id: 'p2', note: 'Variante flachoval', flow: 12000, shape: 'oval', mode: 'size', ratio: 4 },
            { id: 'p3', flow: 450, shape: 'round', mode: 'size' },
            { id: 'p4', flow: 3000, shape: 'oval', mode: 'height', height: 250 },
          ],
        }),
      },
    },
  },
  {
    calc: silencerCalc,
    defaults: silencerDefaults,
    report: silencerReport,
    cases: {
      example: { project: { name: 'Beispiel Kilian', number: 'FX-5', author: 'Fixture', date: '2026-10-12' }, inputs: silencerDefaults.exampleInputs() },
      strands: { project: { name: 'Zwei Stränge, Datenbank, LSV', number: 'FX-6', author: 'Fixture', date: '2026-10-12' }, inputs: silencerStrands() },
    },
  },
];

/** Silencer case 2: supply with database silencers and a branch, exhaust with LSV day and night. */
function silencerStrands() {
  return silencerDefaults.normalizeInputs({
    strands: [
      {
        id: 'st1',
        name: 'Zuluft',
        flow: 8000,
        elements: [
          { id: 'e1', nr: '1', after: null, type: 'source', name: 'Monoblock Zuluft', lw: [80, 82, 84, 86, 84, 80, 76, 70] },
          { id: 'e2', nr: '2', after: 'e1', type: 'silencer', name: 'SD Zentrale', kind: 'rect', install: 'freeOutlet', rect: { series: 'trox-xk', d: 200, s: 100, L: 1500, n: 4, H: 1000 } },
          { id: 'e3', nr: '3', after: 'e2', type: 'component', name: 'VAV Büro', flow: 5000, lw: [62, 58, 54, 50, 48, 46, 42, 38] },
          { id: 'e4', nr: '4', after: 'e3', type: 'silencer', name: 'SD Büro', kind: 'round', round: { series: 'schako-rs-n', dn: 500, L: 950, insulation: 100 } },
          { id: 'e5', nr: '5', after: 'e4', type: 'receiver', name: 'Büro', r: 1.5, q: 2, volume: 120, reverb: 0.6, basis: 'room', room: { type: '3.01' } },
          { id: 'e6', nr: '2.1', after: 'e2', type: 'silencer', name: 'SD Sitzung', flow: 3000, kind: 'round', round: { series: 'trox-ck', dn: 315, L: 1500, insulation: 100, core: 100 } },
          { id: 'e7', nr: '2.2', after: 'e6', type: 'receiver', name: 'Sitzungszimmer', r: 2, q: 2, area: 25, basis: 'manual', target: 32 },
        ],
      },
      {
        id: 'st2',
        name: 'Fortluft',
        flow: 7500,
        elements: [
          { id: 'e8', nr: '1', after: null, type: 'source', name: 'Monoblock Fortluft', lw: [79, 81, 83, 84, 82, 78, 74, 68] },
          { id: 'e9', nr: '2', after: 'e8', type: 'silencer', name: 'SD Fortluft', kind: 'rect', rect: { series: 'schako-mwk-ob', d: 200, s: 100, L: 2000, n: 4, H: 900 } },
          { id: 'e10', nr: '3', after: 'e9', type: 'receiver', name: 'Nachbar Fenster', r: 12, q: 2, basis: 'lsv', lsv: { es: 2, k2: 2, hoursNight: 4 } },
        ],
      },
    ],
  });
}

for (const { calc, defaults, report, cases } of tools) {
  for (const [name, doc] of Object.entries(cases)) {
    const file = new URL(`${defaults.TOOL_ID}_calc-${calc.CALC_VERSION}_${name}.pdf`, dir);
    const exists = await access(file).then(() => true, () => false);
    if (exists) {
      console.log(`skip (exists): ${file.pathname}`);
      continue;
    }
    const result = calc.compute(doc.inputs);
    const env = createEnvelope({
      tool: defaults.TOOL_ID,
      version: defaults.INPUT_VERSION,
      calcVersion: calc.CALC_VERSION,
      project: doc.project,
      inputs: doc.inputs,
      snapshot: calc.snapshotOf(result),
    });
    await writeFile(file, await report(doc, result, env));
    console.log(`wrote ${file.pathname}`);
  }
}
