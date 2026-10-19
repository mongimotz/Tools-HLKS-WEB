// SPDX-License-Identifier: AGPL-3.0-or-later
// PDF-Editor symbols and stamps: SVG sanitising, placeholders, the SVG renderer, the built-in symbol
// libraries (current with their sources), the stamp library with IBM Plex text, own symbols in the engine.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as mupdf from '../lib/vendor/mupdf/mupdf.js';
import { sanitizeSvg, fillPlaceholders, svgToPdf, svgSize, buildLibrary, readLibrary, pageHasInk, SvgError } from '../tools/pdf-editor/svg.js';
import { parsePath, parseTransform, parseColor, length, renderSvg } from '../tools/pdf-editor/svg-render.js';
import { buildStampLibrary, ownStampSvg, STAMP_LIBRARY_ID } from '../tools/pdf-editor/stamps.js';
import { createEngine } from '../tools/pdf-editor/engine.js';
import { symbolCategories, buildCategory } from '../scripts/build-symbol-library.mjs';

const ROOT = new URL('../', import.meta.url);
const readAsset = async (p) => new Uint8Array(await readFile(new URL(p, ROOT)));
const fonts = { regular: await readAsset('assets/fonts/pdf/sans-400.ttf'), semibold: await readAsset('assets/fonts/pdf/sans-600.ttf') };
const textOf = (pdf, page = 0) => mupdf.Document.openDocument(pdf, 'application/pdf').loadPage(page).toStructuredText().asText();

test('sanitizeSvg removes scripts, handlers, foreign content, external references and DTDs', () => {
  const dirty = `<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY x "boom">]>
    <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" onload="alert(1)" width="10mm" height="10mm">
      <script>alert(2)</script><script src="https://evil.example/x.js"/>
      <foreignObject><iframe src="https://evil.example"></iframe></foreignObject>
      <style>@import url(https://evil.example/a.css); .a { fill: url(https://evil.example/p.svg#g) }</style>
      <a href="javascript:alert(3)"><rect class="a" width="5" height="5" onclick="alert(4)" ONMOUSEOVER='x()'/></a>
      <image xlink:href="https://evil.example/i.png" width="5" height="5"/>
      <image href="data:image/png;base64,iVBORw0KGgo=" width="5" height="5"/>
      <use href="#keep"/><animate attributeName="href" to="https://evil.example"/><set attributeName="x" to="1"/>
    </svg>`;
  const clean = sanitizeSvg(dirty);
  for (const bad of [/<script/i, /alert/i, /foreignObject/i, /iframe/i, /@import/i, /evil\.example/, /onload|onclick|onmouseover/i, /<!DOCTYPE|<!ENTITY/i, /<animate|<set/i, /javascript:/i]) {
    assert.doesNotMatch(clean, bad, String(bad));
  }
  assert.match(clean, /data:image\/png;base64/);
  assert.match(clean, /href="#keep"/);
  assert.throws(() => sanitizeSvg('<html><body>no</body></html>'), SvgError);
});

test('fillPlaceholders escapes values, sets the colour and drops an empty separator', () => {
  const svg = '<svg><text fill="currentColor">{name} | {datum}</text><text>{text}</text></svg>';
  assert.equal(fillPlaceholders(svg, { name: 'A & <B>', datum: '05.10.2026', text: 'x' }, '#d42a20'), '<svg><text fill="#d42a20">A &amp; &lt;B&gt; | 05.10.2026</text><text>x</text></svg>');
  assert.equal(fillPlaceholders(svg, { datum: '05.10.2026' }), '<svg><text fill="#000000">05.10.2026</text><text></text></svg>');
});

test('svg-render: path commands, packed arc flags, transforms, lengths, colours', () => {
  assert.deepEqual(parsePath('M10 10 h5 v5 z'), [['M', 10, 10], ['L', 15, 10], ['L', 15, 15], ['Z']]);
  const arc = parsePath('M0 0a5 5 0 0110 0'); // packed flags: large 0, sweep 1, to (10, 0)
  assert.deepEqual(arc.at(-1).slice(-2).map((v) => Math.round(v * 1e6) / 1e6), [10, 0]);
  assert.ok(arc.length >= 3, 'half circle as at least two cubics');
  const q = parsePath('M0 0 Q5 10 10 0 T20 0');
  assert.equal(q.length, 3);
  assert.deepEqual(q[2].slice(-2), [20, 0]);
  const s = parsePath('M0 0 C0 5 5 5 5 0 S10 -5 10 0');
  assert.deepEqual(s[2].slice(1, 3), [5, -5], 'S reflects the last control point');
  assert.deepEqual(parseTransform('translate(10 20) scale(2)'), [2, 0, 0, 2, 10, 20]);
  const r = parseTransform('rotate(90 10 10)');
  assert.deepEqual(r.map((v) => Math.round(v * 1e9) / 1e9), [0, 1, -1, 0, 20, 0]);
  assert.equal(Math.round(length('25.4mm') * 1e6) / 1e6, 96);
  assert.equal(length('50%', 200), 100);
  assert.deepEqual(parseColor('#f00'), [1, 0, 0]);
  assert.deepEqual(parseColor('rgb(0, 128, 255)').map((v) => Math.round(v * 255)), [0, 128, 255]);
  assert.equal(parseColor('none'), 'none');
  assert.deepEqual(parseColor('currentColor', [0, 1, 0]), [0, 1, 0]);
});

test('svg-render: size from width/height in mm, viewBox mapping, text through the encoder', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="20mm" height="10mm" viewBox="0 0 80 40"><rect x="2" y="2" width="76" height="36" rx="4" fill="none" stroke="#000" stroke-width="2"/><text x="40" y="26" text-anchor="middle" font-size="16">Zuluft Ø 250</text></svg>';
  assert.deepEqual(Object.values(svgSize(svg)).map((v) => Math.round(v * 100) / 100), [56.69, 28.35]);
  const calls = [];
  const r = renderSvg(svg, { text: (str, bold) => (calls.push([str, bold]), { hex: '0001', width: 5 }) });
  assert.equal(Math.round(r.width * 100) / 100, 56.69);
  assert.deepEqual(calls, [['Zuluft Ø 250', false]]);
  assert.match(r.content, /\/F1 16 Tf/);
  assert.match(r.content, / c\n/, 'rounded corners as curves');
});

test('svgToPdf: vector page of the SVG size, Plex text is searchable, empty input fails', () => {
  const pdf = svgToPdf(mupdf, '<svg xmlns="http://www.w3.org/2000/svg" width="40mm" height="10mm" viewBox="0 0 160 40"><path d="M5 20 H155" stroke="black" stroke-width="2"/><text x="10" y="30" font-size="14" font-weight="600">Prüfen Δp ≤ 50 Pa</text></svg>', { fonts });
  const doc = mupdf.Document.openDocument(pdf, 'application/pdf');
  const [x0, y0, x1, y1] = doc.loadPage(0).getBounds();
  assert.deepEqual([Math.round(x1 - x0), Math.round(y1 - y0)], [113, 28]);
  assert.match(textOf(pdf), /Prüfen Δp ≤ 50 Pa/);
  assert.ok(pageHasInk(mupdf, pdf));
  assert.throws(() => svgToPdf(mupdf, '<svg width="0" height="0"></svg>'), SvgError);
});

test('every built-in symbol draws a non-empty page; the library PDFs are current with their sources', async () => {
  const index = JSON.parse(await readFile(new URL('tools/pdf-editor/symbols/libraries.json', ROOT), 'utf8'));
  const cats = await symbolCategories();
  assert.equal(cats.reduce((n, c) => n + c.symbols.length, 0), 25);
  for (const cat of cats) {
    const lib = await readFile(new URL(`tools/pdf-editor/symbols/${cat.file}`, ROOT));
    const info = readLibrary(mupdf, lib);
    assert.equal(info.source, cat.source, `${cat.file} is older than its sources: node scripts/build-symbol-library.mjs`);
    assert.equal(info.title, cat.title);
    assert.deepEqual(info.entries.map((e) => e.id), cat.symbols.map((s) => s.id));
    assert.deepEqual(info.entries.map((e) => e.label), cat.symbols.map((s) => s.name));
    assert.equal(index.libraries.find((l) => l.file === cat.file)?.source, cat.source, 'libraries.json is current');
    for (let i = 0; i < info.pages; i++) assert.ok(pageHasInk(mupdf, lib, i), `${cat.symbols[i].id} draws something`);
    const pageSize = mupdf.Document.openDocument(lib, 'application/pdf').loadPage(0).getBounds();
    assert.equal(Math.round(pageSize[2] - pageSize[0]), 34, '12 mm');
  }
  // the build is deterministic enough to reproduce the same registry
  assert.deepEqual(readLibrary(mupdf, buildCategory(cats[0])).entries, readLibrary(mupdf, await readFile(new URL(`tools/pdf-editor/symbols/${cats[0].file}`, ROOT))).entries);
});

test('manifest: every symbol has id, name, category, file and norm reference', async () => {
  const { symbols } = JSON.parse(await readFile(new URL('tools/pdf-editor/symbols/manifest.json', ROOT), 'utf8'));
  const ids = new Set();
  for (const s of symbols) {
    for (const k of ['id', 'name', 'category', 'file', 'norm']) assert.ok(s[k], `${s.id}: ${k}`);
    assert.ok(!ids.has(s.id), `unique ${s.id}`);
    ids.add(s.id);
    assert.match(await readFile(new URL(`tools/pdf-editor/symbols/${s.file}`, ROOT), 'utf8'), /currentColor/, `${s.id} is monochrome`);
  }
});

test('stamp library: templates and own stamps with name and date in Plex, one page each', async () => {
  const manifest = JSON.parse(await readFile(new URL('tools/pdf-editor/stamps/manifest.json', ROOT), 'utf8'));
  const templates = await Promise.all(manifest.stamps.map(async (t) => ({ ...t, svg: await readFile(new URL(`tools/pdf-editor/stamps/${t.file}`, ROOT), 'utf8') })));
  const colors = ['#d42a20', '#0072b2', '#009e73', '#f0e442', '#000000', '#e69f00', '#cc79a7', '#56b4e9', '#ffffff'];
  const pdf = buildStampLibrary(mupdf, { templates, own: [{ id: 'a', text: 'Ausgeführt', color: 2, frame: 'round' }], values: { name: 'F. Muster', datum: '05.10.2026' }, colors, fonts, source: 'x' });
  const info = readLibrary(mupdf, pdf);
  assert.deepEqual(info.entries.map((e) => e.label), ['Geprüft', 'Freigegeben', 'Entwurf', 'Ungültig', 'Zur Kenntnis', 'Ausgeführt']);
  assert.equal(info.pages, 6);
  assert.match(textOf(pdf, 0), /Geprüft\s+F\. Muster \| 05\.10\.2026/);
  assert.match(textOf(pdf, 2), /Entwurf\s+05\.10\.2026/);
  assert.match(textOf(pdf, 5), /Ausgeführt/);
  const lib = new mupdf.PDFDocument(pdf);
  assert.equal(lib.getTrailer().get('Root', 'PieceInfo', 'EMBD_StampLibrary', 'Private', 'Id').asString(), STAMP_LIBRARY_ID);
  assert.match(ownStampSvg({ text: 'Sehr langer eigener Stempeltext', frame: 'none' }, (s) => s.length * 0.6), /viewBox="0 0 (\d+) 64"/);
});

test('engine: own SVG symbol through the worker operation, unreadable SVG is an error', async () => {
  const { ops } = await createEngine({ readAsset });
  const { value } = await ops.svgPage({ svg: '<svg xmlns="http://www.w3.org/2000/svg" width="10mm" height="10mm" viewBox="0 0 10 10"><script>x</script><circle cx="5" cy="5" r="4" fill="none" stroke="black"/></svg>' });
  assert.ok(pageHasInk(mupdf, value));
  await assert.rejects(ops.svgPage({ svg: 'not an svg' }), (e) => e.code === 'not-svg');
  const lib = buildLibrary(mupdf, [{ id: 'a', label: 'A', pdf: value }], { title: 'T', libraryId: 'id', source: 's' });
  assert.equal(readLibrary(mupdf, lib).entries[0].label, 'A');
});
