// SPDX-License-Identifier: AGPL-3.0-or-later
// Convert a PDF to DXF from the command line with the same code as the tool (developer and test use).
//   node scripts/pdf-to-dxf.mjs plan.pdf [--out dir] [--preset nova|geometry|compat] [--scale 100]
//        [--unit mm|cm|m] [--version R2000|R12] [--pages current|each|sideBySide] [--page 1] [--json]
// Prints one line of statistics per page (or JSON with --json) and writes the DXF files.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { createBackend } from '../tools/pdf-to-dxf/backend.js';
import { createService, looksScanned, pageWarnings } from '../tools/pdf-to-dxf/convert.js';
import { defaultSettings, normalizeInputs, applyPreset } from '../tools/pdf-to-dxf/defaults.js';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const input = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
if (!input) {
  console.log('usage: node scripts/pdf-to-dxf.mjs plan.pdf [--out dir] [--preset nova] [--scale 100] [--unit mm] [--version R2000] [--pages current] [--page 1] [--json]');
  process.exit(2);
}

let s = applyPreset(defaultSettings(), opt('preset', 'nova'));
s = normalizeInputs({
  ...s,
  scale: Number(opt('scale', s.scale)),
  unit: opt('unit', s.unit),
  version: opt('version', s.version),
  pages: opt('pages', s.pages),
  page: Number(opt('page', 1)) - 1,
  scanOn: args.includes('--scan'),
});

const svc = createService(await createBackend());
const t0 = Date.now();
const { value: info } = svc.open({ bytes: new Uint8Array(await readFile(input)) });
const report = { file: basename(input), pages: [], ms: 0 };
const indices = s.pages === 'current' ? [s.page] : [...Array(info.pageCount).keys()];
for (const i of indices) {
  const t = Date.now();
  const r = svc.processPage(i, { ...s, page: i }, {});
  report.pages.push({
    page: i + 1,
    size: [Math.round(r.page.width), Math.round(r.page.height)],
    before: r.stats.before,
    segmentsBefore: r.stats.segmentsBefore,
    after: r.stats.after,
    segmentsAfter: r.stats.segmentsAfter,
    byKind: r.stats.byKind,
    layers: r.layers.length,
    hatchLines: r.stats.hatchLines ?? 0,
    texts: r.page.stats.texts,
    unmapped: r.page.stats.unmapped,
    scanned: looksScanned(r.page),
    warnings: pageWarnings(r.page, s, r.scan).map((w) => w.code),
    ms: Date.now() - t,
  });
}
const out = resolve(opt('out', '.'));
await mkdir(out, { recursive: true });
const { value } = svc.export({ settings: s, name: basename(input) });
for (const f of value.files) await writeFile(join(out, f.name), f.bytes);
report.files = value.files.map((f) => `${f.name} (${(f.bytes.length / 1024).toFixed(0)} kB)`);
report.ms = Date.now() - t0;

if (args.includes('--json')) console.log(JSON.stringify(report, null, 1));
else {
  for (const p of report.pages) {
    console.log(
      `${report.file} p${p.page} ${p.size.join('×')} pt: ${p.before} → ${p.after} entities (${p.segmentsBefore} → ${p.segmentsAfter} segments), ` +
        `${p.layers} layers, ${p.hatchLines} hatch lines, ${p.texts} texts${p.unmapped ? ` (${p.unmapped} unmapped)` : ''}` +
        `${p.warnings.length ? `, warnings: ${p.warnings.join(' ')}` : ''}, ${p.ms} ms`,
    );
  }
  console.log(`${report.files.join(', ')} in ${report.ms} ms`);
}
