# PDF-Editor: progress

Plan: [PLAN.md](PLAN.md) (owner, 2026-10-19). Decisions: [DECISIONS.md](DECISIONS.md). Work on `main`, one commit and push per stage.

## Stages

| Stage | State | Notes |
|---|---|---|
| 1 Spike EmbedPDF v3 | done | `@embedpdf/viewer@3.0.0-next.15` vendored (16.1 MB), every annotation type, measurement after calibration, stamp library import, form fields, export reopens without repair; sub-path checked |
| 2 Page shell | done | registry tile, `pdfEdit` icon, app bar (↶ ↷, open, ↓ PDF, → DXF), notice row, theme via `--epdf-*`, `--annot-*` tokens + CVD test, Swiss strings, Plex text font, Swiss measurement format, open/save/shortcuts, drag and drop, start-page hand-over, → DXF, password prompt, mode `Seiten`, cloud and whiteout tools, rule changes in `AGENTS.md`; `tests/lazy-imports.test.js` replaces the MuPDF part of `pdf-to-dxf.robust.test.js` |
| 3 Symbols, stamps, signatures | done | 25 symbol SVGs + 4 library PDFs (build script, fingerprint test), own SVG renderer (MuPDF.js has no SVG reader), Symbole panel (arm, add SVG by button or drop, delete with undo, save/open own library), 5 stamp templates + own stamps drawn in the worker with Plex, settings dialog, signatures draw/upload only; MuPDF worker (engine.js, worker.js) started |
| 4 Document tools | open | |
| 5 OCR | open | |
| 6 Autosave | open | |
| 7 Finish | open | |

## Log

- 2026-10-19: stage 3. Browser checks: libraries import once and survive reloads without copies, symbol armed and placed (12 mm), own SVG with script dropped on the panel (script removed, 20 × 10 mm), stamp Geprüft placed with name and date, settings change redraws the stamps, signature drawn and kept. npm test: 243 tests, 242 pass, 1 skipped.

- 2026-10-19: stage 2. Browser checks (light and dark, sub-path): open by drop and hand-over, Strg+S saves once under the original name, Strg+Z, page rotate/insert/delete with toast undo, cloud tool, password file, damaged file, → DXF. `npm test`: 234 tests, 233 pass, 1 skipped.
- 2026-10-19: stage 1. `scripts/npm-package.mjs`, `scripts/vendor-embedpdf.mjs`, `lib/vendor/embedpdf/`, bare `tools/pdf-editor/` page, `tests/pdf-editor.vendor.test.js`, spike fixture `tests/fixtures/pdf-editor/embedpdf-annotated.pdf`. `npm test`: 224 tests, 223 pass, 1 skipped (real plans).
