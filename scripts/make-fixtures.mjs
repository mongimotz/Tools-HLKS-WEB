// Write reference PDFs to tests/fixtures/. Run once per calculation version and commit the result:
//   npm run fixtures
// The regression test re-imports every fixture and compares the recalculated result with the
// snapshot stored inside it. Never overwrite old fixtures; add new ones with a new file name.

import { writeFile, mkdir, access } from 'node:fs/promises';

import { createEnvelope } from '../lib/core/envelope.js';
import { compute, snapshotOf, CALC_VERSION } from '../tools/duct-pressure-loss/calc.js';
import { exampleInputs, normalizeInputs, TOOL_ID, INPUT_VERSION } from '../tools/duct-pressure-loss/defaults.js';
import { buildReport } from '../tools/duct-pressure-loss/report.js';

const dir = new URL('../tests/fixtures/', import.meta.url);
await mkdir(dir, { recursive: true });

const cases = {
  example: { project: { name: 'Beispiel', number: 'FX-1', author: 'Fixture', date: '2026-10-06' }, inputs: exampleInputs() },
  excel: {
    project: { name: 'Excel-Vorlage Zeile 1', number: 'FX-2', author: 'Fixture', date: '2026-10-06' },
    inputs: normalizeInputs({
      system: { name: 'Vergleich Excel', altitude: 540, temperature: 21, humidity: 0, availablePressure: 500 },
      sections: [{ id: 's1', nr: '1', shape: 'rect', width: 800, height: 400, material: 'galvanized', flow: 6000, length: 10, zetaExtra: 0.6 }],
    }),
  },
};

for (const [name, doc] of Object.entries(cases)) {
  const file = new URL(`${TOOL_ID}_calc-${CALC_VERSION}_${name}.pdf`, dir);
  const exists = await access(file).then(() => true, () => false);
  if (exists) {
    console.log(`skip (exists): ${file.pathname}`);
    continue;
  }
  const result = compute(doc.inputs);
  const env = createEnvelope({ tool: TOOL_ID, version: INPUT_VERSION, calcVersion: CALC_VERSION, project: doc.project, inputs: doc.inputs, snapshot: snapshotOf(result) });
  await writeFile(file, await buildReport(doc, result, env));
  console.log(`wrote ${file.pathname} (${result.totals.critical.toFixed(2)} Pa)`);
}
