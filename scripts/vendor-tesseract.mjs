// SPDX-License-Identifier: AGPL-3.0-or-later
// Vendor tesseract.js (OCR, Apache-2.0) with its WebAssembly core and the German and English models into
// lib/vendor/tesseract/. Usage: node scripts/vendor-tesseract.mjs
//
// Files (no source maps, unchanged):
//   tesseract.esm.min.js, worker.min.js (+ their third-party notices)   npm tesseract.js
//   core/tesseract-core-simd-lstm.wasm.js, core/tesseract-core-lstm.wasm.js  npm tesseract.js-core (LSTM only,
//                                                                        with and without SIMD, wasm inlined)
//   lang/deu.traineddata.gz, lang/eng.traineddata.gz                    tessdata_fast (GitHub, pinned commit)
// npm packages are checked against the registry's integrity hash, the models against the SHA-256 below.
// `npm test` (tests/pdf-editor.vendor.test.js, tests/pdf-editor.ocr.test.js) checks the result.

import { createHash } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { fetchPackage } from './npm-package.mjs';

const TESSERACT = '7.0.0';
const CORE = '7.0.0';
const TESSDATA = {
  repo: 'tesseract-ocr/tessdata_fast',
  tag: '4.1.0',
  commit: '65727574dfcd264acbb0c3e07860e4e9e9b22185',
  files: {
    deu: '19d219bbb6672c869d20a9636c6816a81eb9a71796cb93ebe0cb1530e2cdb22d',
    eng: '7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2',
  },
};

const OUT = new URL('../lib/vendor/tesseract/', import.meta.url);
const out = new Map(); // path → bytes

const js = await fetchPackage('tesseract.js', TESSERACT);
if (js.meta.license !== 'Apache-2.0') throw new Error(`tesseract.js: unexpected license ${js.meta.license}`);
const wanted = js.meta.dependencies?.['tesseract.js-core'] ?? '';
if (!wanted.replace(/^\^/, '').startsWith(CORE.split('.')[0])) throw new Error(`tesseract.js ${TESSERACT} wants core ${wanted}, not ${CORE}`);
for (const p of ['dist/tesseract.esm.min.js', 'dist/worker.min.js', 'dist/tesseract.min.js.LICENSE.txt', 'dist/worker.min.js.LICENSE.txt']) {
  if (!js.files.has(p)) throw new Error(`tesseract.js: missing ${p}`);
  out.set(p.replace(/^dist\//, ''), js.files.get(p));
}
out.set('LICENSE', js.files.get('LICENSE.md'));

const core = await fetchPackage('tesseract.js-core', CORE);
if (core.meta.license !== 'Apache-2.0') throw new Error(`tesseract.js-core: unexpected license ${core.meta.license}`);
for (const p of ['tesseract-core-simd-lstm.wasm.js', 'tesseract-core-lstm.wasm.js', 'LICENSE']) {
  if (!core.files.has(p)) throw new Error(`tesseract.js-core: missing ${p}`);
  out.set(`core/${p}`, core.files.get(p));
}

const raw = (file) => `https://raw.githubusercontent.com/${TESSDATA.repo}/${TESSDATA.commit}/${file}`;
for (const [lang, sha] of Object.entries(TESSDATA.files)) {
  const res = await fetch(raw(`${lang}.traineddata`));
  if (!res.ok) throw new Error(`${lang}.traineddata: ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== sha) throw new Error(`${lang}.traineddata: SHA-256 ${actual}, expected ${sha}`);
  out.set(`lang/${lang}.traineddata.gz`, gzipSync(bytes, { level: 9 })); // no file time: the same bytes every run
}
const license = await fetch(raw('LICENSE'));
if (!license.ok) throw new Error(`tessdata LICENSE: ${license.status}`);
out.set('lang/LICENSE', new Uint8Array(await license.arrayBuffer()));

out.set(
  'VERSION',
  new TextEncoder().encode(
    `tesseract.js ${TESSERACT}\ntesseract.js-core ${CORE}\ntessdata_fast ${TESSDATA.tag} ${TESSDATA.commit} (${Object.keys(TESSDATA.files).join(', ')})\n`,
  ),
);

await rm(OUT, { recursive: true, force: true });
for (const [path, bytes] of out) {
  const target = new URL(path, OUT);
  await mkdir(new URL('.', target), { recursive: true });
  await writeFile(target, bytes);
}
const size = [...out.values()].reduce((n, b) => n + b.length, 0);
console.log(`${out.size} files, ${(size / 1e6).toFixed(1)} MB`);
