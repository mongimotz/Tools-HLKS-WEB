# PDF → DXF: progress

Branch `feature/pdf-to-dxf`, worktree `../Tools-HLKS-pdf-to-dxf` (see DECISIONS.md D0). Plan: `PLAN-pdf2dxf.md` (owner, 2026-10-12).

## Restart notes

- Work only in the worktree. Never switch branches or stash in the main working tree (the silencer agent works there).
- Dev server: `node scripts/serve.mjs 8081`.
- Corpus: `node scripts/make-pdf-to-dxf-fixtures.mjs` (only when the corpus changes).

## Shared files the silencer agent changed on `main`

- `README.md`: tool row "Schalldämpfer" → Testversion; new section "## Schalldämpfer" right before "## Entwicklung".
- `AGENTS.md`: roadmap only.
- `lib/core/registry.js`: silencer status → `ready`.
- `lib/core/ui.js`: icons appended at the end of `ICONS`.
- `lib/core/pdf.js`: `INK_TOKENS` gained chart4 … chart8.
- `scripts/make-fixtures.mjs`: silencer imports, a third entry in `tools`, helper `silencerStrands()`.
- Merged into the branch on 2026-10-12 (aa404cc, main at b174604): no conflicts; silencer files got the SPDX line, the silencer page `mountSourceLink()`.

## Phases

| Phase | State | Notes |
|---|---|---|
| 1 License, repo, vendoring, corpus | done | |
| 2 Extraction → IR | done | backend.js (MuPDF device), ir.js, worker.js + convert.js; all 10 vector fixtures equal their truth |
| 3 DXF writer | done | dxf.js R2000 + R12, tests/helpers/dxf-reader.js, scripts/check-dxf.py; ezdxf: 0 errors (TESTREPORT) |
| 4 Units and scale | done | makeTransform (scale, unit, origin, offset), calibrate, snapPoint, scaleLabel; defaults.js settings + presets; control distance 10 000 mm at 1:100 |
| 5 Structure | done | layers (PDF layers, colour/width modes), clip (rect + polygon), segment dedupe with priorities, join, fills; convert.js process/export |
| 6 Curves, text, hatch, filter | done | exact arc fit + merge to CIRCLE, splines, text height/rotation, unmapped text as outline, dashes, hatch heuristic, filters; scripts/pdf-to-dxf.mjs |
| 7 UI | done | index.html, app.js, preview.js, labels.js, style.css; start page tiles and PDF hand-over; checked in the browser (TESTREPORT) |
| 8 Scans | done | scan.js (threshold, closing, specks, skew, thinning, tracing, outlines), service + UI; clean and dirty 100 % found, skew exact |
| 9 Performance, robustness | done | 300k segments in 3.2 s (Node), fuzz 200 runs, error cases, real-plan test (skipped, no files), lazy-load test; browser check with cancel |
| 10 Docs, release | done (merge: see Release) | README section, docs/pdf-to-dxf-method.md, docs/pdf-to-dxf-nova-test.md, AGENTS.md, DESIGN.md; sub-path check (serve --base), absolute-path test |

## Release

- Sub-path check: `node scripts/serve.mjs 8083 --base Tools-HLKS-WEB`; start page, tile, hand-over of a foreign PDF, worker, backend and MuPDF WebAssembly load under `/Tools-HLKS-WEB/`, conversion runs (curves.pdf 13 → 6). `tests/pdf-to-dxf.robust.test.js` rejects absolute paths in the site.
- No file is in Git LFS; the largest is `mupdf-wasm.wasm` (10.4 MB), checked by `tests/pdf-to-dxf.vendor.test.js`.
- Merge into `main`: see the last log entry.

## Log

- 2026-10-12: worktree set up, silencer agent informed. License commit (AGPL, SPDX, source link). MuPDF 1.28.1 vendored, smoke test green in Node and browser (3 pages of `multipage.pdf`). Corpus of 12 PDFs with truth files.
- 2026-10-12: phases 2–9 done and pushed one by one (see the table). `main` (silencer tool, b174604) merged into the branch without conflicts.
- 2026-10-13: phase 10 docs done. `npm test` on the branch: 176 tests, 175 pass, 1 skipped (real plans: none on this machine).
