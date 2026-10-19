// SPDX-License-Identifier: AGPL-3.0-or-later
// Heavy third-party code loads only where AGENTS.md allows it, and only on demand (`await import()`):
//   MuPDF (10 MB wasm)   tools/pdf-to-dxf/worker.js → backend.js, tools/pdf-editor/worker.js → engine.js
//   EmbedPDF (16 MB)     tools/pdf-editor/ only (bridge.js), when the editor page starts
//   tesseract.js         tools/pdf-editor/ only (ocr.js, inside the editor's worker), on the first OCR
// No page module (start page, tool app.js) imports any of them statically.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const ROOT = new URL('../', import.meta.url);
const rel = (url) => url.href.slice(ROOT.href.length);

/** Where each heavy library may be named in site code (relative to the repository root). */
const ALLOWED = {
  mupdf: ['tools/pdf-to-dxf/backend.js', 'tools/pdf-editor/engine.js'],
  embedpdf: ['tools/pdf-editor/bridge.js'],
  tesseract: ['tools/pdf-editor/ocr.js'],
};
const WORKERS = { 'tools/pdf-to-dxf/worker.js': 'tools/pdf-to-dxf/backend.js', 'tools/pdf-editor/worker.js': 'tools/pdf-editor/engine.js' };

/** Static imports of a module and everything it imports (relative paths only). */
async function importGraph(url, seen = new Set()) {
  if (seen.has(url.href)) return seen;
  seen.add(url.href);
  const src = await readFile(url, 'utf8');
  for (const m of src.matchAll(/^\s*import\s[^'"]*?from\s+['"](\.[^'"]+)['"]/gm)) await importGraph(new URL(m[1], url), seen);
  for (const m of src.matchAll(/^\s*import\s+['"](\.[^'"]+)['"]/gm)) await importGraph(new URL(m[1], url), seen);
  return seen;
}

/** Own site modules: start page, shared core and every tool folder (tests and Node scripts excluded). */
async function siteModules() {
  const files = [];
  const walk = async (dir) => {
    for (const e of await readdir(new URL(dir, ROOT), { withFileTypes: true })) {
      if (e.isDirectory()) await walk(`${dir}${e.name}/`);
      else if (/\.(js|mjs|html)$/.test(e.name)) files.push(`${dir}${e.name}`);
    }
  };
  for (const dir of ['assets/js/', 'lib/core/', 'tools/']) await walk(dir);
  return [...files, 'index.html'];
}

/** String literals in code (comments removed) that name a vendored library folder. */
function namedLibraries(src) {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  const found = new Set();
  for (const m of code.matchAll(/['"`][^'"`\n]*lib\/vendor\/(mupdf|embedpdf|tesseract)\/[^'"`\n]*['"`]/g)) found.add(m[1]);
  return found;
}

test('page modules do not import MuPDF, EmbedPDF or tesseract statically', async () => {
  const pages = [new URL('assets/js/home.js', ROOT)];
  for (const t of await readdir(new URL('tools/', ROOT))) pages.push(new URL(`tools/${t}/app.js`, ROOT));
  // bridge.js may be imported: it loads EmbedPDF itself on demand. The MuPDF and OCR modules belong in workers.
  const workerOnly = [...ALLOWED.mupdf, ...ALLOWED.tesseract];
  const heavy = (u) => /\/lib\/vendor\/(mupdf|embedpdf|tesseract)\//.test(u) || workerOnly.some((f) => u.endsWith(f));
  for (const p of pages) {
    const graph = [...(await importGraph(p))];
    assert.deepEqual(graph.filter(heavy), [], `${rel(p)} must not import heavy libraries statically`);
  }
});

test('heavy libraries are named only in their allowed modules, each loaded with await import()', async () => {
  for (const file of await siteModules()) {
    const src = await readFile(new URL(file, ROOT), 'utf8');
    for (const lib of namedLibraries(src)) {
      assert.ok(ALLOWED[lib].includes(file), `${file} must not load ${lib} (allowed: ${ALLOWED[lib].join(', ')})`);
      assert.match(src, /await import\(/, `${file} loads ${lib} with await import()`);
      assert.doesNotMatch(src, new RegExp(`^\\s*import\\s[^;]*lib/vendor/${lib}/`, 'm'), `${file}: no static import of ${lib}`);
    }
  }
});

test('each tool worker reaches its MuPDF module, and only workers do', async () => {
  for (const [worker, backend] of Object.entries(WORKERS)) {
    const url = new URL(worker, ROOT);
    const graph = [...(await importGraph(url))].map((u) => u.slice(ROOT.href.length));
    assert.ok(graph.includes(backend), `${worker} imports ${backend}`);
  }
});
