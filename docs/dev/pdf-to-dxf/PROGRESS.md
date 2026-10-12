# PDF → DXF: progress

Branch `feature/pdf-to-dxf`, worktree `../Tools-HLKS-pdf-to-dxf` (see DECISIONS.md D0). Plan: `PLAN-pdf2dxf.md` (owner, 2026-10-12).

## Restart notes

- Work only in the worktree. Never switch branches or stash in the main working tree (the silencer agent works there).
- Dev server: `node scripts/serve.mjs 8081`.
- Corpus: `node scripts/make-pdf-to-dxf-fixtures.mjs` (only when the corpus changes).

## Shared files the silencer agent changed on `main` (uncommitted as of 2026-10-12, for the merge)

- `README.md`: tool row "Schalldämpfer" → Testversion; new section "## Schalldämpfer" right before "## Entwicklung".
- `AGENTS.md`: roadmap only.
- `lib/core/registry.js`: silencer status → `ready`.
- `lib/core/ui.js`: icons appended at the end of `ICONS`.
- `lib/core/pdf.js`: `INK_TOKENS` gained chart4 … chart8.
- `scripts/make-fixtures.mjs`: silencer imports, a third entry in `tools`, helper `silencerStrands()`.
- After the merge: SPDX line and `mountSourceLink()` for `tools/silencer/*`, its tests and docs-free files.

## Phases

| Phase | State | Notes |
|---|---|---|
| 1 License, repo, vendoring, corpus | done | |
| 2 Extraction → IR | open | |
| 3 DXF writer | open | |
| 4 Units and scale | open | |
| 5 Structure | open | |
| 6 Curves, text, hatch, filter | open | |
| 7 UI | open | |
| 8 Scans | open | |
| 9 Performance, robustness | open | |
| 10 Docs, release | open | |

## Log

- 2026-10-12: worktree set up, silencer agent informed. License commit (AGPL, SPDX, source link). MuPDF 1.28.1 vendored, smoke test green in Node and browser (3 pages of `multipage.pdf`). Corpus of 12 PDFs with truth files.
