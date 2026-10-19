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
| 7 Finish | open | |

## Log

- 2026-10-19: stage 6. Browser checks: opening writes no slot, a page rotation writes one after 2 s, reload shows `Ungesicherte Änderungen: plan.pdf (…)` with restore and discard, restore opens the rotated state, save removes the slot, the original opened again leaves the slot untouched while it is edited, discard lets the open file write. npm test: 271 tests, 270 pass, 1 skipped.
- 2026-10-19: stage 5. Browser checks (also under the sub-path): OCR on the scan fixture recognises 5 words, the viewer's search finds `Zuluft` and highlights it on the image; the page looks unchanged. npm test: 267 tests, 266 pass, 1 skipped.
- 2026-10-19: stage 4. Browser checks: page numbers, header/footer with `{datei}` / `{datum}`, watermark, merge of two PDFs after the current page (order kept), split into a ZIP, page as JPG, flatten, compress (scan 36 kB → 18 kB, the viewer's save keeps 18 kB), bookmarks with levels, properties, password set (reopens without prompt, saved file needs it) and removed, encrypted file unlocked in the viewer then a tool asks for the password (wrong one marked), damaged file repaired, garbage file refused, images as pages into the file and as a new document, new A3 document. npm test: 262 tests, 261 pass, 1 skipped.
- 2026-10-19: stage 3. Browser checks: libraries import once and survive reloads without copies, symbol armed and placed (12 mm), own SVG with script dropped on the panel (script removed, 20 × 10 mm), stamp Geprüft placed with name and date, settings change redraws the stamps, signature drawn and kept. npm test: 243 tests, 242 pass, 1 skipped.

- 2026-10-19: stage 2. Browser checks (light and dark, sub-path): open by drop and hand-over, Strg+S saves once under the original name, Strg+Z, page rotate/insert/delete with toast undo, cloud tool, password file, damaged file, → DXF. `npm test`: 234 tests, 233 pass, 1 skipped.
- 2026-10-19: stage 1. `scripts/npm-package.mjs`, `scripts/vendor-embedpdf.mjs`, `lib/vendor/embedpdf/`, bare `tools/pdf-editor/` page, `tests/pdf-editor.vendor.test.js`, spike fixture `tests/fixtures/pdf-editor/embedpdf-annotated.pdf`. `npm test`: 224 tests, 223 pass, 1 skipped (real plans).
