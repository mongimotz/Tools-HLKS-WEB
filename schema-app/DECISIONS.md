# Decisions – Prinzipschema editor

Format: date | decision | alternatives | reason.

## 2026-11-18 | App lives in `/schema-app/` (repo root), served at `/schema/`
- Alternatives: `tools/schema-app/` (where the plan file was dropped).
- Reason: the plan names `/schema-app/`. The root tests (`tests/theme.test.js`, `tests/pdf-to-dxf.robust.test.js`, `tests/lazy-imports.test.js`) treat every `tools/<id>` folder as a static no-build tool (`app.js`, `style.css`, relative paths). A Vite app there breaks them. Only `tests/spdx.test.js` needed a skip list for build folders (`node_modules`, `dist`, …).

## 2026-11-18 | Build step and npm dependencies for this app only
- The repo rule "no build step, no npm dependencies, no CDN" (root `AGENTS.md`) stays valid for all other tools. The owner's plan explicitly chooses TypeScript + Vite + React for this app. Nothing is loaded from a CDN: Vite bundles every dependency into `dist/`.
- Deploy changes from "branch main / root" to the GitHub Actions workflow `.github/workflows/pages.yml`. It copies the repository root unchanged (minus `.git`, `.github`, `schema-app`, `node_modules`) and adds `schema-app/dist` as `/schema/`. `CNAME` and `.nojekyll` are checked by `scripts/check-site.mjs`.

## 2026-11-18 | Vite `base: './'` instead of `'/schema/'`
- Reason: root `AGENTS.md` requires relative paths (the site may live under a sub-path or on another static host). `./` works at `/schema/` on hlks.org and anywhere else.

## 2026-11-18 | TypeScript 5.9 instead of 7.x
- Reason: TS 7 (native port) is not yet supported by typescript-eslint and Vite tooling. Revisit later.

## 2026-11-18 | Licenses of new dependencies
- Runtime (bundled into `/schema/`): react, react-dom, zustand, immer, zod, jspdf, svg2pdf.js (MIT); elkjs (EPL-2.0 OR GPL-3.0-or-later, used under GPL-3.0-or-later, AGPL compatible).
- Dev only, never shipped: @resvg/resvg-js (MPL-2.0; PNG rendering in the CLI), Vite, Vitest, Playwright, ESLint, Prettier, tsx, pdfjs-dist (Apache-2.0, PDF checks in tests).

## 2026-11-18 | Norm PDFs
- The owner put the licensed PDFs in `normen/`; moved to `schema-app/_local/normen/` as the plan asks. `_local/` and `normen/` are ignored at root and app level. Symbols are drawn from scratch in SVG following the norm descriptions; no graphics or norm text are copied.

## 2026-11-18 | Owner plan file stays local
- `PLAN_Prinzipschema.md` is git-ignored: it names the owner's employer. This file and `PROGRESS.md` carry everything an agent needs.
