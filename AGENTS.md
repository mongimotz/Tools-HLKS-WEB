In-Chat responses should be kept concise and to the point.

## Project conventions

- **Language:** code, identifiers, comments, file and folder names in English. Everything the user sees (UI, PDF, error messages, `README.md`, `docs/*-method.md`) in German (Swiss spelling, no ß). Agent/developer docs (`AGENTS.md`, `docs/DESIGN.md`) in English.
- **No build step.** Plain HTML, CSS and ES modules. A `git push` is the deploy (GitHub Pages). Use relative paths only, the site may live under a sub-path. The same files must run unchanged on any static host (e.g. Hetzner, Cloudflare).
- **No CDN.** Third-party code goes into `lib/vendor/` with its license. Fonts live in `assets/fonts/`.
- **Design:** follow `docs/DESIGN.md`, especially its owner-set principles: minimal decoration, no explanations in the product (they go to `README.md` / `docs/`), symbols over words, no harsh gradients, red-green colourblind safe, simplicity and speed first. Never use the middle dot (·) as a separator in UI or PDF text; use nothing or " | ". Colours only from `docs/dragon-ink.md`, fonts only IBM Plex Sans + Mono, always via the tokens in `assets/css/tokens.css` (single source; the PDF reads its colours from it, see "Changing the look" in `docs/DESIGN.md`).
- **Consistency:** colours, fonts and sizes are shared by all tools; layouts may differ where practical. Only the start page may carry a visual idea (one small network per discipline), and it must never slow anything down.
- **Tools without a discipline** (group `general` in the registry, with an `icon` name from `lib/core/ui.js`) appear as a tile in the untitled section at the end of the start page. New ones show up there automatically; `home.js` needs no change.

## Structure

```
index.html                 start page (tools as one network per discipline H, L, K, S, tiles for tools without one, open any PDF)
assets/css/                tokens.css, base.css (shared), home.css
assets/js/home.js          start page logic
assets/fonts/              font subsets with generic names: sans/mono.woff2 (web), pdf/*.ttf (PDF), source/ (original variable TTFs + license)
lib/core/                  shared core: envelope, pdf (export/import), files (incl. file hand-over via IndexedDB), store (undo + draft), ui (icons, toasts, theme, source link), combo (number field with standard sizes), format, registry, project-info, air (air properties, friction factor λ)
lib/vendor/pdf-lib/        pdf-lib 1.17.1 (MIT)
lib/vendor/fontkit/        @pdf-lib/fontkit 1.1.1 + pako, one ES module (MIT), for Plex in PDFs
lib/vendor/mupdf/          MuPDF.js 1.28.1 (AGPL-3.0): mupdf.js, mupdf-wasm.js, mupdf-wasm.wasm; used only by tools/pdf-to-dxf in its worker
tools/<tool-id>/           one folder per tool: index.html, app.js (UI), calc.js (pure maths), defaults.js, labels.js, report.js (PDF), csv.js, charts.js / drawing.js, style.css
tools/pdf-to-dxf/          PDF → DXF: app.js, preview.js (DOM); worker.js, convert.js, backend.js (MuPDF), ir.js, pipeline.js, geometry.js, dxf.js, scan.js, defaults.js, labels.js (no DOM)
docs/                      DESIGN.md, dragon-ink.md, <tool-id>-method.md (user-facing calculation docs, German), pdf-to-dxf-nova-test.md
docs/dev/pdf-to-dxf/       PROGRESS, DECISIONS, TESTREPORT, TODO-OWNER of the PDF → DXF build (English)
tests/                     node --test, fixtures/ holds reference PDFs, fixtures/pdf-to-dxf/ the PDF → DXF corpus with *.truth.json, helpers/
scripts/                   serve.mjs (dev server, --base for a sub-path), make-fixtures.mjs, build-fonts.py, make-pdf-to-dxf-fixtures.mjs, pdf-to-dxf.mjs (CLI), check-dxf.py (ezdxf)
```

## Rules for tools

- `calc.js`, `defaults.js`, `labels.js`, `report.js` and `csv.js` must not touch the DOM, so Node tests can run them.
- Import `report.js` / `lib/core/pdf.js` lazily (`await import()`): pdf-lib and fontkit are large and only needed for PDF work.
- Register every tool in `lib/core/registry.js` with its discipline (`group`: heating, ventilation, cooling, plumbing, or `general` for tools without a discipline) and describe it in the tool table of `README.md`.
- Every tool gets a German `docs/<tool-id>-method.md` (formulas, assumptions, limits) linked from `README.md`. Usage hints for the tool go into `README.md`, not into the page.
- Saved data is the envelope from `lib/core/envelope.js`: `{ format, envelopeVersion, tool, version, calcVersion, savedAt, project, inputs, snapshot }`. Only `inputs` and `project` are authoritative; results are always recalculated. `snapshot` holds key results for regression checks. The PDF report embeds the envelope as `data.json`; the start page opens any tool's PDF via the registry.
- Bump `INPUT_VERSION` when the input schema changes (and migrate in `normalizeInputs`). Bump `CALC_VERSION` when results can change, then run `npm run fixtures` to add new reference PDFs. Never delete old fixtures.
- **Beta (owner decision, 2026-10-13):** the tools are not in productive use yet. Until the owner ends the beta, files from older versions (PDF, JSON, draft) need not open: no migration in `normalizeInputs`, no compatibility code. Bump `INPUT_VERSION` anyway, so the version warning shows. Old fixtures of a tool may be deleted when its schema changes. `normalizeInputs` must still not throw on old or foreign data. Backwards compatibility becomes a feature later.
- `normalizeInputs` must be idempotent (round-trip test: export → import → export keeps the data identical).
- Editable catalogues (ζ values, roughness, limits) are part of `inputs` and saved with every file.
- **Exception PDF → DXF:** this tool saves only the DXF. No PDF report, no JSON, no CSV, no envelope, no ⋯ menu. Its input is the user's PDF, which is never stored; only the settings are kept as a browser draft (`normalizeInputs` in its `defaults.js`, idempotent as everywhere). Reason: the result belongs in CAD, and a plan PDF must not be copied into another file. The start page hands PDFs without `data.json` to this tool (IndexedDB, `stashFileHandoff`).
- MuPDF (10 MB WebAssembly) is loaded only by `tools/pdf-to-dxf/worker.js` → `backend.js` with `await import()`. No other page may import it; `tests/pdf-to-dxf.robust.test.js` checks the import graph.

## Commands

- `npm run serve` – dev server on http://localhost:8080
- `npm test` – all tests (calculation, envelope, PDF round trip, fixture regression)
- `npm run fixtures` – write reference PDFs for the current calculation version (cases per tool in `scripts/make-fixtures.mjs`)
- `python scripts/build-fonts.py` – rebuild font subsets from `assets/fonts/source/` (needs fonttools + brotli; output is byte-different each run, only commit when the subset really changes)
- `node scripts/serve.mjs 8080 --base Tools-HLKS-WEB` – dev server under a sub-path, like GitHub Pages
- `node scripts/pdf-to-dxf.mjs plan.pdf --out dir [--preset nova|geometry|compat] [--scan] [--json]` – convert with the tool's code, prints statistics
- `node scripts/make-pdf-to-dxf-fixtures.mjs` – rewrite the PDF → DXF test corpus (only when the corpus should change)
- `python scripts/check-dxf.py file.dxf …` – check DXF files with ezdxf (recover + audit); not part of `npm test`
- Real plans for local tests go into `tests/fixtures/pdf-to-dxf/real/` (git-ignored); `npm test` converts every PDF there.

## Roadmap (from the original plan)

Planned tools (status `planned` in the registry):

- **Kanalrechner** – done as a test version (SIA 382/1 tables 49 and 50). Idea for later: an experimental version with a 3D model and a fluid simulation.
- **Schalldämpfer** – done as a test version (manufacturer data Trox, Schako, Lindab; targets SIA 181 / LSV; mode "Vorschlag"). Open: edge-gap correction, interpolation in L, LSV sum over strands (see `docs/silencer-plan.md`).
- **Monoblock** – air handling unit: fan power, heating and cooling capacity, humidification, filter sizing.
- **Dämmung** – insulation thickness estimate.
- Later candidates: Messprotokoll, Kühllast-Check.

Open technical items:

- PWA / service worker so the site works offline and can be installed.
- Permanent storage beyond the browser draft, e.g. a Google Drive integration (undecided).
- Excel export as `.xlsx` (CSV exists).
- Own domain: buy it, add `CNAME`, set the DNS record, enable HTTPS in the Pages settings.

Done from the plan: shared core, PDF export/import with embedded data, start page import, calcVersion warning, reference PDFs, Druckverlust Lüftung, Kanalrechner, Schalldämpfer, PDF → DXF (test version; vector and scanned PDFs, R2000 and R12; open: the owner's test in Trimble Nova, `docs/pdf-to-dxf-nova-test.md`).

## License

- The repo is AGPL-3.0-or-later (`LICENSE`). Every own source file (`.js`, `.mjs`, `.css`, `.html`, `.py` outside `lib/vendor/`, `assets/fonts/` and `tests/fixtures/`) starts with `// SPDX-License-Identifier: AGPL-3.0-or-later` (`/* … */` in CSS, `#` in Python, `<!-- … -->` on line 2 of HTML, after the doctype). `tests/spdx.test.js` checks it.
- New third-party code only under an AGPL-compatible license: MIT, BSD, ISC, Zlib, Apache-2.0, BSL-1.0, LGPL-3.0, GPL-3.0, AGPL-3.0; fonts under OFL. Not allowed: GPL-2.0-only, proprietary, unclear.
- Every vendored library lives in `lib/vendor/<name>/` with its `LICENSE` and is listed in `README.md` (section "Lizenz und Fremdcode").
- Every page calls `mountSourceLink()` from `lib/core/ui.js`: a small footer link to the source code (AGPL section 13).

## Repository

- GitHub: `mongimotz/Tools-HLKS-WEB` (public, branch `main`).
- Live site (GitHub Pages, deploys from `main` / root on every push): https://mongimotz.github.io/Tools-HLKS-WEB/
