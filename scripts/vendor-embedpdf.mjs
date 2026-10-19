// SPDX-License-Identifier: AGPL-3.0-or-later
// Vendor EmbedPDF (the <embedpdf-viewer> custom element, Apache-2.0) into lib/vendor/embedpdf/.
// Usage: node scripts/vendor-embedpdf.mjs [version]     default: the version in lib/vendor/embedpdf/VERSION
//
// Steps: fetch @embedpdf/viewer from the npm registry (integrity checked), copy only the files the
// self-contained snippet entry `dist/embedpdf.js` reaches (static and dynamic imports, worker and wasm
// URLs; the npm entries need a bundler and are left out), no source maps. Then two small patches
// (listed in lib/vendor/embedpdf/PATCHES.md) and the generated Swiss German string overrides
// tools/pdf-editor/viewer-strings.js. `npm test` (tests/pdf-editor.vendor.test.js) checks the result.

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchPackage } from './npm-package.mjs';

const ROOT = new URL('../', import.meta.url);
const OUT = new URL('lib/vendor/embedpdf/', ROOT);
const ENTRY = 'dist/embedpdf.js';

const version = process.argv[2] ?? (await readFile(new URL('VERSION', OUT), 'utf8')).trim();
console.log(`@embedpdf/viewer@${version}`);
const { meta, files } = await fetchPackage('@embedpdf/viewer', version);
if (meta.license !== 'Apache-2.0') throw new Error(`unexpected license ${meta.license}`);

// ---- module graph of the snippet entry ----------------------------------------------------------

const REFS = [
  /(?:^|[\s;}])(?:import|export)\s[^'"`;]*?from\s*["'](\.{1,2}\/[^"']+)["']/gm, // static
  /\bimport\s*\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g, // dynamic
  /new URL\(\s*["'](\.{1,2}\/[^"']+)["']\s*,\s*import\.meta\.url\s*\)/g, // assets (worker, wasm)
];

const keep = new Set();
const text = (path) => new TextDecoder().decode(files.get(path));
function walk(path) {
  if (keep.has(path)) return;
  if (!files.has(path)) throw new Error(`missing in package: ${path}`);
  keep.add(path);
  if (!path.endsWith('.js')) return;
  const src = text(path);
  for (const re of REFS) for (const m of src.matchAll(re)) walk(posix.normalize(posix.join(posix.dirname(path), m[1])));
}
walk(ENTRY);

// ---- patches ------------------------------------------------------------------------------------

const out = new Map([...keep].map((p) => [p.replace(/^dist\//, ''), files.get(p)]));
const patches = [];

/** Replace exactly one match of `re` in exactly one kept file. */
function patch(id, description, re, replace) {
  const hits = [...out.keys()].filter((p) => p.endsWith('.js') && re.test(new TextDecoder().decode(out.get(p))));
  if (hits.length !== 1) throw new Error(`patch ${id}: expected one file, found ${hits.length}`);
  const src = new TextDecoder().decode(out.get(hits[0]));
  const notice = `// Modified by HLKS-Tools (scripts/vendor-embedpdf.mjs, patch ${id}): ${description}\n`;
  out.set(hits[0], new TextEncoder().encode(notice + src.replace(re, replace)));
  patches.push({ id, file: hits[0], description });
}

// 1. The style panel's colour swatches are a constant. The page sets the annotation colours from
//    tokens.css (--annot-*) on globalThis before it loads the viewer; the original list stays the fallback.
patch(
  'swatches',
  'colour swatches from globalThis.HLKS_ANNOT_SWATCHES when set',
  /(\b[A-Za-z_$][\w$]*\s*=\s*)(\[\s*"#000000",\s*"#5f6368",\s*"#e44234",[^\]]*\])/,
  (_, head, list) => `${head}globalThis.HLKS_ANNOT_SWATCHES ?? ${list}`,
);

// ---- write ---------------------------------------------------------------------------------------

await rm(OUT, { recursive: true, force: true });
for (const [path, bytes] of out) {
  const target = new URL(path, OUT);
  await mkdir(dirname(fileURLToPath(target)), { recursive: true });
  await writeFile(target, bytes);
}
await writeFile(new URL('LICENSE', OUT), files.get('LICENSE'));
await writeFile(new URL('VERSION', OUT), `${version}\n`);
await writeFile(
  new URL('PATCHES.md', OUT),
  `# Changes to the vendored EmbedPDF\n\n` +
    `Package \`@embedpdf/viewer@${version}\` (Apache-2.0, see LICENSE), files reached from \`dist/embedpdf.js\`, no source maps.\n` +
    `Written by \`scripts/vendor-embedpdf.mjs\`. Each changed file starts with a comment naming its patch.\n\n` +
    patches.map((p) => `- \`${p.id}\` in \`${p.file}\`: ${p.description}.`).join('\n') +
    '\n',
);

// ---- Swiss German: overrides for every German string with ß ----------------------------------------

const deChunk = [...out.keys()].find((p) => /^chunks\/de-[^/]+\.js$/.test(p) && /\bexport\s*\{\s*\w+\s+as\s+de\s*\}/.test(new TextDecoder().decode(out.get(p))));
if (!deChunk) throw new Error('German translations not found');
const { de } = await import(new URL(deChunk, OUT));
const overrides = {};
(function collect(node, prefix) {
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string' && value.includes('ß')) overrides[path] = value.replaceAll('ß', 'ss');
    else if (value && typeof value === 'object') collect(value, path);
  }
})(de.translations, '');
await writeFile(
  new URL('tools/pdf-editor/viewer-strings.js', ROOT),
  `// SPDX-License-Identifier: AGPL-3.0-or-later\n` +
    `// GENERATED by scripts/vendor-embedpdf.mjs from EmbedPDF ${version}: German viewer strings in Swiss spelling (ss for ß).\n` +
    `// Do not edit; own words for the viewer go to labels.js (VIEWER_STRINGS).\n\n` +
    `export const SWISS_DE = ${JSON.stringify(overrides, null, 2)};\n`,
);

const bytes = [...out.values()].reduce((n, b) => n + b.length, 0);
console.log(`${out.size} files, ${(bytes / 1e6).toFixed(1)} MB, ${patches.length} patch(es), ${Object.keys(overrides).length} Swiss overrides`);
