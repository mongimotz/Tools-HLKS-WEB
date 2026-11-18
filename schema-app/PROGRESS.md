# Progress – Prinzipschema editor

| Phase | Status |
|---|---|
| 0 Scaffold + deploy | done |
| 1 Model, validation, renderer, CLI | done |
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

## Phase 1
- Model (`src/model/`): types, zod schema with defaults, migration entry (v1), stable serializer (one component per line), topology rules (`validate.ts`).
- Renderer (`src/render/render.ts`): pure SVG string, used by CLI and editor. Frame (ISO 5457 margins), title block template, legend of used media, flow arrows, medium code at the start of each medium run, crossing bridges.
- Router (`src/layout/route.ts`): A* on the sheet grid with bend/crossing/overlap costs; waypoints are taken as given.
- CLI: `validate`, `render` (PNG via resvg with the bundled Plex fonts, or SVG), `new --template empty|ahu-basic`.
- Tests: validation cases, migration errors, serializer round trip, geometry, symbol rules, PNG reference per example (`tests/visual/`).
