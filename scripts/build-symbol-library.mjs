// SPDX-License-Identifier: AGPL-3.0-or-later
// Build the PDF-Editor's schema symbol libraries from tools/pdf-editor/symbols/*.svg (manifest.json):
//   node scripts/build-symbol-library.mjs
// One stamp library PDF per category (symbols/<category>.pdf, one page per symbol, page size = symbol size,
// black), and symbols/libraries.json for the page. Commit the result: there is no build step at runtime.
// Each PDF carries a fingerprint of its sources (SVGs, manifest entries, renderer); tests/pdf-editor.svg.test.js
// fails when a PDF is older than its sources.

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as mupdf from '../lib/vendor/mupdf/mupdf.js';
import { sanitizeSvg, fillPlaceholders, svgToPdf, buildLibrary } from '../tools/pdf-editor/svg.js';

const DIR = new URL('../tools/pdf-editor/symbols/', import.meta.url);
const RENDERER = ['../tools/pdf-editor/svg.js', '../tools/pdf-editor/svg-render.js'].map((p) => new URL(p, import.meta.url));
const SLUG = { 'Lüftung': 'lueftung', 'Heizung': 'heizung', 'Sanitär': 'sanitaer', 'Allgemein': 'allgemein' };

const slug = (category) => SLUG[category] ?? category.toLowerCase().normalize('NFD').replace(/[^\w]+/g, '-');

/** Categories in manifest order with their symbols, SVG texts and source fingerprint. */
export async function symbolCategories() {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', DIR), 'utf8'));
  const renderer = (await Promise.all(RENDERER.map((u) => readFile(u, 'utf8')))).join('\n');
  const cats = new Map();
  for (const s of manifest.symbols) {
    if (!cats.has(s.category)) cats.set(s.category, []);
    cats.get(s.category).push({ ...s, svg: await readFile(new URL(s.file, DIR), 'utf8') });
  }
  return [...cats].map(([category, symbols]) => {
    const hash = createHash('sha256').update(renderer);
    for (const s of symbols) hash.update(JSON.stringify({ id: s.id, name: s.name, file: s.file })).update(s.svg);
    const id = slug(category);
    return { category, id, libraryId: `hlks-symbole-${id}`, title: `Symbole ${category}`, file: `${id}.pdf`, source: hash.digest('hex').slice(0, 16), symbols };
  });
}

/** The library PDF of one category. */
export function buildCategory(cat) {
  const items = cat.symbols.map((s) => ({ id: s.id, label: s.name, pdf: svgToPdf(mupdf, fillPlaceholders(sanitizeSvg(s.svg), {}, '#000000')) }));
  return buildLibrary(mupdf, items, { title: cat.title, libraryId: cat.libraryId, source: cat.source });
}

async function main() {
  const cats = await symbolCategories();
  for (const cat of cats) await writeFile(new URL(cat.file, DIR), buildCategory(cat));
  const index = cats.map(({ id, libraryId, title, file, source, symbols }) => ({ id, libraryId, title, file, source, count: symbols.length }));
  await writeFile(new URL('libraries.json', DIR), `${JSON.stringify({ libraries: index }, null, 2)}\n`);
  console.log(index.map((c) => `${c.file}: ${c.count}`).join(', '));
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await main();
else if (fileURLToPath(import.meta.url) === process.argv[1]) await main();
