# PDF-Editor: checks for the owner

Manual checks that the automated tests cannot do. Tick them off here or tell the agent what failed.

## Exports in other programs

Mark up a real plan in the editor (comments, shapes, revision cloud, measurements, a symbol, a stamp, a signature, form entries), save it, then open the file in:

- [ ] Acrobat Reader: everything visible; comments, shapes and measurements stay editable (move, change text, delete).
- [ ] Edge: everything visible and printable.
- [ ] Bluebeam Revu (if available): markups listed and editable, measurements show the same values and scale.
- [ ] Trimble Nova: the plan opens as a background and markups are visible (see also [pdf-to-dxf-nova-test.md](../../pdf-to-dxf-nova-test.md) for the DXF route).
- [ ] A file with a digital signature: after markup and ↓ PDF the signature is still valid in Acrobat.

## Measuring

- [ ] Calibrate on a long known dimension of a real plan, then measure another known dimension: the deviation is within the click error described in [pdf-editor-method.md](../../pdf-editor-method.md).
- [ ] Choose the preset 1:50 or 1:100 on a plan plotted at that scale and measure a known dimension.
- [ ] The scale and the measurements show the same values in Acrobat or Bluebeam.

## Symbols and stamps

- [ ] Review the 25 schema symbols (`tools/pdf-editor/symbols/*.svg`, shown in the Symbole panel): drawing, name, category and the `norm` reference in `symbols/manifest.json`. Change an SVG, run `node scripts/build-symbol-library.mjs`, commit both.
- [ ] Stamps `Geprüft`, `Freigegeben`, `Entwurf`, `Ungültig`, `Zur Kenntnis`: wording, colours, size (56 × 16 mm).
- [ ] Symbols and stamps print sharp (print a page with them on paper or to PDF and zoom in).

## Forms

- [ ] A form filled in the editor shows its values in Acrobat; a form field created in the editor can be filled in Acrobat.

## OCR and compression

- [ ] OCR on two or three real scans (a plan, a typed letter): search finds typical words, the page looks unchanged.
- [ ] Compress a large scan: the file is smaller and still readable at the chosen resolution.

## Autosave

- [ ] Edit a plan, close the tab without saving, open the editor again: `Ungesicherte Änderungen` restores the edits; ↓ PDF removes the notice.

## Phone

- [ ] On a real phone: open a PDF from the start page, fill a form field, place a comment, save.

## After an EmbedPDF update

- [ ] Run `node scripts/vendor-embedpdf.mjs <version>` and `npm test`, then repeat the stage 1 spike by hand: every annotation type, a measurement after calibration, a stamp, a form field; export and reopen in Acrobat (see DECISIONS E5).

## README

- [ ] Update the README tool table, method links and licence table with the text in [PROGRESS.md](PROGRESS.md#readme-changes-owner).
