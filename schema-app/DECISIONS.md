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

## 2026-11-18 | Default style follows Swiss practice (owner request)
- The owner's sample schemas (several Swiss offices) all use AUL green, ZUL red, ABL yellow, FOL blue, heating flow red / return blue. This replaces the EN 12792 colours above (ZUL blue, FOL brown) as default; a style template can bring them back.
- Air lines are drawn as thick ducts (`stroke.duct` 1 mm), pipes stay 0.5 mm. Device frames (groups) are magenta and dashed, component IDs blue (`colors.unit`, `colors.label`). Black-and-white output keeps everything in ink.
- Red-green: AUL and ZUL differ in hue only for colour-blind readers; the line codes and the legend name them, and black-and-white output uses dash patterns.

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

## 2026-11-18 | Editor canvas shows the renderer's SVG
- The sheet in the editor is the same SVG string the CLI and the exports produce (plus grid and note pins), injected into the canvas; a separate React layer draws hit areas, ports and handles. Every edit re-renders the whole sheet (< 1 ms for the examples), during a drag as an uncommitted preview.
- Alternative: React components per symbol. Rejected: two drawing paths would drift apart; the plan requires one renderer for editor and CLI.

## 2026-11-18 | Editing details
- A manual move pins the component (plan). Lines with exactly one moved end lose their manual waypoints and are routed automatically again; with both ends moved the waypoints move along.
- A connection drawn from an input port to an output port is stored output → input, so from → to stays the flow direction.
- The first edit of a file with auto-placed components (`pos: null`) writes the computed positions into the file, so what the user sees is what is saved.
- Browser draft in `localStorage` until phase 4 adds file handles (only this device; nothing leaves the browser).

## 2026-11-18 | Live sync details
- Change detection: `lastModified` every 1 s, then a text comparison (a touched but unchanged file is ignored). An invalid file keeps the old `lastModified` as known, so the next poll retries it.
- «Beide als Kopie»: the user's version is written to a new file (save picker, suggested name "… (Kopie).schema"; download in other browsers); the editor then continues with the external version of the original file, so live sync with the other program keeps working.
- Test approach: files in the origin private file system are real `FileSystemFileHandle`s with the same API; the test writes into them like an external program. A test hook `window.__openHandle` opens such a handle.
- The browser draft (localStorage) stays as a safety net; an open file has priority once its permission is granted.

## 2026-11-18 | Export
- PDF via jsPDF + svg2pdf from the same SVG as the editor, page size = sheet size (1:1). Plex 400/600 embedded; svg2pdf requests the style "600normal" for semibold, registered explicitly.
- PNG: SVG with fonts embedded as data URLs drawn onto a canvas at 300 dpi (A3: 4961 × 3508 px).

## 2026-11-18 | Notes
- Deleting a component or line keeps its notes: they become free notes (`anchor.pos`) at the old pin position (editor delete and the `remove` operation). Alternative: delete them with the element (phase 3 behaviour). Rejected: a review comment would vanish silently, and a note on a deleted line left a dangling anchor.
- The notes list is a second tab in the right panel («Anmerkungen» with the count of open notes). Opening a note (list or pin) selects its anchor element, so the sheet highlights it; the open note keeps its pin highlighted. The «Offen» filter keeps the open note visible right after it is set to done.
- Pins stay a renderer option (`notes: true`) used only by the editor; the hit circles live in the editor overlay, positions come from `renderSchema(...).notePins`.

## 2026-11-18 | Assistant (OpenRouter)
- CORS: checked on 2026-11-18, OpenRouter answers the preflight for `chat/completions` with `Access-Control-Allow-Origin: *` and allows `Authorization`, `Content-Type`, `X-Title`. The browser calls it directly; no proxy.
- One tool, `apply_operations` with `{ ops: [...] }`, its JSON schema generated from the zod op schemas (`z.toJSONSchema`, draft 7, `oneOf` → `anyOf` for strict providers). One call is one atomic batch, the same vocabulary as `cli ops`. Alternative: one tool per op. Rejected: a model's several calls would need their own atomicity rule, and the schemas would drift from the ops.
- Check loop: at most 3 model calls per task. A failed batch changes nothing and its error goes back as the tool result; a batch that applies but adds new topology errors is kept and the errors go back too. A model reply without tool calls ends the run. After 3 rounds with an error and no change: «Abbruch nach 3 Runden», no preview. Successful batches of a run are shown as one preview.
- Preview: the canvas shows the proposal (added green, content changes blue, removed components as red boxes at the old place; position-only changes from the relayout are not highlighted). Editing is blocked while it is shown, only the view moves. «Übernehmen» commits it as one undo step («Assistent»); if the document changed meanwhile (e.g. live sync) the proposal is dropped with a message.
- Key: `localStorage` key `hlks-schema-assistant` only, password field, «Key löschen». Never part of the document, draft, files or exports (e2e test checks file, SVG, draft, console, request bodies).
- Default model `anthropic/claude-sonnet-5.5` (on OpenRouter's list, tool calling, mid price); the field offers all tool-capable models from the public model list.
- Tests: the e2e mock is Playwright's request interception on the real OpenRouter URL (no extra server process, the app code runs unchanged); the loop has unit tests with a fetch stub. A real call runs only with `OPENROUTER_API_KEY` (optional `OPENROUTER_MODEL`).

## 2026-11-18 | Phase 7
- Start page: «Prinzipschema» is a tile in the section without discipline (Lüftung already has its three entries; the tool will cover other disciplines in phase 8). Registry `path: 'schema/'` (built), `source: 'schema-app/'` for the page check.
- Style template and «Schwarzweiss» are per browser (localStorage), not in the file: company title blocks must not travel into shared files or the repo. Invalid values fall back to the default style.
- Help stays the shortcut dialog (?); no separate help page. Lighthouse: not run (owner asked for minimal testing).

## 2026-11-18 | Phase 8 (started by the owner without a review stop)
- 18 hydraulic symbols (`src/symbols/water/`), drawn from scratch after the usual ISO 10628-2 / EN 806-1 shapes, all `checked: false` (not compared with the norm PDFs yet). 7 water media (HVL/HRL, KVL/KRL, PWC/PWH/PWH-C) with colours and dash patterns.
- No ELK: the strand layout handles circuits. A line from a `*.flow` to a `*.return` medium starts a new strand; a return strand ending at a placed generator is placed below the flow row, right to left, ending right of the generator. Cycles start at the generator (return in, flow out). Generators have both ports on one side; orientation and row line then follow the outlet.
- `add_chain` takes `medium` for hydraulic chains. Symbol catalogue moved to A2 (47 symbols).
- Norm check (2026-11-18, EN 1861 table 1 and EN 806-1 table 1, both scans): pump (EN 1861 group 15, chevron to the outlet), valve and three-way valve (group 2), tank (group 8), plate heat exchanger (group 11), check valve (EN 806-1 6.6.4) and water meter (6.10.8) redrawn or confirmed and marked checked. Boiler, heat pump, chiller, consumer, radiator, balancing valve, strainer, water heater, expansion vessel, tap, motor valve and network connection are own drawings (*): the norms have no building-services symbol for them or only process-plant forms.
- Single-port symbols that hang off a row are mirrored instead of turned upside down (a tap keeps its spout down).
- Not done: IEC 81346 reference designations (optional in the plan; the component IDs serve as designations for now).

## 2026-11-18 | Way of working
- Owner decision: no stop points between phases; build without asking, minimal testing. The plan's stop points (after phases 2, 4, and «phase 8 only after feedback») no longer apply.
