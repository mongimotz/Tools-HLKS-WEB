In-Chat responses should be kept concise and to the point.

## Project conventions

- **Language:** code, identifiers, comments, file and folder names in English. Everything the user sees (UI, PDF, error messages, `README.md`, `docs/*-method.md`) in German (Swiss spelling, no ß). Agent/developer docs (`AGENTS.md`, `docs/DESIGN.md`) in English.
- **No build step.** Plain HTML, CSS and ES modules. A `git push` is the deploy (GitHub Pages). Use relative paths only, the site may live under a sub-path. The same files must run unchanged on any static host (e.g. Hetzner, Cloudflare).
- **No CDN.** Third-party code goes into `lib/vendor/` with its license. Fonts live in `assets/fonts/`.
- **Design:** follow `docs/DESIGN.md`, especially its owner-set principles: minimal decoration, no explanations in the product (they go to agent or method documentation), symbols over words, no harsh gradients, red-green colourblind safe, simplicity and speed first. Never use the middle dot (·) as a separator in UI or PDF text; use nothing or " | ". Colours only from `docs/dragon-ink.md`, fonts only IBM Plex Sans + Mono, always via the tokens in `assets/css/tokens.css` (single source; the PDF reads its colours from it, see "Changing the look" in `docs/DESIGN.md`).
- **Consistency:** colours, fonts and sizes are shared by all tools; layouts may differ where practical. Only the start page may carry a visual idea (one small network per discipline), and it must never slow anything down.
- **Tools without a discipline** (group `general` in the registry, with an `icon` name from `lib/core/ui.js`) appear as a tile in the untitled section at the end of the start page. New ones show up there automatically; `home.js` needs no change.

## Documentation (owner decision, 2026-10-13)

`README.md` is edited only by the project owner. Agents must not edit it or add notes, work logs, implementation details, or development instructions there. Tell the owner when a README update is needed.
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

## Structure

```
index.html                 start page (tools as one network per discipline H, L, K, S, tiles for tools without one, open any PDF)
assets/css/                tokens.css, base.css (shared), home.css
assets/js/home.js          start page logic
assets/fonts/              font subsets with generic names: sans/mono.woff2 (web), pdf/*.ttf (PDF), source/ (original variable TTFs + license)
lib/core/                  shared core: envelope, pdf (export/import), files (incl. file hand-over via IndexedDB), store (undo + draft), ui (icons, toasts, theme, source link), combo (number field with standard sizes), format, registry, project-info (project fields), issues (notice panel), air (air properties, friction factor λ)
lib/vendor/pdf-lib/        pdf-lib 1.17.1 (MIT)
lib/vendor/fontkit/        @pdf-lib/fontkit 1.1.1 + pako, one ES module (MIT), for Plex in PDFs
lib/vendor/mupdf/          MuPDF.js 1.28.1 (AGPL-3.0): mupdf.js, mupdf-wasm.js, mupdf-wasm.wasm; used only by tools/pdf-to-dxf in its worker
tools/<tool-id>/           one folder per tool: AGENTS.md (local contracts), index.html, app.js (UI), calc.js (pure maths), defaults.js, labels.js, report.js (PDF), csv.js, charts.js / drawing.js, style.css
tools/pdf-to-dxf/          PDF → DXF: app.js, preview.js (DOM); worker.js, convert.js, backend.js (MuPDF), ir.js, pipeline.js, geometry.js, dxf.js, scan.js, defaults.js, labels.js (no DOM)
docs/                      DESIGN.md, dragon-ink.md, <tool-id>-method.md (user-facing calculation docs, German), pdf-to-dxf-nova-test.md
docs/dev/pdf-to-dxf/       PROGRESS, DECISIONS, TESTREPORT, TODO-OWNER of the PDF → DXF build (English)
tests/                     node --test, fixtures/ holds reference PDFs, fixtures/pdf-to-dxf/ the PDF → DXF corpus with *.truth.json, helpers/
scripts/                   serve.mjs (dev server, --base for a sub-path), make-fixtures.mjs, build-fonts.py, make-pdf-to-dxf-fixtures.mjs, pdf-to-dxf.mjs (CLI), check-dxf.py (ezdxf)
```

## Rules for tools

- `calc.js`, `defaults.js`, `labels.js`, `report.js` and `csv.js` must not touch the DOM, so Node tests can run them.
- Import `report.js` / `lib/core/pdf.js` lazily (`await import()`): pdf-lib and fontkit are large and only needed for PDF work.
- Register every tool in `lib/core/registry.js` with its discipline (`group`: heating, ventilation, cooling, plumbing, or `general` for tools without a discipline). Tell the owner when its entry in the README tool table needs an update; do not edit the README.
- Every tool gets a German `docs/<tool-id>-method.md` (formulas, assumptions, limits). The owner maintains its link in `README.md`. Keep detailed behavior and usage contracts in its English `tools/<tool-id>/AGENTS.md`, not in the page or the README.
- Saved data is the envelope from `lib/core/envelope.js`: `{ format, envelopeVersion, tool, version, calcVersion, savedAt, project, inputs, snapshot }`. Only `inputs` and `project` are authoritative; results are always recalculated. `snapshot` holds key results for regression checks. The PDF report embeds the envelope as `data.json`; the start page opens any tool's PDF via the registry.
- Bump `INPUT_VERSION` when the input schema changes (and migrate in `normalizeInputs`). Bump `CALC_VERSION` when results can change, then run `npm run fixtures` to add new reference PDFs. Never delete old fixtures.
- **Beta (owner decision, 2026-10-13):** the tools are not in productive use yet. Until the owner ends the beta, files from older versions (PDF, JSON, draft) need not open: no migration in `normalizeInputs`, no compatibility code. Bump `INPUT_VERSION` anyway, so the version warning shows. Old fixtures of a tool may be deleted when its schema changes. `normalizeInputs` must still not throw on old or foreign data. Backwards compatibility becomes a feature later.
- `normalizeInputs` must be idempotent (round-trip test: export → import → export keeps the data identical).
- Editable catalogues (ζ values, roughness, limits) are part of `inputs` and saved with every file.
- **Exception PDF → DXF:** this tool saves only the DXF. No PDF report, no JSON, no CSV, no envelope, no ⋯ menu. Its input is the user's PDF, which is never stored; only the settings are kept as a browser draft (`normalizeInputs` in its `defaults.js`, idempotent as everywhere). Reason: the result belongs in CAD, and a plan PDF must not be copied into another file. The start page hands PDFs without `data.json` to this tool (IndexedDB, `stashFileHandoff`).
- MuPDF (10 MB WebAssembly) is loaded only by `tools/pdf-to-dxf/worker.js` → `backend.js` with `await import()`. No other page may import it; `tests/pdf-to-dxf.robust.test.js` checks the import graph.

## Shared application behavior

- Calculations and conversion run locally in the browser. There is no application backend, sign-in or upload of input files.
- The folder action `Öffnen` and drag-and-drop accept HLKS-Tools PDF and JSON files. The homepage routes them through the registry.
- A PDF without HLKS-Tools data opens in PDF → DXF. Preserve this handoff when changing imports.
- Keep the original report PDF. Other software can remove its `data.json` attachment when printing or saving it again.
- Drafts belong to one browser on one device. The homepage shows the saved calculation name below its tool.
- The standard ⋯ menu contains `Neue Berechnung`, `Beispiel laden`, `JSON speichern` and `CSV speichern`.
- JSON contains the calculation data. CSV uses semicolons for Excel. PDF → DXF has no ⋯ menu or these exports.
- Seeded examples and `Beispiel laden` set `project.name` to exactly `Beispiel`. Preserve other editable project names.
- Recalculate imported results from inputs. A calculation-version warning shows both versions; changed key results show the old and new values.
- Shared controls: ↶ / ↷ undo and redo, folder opens a file, ↓ PDF exports, and ⋯ opens further actions.
- The half-circle, sun and moon indicate `System`, `Hell` and `Dunkel`. The theme button cycles through those states.
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

## Calculation tabs and catalogues

- Calculation tools use `mountCalculationTabs()` from `lib/core/calculation-tabs.js` below the shared workspace header. Each tab holds one independent calculation. Schalldämpfer uses its existing paths as calculations.
- Use the shared add, duplicate, and delete icons. Keep at least one calculation. Deletion offers undo. Arrow keys, Home, and End select tabs.
- Keep calculation names editable in their existing name fields. Show a short key result beside each tab name. Indicate limit violations with a color and an icon.
- Project fields and editable catalogues apply to all calculations in the project. Calculation inputs and pinned variants belong to their calculation. Duplicates must not share mutable calculation data.
- JSON and PDF data contain every calculation. PDF reports and CSV exports include every calculation, with its name. Recalculate results from the saved inputs.
- During beta, reject imports with older input versions before normalization. Show the saved and current versions. Do not replace an open project with reset inputs from an unsupported schema.
- Collect notices from all calculations. Selecting a notice activates its calculation before focusing the affected field, row, or receiver.
- Tools with catalogue editors use one small book icon beside the calculation tabs. Open the editor with `mountCatalogDialog()` from `lib/core/catalog-dialog.js`. Keep the workspace in place beneath this window.
- PDF → DXF has no calculation tabs or editable project catalogues. Put independent settings above the preset selector and all preset-controlled options below it. While a named preset applies, visibly dim its controlled labels, values and borders using the existing tokens, without extra selection outlines. Keep them editable and show full keyboard focus. A changed option makes the preset `Benutzerdefiniert`.

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
- Real plans for local tests go into `tests/fixtures/pdf-to-dxf/real/` (git-ignored); `npm test` converts every PDF there.
- Full PDF → DXF CLI options and test procedures: [tools/pdf-to-dxf/AGENTS.md](tools/pdf-to-dxf/AGENTS.md#development-helpers).

## Tool inventory (owner decision, 2026-10-13)

The start page shows three entries per discipline. Lüftung has three ready tools. Heizung, Klima and Sanitär use `Platzhalter 1` to `Platzhalter 3`, with status `placeholder` and no path. These slots do not name or promise future tools. The registry generates them from a count, so more entries can be added later.

Current implementation notes:

- **Kanalrechner** – done as a test version (SIA 382/1 tables 49 and 50).
- **Schalldämpfer** – done as a test version, version 2 since 2026-10-13 (paths as plain level lists like the owner's Excel sheet, dB / dB(A) per line, design panel with housing B × H, front view and variants; manufacturer data Trox, Schako, Lindab; targets SIA 2024 / SIA 181 / LSV). Open: interpolation in L and s, LSV sum over paths (see `docs/silencer-plan.md`).

Open technical items:

- PWA / service worker so the site works offline and can be installed.
- Permanent storage beyond the browser draft, e.g. a Google Drive integration (undecided).
- Excel export as `.xlsx` (CSV exists).
- Own domain: buy it, add `CNAME`, set the DNS record, enable HTTPS in the Pages settings.

Available: shared core, PDF export/import with embedded data, start page import, calcVersion warning, reference PDFs, Druckverlust Lüftung, Kanalrechner, Schalldämpfer, PDF → DXF (test version; vector and scanned PDFs, R2000 and R12; open: the owner's test in Trimble Nova, `docs/pdf-to-dxf-nova-test.md`).

## License

- Copyright (C) 2025–2026 Fabio. Users can use, modify and redistribute the tools under AGPL-3.0-or-later.
- A modified version distributed or offered online must disclose its source under the same license. Keep the source footer visible.
- The repo is AGPL-3.0-or-later (`LICENSE`). Every own source file (`.js`, `.mjs`, `.css`, `.html`, `.py` outside `lib/vendor/`, `assets/fonts/` and `tests/fixtures/`) starts with `// SPDX-License-Identifier: AGPL-3.0-or-later` (`/* … */` in CSS, `#` in Python, `<!-- … -->` on line 2 of HTML, after the doctype). `tests/spdx.test.js` checks it.
- New third-party code only under an AGPL-compatible license: MIT, BSD, ISC, Zlib, Apache-2.0, BSL-1.0, LGPL-3.0, GPL-3.0, AGPL-3.0; fonts under OFL. Not allowed: GPL-2.0-only, proprietary, unclear.
- Every vendored library lives in `lib/vendor/<name>/` with its `LICENSE` and is listed in `README.md` (section "Lizenz und Fremdcode").
- Every page calls `mountSourceLink()` from `lib/core/ui.js`: a small footer link to the source code (AGPL section 13).
- MuPDF.js 1.28.1 is by Artifex Software, vendored unchanged from the npm package `mupdf` under AGPL-3.0-or-later.
- MuPDF upstream: [source repository](https://cgit.ghostscript.com/mupdf.git/) and [project website](https://mupdf.com).

## Repository

- GitHub: `mongimotz/Tools-HLKS-WEB` (public, branch `main`).
- Live site (GitHub Pages, deploys from `main` / root on every push): https://mongimotz.github.io/Tools-HLKS-WEB/
- Keep `.nojekyll` in the repository root. GitHub Pages usually publishes a push within one to two minutes.
