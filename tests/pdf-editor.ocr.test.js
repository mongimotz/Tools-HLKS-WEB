// SPDX-License-Identifier: AGPL-3.0-or-later
// PDF-Editor OCR: the scan fixture gets an invisible text layer in which the printed words are found and
// lie on their place in the image; pages with text are left alone; hOCR parsing and word placement.
// The recognizer is the vendored tesseract core run directly (tests/helpers/tesseract-node.js); the test is
// skipped with a message when the tesseract files are missing.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import * as mupdf from '../lib/vendor/mupdf/mupdf.js';
import { createEngine } from '../tools/pdf-editor/engine.js';
import { parseHocr, placeWords, pagesWithoutText } from '../tools/pdf-editor/ocr.js';
import { nodeRecognizer, CORE, LANGS } from './helpers/tesseract-node.js';

const ROOT = new URL('../', import.meta.url);
const readAsset = async (p) => new Uint8Array(await readFile(new URL(p, ROOT)));
const fixture = (name) => readAsset(`tests/fixtures/pdf-editor/${name}`);
const SCAN_WORDS = ['Lüftungsgerät', 'Revision', 'Zuluft'];

const missing = await Promise.all([CORE, ...LANGS].map((u) => access(u).then(() => null, () => u.pathname)));
const skip = missing.some(Boolean) && `tesseract files missing (node scripts/vendor-tesseract.mjs): ${missing.filter(Boolean).join(', ')}`;
if (skip) console.log(`# skipped: ${skip}`);

const { ops } = await createEngine({ readAsset, recognizer: nodeRecognizer });

/** Words of a page as MuPDF extracts them, with their boxes (points, page as shown). */
function words(bytes, index = 0) {
  const doc = mupdf.Document.openDocument(bytes, 'application/pdf');
  const out = [];
  const st = JSON.parse(doc.loadPage(index).toStructuredText('preserve-whitespace').asJSON());
  for (const block of st.blocks) for (const line of block.lines ?? []) out.push({ text: line.text, bbox: line.bbox });
  return { text: out.map((l) => l.text).join('\n'), lines: out };
}

test('OCR: the scan gets a text layer with the printed words', { skip }, async () => {
  const bytes = await fixture('scan.pdf');
  assert.equal(words(bytes).text.trim(), '', 'the fixture has no text');
  const { value } = await ops.ocr({ bytes, pages: { mode: 'notext' } });
  assert.equal(value.pages, 1);
  assert.ok(value.words >= 5, `${value.words} words`);
  const { text, lines } = words(value.bytes);
  for (const w of SCAN_WORDS) assert.ok(text.includes(w), `"${w}" in ${JSON.stringify(text)}`);
  assert.ok(/Revision\s+B\s+Zuluft\s+250/.test(text), 'spaces between words');
  // the words lie where they are printed: "Lüftungsgerät" at x 30 pt, its baseline at 200 − 130 = 70 pt from the top
  const first = lines.find((l) => l.text.includes(SCAN_WORDS[0]));
  assert.ok(Math.abs(first.bbox.x - 30) < 4, `x ${first.bbox.x}`);
  assert.ok(first.bbox.y < 70 && first.bbox.y + first.bbox.h > 62, `y ${first.bbox.y} h ${first.bbox.h}`);
  assert.ok(Math.abs(first.bbox.w - 178) < 12, `width ${first.bbox.w}`);
  // invisible: the page looks the same as before
  const look = (b) => mupdf.Document.openDocument(b, 'application/pdf').loadPage(0).toPixmap(mupdf.Matrix.identity, mupdf.ColorSpace.DeviceGray, false).getPixels();
  const [a, c] = [look(bytes), look(value.bytes)];
  let d = 0;
  for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - c[i]);
  assert.ok(d / a.length < 0.5, 'nothing drawn');
  // the text layer is Plex in render mode 3
  const doc = new mupdf.PDFDocument(value.bytes);
  const contents = doc.loadPage(0).getObject().get('Contents');
  const last = contents.get(contents.length - 1).readStream().asString();
  assert.match(last, /3 Tr \/HLKSF1 [\d.]+ Tf [\d.]+ Tz/);
});

test('OCR: pages with text are skipped in the "without text" mode, chosen pages are read', { skip }, async () => {
  const plan = await fixture('plan.pdf');
  const doc = new mupdf.PDFDocument(plan);
  assert.deepEqual(pagesWithoutText(doc), [], 'every plan page has text');
  const none = await ops.ocr({ bytes: plan, pages: { mode: 'notext' } });
  assert.equal(none.value.bytes, null);
  assert.equal(none.value.pages, 0);
  const rotated = await ops.ocr({ bytes: await fixture('rotated.pdf'), pages: { mode: 'range', range: '3' } });
  assert.equal(rotated.value.pages, 1);
  const reopened = new mupdf.PDFDocument(rotated.value.bytes);
  assert.equal(reopened.countPages(), 3);
  assert.equal(reopened.loadPage(2).getObject().get('Rotate').asNumber(), 90, 'rotation kept');
});

test('hOCR: lines, words, entities, baseline and angle', () => {
  const hocr = `<div class='ocr_page' id='page_1' title='image "x.png"; bbox 0 0 1000 500; ppageno 0'>
    <span class='ocr_line' id='line_1_1' title="bbox 100 100 400 140; baseline 0.01 -8; x_size 30">
      <span class='ocrx_word' id='word_1_1' title='bbox 100 100 200 140; x_wconf 91'>Ø&amp;Δ</span>
      <span class='ocrx_word' id='word_1_2' title='bbox 250 102 400 140; x_wconf 80'><strong>250</strong></span>
    </span>
    <span class='ocr_textfloat' id='line_1_2' title="bbox 600 50 640 300; textangle 90; x_size 30">
      <span class='ocrx_word' id='word_1_3' title='bbox 600 50 640 300; x_wconf 77'>Schacht</span>
    </span></div>`;
  const page = parseHocr(hocr);
  assert.equal(page.width, 1000);
  assert.equal(page.height, 500);
  assert.equal(page.lines.length, 2);
  assert.deepEqual(page.lines[0].words.map((w) => w.text), ['Ø&Δ', '250']);
  assert.deepEqual(page.lines[0].baseline, { slope: 0.01, intercept: -8 });
  assert.equal(page.lines[1].angle, 90);
  const placed = placeWords(page);
  assert.deepEqual(placed.map((p) => p.text), ['Ø&Δ', ' ', '250', 'Schacht']);
  const [w1, space, w2, up] = placed;
  assert.equal(w1.x, 100);
  assert.equal(w1.y, 132, 'baseline 8 px above the line bottom');
  assert.equal(w1.size, 32, 'size from the baseline to the top of the line');
  assert.equal(w1.length, 100);
  assert.ok(Math.abs(space.length - 50) < 1 && Math.abs(space.x - 200) < 0.1);
  assert.ok(Math.abs(w2.y - (132 + 0.01 * 150)) < 1e-9, 'baseline follows the slope');
  assert.equal(up.angle, 90);
  assert.equal(up.length, 250);
  assert.equal(up.y, 300, 'vertical text starts at the bottom');
});
