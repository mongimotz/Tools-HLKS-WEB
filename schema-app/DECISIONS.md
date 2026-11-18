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

## 2026-11-18 | Air media colours (EN 12792:2003, table 1, read from the local PDF)
- Norm: AUL green, ABL yellow, FOL brown, UML orange, ÜBL/Raumluft grey. ZUL colour depends on the number of thermodynamic treatments (none green, 1 red, 2–3 blue, 4 violet).
- Chosen: ZUL blue (typical unit with heat recovery + heater, 2–3 treatments). MIL has no norm colour: olive (between green and orange). KVS circuit (`water.hrc`) teal, own choice. Black-and-white mode uses dash patterns + codes.
- Alternative: ZUL colour by treatment count, computed per line. Rejected for now (more rules, little gain); a style template can override colours.

## 2026-11-18 | Symbols
- Drawn from scratch following EN 12792 tables 3–6 (descriptions and proportions, not copied). `checked: true` = compared with the local norm PDF.
- No norm symbol exists for: WRG plate (square with both diagonals), WRG rotor (ellipse with axis and motor M), KVS coil, droplet separator (zig-zag), room/zone (dashed box), fire compartment border (dash-dot line), junction (dot). Marked with `norm: ""` and "*" in the catalog. SIA 411 contains no device symbols for these (it is a modular block representation); its sensor symbols are floor-plan symbols (electrosuisse), not used.
- Sensors: circle with letter (T, rF, p, Δp, CO₂, VOC) and stem (Wirklinie) down to the duct; the stem is not an obstacle for routing (`obstacle` box).
- Motor damper = damper (EN T4/9) + actuator (EN T6/3) on top.

## 2026-11-18 | Layout rules
- One flow graph, split into strands along each symbol's flow port pairs. Main strand left → right; WRG b side (extract) right → left, above, 40 mm port distance (WRG height 45 mm) so labels and values of both rows fit.
- Hanging terminals: a single-port symbol whose port is across the row hangs below a left → right row and above a right → left row (outside the space between supply and extract). Terminals at right-hand row ends line up vertically.
- Reversed rows use a mirror (`flip`), not a 180° turn, so actuators stay on top; exception: a symbol with connected side ports (KVS coil) turns 180° when that points its ports at the partner.
- Sensors in a chain reserve 15 mm each after their host and sit on the duct, placed from the host side.
- Sheet fitting: gaps shrink from 10 mm to 5 mm, then the layout suggests the next sheet size or a second sheet. **No automatic row wrapping yet** (plan item "Umbrüche"): wrapping a coupled supply/extract pair breaks the picture; revisit with real examples.
- ELK (`elkjs`) is not used for ventilation: the strand layout covers chains, coupled rows and junction branches. It is removed from the dependencies until Phase 8 (branched hydraulic networks).

## 2026-11-18 | Drawing check (`src/layout/check.ts`)
- Rendering returns text boxes, routes and group frames; the check reports overlapping texts, texts on symbols, lines through symbols, frames cutting non-members, content outside the frame or on the title block. It runs in `cli validate`, `cli ops` and for every example in the tests, so "look at the PNG" is backed by an automatic check.
