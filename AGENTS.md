In-Chat responses should be kept concise and to the point.

## Project conventions

- **Language:** code, identifiers, comments, file and folder names in English. Everything the user sees (UI, PDF, error messages) in German (Swiss spelling, no ß).
- **No build step.** Plain HTML, CSS and ES modules. A `git push` is the deploy (GitHub Pages). Use relative paths only, the site may live under a sub-path.
- **No CDN.** Third-party code goes into `lib/vendor/` with its license. Fonts live in `assets/fonts/`.
- **Design:** follow `docs/DESIGN.md`. Colours come from `dragon-ink.md`, fonts only IBM Plex Sans + Mono (from `IBM Plex/`). Use them only via the tokens in `assets/css/tokens.css`.

## Structure

```
index.html                 start page (tool list + open any PDF)
assets/css/                tokens.css, base.css (shared), home.css
assets/js/home.js          start page logic
lib/core/                  shared core: envelope, pdf (export/import), files, store (undo + draft), ui, format, registry, project-info
lib/vendor/pdf-lib/        pdf-lib 1.17.1 (MIT)
lib/vendor/fontkit/        @pdf-lib/fontkit 1.1.1 + pako, one ES module (MIT), for Plex in PDFs
assets/fonts/              Plex subsets: variable WOFF2 (web), pdf/*.ttf (PDF); built by scripts/build-fonts.py
tools/<tool-id>/           one folder per tool: index.html, app.js (UI), calc.js (pure maths), defaults.js, labels.js, report.js (PDF), csv.js, style.css
tests/                     node --test, fixtures/ holds reference PDFs
scripts/                   serve.mjs (dev server), make-fixtures.mjs, build-fonts.py
```

## Rules for tools

- `calc.js`, `defaults.js`, `labels.js`, `report.js` and `csv.js` must not touch the DOM, so Node tests can run them.
- Import `report.js` / `lib/core/pdf.js` lazily (`await import()`): pdf-lib and fontkit are large and only needed for PDF work.
- Register every tool in `lib/core/registry.js`.
- Saved data is the envelope from `lib/core/envelope.js`: `{ format, envelopeVersion, tool, version, calcVersion, savedAt, project, inputs, snapshot }`. Only `inputs` and `project` are authoritative; results are always recalculated. `snapshot` holds key results for regression checks.
- Bump `INPUT_VERSION` when the input schema changes (and migrate in `normalizeInputs`). Bump `CALC_VERSION` when results can change, then run `npm run fixtures` to add new reference PDFs. Never delete old fixtures.
- `normalizeInputs` must be idempotent (round-trip test).

## Commands

- `npm run serve` – dev server on http://localhost:8080
- `npm test` – all tests (calculation, envelope, PDF round trip, fixture regression)
- `npm run fixtures` – write reference PDFs for the current calculation version
- `python scripts/build-fonts.py` – rebuild font subsets from `IBM Plex/` (needs fonttools + brotli)

`IBM Plex/` (the full font package) is git-ignored; only the built subsets are committed.
