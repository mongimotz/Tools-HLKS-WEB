In-Chat responses should be kept concise and to the point.

## Project conventions

- **Language:** code, identifiers, comments, file and folder names in English. Everything the user sees (UI, PDF, error messages, `README.md`, `docs/*-method.md`) in German (Swiss spelling, no ß). Agent/developer docs (`AGENTS.md`, `docs/DESIGN.md`) in English.
- **No build step.** Plain HTML, CSS and ES modules. A `git push` is the deploy (GitHub Pages). Use relative paths only, the site may live under a sub-path. The same files must run unchanged on any static host (e.g. Hetzner, Cloudflare).
- **No CDN.** Third-party code goes into `lib/vendor/` with its license. Fonts live in `assets/fonts/`.
- **Design:** follow `docs/DESIGN.md`, especially its owner-set principles: minimal decoration, no explanations in the product (they go to `README.md` / `docs/`), symbols over words, no harsh gradients, red-green colourblind safe, simplicity and speed first. Colours only from `docs/dragon-ink.md`, fonts only IBM Plex Sans + Mono, always via the tokens in `assets/css/tokens.css`.
- **Consistency:** colours, fonts and sizes are shared by all tools; layouts may differ where practical. Only the start page may carry a visual idea (the duct network), and it must never slow anything down.

## Structure

```
index.html                 start page (tool list as duct network + open any PDF)
assets/css/                tokens.css, base.css (shared), home.css
assets/js/home.js          start page logic
assets/fonts/              Plex subsets: variable WOFF2 (web), pdf/*.ttf (PDF), source/ (original variable TTFs + license)
lib/core/                  shared core: envelope, pdf (export/import), files, store (undo + draft), ui, format, registry, project-info
lib/vendor/pdf-lib/        pdf-lib 1.17.1 (MIT)
lib/vendor/fontkit/        @pdf-lib/fontkit 1.1.1 + pako, one ES module (MIT), for Plex in PDFs
tools/<tool-id>/           one folder per tool: index.html, app.js (UI), calc.js (pure maths), defaults.js, labels.js, report.js (PDF), csv.js, charts.js, style.css
docs/                      DESIGN.md, dragon-ink.md, <tool-id>-method.md (user-facing calculation docs, German)
tests/                     node --test, fixtures/ holds reference PDFs
scripts/                   serve.mjs (dev server), make-fixtures.mjs, build-fonts.py
```

## Rules for tools

- `calc.js`, `defaults.js`, `labels.js`, `report.js` and `csv.js` must not touch the DOM, so Node tests can run them.
- Import `report.js` / `lib/core/pdf.js` lazily (`await import()`): pdf-lib and fontkit are large and only needed for PDF work.
- Register every tool in `lib/core/registry.js` and describe it in the tool table of `README.md`.
- Every tool gets a German `docs/<tool-id>-method.md` (formulas, assumptions, limits) linked from `README.md`. Usage hints for the tool go into `README.md`, not into the page.
- Saved data is the envelope from `lib/core/envelope.js`: `{ format, envelopeVersion, tool, version, calcVersion, savedAt, project, inputs, snapshot }`. Only `inputs` and `project` are authoritative; results are always recalculated. `snapshot` holds key results for regression checks. The PDF report embeds the envelope as `data.json`; the start page opens any tool's PDF via the registry.
- Bump `INPUT_VERSION` when the input schema changes (and migrate in `normalizeInputs`). Bump `CALC_VERSION` when results can change, then run `npm run fixtures` to add new reference PDFs. Never delete old fixtures.
- `normalizeInputs` must be idempotent (round-trip test: export → import → export keeps the data identical).
- Editable catalogues (ζ values, roughness, limits) are part of `inputs` and saved with every file.

## Commands

- `npm run serve` – dev server on http://localhost:8080
- `npm test` – all tests (calculation, envelope, PDF round trip, fixture regression)
- `npm run fixtures` – write reference PDFs for the current calculation version
- `python scripts/build-fonts.py` – rebuild font subsets from `assets/fonts/source/` (needs fonttools + brotli; output is byte-different each run, only commit when the subset really changes)

## Roadmap (from the original plan)

Planned tools (status `planned` in the registry):

- **Kanalrechner** – duct/pipe sizing from flow and velocity. Idea: an experimental version with a 3D model and a fluid simulation.
- **Schalldämpfer** – silencer sizing including sound level calculation per octave band.
- **Monoblock** – air handling unit: fan power, heating and cooling capacity, humidification, filter sizing.
- **Dämmung** – insulation thickness estimate.
- Later candidates: Messprotokoll, Kühllast-Check.

Open technical items:

- PWA / service worker so the site works offline and can be installed.
- Permanent storage beyond the browser draft, e.g. a Google Drive integration (undecided).
- Excel export as `.xlsx` (CSV exists).
- Own domain: buy it, add `CNAME`, set the DNS record, enable HTTPS in the Pages settings.

Done from the plan: shared core, PDF export/import with embedded data, start page import, calcVersion warning, reference PDFs, first tool (Druckverlust Lüftung).

## Repository

- GitHub: `mongimotz/Tools-HLKS-WEB` (public, branch `main`).
- Live site (GitHub Pages, deploys from `main` / root on every push): https://mongimotz.github.io/Tools-HLKS-WEB/
