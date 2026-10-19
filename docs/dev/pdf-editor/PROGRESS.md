# PDF-Editor: progress

Plan: [PLAN.md](PLAN.md) (owner, 2026-10-19). Decisions: [DECISIONS.md](DECISIONS.md). Work on `main`, one commit and push per stage.

## Stages

| Stage | State | Notes |
|---|---|---|
| 1 Spike EmbedPDF v3 | done | `@embedpdf/viewer@3.0.0-next.15` vendored (16.1 MB), every annotation type, measurement after calibration, stamp library import, form fields, export reopens without repair; sub-path checked |
| 2 Page shell | done | registry tile, `pdfEdit` icon, app bar (↶ ↷, open, ↓ PDF, → DXF), notice row, theme via `--epdf-*`, `--annot-*` tokens + CVD test, Swiss strings, Plex text font, Swiss measurement format, open/save/shortcuts, drag and drop, start-page hand-over, → DXF, password prompt, mode `Seiten`, cloud and whiteout tools, rule changes in `AGENTS.md`; `tests/lazy-imports.test.js` replaces the MuPDF part of `pdf-to-dxf.robust.test.js` |
| 3 Symbols, stamps, signatures | open | |
| 4 Document tools | open | |
| 5 OCR | open | |
| 6 Autosave | open | |
| 7 Finish | open | |

## Log

- 2026-10-19: stage 2. Browser checks (light and dark, sub-path): open by drop and hand-over, Strg+S saves once under the original name, Strg+Z, page rotate/insert/delete with toast undo, cloud tool, password file, damaged file, → DXF. `npm test`: 234 tests, 233 pass, 1 skipped.
- 2026-10-19: stage 1. `scripts/npm-package.mjs`, `scripts/vendor-embedpdf.mjs`, `lib/vendor/embedpdf/`, bare `tools/pdf-editor/` page, `tests/pdf-editor.vendor.test.js`, spike fixture `tests/fixtures/pdf-editor/embedpdf-annotated.pdf`. `npm test`: 224 tests, 223 pass, 1 skipped (real plans).
