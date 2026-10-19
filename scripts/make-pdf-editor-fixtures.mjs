// SPDX-License-Identifier: AGPL-3.0-or-later
// Write the test files of the PDF-Editor to tests/fixtures/pdf-editor/. Run it when they should change:
//   node scripts/make-pdf-editor-fixtures.mjs
// plan.pdf (3 pages: A3 plan with a square annotation, A4 with a form, A4 text), rotated.pdf (/Rotate 90),
// cropped.pdf (CropBox inside the MediaBox), encrypted.pdf (AES-256, user password "geheim", owner "chef"),
// damaged.pdf (plan.pdf cut off), scan.pdf (a 300 dpi greyscale image of printed words, for OCR).
// embedpdf-annotated.pdf is not written here: it was saved from the viewer in the stage 1 spike.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { PDFDocument, rgb } from '../lib/vendor/pdf-lib/pdf-lib.esm.min.js';
import fontkit from '../lib/vendor/fontkit/fontkit.esm.min.js';
import * as mupdf from '../lib/vendor/mupdf/mupdf.js';

const OUT = new URL('../tests/fixtures/pdf-editor/', import.meta.url);
const A4 = [595.28, 841.89];
const A3_LANDSCAPE = [1190.55, 841.89];
/** Words the OCR test looks for in scan.pdf. */
export const SCAN_WORDS = ['Lüftungsgerät', 'Revision', 'Zuluft'];

const write = (name, bytes) => writeFile(new URL(name, OUT), bytes);
const fixed = { creationDate: new Date('2026-10-19T00:00:00Z'), modDate: new Date('2026-10-19T00:00:00Z') };

async function newDoc() {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setCreationDate(fixed.creationDate);
  doc.setModificationDate(fixed.modDate);
  doc.setProducer('HLKS-Tools fixtures');
  doc.setCreator('HLKS-Tools fixtures');
  const font = await doc.embedFont(await readFile(new URL('../assets/fonts/pdf/sans-400.ttf', import.meta.url)), { subset: true });
  return { doc, font };
}

/** Three pages: a plan, a form, a text page. */
async function plan() {
  const { doc, font } = await newDoc();
  doc.setTitle('Lüftungsplan EG');
  doc.setAuthor('HLKS-Tools');
  const p1 = doc.addPage(A3_LANDSCAPE);
  p1.drawRectangle({ x: 40, y: 40, width: A3_LANDSCAPE[0] - 80, height: A3_LANDSCAPE[1] - 80, borderColor: rgb(0, 0, 0), borderWidth: 1 });
  for (let i = 0; i < 6; i++) p1.drawLine({ start: { x: 120 + i * 150, y: 200 }, end: { x: 120 + i * 150, y: 640 }, thickness: 0.5, color: rgb(0, 0, 0) });
  p1.drawRectangle({ x: 300, y: 380, width: 240, height: 60, borderColor: rgb(0.2, 0.4, 0.8), borderWidth: 1.5 });
  p1.drawText('Lüftungsplan EG  Massstab 1:50', { x: 60, y: 60, size: 14, font });
  p1.drawText('Zuluft Ø 250  Δp ≤ 50 Pa', { x: 310, y: 450, size: 10, font });
  const p2 = doc.addPage(A4);
  p2.drawText('Abnahmeprotokoll', { x: 60, y: 780, size: 18, font });
  p2.drawText('Bemerkung', { x: 60, y: 700, size: 11, font });
  const form = doc.getForm();
  const field = form.createTextField('bemerkung');
  field.setText('Klappe K3 prüfen');
  field.addToPage(p2, { x: 160, y: 690, width: 300, height: 22, font });
  const box = form.createCheckBox('geprueft');
  box.check();
  box.addToPage(p2, { x: 160, y: 650, width: 14, height: 14 });
  form.updateFieldAppearances(font);
  const p3 = doc.addPage(A4);
  p3.drawText('Seite 3: Text für Suche und Kopfzeilen', { x: 60, y: 780, size: 12, font });
  const bytes = await doc.save({ useObjectStreams: false });
  // a square annotation with an appearance stream on page 1 (MuPDF writes it)
  const m = new mupdf.PDFDocument(bytes);
  const annot = m.loadPage(0).createAnnotation('Square');
  annot.setRect([600, 300, 800, 420]);
  annot.setColor([0.83, 0.16, 0.13]);
  annot.setBorderWidth(1);
  annot.setContents('Revision B');
  annot.update();
  return m.saveToBuffer('compress').asUint8Array();
}

async function variant(edit) {
  const doc = await PDFDocument.load(await readFile(new URL('plan.pdf', OUT)));
  edit(doc);
  doc.setModificationDate(fixed.modDate);
  return doc.save({ useObjectStreams: false });
}

/** A page image of printed words at 300 dpi, the only content of its page (like a scanner writes it). */
async function scan() {
  const { doc, font } = await newDoc();
  const page = doc.addPage([420, 200]);
  page.drawText(SCAN_WORDS[0], { x: 30, y: 130, size: 28, font });
  page.drawText(`${SCAN_WORDS[1]} B  ${SCAN_WORDS[2]} 250`, { x: 30, y: 70, size: 24, font });
  const vector = await doc.save();
  const z = 300 / 72;
  const pix = mupdf.Document.openDocument(vector, 'application/pdf').loadPage(0).toPixmap(mupdf.Matrix.scale(z, z), mupdf.ColorSpace.DeviceGray, false);
  const out = await newDoc();
  const img = await out.doc.embedPng(pix.asPNG());
  out.doc.addPage([420, 200]).drawImage(img, { x: 0, y: 0, width: 420, height: 200 });
  return out.doc.save({ useObjectStreams: false });
}

await mkdir(OUT, { recursive: true });
await write('plan.pdf', await plan());
await write('rotated.pdf', await variant((d) => d.getPages().forEach((p) => p.setRotation({ type: 'degrees', angle: 90 }))));
await write('cropped.pdf', await variant((d) => d.getPage(0).setCropBox(200, 150, 600, 400)));
const encrypted = new mupdf.PDFDocument(await readFile(new URL('plan.pdf', OUT)));
await write('encrypted.pdf', encrypted.saveToBuffer('encrypt=aes-256,user-password=geheim,owner-password=chef').asUint8Array());
const planBytes = await readFile(new URL('plan.pdf', OUT));
await write('damaged.pdf', planBytes.subarray(0, Math.floor(planBytes.length * 0.6)));
await write('scan.pdf', await scan());
console.log('written to tests/fixtures/pdf-editor/');
