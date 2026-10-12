# PDF → DXF: decisions

Decisions taken while working through the plan (`PLAN-pdf2dxf.md`, set by the owner on 2026-10-12). `AGENTS.md` and `docs/DESIGN.md` win over the plan; every deviation is listed here.

## D0 Parallel work: separate git worktree

Another agent builds the silencer tool in the main working tree on `main` at the same time (uncommitted changes there). This tool is built in a second worktree, `../Tools-HLKS-pdf-to-dxf` on branch `feature/pdf-to-dxf`, so neither agent touches the other's files, index or branch.

- The main working tree, `main` and the shared stash are never touched from here.
- Dev server of this worktree: port 8081 (the other agent uses 8080). `.claude/launch.json` is changed locally only (`git update-index --skip-worktree`).
- Shared files edited on this branch: `README.md`, `AGENTS.md`, `docs/DESIGN.md`, `lib/core/registry.js`, `lib/core/ui.js`, `assets/js/home.js`, `assets/css/*`, `package.json`, `.gitignore`, `.gitattributes`, `scripts/serve.mjs`, and the SPDX line at the top of every own source file. New icons go to the top of `ICONS` in `ui.js`; the silencer agent appends at the end.
- Merge (phase 10): `main` is merged into this branch first and conflicts are resolved here. Silencer files from `main` then get their SPDX line and the `mountSourceLink()` call. `main` itself is only updated when its working tree is clean; otherwise the branch stays and "merge the branch" goes to `TODO-OWNER.md`.

## D1 Repo patterns this tool follows

Summary of what was read in phase 1 (AGENTS.md, DESIGN.md, dragon-ink.md, lib/core, tools/duct-sizing, scripts/serve.mjs):

- Static site, ES modules, relative paths, no CDN, no build. `ROOT_URL` in `registry.js` comes from `import.meta.url`.
- Page skeleton: `.appbar` (brand → start page, `/` + tool name, icon buttons, primary action), `main.page`, `.drop-overlay`. Theme button via `bindThemeToggle`, icons via `icon()` from `lib/core/ui.js` (16 px stroke icons), toasts for short status.
- State: `DocumentStore` (`lib/core/store.js`) with undo/redo and a draft in `localStorage` (`hlks-tools:<tool>:draft`).
- Keyboard: Strg+Z/Y, Strg+S (primary save), Strg+O (open). Drag and drop with `enableFileDrop`.
- Pure modules (`calc`, `defaults`, `labels`, `report`, `csv`) never touch the DOM so `node --test` runs them.
- Heavy code is imported lazily (`await import()`).
- Colours only via tokens; `tests/theme.test.js` rejects colour literals and font names in tool stylesheets.
- `normalizeInputs` must be idempotent; `INPUT_VERSION` is bumped on schema changes.

## D2 License step

- `LICENSE` is the unchanged text from https://www.gnu.org/licenses/agpl-3.0.txt (SHA-256 `0d96a4ff…abcb0`). The `LICENSE` in the MuPDF npm package is an older revision of the same license (http://fsf.org link) and is kept unchanged in `lib/vendor/mupdf/LICENSE`.
- SPDX line: line 1 in JS, CSS and Python (a comment before a Python docstring keeps the docstring), line 2 in HTML (after the doctype, so the doctype stays first). `tests/spdx.test.js` checks all own files.
- Source link: there was no footer on any page. `mountSourceLink()` in `lib/core/ui.js` appends a small `<footer class="site-foot">` with one code icon (`</>`) linking to the GitHub repo, `title="Quellcode (AGPL-3.0)"`. Every page calls it once; it is hidden in print.

## D3 MuPDF.js

- Version 1.28.1 from npm (`npm pack mupdf`), AGPL-3.0-or-later. Vendored: `mupdf.js`, `mupdf-wasm.js`, `mupdf-wasm.wasm` (10.4 MB), `LICENSE`. Not vendored: the `.d.ts` files (no TypeScript) and the pre-compressed `.br` copies (GitHub Pages compresses itself).
- The module finds its `.wasm` with `new URL('mupdf-wasm.wasm', import.meta.url)`, so it works under a sub-path without changes. It uses top-level await and imports `node:fs` only under Node.
- `scripts/serve.mjs` serves `.wasm` as `application/wasm` (needed for streaming compilation).
- `.gitattributes`: `*.wasm binary`. No Git LFS.

## D4 Test corpus

- `scripts/make-pdf-to-dxf-fixtures.mjs` writes the PDFs with raw content-stream operators (one extra content stream per page via pdf-lib), so every coordinate in the truth file is exactly what the PDF draws. Text uses pdf-lib `drawText` with IBM Plex Sans (`assets/fonts/pdf/sans-400.ttf`).
- "Text without Unicode mapping": the same font embedded a second time, `/ToUnicode` deleted after `doc.flush()`. MuPDF then reports U+FFFD for every glyph.
- Scans: the vector plan is rendered by MuPDF at 300 dpi (grey). The clean scan is embedded as PNG (33 kB). The dirty one is rotated 1.5° counter-clockwise about the page centre, gets an uneven grey background, Gaussian noise (σ 6), specks and blots, and is embedded as JPEG quality 75 (441 kB), as real scans usually are.
- Truth coordinates: pt, y up, origin bottom left of the displayed page. The truth of `rotated.pdf` is mapped with (x, y) → (y − y0, x1 − x) for `/Rotate 90` and the CropBox; MuPDF agrees.

## D5 IR details (deviations from the plan's sketch)

- Points are flat `Float64Array`s (`pts: [x0, y0, x1, y1, …]`) instead of `{x, y}` objects, also for lines and cubics (phase 9: no object per point). The readable form with `[[x, y], …]` (`toPlain` / `fromPlain` in `ir.js`) is used by truth files and tests.
- Attributes keep the PDF layer in `ocg` and the output layer in `layer` (set by the pipeline), so the layer mode can change without extracting again. Colours are 0…255.
- Arcs and circles use `cx, cy, r, start, end` (degrees, counter-clockwise).
- Straight runs of a subpath become one `line` (2 points) or `polyline`; a run that ends at its start is closed; fills are always closed. Every Bézier is its own `cubic` with a `chain` id per subpath, so arc fitting can merge the pieces of one circle.
- Clips are a list on the page (`page.clips[id] = { id, parent, rect | rings | none }`), entities refer to the innermost one by `clipId`. Clips MuPDF cannot express as a path (stroke clips, text clips, soft masks) are recorded as `none` (no clipping).
- Content inside soft-mask definitions and tiling patterns is skipped (pattern fills are decoration; a hatch in a pattern is lost, documented as a limit). Invisible text (render mode 3, e.g. OCR layers) is counted, not extracted.
- MuPDF hides switched-off PDF layers while running a page. To read them, the backend switches all layers on for that run and restores them; `page.layers` keeps the default visibility.
- Text: glyphs are grouped into runs in content order (same size ±2 %, direction ±1°, colour, layer, clip; perpendicular offset ≤ 0.1 h; gap −0.3 h … 0.5 h). A gap > 0.15 h without a space glyph inserts a space. Glyphs without Unicode (U+FFFD, 0, control characters) become U+FFFD and mark the run `unmapped`.
- Text as outline: MuPDF.js has no glyph outline API. The backend sends the text object through MuPDF's own SVG writer (`DocumentWriter(buffer, 'svg', 'text=path')`) and parses the glyph paths (`<path id>` + `<use transform>`). One writer per text object, so colour and layer stay right.
- An empty user password is tried before reporting "password".

## D6 Conversion service and worker

- `convert.js` holds the conversion service (open, extract with cache, render, later process and export). `worker.js` only does the message plumbing, so Node tests use the same code as the browser. Not in the plan's file list; added for testability.
- Cancelling: a job checks a cancel flag between pipeline steps. A long MuPDF call cannot be interrupted; the UI then terminates the worker and starts a new one (phase 9).
