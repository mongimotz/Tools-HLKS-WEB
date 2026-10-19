# PDF-Editor: progress

Plan: [PLAN.md](PLAN.md) (owner, 2026-10-19). Decisions: [DECISIONS.md](DECISIONS.md). Work on `main`, one commit and push per stage.

## Stages

| Stage | State | Notes |
|---|---|---|
| 1 Spike EmbedPDF v3 | done | `@embedpdf/viewer@3.0.0-next.15` vendored (16.1 MB), every annotation type, measurement after calibration, stamp library import, form fields, export reopens without repair; sub-path checked |
| 2 Page shell | open | |
| 3 Symbols, stamps, signatures | open | |
| 4 Document tools | open | |
| 5 OCR | open | |
| 6 Autosave | open | |
| 7 Finish | open | |

## Log

- 2026-10-19: stage 1. `scripts/npm-package.mjs`, `scripts/vendor-embedpdf.mjs`, `lib/vendor/embedpdf/`, bare `tools/pdf-editor/` page, `tests/pdf-editor.vendor.test.js`, spike fixture `tests/fixtures/pdf-editor/embedpdf-annotated.pdf`. `npm test`: 224 tests, 223 pass, 1 skipped (real plans).
