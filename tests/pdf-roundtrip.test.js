// Export → import → export must keep the data identical. Saved fixture PDFs must still import.
// Fixtures of the current calculation version must reproduce their snapshot exactly (regression check);
// older ones may differ, because a new calculation version is allowed to change results.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

import { extractDataJson, isPdf } from '../lib/core/pdf.js';
import { createEnvelope, parseEnvelope, checkCompatibility } from '../lib/core/envelope.js';
import { compute, snapshotOf, CALC_VERSION } from '../tools/duct-pressure-loss/calc.js';
import { normalizeInputs, exampleInputs, TOOL_ID, INPUT_VERSION } from '../tools/duct-pressure-loss/defaults.js';
import { buildReport } from '../tools/duct-pressure-loss/report.js';
import { buildCsv } from '../tools/duct-pressure-loss/csv.js';

const project = { name: 'Testprojekt Ä/Ö/Ü', number: 'P-42', author: 'Test', date: '2026-10-06' };

async function exportPdf(doc) {
  const result = compute(doc.inputs);
  const env = createEnvelope({
    tool: TOOL_ID,
    version: INPUT_VERSION,
    calcVersion: CALC_VERSION,
    project: doc.project,
    inputs: doc.inputs,
    snapshot: snapshotOf(result),
  });
  return buildReport(doc, result, env);
}

async function importPdf(bytes) {
  assert.ok(isPdf(bytes));
  const text = await extractDataJson(bytes);
  assert.ok(text, 'data.json attachment present');
  const env = parseEnvelope(text);
  const notes = checkCompatibility(env, { tool: TOOL_ID, version: INPUT_VERSION, calcVersion: CALC_VERSION });
  assert.deepEqual(notes, []);
  return { env, doc: { project: env.project, inputs: normalizeInputs(env.inputs) } };
}

test('PDF round trip keeps project and inputs identical', async () => {
  const doc = { project, inputs: exampleInputs() };
  doc.inputs.sections[0].note = 'Sonderzeichen: ζ λ Δp → ≤ ² ³ ° Ø “Zitat” <tag> & ;';
  const pdf1 = await exportPdf(doc);
  const { doc: back1 } = await importPdf(pdf1);
  assert.deepEqual(back1, doc);

  const pdf2 = await exportPdf(back1);
  const { doc: back2, env } = await importPdf(pdf2);
  assert.deepEqual(back2, doc);
  assert.equal(env.snapshot.critical, snapshotOf(compute(doc.inputs)).critical);
});

test('CSV export has one line per section plus header', () => {
  const inputs = exampleInputs();
  const csv = buildCsv({ project, inputs }, compute(inputs));
  const lines = csv.trim().split('\r\n');
  assert.equal(lines.length, inputs.sections.length + 1);
  assert.ok(csv.startsWith('﻿'));
});

test('fixture PDFs still import and reproduce their snapshot', async () => {
  const dir = new URL('./fixtures/', import.meta.url);
  const files = (await readdir(dir)).filter((f) => f.endsWith('.pdf'));
  assert.ok(files.length > 0, 'at least one fixture (npm run fixtures)');
  for (const f of files) {
    const bytes = new Uint8Array(await readFile(new URL(f, dir)));
    const text = await extractDataJson(bytes);
    const env = parseEnvelope(text);
    if (env.tool !== TOOL_ID) continue;
    checkCompatibility(env, { tool: TOOL_ID, version: INPUT_VERSION, calcVersion: CALC_VERSION });
    const result = compute(normalizeInputs(env.inputs));
    assert.ok(Number.isFinite(result.totals.critical), `${f}: no result`);
    if (env.calcVersion !== CALC_VERSION) continue;
    assert.ok(
      Math.abs(result.totals.critical - env.snapshot.critical) < 0.01,
      `${f}: saved ${env.snapshot.critical} Pa, now ${result.totals.critical.toFixed(3)} Pa (calc ${env.calcVersion} → ${CALC_VERSION})`,
    );
    assert.deepEqual(result.path, env.snapshot.path, `${f}: critical path changed`);
  }
});
