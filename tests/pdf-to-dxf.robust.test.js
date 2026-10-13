// SPDX-License-Identifier: AGPL-3.0-or-later
// Phase 9: performance and robustness. 300 000 segments in under 15 s, 200 random option sets on every
// fixture give valid DXF files, error cases, real plans (when present), and MuPDF loads only in the worker.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createBackend, PdfError } from '../tools/pdf-to-dxf/backend.js';
import { createService } from '../tools/pdf-to-dxf/convert.js';
import * as D from '../tools/pdf-to-dxf/defaults.js';
import { readDxf } from './helpers/dxf-reader.js';
import { FIXTURES } from './helpers/truth.js';
import { heavyPdf } from './helpers/heavy-pdf.js';

const backend = await createBackend();
const svc = createService(backend);

test('300 000 segments: extract, pipeline and DXF in under 15 s', async () => {
  const { bytes, segments } = await heavyPdf({ segments: 300000 });
  assert.ok(segments >= 300000);
  const t0 = Date.now();
  svc.open({ bytes });
  const s = D.normalizeInputs(D.defaultSettings());
  const { value } = svc.export({ settings: s, name: 'heavy.pdf' }, {});
  const ms = Date.now() - t0;
  assert.ok(ms < 15000, `${ms} ms`);
  const dxf = readDxf(value.files[0].bytes);
  assert.deepEqual(dxf.errors, []);
  assert.ok(dxf.entities.length > 10000);
});

// ---- fuzz: random option combinations ----------------------------------------------------------------

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const VECTOR = ['lines', 'curves', 'layers', 'clip', 'text', 'hatch', 'dash', 'dupes', 'rotated', 'multipage'];

test('fuzz: 200 random option sets on the fixtures, every DXF passes the reader', async () => {
  const rand = mulberry32(20261012);
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const bytesOf = new Map();
  for (const name of [...VECTOR, 'scan_clean']) bytesOf.set(name, new Uint8Array(await readFile(new URL(`${name}.pdf`, FIXTURES))));
  let scans = 0;
  for (let run = 0; run < 200; run++) {
    const name = rand() < 0.05 && scans < 6 ? 'scan_clean' : pick(VECTOR);
    if (name === 'scan_clean') scans++;
    svc.open({ bytes: bytesOf.get(name) });
    const pages = backend.getPageCount();
    const raw = {
      ...D.defaultSettings(),
      scale: pick([1, 20, 50, 100, 500, 98.7, 1000]),
      unit: pick(D.UNITS),
      origin: pick(D.ORIGINS),
      version: pick(D.VERSIONS),
      trueColor: rand() < 0.5,
      join: rand() < 0.7,
      dedupe: rand() < 0.7,
      arcs: rand() < 0.7,
      curves: pick(D.CURVE_MODES),
      text: pick(D.TEXT_MODES),
      hatch: pick(D.HATCH_MODES),
      fills: pick(D.FILL_MODES),
      clip: pick(D.CLIP_MODES),
      dashes: pick(D.DASH_MODES),
      layerMode: pick(D.LAYER_MODES),
      hiddenLayers: rand() < 0.5,
      minLengthMm: pick([0, 0, 1, 20]),
      pages: pick(D.PAGE_MODES),
      page: Math.floor(rand() * pages),
      area: rand() < 0.2 ? [100, 100, 100 + rand() * 300, 100 + rand() * 500] : null,
      scanOn: name === 'scan_clean',
      scan: { dpi: 200, mode: pick(D.SCAN_MODES), snapDeg: pick([0, 2, 5]) },
      tol: { join: pick([0.01, 0.05, 0.5]), arc: pick([0.005, 0.02, 0.2]), flatten: pick([0.01, 0.05, 0.5]) },
    };
    const s = D.normalizeInputs(raw);
    const { value } = svc.export({ settings: s, name: `${name}.pdf` }, {});
    assert.ok(value.files.length >= 1, `${name} run ${run}`);
    for (const f of value.files) {
      const dxf = readDxf(f.bytes);
      assert.deepEqual(dxf.errors, [], `${name} run ${run}: ${JSON.stringify(s)}`);
      assert.equal(dxf.version, s.version === 'R12' ? 'AC1009' : 'AC1015');
    }
  }
});

// ---- error cases ------------------------------------------------------------------------------------

test('errors: empty, damaged, password, page without content', async () => {
  const code = (fn) => {
    try {
      fn();
    } catch (e) {
      return e instanceof PdfError ? e.code : `other: ${e.message}`;
    }
    return null;
  };
  assert.equal(code(() => svc.open({ bytes: new Uint8Array(0) })), 'damaged');
  assert.equal(code(() => svc.open({ bytes: new TextEncoder().encode('%PDF-1.7\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF') })), 'empty');
  const truncated = (await readFile(new URL('lines.pdf', FIXTURES))).subarray(0, 300);
  const c = code(() => svc.open({ bytes: truncated }));
  assert.ok(c === 'damaged' || c === 'empty', `truncated: ${c}`);

  // encrypted with a user password, written by MuPDF
  const mupdf = await import('../lib/vendor/mupdf/mupdf.js');
  const doc = new mupdf.PDFDocument(await readFile(new URL('lines.pdf', FIXTURES)));
  const locked = doc.saveToBuffer('encrypt=aes-256,user-password=geheim,owner-password=chef').asUint8Array();
  assert.equal(code(() => svc.open({ bytes: locked })), 'password');
  // only an owner password: opens
  const owner = doc.saveToBuffer('encrypt=aes-128,owner-password=chef').asUint8Array();
  assert.equal(code(() => svc.open({ bytes: owner })), null);

  // a blank page: no entities, still a valid DXF
  const { PDFDocument } = await import('../lib/vendor/pdf-lib/pdf-lib.esm.min.js');
  const blank = await PDFDocument.create();
  blank.addPage([595.28, 841.89]);
  svc.open({ bytes: await blank.save() });
  const r = svc.process({ settings: D.defaultSettings() }, {}).value;
  assert.equal(r.buckets.length, 0);
  const dxf = readDxf(svc.export({ settings: D.defaultSettings(), name: 'leer.pdf' }, {}).value.files[0].bytes);
  assert.deepEqual(dxf.errors, []);
  assert.equal(dxf.entities.length, 0);
  // page index out of range
  assert.equal(code(() => svc.process({ settings: { ...D.defaultSettings(), page: 3 } }, {})), 'page');
});

test('cancel: a cancelled job stops between steps', async () => {
  svc.open({ bytes: new Uint8Array(await readFile(new URL('hatch.pdf', FIXTURES))) });
  assert.throws(() => svc.process({ settings: D.defaultSettings() }, { isCancelled: () => true }), (e) => e.code === 'cancelled');
});

// ---- real plans (tests/fixtures/pdf-to-dxf/real/, not committed) ------------------------------------

test('real plans: every PDF in real/ converts to a valid DXF', async (t) => {
  let files = [];
  try {
    files = (await readdir(new URL('real/', FIXTURES))).filter((f) => /\.pdf$/i.test(f));
  } catch {
    /* no folder */
  }
  if (!files.length) {
    t.skip('no real plans in tests/fixtures/pdf-to-dxf/real/');
    return;
  }
  for (const f of files) {
    svc.open({ bytes: new Uint8Array(await readFile(new URL(`real/${f}`, FIXTURES))) });
    const { value } = svc.export({ settings: { ...D.defaultSettings(), pages: 'each' }, name: f }, {});
    for (const out of value.files) assert.deepEqual(readDxf(out.bytes).errors, [], f);
  }
});

// ---- relative paths only (the site runs under a sub-path on GitHub Pages) ------------------------------

test('no absolute paths in the site (src="/", href="/", fetch("/"), url(/), imports from "/")', async () => {
  const root = new URL('../', import.meta.url);
  const files = ['index.html'];
  for (const dir of ['assets/css', 'assets/js', 'lib/core']) for (const f of await readdir(new URL(`${dir}/`, root))) files.push(`${dir}/${f}`);
  for (const t of await readdir(new URL('tools/', root))) for (const f of await readdir(new URL(`tools/${t}/`, root), { withFileTypes: true })) if (f.isFile()) files.push(`tools/${t}/${f.name}`);
  const bad = /(?:src|href)=["']\/(?!\/)|fetch\(\s*['"`]\/(?!\/)|url\(\s*['"]?\/(?!\/)|from\s+['"]\/|import\(\s*['"`]\/(?!\/)/;
  for (const f of files.filter((f) => /\.(html|js|css)$/.test(f))) {
    const src = await readFile(new URL(f, root), 'utf8');
    assert.doesNotMatch(src, bad, f);
  }
});

// ---- loading: MuPDF only in the worker -----------------------------------------------------------------

/** Static imports of a module and everything it imports (relative paths only). */
async function importGraph(url, seen = new Set()) {
  if (seen.has(url.href)) return seen;
  seen.add(url.href);
  const src = await readFile(url, 'utf8');
  for (const m of src.matchAll(/^\s*import\s[^'"]*?from\s+['"](\.[^'"]+)['"]/gm)) await importGraph(new URL(m[1], url), seen);
  for (const m of src.matchAll(/^\s*import\s+['"](\.[^'"]+)['"]/gm)) await importGraph(new URL(m[1], url), seen);
  return seen;
}

test('start page and tool pages do not load MuPDF; the PDF → DXF page loads it only in its worker', async () => {
  const root = new URL('../', import.meta.url);
  const pages = [new URL('assets/js/home.js', root)];
  for (const t of await readdir(new URL('tools/', root))) pages.push(new URL(`tools/${t}/app.js`, root));
  for (const p of pages) {
    const graph = [...(await importGraph(p))];
    assert.ok(!graph.some((u) => u.includes('/lib/vendor/mupdf/') || u.endsWith('/backend.js')), `${p.pathname} must not import MuPDF statically`);
  }
  const workerGraph = [...(await importGraph(new URL('tools/pdf-to-dxf/worker.js', root)))];
  assert.ok(workerGraph.some((u) => u.endsWith('/backend.js')));
  const backendSrc = await readFile(new URL('tools/pdf-to-dxf/backend.js', root), 'utf8');
  assert.match(backendSrc, /await import\('\.\.\/\.\.\/lib\/vendor\/mupdf\/mupdf\.js'\)/, 'MuPDF is imported lazily');
});
