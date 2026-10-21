In-Chat responses should be kept concise and to the point.

End every task with an 80/20 summary, max 10 lines: the 20% I have to read, what to check, what you were unsure about, what's next. No recap of your reasoning, no restating what I asked.

## Project conventions

- **Language:** code, identifiers, comments, file and folder names in English. Everything the user sees (UI, PDF, error messages, `README.md`, `docs/*-method.md`) in German (Swiss spelling, no ß). Agent/developer docs (`AGENTS.md`, `docs/DESIGN.md`) in English.
- **No build step.** Plain HTML, CSS and ES modules. A `git push` is the deploy (GitHub Pages). Use relative paths only, the site may live under a sub-path. The same files must run unchanged on any static host (e.g. Hetzner, Cloudflare).
- **No CDN.** Third-party code goes into `lib/vendor/` with its license. Fonts live in `assets/fonts/`.
- **Design:** follow `docs/DESIGN.md`, especially its owner-set principles: minimal decoration, no explanations in the product (they go to agent or method documentation), symbols over words, no harsh gradients, red-green colourblind safe, simplicity and speed first. Never use the middle dot (·) as a separator in UI or PDF text; use nothing or " | ". Colours only from `docs/dragon-ink.md`, fonts only IBM Plex Sans + Mono, always via the tokens in `assets/css/tokens.css` (single source; the PDF reads its colours from it, see "Changing the look" in `docs/DESIGN.md`).
- **Consistency:** colours, fonts and sizes are shared by all tools; layouts may differ where practical. Only the start page may carry a visual idea (one small network per discipline), and it must never slow anything down.
- **Tools without a discipline** (group `general` in the registry, with an `icon` name from `lib/core/ui.js`) appear as a tile in the untitled section at the end of the start page. New ones show up there automatically; `home.js` needs no change.

## Documentation (owner decision, 2026-10-13)

`README.md` is edited by the project owner. Exception (owner decision, 2026-10-21): agents keep its changing lists current without asking: the tool table (`## Werkzeuge`), the calculation links (`Rechenwege`) and the third-party table (`## Lizenz und Fremdcode`). Add, remove or update entries only; tool descriptions stay one short line, a summary, no detail. The README must stay short: agents must not add sections, notes, work logs, implementation details, or development instructions. Tell the owner when another part of the README is outdated or no longer relevant.
The README covers the project introduction, available tools, calculation links, and brief development, publishing and license information.
Shared contracts and development rules belong in this file. Tool-specific behavior belongs in `tools/<tool-id>/AGENTS.md`.
Read the relevant tool file before changing that tool. Preserve its documented behavior unless the owner requests a change.
German method documents describe formulas, assumptions and limits. Design rules remain in [docs/DESIGN.md](docs/DESIGN.md) and [docs/dragon-ink.md](docs/dragon-ink.md).

| Tool | Agent instructions | Calculation method |
|---|---|---|
| Druckverlust Lüftung | [tools/duct-pressure-loss/AGENTS.md](tools/duct-pressure-loss/AGENTS.md) | [docs/duct-pressure-loss-method.md](docs/duct-pressure-loss-method.md) |
| Kanalrechner | [tools/duct-sizing/AGENTS.md](tools/duct-sizing/AGENTS.md) | [docs/duct-sizing-method.md](docs/duct-sizing-method.md) |
| Schalldämpfer | [tools/silencer/AGENTS.md](tools/silencer/AGENTS.md) | [docs/silencer-method.md](docs/silencer-method.md) |
| PDF → DXF | [tools/pdf-to-dxf/AGENTS.md](tools/pdf-to-dxf/AGENTS.md) | [docs/pdf-to-dxf-method.md](docs/pdf-to-dxf-method.md) |
| PDF-Editor | [tools/pdf-editor/AGENTS.md](tools/pdf-editor/AGENTS.md) | [docs/pdf-editor-method.md](docs/pdf-editor-method.md) |
| Klimastation | [tools/climate-station/AGENTS.md](tools/climate-station/AGENTS.md) | [docs/climate-station-method.md](docs/climate-station-method.md) |

## Structure

```
index.html                 start page (tools as one network per discipline H, L, K, S, tiles for tools without one, open any PDF)
assets/css/                tokens.css, base.css (shared), home.css
assets/js/home.js          start page logic
assets/fonts/              font subsets with generic names: sans/mono.woff2 (web), pdf/*.ttf (PDF), source/ (original variable TTFs + license)
lib/core/                  shared core: envelope, pdf (export/import), files (incl. file hand-over via IndexedDB), store (undo + draft), ui (icons, toasts, theme, source link), combo (number field with standard sizes), format, registry, project-info (project fields), issues (notice panel), air (air properties, friction factor λ)
lib/vendor/pdf-lib/        pdf-lib 1.17.1 (MIT)
lib/vendor/fontkit/        @pdf-lib/fontkit 1.1.1 + pako, one ES module (MIT), for Plex in PDFs
lib/vendor/mupdf/          MuPDF.js 1.28.1 (AGPL-3.0): mupdf.js, mupdf-wasm.js, mupdf-wasm.wasm; used only in the workers of tools/pdf-to-dxf and tools/pdf-editor
lib/vendor/embedpdf/       EmbedPDF viewer 3.0.0-next.15 (Apache-2.0), the files its snippet entry embedpdf.js reaches, PATCHES.md, VERSION; used only by tools/pdf-editor
lib/vendor/tesseract/      tesseract.js 7.0.0 + core 7.0.0 (LSTM, SIMD and plain) (Apache-2.0), lang/ deu + eng from tessdata_fast 4.1.0 (Apache-2.0), VERSION; used only by tools/pdf-editor/ocr.js in the editor's worker
tools/<tool-id>/           one folder per tool: AGENTS.md (local contracts), index.html, app.js (UI), calc.js (pure maths), defaults.js, labels.js, report.js (PDF), csv.js, charts.js / drawing.js, style.css
tools/pdf-to-dxf/          PDF → DXF: app.js, preview.js (DOM); worker.js, convert.js, backend.js (MuPDF), ir.js, pipeline.js, geometry.js, dxf.js, scan.js, defaults.js, labels.js (no DOM)
tools/pdf-editor/          PDF-Editor: app.js, bridge.js (EmbedPDF), theme.js, library.js, tools-ui.js, client.js (DOM); worker.js, engine.js (MuPDF), pages.js, images.js, compress.js, ocr.js, autosave.js, svg.js, svg-render.js, stamps.js, zip.js, defaults.js, labels.js (no DOM); symbols/ (SVG + library PDFs), stamps/ (templates)
tools/climate-station/     Klimastation: app.js, map.js (DOM); calc.js, defaults.js, labels.js (no DOM); data/ stations.json (SIA 2028 table 1, no climate values), regions.json (traced region map), places.json (swisstopo localities)
docs/                      DESIGN.md, dragon-ink.md, <tool-id>-method.md (user-facing calculation docs, German), pdf-to-dxf-nova-test.md
docs/dev/pdf-to-dxf/       PROGRESS, DECISIONS, TESTREPORT, TODO-OWNER of the PDF → DXF build (English)
docs/dev/pdf-editor/       PLAN, PROGRESS, DECISIONS, TODO-OWNER of the PDF-Editor build (English)
tests/                     node --test, fixtures/ holds reference PDFs, fixtures/pdf-to-dxf/ the PDF → DXF corpus with *.truth.json, fixtures/pdf-editor/ the editor's test files, helpers/
scripts/                   serve.mjs (dev server, --base for a sub-path), make-fixtures.mjs, build-fonts.py, make-pdf-to-dxf-fixtures.mjs, pdf-to-dxf.mjs (CLI), check-dxf.py (ezdxf), npm-package.mjs + vendor-embedpdf.mjs + vendor-tesseract.mjs (vendoring), make-pdf-editor-fixtures.mjs, build-climate-regions.py + build-places.mjs (Klimastation data)
```

## Rules for tools

- `calc.js`, `defaults.js`, `labels.js`, `report.js` and `csv.js` must not touch the DOM, so Node tests can run them.
- Import `report.js` / `lib/core/pdf.js` lazily (`await import()`): pdf-lib and fontkit are large and only needed for PDF work.
- Register every tool in `lib/core/registry.js` with its discipline (`group`: heating, ventilation, cooling, plumbing, or `general` for tools without a discipline). Keep its row in the README tool table current (see Documentation).
- Every tool gets a German `docs/<tool-id>-method.md` (formulas, assumptions, limits). Keep its link under `Rechenwege` in `README.md` current. Keep detailed behavior and usage contracts in its English `tools/<tool-id>/AGENTS.md`, not in the page or the README.
- Saved data is the envelope from `lib/core/envelope.js`: `{ format, envelopeVersion, tool, version, calcVersion, savedAt, project, inputs, snapshot }`. Only `inputs` and `project` are authoritative; results are always recalculated. `snapshot` holds key results for regression checks. The PDF report embeds the envelope as `data.json`; the start page opens any tool's PDF via the registry.
- Bump `INPUT_VERSION` when the input schema changes (and migrate in `normalizeInputs`). Bump `CALC_VERSION` when results can change, then run `npm run fixtures` to add new reference PDFs. Never delete old fixtures.
- **Beta (owner decision, 2026-10-13):** the tools are not in productive use yet. Until the owner ends the beta, files from older versions (PDF, JSON, draft) need not open: no migration in `normalizeInputs`, no compatibility code. Bump `INPUT_VERSION` anyway, so the version warning shows. Old fixtures of a tool may be deleted when its schema changes. `normalizeInputs` must still not throw on old or foreign data. Backwards compatibility becomes a feature later.
- `normalizeInputs` must be idempotent (round-trip test: export → import → export keeps the data identical).
- Editable catalogues (ζ values, roughness, limits) are part of `inputs` and saved with every file.
- **Exception PDF → DXF:** this tool saves only the DXF. No PDF report, no JSON, no CSV, no envelope, no ⋯ menu. Its input is the user's PDF, which is never stored; only the settings are kept as a browser draft (`normalizeInputs` in its `defaults.js`, idempotent as everywhere). Reason: the result belongs in CAD, and a plan PDF must not be copied into another file. It receives PDFs from the PDF-Editor's `→ DXF` button (IndexedDB, `stashFileHandoff`).
- **Exception PDF-Editor (owner decision, 2026-10-19):** the editor saves only the edited PDF. No envelope, no `data.json`, no JSON or CSV. Its ⋯ menu holds the document tools instead of the standard entries. Its settings are a browser draft (`normalizeSettings` in its `defaults.js`, idempotent). Autosave keeps the user's PDF in IndexedDB on this device only. The start page hands PDFs without `data.json` to this tool; its `→ DXF` icon button hands the current file on to PDF → DXF with `stashFileHandoff`.
- **Exception Klimastation (owner decision, 2026-10-20):** the tool saves nothing but a browser draft and the page URL (`normalizeInputs` in its `defaults.js`, idempotent). No envelope, no PDF, JSON or CSV, no ⋯ menu; its primary action copies one tab-separated row for Excel. It contains no SIA 2028 climate values (copyright): only station names, positions, heights, regions and the traced region map. Its address search and height query call swisstopo (`api3.geo.admin.ch`); place search and ranking run locally.
- MuPDF (10 MB WebAssembly) is loaded only by `tools/pdf-to-dxf/worker.js` → `backend.js` and `tools/pdf-editor/worker.js` → `engine.js`, always with `await import()`, never by a page module.
- EmbedPDF (`lib/vendor/embedpdf/`) and tesseract.js (`lib/vendor/tesseract/`) are imported only by `tools/pdf-editor/` and only with `await import()`: EmbedPDF by `bridge.js` when the editor page starts, tesseract by `ocr.js` inside the editor's worker on the first OCR. `tests/lazy-imports.test.js` checks the import graph of every page and the allowed modules.
- EmbedPDF draws its own UI in a shadow DOM. Its theme tokens (`--epdf-*`) map to `assets/css/tokens.css` in `tools/pdf-editor/style.css`; its layout and icons inside the viewer are accepted. The page around it (app bar, notice row, own dialogs) follows `docs/DESIGN.md` fully.

## Shared application behavior

- Calculations and conversion run locally in the browser. There is no application backend, sign-in or upload of input files. Exception: the Klimastation sends a typed address search text or a site coordinate to swisstopo.
- The folder action `Öffnen` and drag-and-drop accept HLKS-Tools PDF and JSON files. The homepage routes them through the registry.
- A PDF without HLKS-Tools data opens in the PDF-Editor; its `→ DXF` button hands it on to PDF → DXF. Preserve this handoff when changing imports.
- Keep the original report PDF. Other software can remove its `data.json` attachment when printing or saving it again.
- Drafts belong to one browser on one device. The homepage shows the saved calculation name below its tool.
- The standard ⋯ menu contains `Neue Berechnung`, `Beispiel laden`, `JSON speichern` and `CSV speichern`.
- JSON contains the calculation data. CSV uses semicolons for Excel. PDF → DXF has no ⋯ menu or these exports. The PDF-Editor's ⋯ menu holds its document tools instead.
- Seeded examples and `Beispiel laden` set `project.name` to exactly `Beispiel`. Preserve other editable project names.
- Recalculate imported results from inputs. A calculation-version warning shows both versions; changed key results show the old and new values.
- Shared controls: ↶ / ↷ undo and redo, folder opens a file, ↓ PDF exports, and ⋯ opens further actions.
- The theme button switches between `Hell` (sun) and `Dunkel` (moon); its icon shows the current scheme. Without a stored choice the page follows the system setting. There is no separate `System` state (owner decision, 2026-10-15).
- Strg+Z / Strg+Y undo and redo. Strg+O opens a file. Strg+S saves the tool's primary export, PDF or DXF.
- Deletion offers undo in its toast. Catalogue reset uses ↺. Hint arrows jump to the affected row.
- On the homepage, hover or keyboard focus opens the ready branch's valve or damper and starts flow to its terminal.

## Shared workspace header

These rules apply to existing and new tools.

- Calculation tools use one `.workspace-head` row below the app bar. Mount `mountProjectInfo()` from `lib/core/project-info.js` on the left. Mount `createIssuePanel()` from `lib/core/issues.js` on the right.
- Keep the row 32 px high with `--issue-bar-h`. It stays visible below the app bar while the page scrolls. Keep its height when notices appear, change, or disappear.
- Keep the project name visible and editable inline. An icon button opens `Projekt-Nr.`, `Bearbeiter`, and `Datum` in a dropdown overlay. Preserve these fields in saved files.
- Sort notices by severity: errors, warnings, then information. Use severity colors and icons together. Show a short summary and a jump action for the affected input, row, or receiver.
- The notice count opens the full list as an overlay. Project details and notice lists must not move the workspace. Keep technical details in one primary place, with short indicators elsewhere when necessary.
- Keep the notice area visible without messages. Its empty state keeps a check icon on the left and `0 Hinweise` on the right, without repeating `Keine Hinweise` visibly. Preserve the accessible empty-state label. This state does not certify the calculation.
- Keep controls keyboard accessible. Escape closes an overlay and returns focus to its trigger. Outside clicks or focus close the overlay. Retain focus when notices update or disappear.
- PDF → DXF has no project fields. It uses the shared notice row alone above the preview. Its empty, processing, and cancelled states use neutral status messages.
- The PDF-Editor has no project fields either. Its notice row stands alone above the viewer: no document, opening, password needed, autosave available, document-tool and OCR progress, errors.
- The Klimastation has no project fields either. Its notice row stands alone above the search and map: height, site outside the regions, border proximity, station chosen by hand.

## Calculation tabs and catalogues

- Calculation tools use `mountCalculationTabs()` from `lib/core/calculation-tabs.js` below the shared workspace header. Each tab holds one independent calculation. Schalldämpfer uses its existing paths as calculations.
- Use the shared add, duplicate, and delete icons. Keep at least one calculation. Deletion offers undo. Arrow keys, Home, and End select tabs.
- Edit calculation names only in the tab itself (owner decision, 2026-10-15): a click on the active tab, a double click or F2 opens an inline field; Enter or leaving the field saves, Escape cancels. A new calculation opens this field at once. Pass `onRename` and each item's raw `name`; an empty name shows the fallback (`Berechnung N`, or the tool's `placeholder`). Tools have no separate name field below the tabs. Show a short key result beside each tab name. Indicate limit violations with a color and an icon.
- Project fields and editable catalogues apply to all calculations in the project. Calculation inputs and pinned variants belong to their calculation. Duplicates must not share mutable calculation data.
- JSON and PDF data contain every calculation. PDF reports and CSV exports include every calculation, with its name. Recalculate results from the saved inputs.
- During beta, reject imports with older input versions before normalization. Show the saved and current versions. Do not replace an open project with reset inputs from an unsupported schema.
- Collect notices from all calculations. Selecting a notice activates its calculation before focusing the affected field, row, or receiver.
- Tools with catalogue editors use one small book icon beside the calculation tabs. Open the editor with `mountCatalogDialog()` from `lib/core/catalog-dialog.js`. Keep the workspace in place beneath this window.
- The Klimastation has no calculation tabs or editable project catalogues.
- PDF → DXF and the PDF-Editor have no calculation tabs or editable project catalogues. Put independent settings above the preset selector and all preset-controlled options below it. While a named preset applies, visibly dim its controlled labels, values and borders using the existing tokens, without extra selection outlines. Keep them editable and show full keyboard focus. A changed option makes the preset `Benutzerdefiniert`.

## Commands

Node.js 20 or newer runs the dev server and tests. There is no build step and no npm dependency installation.
The optional Python helpers have their own prerequisites.

- `npm run serve` – dev server on http://localhost:8080
- `npm test` – all tests (calculation, envelope, PDF save/open/resave round trip, reference PDFs in `tests/fixtures/`)
- `npm run fixtures` – write reference PDFs for the current calculation version (cases per tool in `scripts/make-fixtures.mjs`)
- `python scripts/build-fonts.py` – rebuild font subsets from `assets/fonts/source/` (needs fonttools + brotli; output is byte-different each run, only commit when the subset really changes)
- `node scripts/serve.mjs 8080 --base Tools-HLKS-WEB` – dev server at http://localhost:8080/Tools-HLKS-WEB/; checks relative paths under a sub-path like GitHub Pages
- `node scripts/pdf-to-dxf.mjs plan.pdf --out dir [--preset nova|geometry|compat] [--scan] [--json]` – convert with the tool's code, prints statistics
- `node scripts/make-pdf-to-dxf-fixtures.mjs` – rewrite the PDF → DXF test corpus (only when the corpus should change)
- `python scripts/check-dxf.py file.dxf …` – check DXF files with ezdxf (recover + audit; install with `pip install ezdxf`); not part of `npm test`
- `node scripts/vendor-embedpdf.mjs [version]` – vendor EmbedPDF from the npm registry (integrity checked) into `lib/vendor/embedpdf/`, apply `PATCHES.md`, regenerate `tools/pdf-editor/viewer-strings.js`
- `node scripts/vendor-tesseract.mjs` – vendor tesseract.js and its core from the npm registry (integrity checked) and the deu + eng models from tessdata_fast (pinned commit, SHA-256 checked) into `lib/vendor/tesseract/`; versions are constants in the script
- `node scripts/make-pdf-editor-fixtures.mjs` – rewrite the PDF-Editor test files in `tests/fixtures/pdf-editor/` (only when they should change)
- `python scripts/build-climate-regions.py map.svg` – build the Klimastation regions and map lines from the owner's vector redraw of SIA 2028 figure 1 (not in the repository; needs numpy + Pillow); see [tools/climate-station/AGENTS.md](tools/climate-station/AGENTS.md#rebuilding-the-data)
- `node scripts/build-places.mjs AMTOVZ_CSV_LV95.csv` – rebuild the Klimastation localities from swisstopo's directory of localities
- `node scripts/build-symbol-library.mjs` – rebuild the PDF-Editor's symbol library PDFs from `tools/pdf-editor/symbols/*.svg` (commit the result; `npm test` fails when they are out of date)
- Real plans for local tests go into `tests/fixtures/pdf-to-dxf/real/` (git-ignored); `npm test` converts every PDF there.
- Full PDF → DXF CLI options and test procedures: [tools/pdf-to-dxf/AGENTS.md](tools/pdf-to-dxf/AGENTS.md#development-helpers).

## Tool inventory (owner decision, 2026-10-13)

The start page shows three entries per discipline. Lüftung has three ready tools. Klima has the Klimastation and `Platzhalter 1` to `Platzhalter 2`. Heizung and Sanitär use `Platzhalter 1` to `Platzhalter 3`, with status `placeholder` and no path. These slots do not name or promise future tools. The registry generates them from a count, so more entries can be added later.

Current implementation notes:

- **Kanalrechner** – done as a test version (SIA 382/1 tables 49 and 50).
- **Schalldämpfer** – done as a test version, version 2 since 2026-10-13 (paths as plain level lists like the owner's Excel sheet, dB / dB(A) per line, design panel with housing B × H, front view and variants; manufacturer data Trox, Schako, Lindab; targets SIA 2024 / SIA 181 / LSV). Open: interpolation in L and s, LSV sum over paths (see `docs/silencer-plan.md`).

Open technical items:

- PWA / service worker so the site works offline and can be installed.
- Permanent storage beyond the browser draft, e.g. a Google Drive integration (undecided).
- Excel export as `.xlsx` (CSV exists).

Available: shared core, PDF export/import with embedded data, start page import, calcVersion warning, reference PDFs, Druckverlust Lüftung, Kanalrechner, Schalldämpfer, PDF → DXF (test version; vector and scanned PDFs, R2000 and R12; open: the owner's test in Trimble Nova, `docs/pdf-to-dxf-nova-test.md`), PDF-Editor (test version; open: the owner's checks in `docs/dev/pdf-editor/TODO-OWNER.md`), Klimastation (test version; station choice for SIA 2028, copy to Excel).

## License

- Copyright (C) 2025–2026 Fabio. Users can use, modify and redistribute the tools under AGPL-3.0-or-later.
- A modified version distributed or offered online must disclose its source under the same license. Keep the source link visible.
- The repo is AGPL-3.0-or-later (`LICENSE`). Every own source file (`.js`, `.mjs`, `.css`, `.html`, `.py` outside `lib/vendor/`, `assets/fonts/` and `tests/fixtures/`) starts with `// SPDX-License-Identifier: AGPL-3.0-or-later` (`/* … */` in CSS, `#` in Python, `<!-- … -->` on line 2 of HTML, after the doctype). `tests/spdx.test.js` checks it.
- New third-party code only under an AGPL-compatible license: MIT, BSD, ISC, Zlib, Apache-2.0, BSL-1.0, LGPL-3.0, GPL-3.0, AGPL-3.0; fonts under OFL. Not allowed: GPL-2.0-only, proprietary, unclear.
- Every vendored library lives in `lib/vendor/<name>/` with its `LICENSE` and is listed in `README.md` (section "Lizenz und Fremdcode"). A vendored file changed by this project starts with a notice comment and is listed in that library's `PATCHES.md` (Apache-2.0 section 4b).
- EmbedPDF (Apache-2.0) and tesseract.js (Apache-2.0) are vendored with their `LICENSE` and a `VERSION` file. Update them only with their vendoring scripts (`scripts/vendor-embedpdf.mjs`, `scripts/vendor-tesseract.mjs`) and run `npm test`.
- Logic ported from BentoPDF (AGPL-3.0-only) keeps that license: such a file starts with `// SPDX-License-Identifier: AGPL-3.0-only` and, on the next line, `// Ported from BentoPDF <source path> at <commit>`. `tests/spdx.test.js` accepts this identifier only together with that attribution line. BentoPDF itself, Ghostscript, PyMuPDF and LibreOffice WASM are not vendored.
- Every page calls `mountSourceLink()` from `lib/core/ui.js`: a code icon (`</>`) in the app bar, before the theme button, linking to the source code (AGPL section 13). There is no footer (owner decision, 2026-10-15).
- MuPDF.js 1.28.1 is by Artifex Software, vendored unchanged from the npm package `mupdf` under AGPL-3.0-or-later.
- MuPDF upstream: [source repository](https://cgit.ghostscript.com/mupdf.git/) and [project website](https://mupdf.com).

## Repository

- GitHub: `mongimotz/Tools-HLKS-WEB` (public, branch `main`).
- Live site (GitHub Pages, deploys from `main` / root on every push): https://hlks.org/ (custom domain since 2026-10-21; `CNAME` in the root holds it, DNS at Cloudflare as "DNS only"). The old https://mongimotz.github.io/Tools-HLKS-WEB/ redirects there.
- Keep `CNAME` in the repository root. Browser drafts and autosave are per origin, so data stored under github.io does not appear on hlks.org.
- Keep `.nojekyll` in the repository root. GitHub Pages usually publishes a push within one to two minutes.
