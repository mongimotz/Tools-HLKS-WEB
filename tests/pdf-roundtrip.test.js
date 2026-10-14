// SPDX-License-Identifier: AGPL-3.0-or-later
// Export → import → export must keep the data identical. Saved fixture PDFs must still import.
// Fixtures of the current calculation version must reproduce their snapshot exactly (regression check);
// older ones may differ, because a new calculation version is allowed to change results.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

import { extractDataJson, isPdf } from '../lib/core/pdf.js';
import { createEnvelope, parseEnvelope, checkCompatibility } from '../lib/core/envelope.js';
import { computeProject, snapshotProjectOf, CALC_VERSION } from '../tools/duct-pressure-loss/calc.js';
import { normalizeInputs, exampleInputs, duplicateCalculation, newCalculation, TOOL_ID, INPUT_VERSION } from '../tools/duct-pressure-loss/defaults.js';
import { buildReport } from '../tools/duct-pressure-loss/report.js';
import { buildCsv } from '../tools/duct-pressure-loss/csv.js';
import { PDFDocument } from '../lib/vendor/pdf-lib/pdf-lib.esm.min.js';

const project = { name: 'Testprojekt Ä/Ö/Ü', number: 'P-42', author: 'Test', date: '2026-10-06' };

/** Simulate an edited number before the input's change/blur handler commits its order. */
function pendingNumberInputs() {
  const inputs = exampleInputs();
  const sections = inputs.calculations[0].sections;
  sections.find((section) => section.id === 's3').nr = ' 10 ';
  sections.reverse();
  for (const section of sections) section.parent = 'stale-explicit-parent';
  return inputs;
}

async function exportPdf(doc) {
  const result = computeProject(doc.inputs);
  const env = createEnvelope({
    tool: TOOL_ID,
    version: INPUT_VERSION,
    calcVersion: CALC_VERSION,
    project: doc.project,
    inputs: doc.inputs,
    snapshot: snapshotProjectOf(result),
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
  doc.inputs.calculations[0].sections[0].note = 'Sonderzeichen: ζ λ Δp → ≤ ² ³ ° Ø “Zitat” <tag> & ;';
  const copy = duplicateCalculation(doc.inputs.calculations, doc.inputs.calculations[0].id);
  copy.system.name = 'Abluft Küche';
  copy.system.direction = 'extract';
  copy.sections[0].flow = 4200;
  doc.inputs.calculations.push(copy);
  const pdf1 = await exportPdf(doc);
  const { doc: back1 } = await importPdf(pdf1);
  assert.deepEqual(back1, doc);

  const pdf2 = await exportPdf(back1);
  const { doc: back2, env } = await importPdf(pdf2);
  assert.deepEqual(back2, doc);
  assert.deepEqual(env.snapshot, snapshotProjectOf(computeProject(doc.inputs)));
});

test('CSV export recalculates and includes every calculation and section', () => {
  const inputs = exampleInputs();
  const copy = duplicateCalculation(inputs.calculations, inputs.calculations[0].id);
  copy.system.name = 'Abluft Küche';
  copy.sections[0].flow = 4200;
  inputs.calculations.push(copy);
  const empty = newCalculation(inputs.calculations);
  empty.system.name = 'Leer';
  empty.sections = [];
  inputs.calculations.push(empty);
  const csv = buildCsv({ project, inputs }, { stale: true });
  const lines = csv.trim().split('\r\n');
  assert.equal(lines.length, inputs.calculations.reduce((count, calculation) => count + Math.max(1, calculation.sections.length), 1));
  assert.ok(csv.includes('"Zuluft Büro 1. OG";"1"'));
  assert.ok(csv.includes('"Abluft Küche";"1"'));
  assert.ok(csv.includes('"Leer";'));
  assert.ok(csv.startsWith('﻿'));
});

test('PDF starts each calculation on its own pages and replaces stale snapshots', async () => {
  const inputs = exampleInputs();
  const copy = duplicateCalculation(inputs.calculations, inputs.calculations[0].id);
  copy.system.name = 'Abluft';
  copy.sections[0].flow = 9000;
  inputs.calculations.push(copy);
  const one = { project, inputs: { ...inputs, calculations: [inputs.calculations[0]] } };
  const two = { project, inputs: { ...inputs, calculations: [copy] } };
  const counts = await Promise.all([one, two].map(async (doc) => (await PDFDocument.load(await exportPdf(doc))).getPageCount()));
  const envelope = createEnvelope({ tool: TOOL_ID, version: INPUT_VERSION, calcVersion: CALC_VERSION, project, inputs: one.inputs, snapshot: { stale: true } });
  const pdf = await buildReport({ project, inputs }, { stale: true }, envelope);
  assert.equal((await PDFDocument.load(pdf)).getPageCount(), counts[0] + counts[1]);
  const back = parseEnvelope(await extractDataJson(pdf));
  assert.deepEqual(back.inputs, inputs);
  assert.deepEqual(back.snapshot, snapshotProjectOf(computeProject(inputs)));
});

test('PDF canonicalises pending section numbers and embeds their derived snapshot', async () => {
  const inputs = pendingNumberInputs();
  const before = structuredClone(inputs);
  const canonical = normalizeInputs(inputs);
  const envelope = createEnvelope({ tool: TOOL_ID, version: INPUT_VERSION, calcVersion: CALC_VERSION, project, inputs: exampleInputs(), snapshot: { stale: true } });
  const pdf = await buildReport({ project, inputs }, { stale: true }, envelope);
  const back = parseEnvelope(await extractDataJson(pdf));
  assert.deepEqual(back.inputs, canonical);
  assert.deepEqual(back.inputs.calculations[0].sections.map((section) => section.nr), ['1', '1.1', '2', '2.1', '4', '10']);
  assert.ok(back.inputs.calculations.every((calculation) => calculation.sections.every((section) => !Object.hasOwn(section, 'parent'))));
  assert.deepEqual(normalizeInputs(JSON.parse(JSON.stringify(back.inputs))), back.inputs, 'saved inputs survive normalisation unchanged');
  assert.deepEqual(back.snapshot, snapshotProjectOf(computeProject(canonical)));
  assert.deepEqual(inputs, before, 'export leaves the live input object unchanged');
});

test('CSV canonicalises number order and derives predecessors after renumbering', () => {
  const inputs = pendingNumberInputs();
  const before = structuredClone(inputs);
  const rows = buildCsv({ project, inputs }).trim().split('\r\n').slice(1).map((line) => line.split(';').map((cell) => cell.replace(/^"|"$/g, '')));
  assert.deepEqual(rows.map((row) => row[1]), ['1', '1.1', '2', '2.1', '4', '10']);
  assert.equal(rows.find((row) => row[1] === '10')[2], '4');
  assert.equal(rows.find((row) => row[1] === '4')[2], '2');
  assert.equal(rows.find((row) => row[1] === '1.1')[2], '1');
  assert.equal(rows.find((row) => row[1] === '1')[2], 'Ventilator');
  assert.deepEqual(inputs, before, 'export leaves the live input object unchanged');
});

test('fixture PDFs still import and reproduce their snapshot', async () => {
  const dir = new URL('./fixtures/', import.meta.url);
  const files = (await readdir(dir)).filter((f) => f.endsWith('.pdf'));
  assert.ok(files.length > 0, 'at least one fixture (npm run fixtures)');
  let current = 0;
  for (const f of files) {
    const bytes = new Uint8Array(await readFile(new URL(f, dir)));
    const text = await extractDataJson(bytes);
    const env = parseEnvelope(text);
    if (env.tool !== TOOL_ID) continue;
    if (env.version !== INPUT_VERSION) continue;
    current++;
    checkCompatibility(env, { tool: TOOL_ID, version: INPUT_VERSION, calcVersion: CALC_VERSION });
    const result = computeProject(normalizeInputs(env.inputs));
    assert.ok([...result.calculations.values()].every((calculation) => Number.isFinite(calculation.totals.critical)), `${f}: no result`);
    if (env.calcVersion !== CALC_VERSION) continue;
    assert.deepEqual(snapshotProjectOf(result), env.snapshot, `${f}: calculation snapshot changed`);
  }
  assert.ok(current > 0, 'current schema pressure fixtures exist (npm run fixtures)');
});
