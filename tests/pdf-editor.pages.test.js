// SPDX-License-Identifier: AGPL-3.0-or-later
// PDF-Editor page selection and overlays: range parser (also invalid input), split groups, extract and
// split order, page-number and header/footer templates, positions on rotated and cropped pages.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as mupdf from '../lib/vendor/mupdf/mupdf.js';
import { parseRanges, everyN, oddEven, groupFileName, fillTemplate, placeBox, margins, tileCenters, extractPages } from '../tools/pdf-editor/pages.js';
import { createEngine } from '../tools/pdf-editor/engine.js';
import { unzip } from '../tools/pdf-editor/zip.js';

const ROOT = new URL('../', import.meta.url);
const readAsset = async (p) => new Uint8Array(await readFile(new URL(p, ROOT)));
const fixture = (name) => readAsset(`tests/fixtures/pdf-editor/${name}`);
const { ops } = await createEngine({ readAsset });
const openPdf = (bytes) => mupdf.Document.openDocument(bytes, 'application/pdf');
/** Words on a page with their position as the viewer shows it (top left origin). */
function words(bytes, page = 0) {
  const out = [];
  const st = openPdf(bytes).loadPage(page).toStructuredText();
  st.walk({ beginLine: () => out.push({ text: '', bbox: null }), onChar: (c, origin, font, size, quad) => {
    const w = out.at(-1);
    w.text += c;
    w.bbox ??= quad;
  } });
  return out.filter((w) => w.text.trim()).map((w) => ({ text: w.text.trim(), x: w.bbox[0], y: w.bbox[1] }));
}

test('parseRanges: single pages, ranges, open ranges, separators, order of groups, errors', () => {
  assert.deepEqual(parseRanges('1-3, 5, 8-', 10), { pages: [0, 1, 2, 4, 7, 8, 9], groups: [[0, 1, 2], [4], [7, 8, 9]], errors: [] });
  assert.deepEqual(parseRanges(' -2 ; 4 ', 5).pages, [0, 1, 3]);
  assert.deepEqual(parseRanges('5, 1-2', 5).groups, [[4], [0, 1]], 'groups keep input order');
  assert.deepEqual(parseRanges('', 3).pages, [0, 1, 2], 'empty = every page');
  assert.deepEqual(parseRanges('3–4', 5).pages, [2, 3], 'en dash');
  for (const bad of ['0', '6', '4-2', 'a', '1-x', '2-9', '-', '1.5']) assert.deepEqual(parseRanges(bad, 5).errors, [bad], bad);
  assert.deepEqual(parseRanges('1, 99, 2', 5), { pages: [0, 1], groups: [[0], [1]], errors: ['99'] });
});

test('groups: every n, odd/even, file names', () => {
  assert.deepEqual(everyN(2, 5), [[0, 1], [2, 3], [4]]);
  assert.deepEqual(everyN(0, 2), [[0], [1]]);
  assert.deepEqual(oddEven('odd', 5), [0, 2, 4]);
  assert.deepEqual(oddEven('even', 5), [1, 3]);
  assert.equal(groupFileName('Plan.pdf', [2]), 'Plan_Seite-3.pdf');
  assert.equal(groupFileName('Plan.pdf', [0, 1, 2]), 'Plan_Seiten-1-3.pdf');
  assert.equal(groupFileName('Plan', [0, 2, 4]), 'Plan_Seiten-1,3,5.pdf');
});

test('templates and layout helpers', () => {
  assert.equal(fillTemplate('Seite {n} von {total} | {datei} | {datum}', { n: 2, total: 9, datei: 'Plan.pdf', datum: '19.10.2026' }), 'Seite 2 von 9 | Plan.pdf | 19.10.2026');
  assert.deepEqual(margins(595, 842), { x: 23.8, y: 33.68 });
  assert.deepEqual(margins(100, 2000), { x: 8, y: 40 });
  const b = placeBox('bottom-right', 595, 842, 50, 10);
  assert.ok(b.x + 50 <= 595 - 20 && b.y + 10 <= 842 - 30 && b.y > 700);
  assert.deepEqual(placeBox('center', 100, 100, 20, 10), { x: 40, y: 45 });
  assert.ok(tileCenters({ pageWidth: 595, pageHeight: 842, itemWidth: 100, itemHeight: 20, angle: 45 }).length > 20);
});

test('extract and split keep the page order and make one file or a ZIP', async () => {
  const plan = await fixture('plan.pdf');
  const two = extractPages(mupdf, plan, [2, 0]);
  const doc = openPdf(two);
  assert.equal(doc.countPages(), 2);
  assert.match(doc.loadPage(0).toStructuredText().asText(), /Seite 3/);
  assert.match(doc.loadPage(1).toStructuredText().asText(), /Lüftungsplan/);
  const single = await ops.split({ bytes: plan, mode: 'range', range: '3, 1', name: 'Plan.pdf' });
  assert.equal(single.value.files.length, 1);
  assert.equal(single.value.files[0].name, 'Plan_Seiten-1,3.pdf');
  const groups = await ops.split({ bytes: plan, mode: 'groups', range: '1, 2-3', name: 'Plan.pdf' });
  const parts = unzip(groups.value.files[0].bytes);
  assert.deepEqual(parts.map((p) => p.name), ['Plan_Seite-1.pdf', 'Plan_Seiten-2-3.pdf']);
  assert.deepEqual(parts.map((p) => openPdf(p.bytes).countPages()), [1, 2]);
  const each = await ops.split({ bytes: plan, mode: 'each', name: 'Plan.pdf' });
  assert.equal(unzip(each.value.files[0].bytes).length, 3);
  await assert.rejects(ops.split({ bytes: plan, mode: 'range', range: '7', name: 'Plan.pdf' }), (e) => e.code === 'range');
});

test('page numbers: template, start number, page range, position on normal, rotated and cropped pages', async () => {
  for (const name of ['plan.pdf', 'rotated.pdf', 'cropped.pdf']) {
    const { value } = await ops.pageNumbers({ bytes: await fixture(name), pages: { mode: 'range', range: '2-' }, template: 'Seite {n} von {total}', start: 5, position: 'bottom-right' });
    const doc = openPdf(value);
    assert.doesNotMatch(doc.loadPage(0).toStructuredText().asText(), /Seite \d von/, `${name}: page 1 not numbered`);
    const w = words(value, 1).find((x) => x.text.startsWith('Seite 5'));
    assert.ok(w, `${name}: page 2 is "Seite 5 von 6"`);
    assert.match(w.text, /Seite 5 von 6/);
    const [, , pw, ph] = doc.loadPage(1).getBounds();
    assert.ok(w.x > pw * 0.6 && w.y > ph * 0.85, `${name}: bottom right as shown (${Math.round(w.x)}, ${Math.round(w.y)} of ${Math.round(pw)} × ${Math.round(ph)})`);
    assert.equal(doc.asPDF().wasRepaired(), false);
  }
});

test('header and footer: left, centre, right with placeholders', async () => {
  const { value } = await ops.headerFooter({ bytes: await fixture('plan.pdf'), pages: { mode: 'all' }, slots: { headerLeft: '{datei}', headerCenter: 'Projekt Riggenbach', headerRight: '{datum}', footerCenter: '{n}/{total}' }, datei: 'Plan.pdf', datum: '19.10.2026' });
  const w = words(value, 2);
  const at = (t) => w.find((x) => x.text.includes(t));
  const [, , pw, ph] = openPdf(value).loadPage(2).getBounds();
  assert.ok(at('Plan.pdf').x < pw * 0.2 && at('Plan.pdf').y < ph * 0.1);
  assert.ok(Math.abs(at('Projekt Riggenbach').x + 40 - pw / 2) < 60);
  assert.ok(at('19.10.2026').x > pw * 0.7);
  assert.ok(at('3/3').y > ph * 0.9);
});
