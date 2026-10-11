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
];

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
