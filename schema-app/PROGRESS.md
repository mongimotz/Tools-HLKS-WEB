# Progress – Prinzipschema editor

| Phase | Status |
|---|---|
| 0 Scaffold + deploy | done |
| 1 Model, validation, renderer, CLI | open |
| 2 Ventilation symbols, chain layout, ops | open |
| 3 Editor | open |
| 4 Files, live sync, export | open |
| 5 Notes | open |
| 6 OpenRouter assistant | open |
| 7 Styles, polish, start page | open |

## Phase 0
- `npm run build` builds `dist/` (relative base). `npm run check:site [out]` assembles and checks the Pages artifact (old pages, `CNAME`, `.nojekyll`, `/schema/index.html`, no sources leaked).
- Owner: switch Settings → Pages → Source to "GitHub Actions" before merging to `main` (otherwise the old branch deploy keeps running and `/schema/` stays missing).
- Root `npm test`: 3 failures locally come from an untracked `tools/.DS_Store` (Finder file); not present in a clean checkout.
