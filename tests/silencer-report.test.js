// SPDX-License-Identifier: AGPL-3.0-or-later
// Silencer PDF report, CSV and reference PDFs (test 7 of docs/silencer-plan.md): export → import → export keeps
// the data identical; fixtures of the current calculation version reproduce their snapshot.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

import { extractDataJson, isPdf } from '../lib/core/pdf.js';
import { createEnvelope, parseEnvelope, checkCompatibility } from '../lib/core/envelope.js';
import { compute, snapshotOf, CALC_VERSION } from '../tools/silencer/calc.js';
import { normalizeInputs, exampleInputs, newPath, newRow, TOOL_ID, INPUT_VERSION } from '../tools/silencer/defaults.js';
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

/** The example plus a third path with a source in dB(A), a database silencer and an LSV receiver. */
function threePaths() {
  const inputs = exampleInputs();
  inputs.paths[0].rows[0].name = 'Sonderzeichen: ζ λ Δp → ≤ ² ³ ° Ø “Zitat” <tag> & ;';
  const p = newPath(inputs, { name: 'Fortluft', flow: 6000 });
  Object.assign(p.rows[0], { lw: [53, 66, 75, 83, 84, 81, 77, 69], unit: 'dBA' });
  inputs.paths.push(p);
  const sd = newRow(inputs, 'silencer', { kind: 'rect', rect: { series: 'trox-mk', d: 200, s: 100, L: 2000, B: 900, H: 1000 } });
  p.rows.push(sd);
  p.rows.push(newRow(inputs, 'silencer', { kind: 'round', round: { series: 'trox-ck', dn: 630, L: 1500, insulation: 100, core: 100 } }));
  p.rows.push(newRow(inputs, 'loss', { name: 'Mündung', d: [10, 6, 3, 1, 0, 0, 0, 0] }));
  Object.assign(p.receiver, { name: 'Nachbar', r: 5, basis: 'lsv', lsv: { es: 3, hoursNight: 6 } });
  return normalizeInputs(inputs);
}

test('7. PDF round trip keeps project and inputs identical', async () => {
  const doc = { project, inputs: threePaths() };
  const { doc: back1 } = await importPdf(await exportPdf(doc));
  assert.deepEqual(back1, doc);
  const { doc: back2, env } = await importPdf(await exportPdf(back1));
  assert.deepEqual(back2, doc);
  assert.deepEqual(env.snapshot, snapshotOf(compute(doc.inputs)));
});

test('PDF round trip preserves automatic sizing, fractional estimated gaps and Schako noise profiles', async () => {
  const inputs = normalizeInputs({ paths: [{
    id: 'w1', name: 'Maximalmasse', flow: 5000,
    rows: [
      { id: 'r1', type: 'source', lw: [84, 88, 89, 87, 84, 81, 77, 72] },
      {
        id: 'r2', type: 'silencer', name: 'RIO', kind: 'rect',
        design: { mode: 'auto', maxB: 1234, maxH: 1075, maxL: 2000 },
        rect: { series: 'prod-rio', d: 160, s: 80.25, L: 1500, B: 1234, H: 1075 },
      },
      {
        id: 'r3', type: 'silencer', name: 'Schako', kind: 'rect',
        design: { mode: 'auto', maxB: 900, maxH: 1000, maxL: 1500 },
        rect: { series: 'schako-mwk-ob', d: 200, s: 99.5, L: 1500, B: 898.5, H: 1000 },
      },
      {
        id: 'r4', type: 'silencer', kind: 'round',
        design: { mode: 'auto', maxB: null, maxH: null, maxL: 1200 },
        round: { series: 'schako-rs-n', dn: 200, insulation: 100, L: 950 },
      },
    ],
    receiver: { name: 'Büro', r: 3, q: 2, basis: 'manual', target: 40 },
  }] });
  const [, estimated, schako, circular] = inputs.paths[0].rows;
  assert.equal(estimated.row.estimated, true);
  assert.ok(estimated.row.estimateSources.length > 0);
  assert.ok(estimated.row.interpolation, 'the effective gap lies between source table gaps');
  assert.equal(estimated.rect.s, 80.25);
  assert.ok(Math.abs(estimated.row.s - 86.8) < 1e-9, 'the stored row uses the actual casing gap');
  assert.ok(estimated.row.de.some((v) => !Number.isInteger(v)), 'the estimate retains fractional attenuation');
  assert.ok(schako.row.noiseProfile?.lw.length > 0, 'the saved Schako row contains octave noise spectra');
  assert.equal(schako.row.s, 99.5);
  assert.equal(circular.row.overallLength, 1050);

  const doc = { project, inputs };
  const result = compute(inputs);
  const csv = buildCsv(doc, result);
  assert.match(csv, /Prod\. RIO \(geschätzt\)/, 'the CSV marks the product itself as estimated');
  assert.match(csv, /L gesamt 1’050/);
  const { doc: back1 } = await importPdf(await exportPdf(doc));
  assert.deepEqual(back1, doc, 'all project, design and stored manufacturer fields survive import');
  const { doc: back2, env } = await importPdf(await exportPdf(back1));
  assert.deepEqual(back2, doc, 'resaving keeps all inputs unchanged');
  assert.deepEqual(env.snapshot, snapshotOf(result));
  assert.equal(buildCsv(back2, compute(back2.inputs)), csv, 'the imported data reproduces the complete CSV');
});

test('CSV export has one line per table line of every path, plus sum and receiver, plus header', () => {
  const inputs = threePaths();
  const result = compute(inputs);
  const csv = buildCsv({ project, inputs }, result);
  const lines = csv.trim().split('\r\n');
  assert.equal(lines.length, result.paths.reduce((n, p) => n + p.lines.length + 2, 0) + 1);
  assert.ok(csv.startsWith('\uFEFF'));
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
  assert.equal(columns, 18);
  for (const l of lines.slice(1)) assert.equal(fields(l), columns, l);
});

test('fixture PDFs still import and reproduce their snapshot', async () => {
  const dir = new URL('./fixtures/', import.meta.url);
  const files = (await readdir(dir)).filter((f) => f.startsWith(`${TOOL_ID}_`) && f.endsWith('.pdf'));
  assert.ok(files.length > 0, 'at least one fixture (npm run fixtures)');
  for (const f of files) {
    const env = parseEnvelope(await extractDataJson(new Uint8Array(await readFile(new URL(f, dir)))));
    if (env.version !== INPUT_VERSION) {
      assert.throws(() => checkCompatibility(env, { tool: TOOL_ID, version: INPUT_VERSION, calcVersion: CALC_VERSION }), /[Vv]ersion/);
      continue;
    }
    checkCompatibility(env, { tool: TOOL_ID, version: INPUT_VERSION, calcVersion: CALC_VERSION });
    const snap = snapshotOf(compute(normalizeInputs(env.inputs)));
    if (env.calcVersion !== CALC_VERSION) continue;
    assert.deepEqual(snap, env.snapshot, `${f}: result changed (calc ${env.calcVersion} → ${CALC_VERSION})`);
  }
});
