# PDF-Editor: progress

Plan: [PLAN.md](PLAN.md) (owner, 2026-10-19). Decisions: [DECISIONS.md](DECISIONS.md). Work on `main`, one commit and push per stage.

## Stages

| Stage | State | Notes |
|---|---|---|
| 1 Spike EmbedPDF v3 | done | `@embedpdf/viewer@3.0.0-next.15` vendored (16.1 MB), every annotation type, measurement after calibration, stamp library import, form fields, export reopens without repair; sub-path checked |
| 2 Page shell | done | registry tile, `pdfEdit` icon, app bar (↶ ↷, open, ↓ PDF, → DXF), notice row, theme via `--epdf-*`, `--annot-*` tokens + CVD test, Swiss strings, Plex text font, Swiss measurement format, open/save/shortcuts, drag and drop, start-page hand-over, → DXF, password prompt, mode `Seiten`, cloud and whiteout tools, rule changes in `AGENTS.md`; `tests/lazy-imports.test.js` replaces the MuPDF part of `pdf-to-dxf.robust.test.js` |
| 3 Symbols, stamps, signatures | done | 25 symbol SVGs + 4 library PDFs (build script, fingerprint test), own SVG renderer (MuPDF.js has no SVG reader), Symbole panel (arm, add SVG by button or drop, delete with undo, save/open own library), 5 stamp templates + own stamps drawn in the worker with Plex, settings dialog, signatures draw/upload only; MuPDF worker (engine.js, worker.js) started |
| 4 Document tools | done | ⋯ menu in plan order: PDFs anhängen, Seiten teilen / extrahieren, Wasserzeichen, Seitenzahlen, Kopf- und Fusszeile, Seiten als Bilder, Bilder als Seiten, Reduzieren, Komprimieren, Kennwort, Lesezeichen, Eigenschaften, Neues Dokument; MuPDF worker (`engine.js`, `pages.js` ported from BentoPDF, `images.js`, `compress.js`, `zip.js`); progress and cancel in the notice row; reload keeps page and password; repair on open |
| 5 OCR | done | tesseract.js 7.0.0 + core 7.0.0 (LSTM, SIMD and plain) + tessdata_fast deu/eng vendored by `scripts/vendor-tesseract.mjs` (10.8 MB); `ocr.js` (BentoPDF port): MuPDF 300 dpi → tesseract.js in the worker → hOCR → invisible Plex text layer with `Tz`; menu entry with pages without text, all, current, range |
| 6 Autosave | done | `autosave.js`: IndexedDB slot per file name + size, 2 s after a change, at most 3 slots, 14 days; notice `Ungesicherte Änderungen` with restore and discard (`lib/core/issues.js` takes `actions`); save clears the slot; a found slot waits for a decision |
| 7 Finish | done | method doc `docs/pdf-editor-method.md` (measuring and its accuracy, OCR, compression, password, autosave, limits); mobile check at 375 px; keyboard check (focus returns to ⋯ after a menu dialog, ↑ ↓ Home End in the ⋯ menu); tool `AGENTS.md` complete; TODO-OWNER complete |

## Result

The plan is carried out in full (stages 1 to 7). The editor is a test version until the owner's checks in [TODO-OWNER.md](TODO-OWNER.md) pass.

**Done**

- Viewer and editor (EmbedPDF 3.0.0-next.15, vendored, no CDN): view, comment, mark up, highlight, shapes, revision cloud, whiteout, redaction, measure with scale (calibration, plan scale presets, Swiss number format), stamps, signatures (draw, upload), form fill and form design, page edits (rotate, insert, duplicate, move, delete with undo), search, print.
- Site look: tokens, Plex fonts, colourblind-safe annotation colours, Swiss German strings, light and dark.
- 25 schema symbols in 4 libraries, own SVG symbols (sanitised, saved as a shareable PDF), 5 stamp templates and own stamps.
- Document tools in the ⋯ menu (MuPDF worker): append PDFs, split / extract, watermark, page numbers, header and footer, pages as images, images as pages, flatten, compress, password (AES-256), OCR (tesseract.js, deu + eng, invisible text layer), bookmarks, properties, new document; progress and cancel in the notice row; repair on open.
- Autosave in IndexedDB (3 slots, 14 days) with restore and discard in the notice row.
- Start page: PDFs without HLKS-Tools data open in the editor; `→ DXF` hands the current file to PDF → DXF.
- Method doc, tool `AGENTS.md`, root `AGENTS.md` rules, tests (engine, pages, compress, crypt, svg, ocr, autosave, vendor, zip, lazy imports).

**Open**

- The owner's manual checks ([TODO-OWNER.md](TODO-OWNER.md)), especially the Nova and Acrobat checks and the symbol review.
- README update by the owner (below).
- Not in the plan, possible later: own snapping for measurements, more OCR languages (fra, ita), a newer EmbedPDF once 3.0 is released.

## README changes (owner)

The README is the owner's. These are the exact changes for the PDF-Editor.

1. Section `Werkzeuge`, new row after `PDF → DXF`:

   ```
   | –            | PDF-Editor    | PDF-Pläne ansehen, markieren, messen, stempeln, unterschreiben, Formulare ausfüllen, Seiten und Dokumentwerkzeuge (OCR, Komprimieren, Kennwort) | BETA     |
   ```

2. Section `Dokumentation`, line `Rechenwege`: append ` | [PDF-Editor](docs/pdf-editor-method.md)` before the final full stop.

3. Section `Lizenz und Fremdcode`, new rows at the end of the table:

   ```
   | EmbedPDF 3.0.0-next.15             | [Apache 2.0](lib/vendor/embedpdf/LICENSE)        | `lib/vendor/embedpdf/`                         |
   | tesseract.js 7.0.0 und Core 7.0.0  | [Apache 2.0](lib/vendor/tesseract/LICENSE)       | `lib/vendor/tesseract/`                        |
   | tessdata_fast 4.1.0 (deu, eng)     | [Apache 2.0](lib/vendor/tesseract/lang/LICENSE)  | `lib/vendor/tesseract/lang/`                   |
   | Logik aus BentoPDF                 | [AGPL v3](https://github.com/alam00000/bentopdf) | `tools/pdf-editor/pages.js`, `tools/pdf-editor/ocr.js` |
   ```

   The BentoPDF row: the two files are ported (not copied) from BentoPDF at commit `d6537217e69e1ea9be83648287401f8b56630f51` and stay AGPL-3.0-only (their header says so).

## Log

- 2026-10-20: stage 7. Mobile check at 375 px (view, form field `Bemerkung` filled, rectangle drawn, ⋯ menu and `Kopf- und Fusszeile` dialog fit, no horizontal scroll). Keyboard check: tab order, ⋯ menu with Enter, ↑ ↓ Home End, Escape; dialog Escape returns focus to ⋯ (fixed); notice list with Enter, restore by keyboard, Escape returns to the count; Strg+O, Strg+S, Strg+Z, Strg+Y. npm test: 271 tests, 270 pass, 1 skipped.
- 2026-10-19: stage 6. Browser checks: opening writes no slot, a page rotation writes one after 2 s, reload shows `Ungesicherte Änderungen: plan.pdf (…)` with restore and discard, restore opens the rotated state, save removes the slot, the original opened again leaves the slot untouched while it is edited, discard lets the open file write. npm test: 271 tests, 270 pass, 1 skipped.
- 2026-10-19: stage 5. Browser checks (also under the sub-path): OCR on the scan fixture recognises 5 words, the viewer's search finds `Zuluft` and highlights it on the image; the page looks unchanged. npm test: 267 tests, 266 pass, 1 skipped.
- 2026-10-19: stage 4. Browser checks: page numbers, header/footer with `{datei}` / `{datum}`, watermark, merge of two PDFs after the current page (order kept), split into a ZIP, page as JPG, flatten, compress (scan 36 kB → 18 kB, the viewer's save keeps 18 kB), bookmarks with levels, properties, password set (reopens without prompt, saved file needs it) and removed, encrypted file unlocked in the viewer then a tool asks for the password (wrong one marked), damaged file repaired, garbage file refused, images as pages into the file and as a new document, new A3 document. npm test: 262 tests, 261 pass, 1 skipped.
- 2026-10-19: stage 3. Browser checks: libraries import once and survive reloads without copies, symbol armed and placed (12 mm), own SVG with script dropped on the panel (script removed, 20 × 10 mm), stamp Geprüft placed with name and date, settings change redraws the stamps, signature drawn and kept. npm test: 243 tests, 242 pass, 1 skipped.

- 2026-10-19: stage 2. Browser checks (light and dark, sub-path): open by drop and hand-over, Strg+S saves once under the original name, Strg+Z, page rotate/insert/delete with toast undo, cloud tool, password file, damaged file, → DXF. `npm test`: 234 tests, 233 pass, 1 skipped.
- 2026-10-19: stage 1. `scripts/npm-package.mjs`, `scripts/vendor-embedpdf.mjs`, `lib/vendor/embedpdf/`, bare `tools/pdf-editor/` page, `tests/pdf-editor.vendor.test.js`, spike fixture `tests/fixtures/pdf-editor/embedpdf-annotated.pdf`. `npm test`: 224 tests, 223 pass, 1 skipped (real plans).
