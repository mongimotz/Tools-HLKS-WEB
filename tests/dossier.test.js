// SPDX-License-Identifier: AGPL-3.0-or-later
// Project Dossier PDF compilation, attachment round-trip, attachDataJson, and .schema envelope wrapping.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PDFDocument } from '../lib/vendor/pdf-lib/pdf-lib.esm.min.js';
import { buildDossierPdf, attachDataJson, extractDataJson, readAttachments, isPdf } from '../lib/core/pdf.js';
import { createEnvelope, parseEnvelope } from '../lib/core/envelope.js';
import { wrapSchemaEnvelope } from '../lib/core/files.js';
import { computeProject as computePressure, snapshotProjectOf as snapPressure, CALC_VERSION as P_CALC } from '../tools/duct-pressure-loss/calc.js';
import { exampleInputs as pressureExample, TOOL_ID as P_ID, INPUT_VERSION as P_VER } from '../tools/duct-pressure-loss/defaults.js';
import { buildReport as buildPressureReport } from '../tools/duct-pressure-loss/report.js';
import { computeProject as computeSizing, snapshotProjectOf as snapSizing, CALC_VERSION as S_CALC } from '../tools/duct-sizing/calc.js';
import { exampleInputs as sizingExample, TOOL_ID as S_ID, INPUT_VERSION as S_VER } from '../tools/duct-sizing/defaults.js';
import { buildReport as buildSizingReport } from '../tools/duct-sizing/report.js';

const project = { name: 'Neubau Muster', number: '2026-01', author: 'FG', date: '2026-11-24' };

test('buildDossierPdf combines reports with cover, TOC, dossier data.json and per-tool attachments', async () => {
  const pIn = pressureExample();
  const pRes = computePressure(pIn);
  const pEnv = createEnvelope({ tool: P_ID, version: P_VER, calcVersion: P_CALC, project, inputs: pIn, snapshot: snapPressure(pRes) });
  const pPdf = await buildPressureReport({ project, inputs: pIn }, pRes, pEnv);

  const sIn = sizingExample();
  const sRes = computeSizing(sIn);
  const sEnv = createEnvelope({ tool: S_ID, version: S_VER, calcVersion: S_CALC, project, inputs: sIn, snapshot: snapSizing(sRes) });
  const sPdf = await buildSizingReport({ project, inputs: sIn }, sRes, sEnv);

  const pPages = (await PDFDocument.load(pPdf)).getPageCount();
  const sPages = (await PDFDocument.load(sPdf)).getPageCount();

  const dossierEnv = createEnvelope({
    tool: 'dossier',
    version: 1,
    calcVersion: '1.0.0',
    project,
    inputs: {
      includeCover: true,
      items: [
        { toolId: P_ID, toolName: 'Druckverlust Lüftung', title: project.name, summary: '1 Berechnung', envelope: pEnv },
        { toolId: S_ID, toolName: 'Kanalrechner', title: project.name, summary: '1 Berechnung', envelope: sEnv },
      ],
    },
    snapshot: { count: 2 },
  });

  const dossierBytes = await buildDossierPdf({
    project,
    includeCover: true,
    envelope: dossierEnv,
    entries: [
      { toolId: P_ID, toolName: 'Druckverlust Lüftung', title: project.name, summary: '1 Berechnung', pdfBytes: pPdf, envelope: pEnv },
      { toolId: S_ID, toolName: 'Kanalrechner', title: project.name, summary: '1 Berechnung', pdfBytes: sPdf, envelope: sEnv },
    ],
  });

  assert.ok(isPdf(dossierBytes));
  const outDoc = await PDFDocument.load(dossierBytes);
  assert.equal(outDoc.getPageCount(), 1 + pPages + sPages, 'cover page + all tool report pages');

  const extracted = await extractDataJson(dossierBytes);
  assert.ok(extracted, 'dossier data.json embedded');
  const parsed = parseEnvelope(extracted);
  assert.equal(parsed.tool, 'dossier');
  assert.equal(parsed.project.name, project.name);
  assert.equal(parsed.inputs.items.length, 2);

  const files = await readAttachments(dossierBytes);
  const names = files.map((f) => f.name);
  assert.ok(names.includes('data.json'));
  assert.ok(names.includes('01-duct-pressure-loss.json'));
  assert.ok(names.includes('02-duct-sizing.json'));
});

test('attachDataJson preserves an HLKS envelope on a plain PDF', async () => {
  const plain = await PDFDocument.create();
  plain.addPage([400, 400]);
  const plainBytes = await plain.save();
  assert.equal(await extractDataJson(plainBytes), null);

  const env = createEnvelope({ tool: P_ID, version: P_VER, calcVersion: P_CALC, project, inputs: { ok: true } });
  const patched = await attachDataJson(plainBytes, env);
  const back = parseEnvelope(await extractDataJson(patched));
  assert.equal(back.tool, P_ID);
  assert.deepEqual(back.inputs, { ok: true });
});

test('wrapSchemaEnvelope wraps hlks-schema into a valid hlks-tools envelope', () => {
  const schema = {
    format: 'hlks-schema',
    version: 1,
    meta: { title: 'Lüftung EG', project: 'Musterbau', author: 'FG', date: '2026-11-24', revision: 'A' },
    components: [],
    connections: [],
  };
  const env = parseEnvelope(wrapSchemaEnvelope(schema, 'lueftung-eg.schema'));
  assert.equal(env.tool, 'schema');
  assert.equal(env.project.name, 'Musterbau');
  assert.equal(env.snapshot.fileName, 'lueftung-eg.schema');
});
