// Silencer PDF report, CSV and reference PDFs (test 7 of docs/silencer-plan.md): export → import → export keeps
// the data identical; fixtures of the current calculation version reproduce their snapshot.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

import { extractDataJson, isPdf } from '../lib/core/pdf.js';
import { createEnvelope, parseEnvelope, checkCompatibility } from '../lib/core/envelope.js';
import { compute, snapshotOf, CALC_VERSION } from '../tools/silencer/calc.js';
import { normalizeInputs, exampleInputs, newStrand, insertBefore, TOOL_ID, INPUT_VERSION } from '../tools/silencer/defaults.js';
import { buildReport } from '../tools/silencer/report.js';
import { buildCsv } from '../tools/silencer/csv.js';

const project = { name: 'Testprojekt Ä/Ö/Ü', number: 'P-42', author: 'Test', date: '2026-10-12' };

async function exportPdf(doc) {
  const result = compute(doc.inputs);
  const env = createEnvelope({ tool: TOOL_ID, version: INPUT_VERSION, calcVersion: CALC_VERSION, project: doc.project, inputs: doc.inputs, snapshot: snapshotOf(result) });
  return buildReport(doc, result, env);
}

async function importPdf(bytes) {
  assert.ok(isPdf(bytes));
  const env = parseEnvelope(await extractDataJson(bytes));
  assert.deepEqual(checkCompatibility(env, { tool: TOOL_ID, version: INPUT_VERSION, calcVersion: CALC_VERSION }), []);
  return { env, doc: { project: env.project, inputs: normalizeInputs(env.inputs) } };
}

/** The example plus a second strand with a database silencer and an LSV receiver. */
function twoStrands() {
  const inputs = exampleInputs();
  inputs.strands[0].elements[0].name = 'Sonderzeichen: ζ λ Δp → ≤ ² ³ ° Ø “Zitat” <tag> & ;';
  const s = newStrand(inputs, { name: 'Fortluft', flow: 6000 });
  s.elements[0].lw = [80, 82, 84, 86, 84, 80, 76, 70];
  Object.assign(s.elements[1], { r: 5, basis: 'lsv', lsv: { es: 3, hoursNight: 6 } });
  insertBefore(inputs, s, s.elements[1].id, 'silencer', { kind: 'rect', rect: { series: 'trox-mk', d: 200, s: 100, L: 2000, n: 3, H: 1000 } });
  inputs.strands.push(s);
  return normalizeInputs(inputs);
}

test('7. PDF round trip keeps project and inputs identical', async () => {
  const doc = { project, inputs: twoStrands() };
  const { doc: back1 } = await importPdf(await exportPdf(doc));
  assert.deepEqual(back1, doc);
  const { doc: back2, env } = await importPdf(await exportPdf(back1));
  assert.deepEqual(back2, doc);
  assert.deepEqual(env.snapshot, snapshotOf(compute(doc.inputs)));
});

test('CSV export has one line per element of every strand plus header', () => {
  const inputs = twoStrands();
  const csv = buildCsv({ project, inputs }, compute(inputs));
  const lines = csv.trim().split('\r\n');
  assert.equal(lines.length, inputs.strands.reduce((n, s) => n + s.elements.length, 0) + 1);
  assert.ok(csv.startsWith('﻿'));
  // fields separated by ; outside of "…"
  const fields = (line) => {
    let n = 1;
    let quoted = false;
    for (const ch of line) {
      if (ch === '"') quoted = !quoted;
      else if (ch === ';' && !quoted) n++;
    }
    return n;
  };
  const columns = fields(lines[0]);
  assert.equal(columns, 50);
  for (const l of lines.slice(1)) assert.equal(fields(l), columns, l);
});

test('fixture PDFs still import and reproduce their snapshot', async () => {
  const dir = new URL('./fixtures/', import.meta.url);
  const files = (await readdir(dir)).filter((f) => f.startsWith(`${TOOL_ID}_`) && f.endsWith('.pdf'));
  assert.ok(files.length > 0, 'at least one fixture (npm run fixtures)');
  for (const f of files) {
    const env = parseEnvelope(await extractDataJson(new Uint8Array(await readFile(new URL(f, dir)))));
    checkCompatibility(env, { tool: TOOL_ID, version: INPUT_VERSION, calcVersion: CALC_VERSION });
    const snap = snapshotOf(compute(normalizeInputs(env.inputs)));
    if (env.calcVersion !== CALC_VERSION) continue;
    assert.deepEqual(snap, env.snapshot, `${f}: result changed (calc ${env.calcVersion} → ${CALC_VERSION})`);
  }
});
