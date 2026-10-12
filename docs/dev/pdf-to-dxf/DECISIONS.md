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

## D7 DXF writer

- Own writer (`dxf.js`), modelled on the files ezdxf 1.4.4 writes for a new R2000 / R12 drawing, reduced to what a drawing needs: R2000 has HEADER, CLASSES, TABLES (VPORT, LTYPE, LAYER, STYLE, VIEW, UCS, APPID, DIMSTYLE, BLOCK_RECORD), BLOCKS (`*Model_Space`, `*Paper_Space`), ENTITIES and OBJECTS (root dictionary, ACAD_GROUP, ACAD_LAYOUT with Model and Layout1, ACAD_MLINESTYLE, ACAD_PLOTSETTINGS, ACAD_PLOTSTYLENAME with the "Normal" placeholder that every layer points to with code 390).
- CLASSES is not empty (plan: "leer"): LAYOUT, ACDBDICTIONARYWDFLT and ACDBPLACEHOLDER are class-based objects in R2000, so the classes of the objects the file contains are declared, as AutoCAD and ezdxf do.
- Handles: fixed small handles for the skeleton, layers and entities count up from 0x30. `$HANDSEED` is the next free handle.
- Colours: an entity with the colour of its layer is BYLAYER. Otherwise code 62 (nearest ACI, weighted RGB distance) and, unless black or white, code 420 (true colour). Black and white are ACI 7 only. Note: group code 420 was introduced with AutoCAD 2004; AutoCAD, ezdxf, ODA and LibreCAD read it in AC1015 files, but if Nova rejects it, the option "Echtfarben" switches it off (and R12 never writes it). To be checked in the Nova test.
- Text height: DXF text height is the capital height, PDF font size is the em size. TEXT height = font size × 0.7 (`TEXT_HEIGHT_RATIO`, cap height of Arial, Helvetica and Plex is 0.70–0.72) × 25.4/72 × M. The plan's formula without 0.7 makes every text about 40 % too large in CAD.
- Text style "Standard" uses `arial.ttf` in R2000 (², Ø and umlauts exist in Arial, not in txt.shx) and `txt` in R12.
- Line types DASHED (dash–gap) and DASHDOT (four or more elements), pattern from the first dash array of that kind on the page, scaled like the geometry, `$LTSCALE` 1. Only line types that are used are written.
- Line weights: paper width in mm (not scaled), rounded to the nearest valid DXF value.
- R12: no handles (`$HANDLING` absent), classic empty BLOCKS section, layer names A–Z 0–9 _ - $ up to 31 characters (umlauts folded), characters outside Windows-1252 as `?`.
- Files use CRLF and Windows-1252 (`$DWGCODEPAGE ANSI_1252`); characters outside it are written as `\U+XXXX` (R2000).

## D8 Units, scale, settings

- Output coordinate = (p − origin + offset) · k with k = 25.4/72 · M / unit (mm 1, cm 10, m 1000). Origin "page" is the bottom left corner of the displayed page; "center" is the centre of the exported geometry.
- Calibration returns M (it may be fractional, shown as `1:98.7`) and sets `calibrated: true`. Clicks snap to the nearest end point within a few screen pixels (`snapPoint`).
- Settings (`defaults.js`) are the tool's whole saved state: scale, unit, origin, DXF options, structure options, tolerances (paper mm), scan options, and per-document fields (page, area, layers, colours and widths switched off) that are reset when another PDF is opened.
- Presets set only the conversion options. `preset` is derived (`presetOf`): any change away from a preset shows "Benutzerdefiniert".
- Default layer mode without PDF layers: one layer per colour and line weight (`PDF_RRGGBB_0.35`), so thin hatch lines or coloured content can be switched off in CAD.
- Hatch option gets a third value "keep" (heuristic off) next to the plan's "remove" and "own layer", because a heuristic can be wrong.
- "Maximale Kompatibilität" keeps text as glyph outlines (polylines): the preset allows only lines and polylines, and room labels are worth keeping.

## D9 Pipeline order and structure steps

- Order: select + layers → curves (arc fit) → clip → dedupe → hatch → join → dashes → area → layer list → filter → transform. The plan's order (clip → dedupe → join → arcFit → hatch …) changes in two places: curves come first, because clipping and joining work on lines and arcs, not on Béziers; hatch detection comes before join, because hatch lines are single segments.
- Layers: the PDF layer name wins; otherwise the layer mode decides. Names follow the plan's example: `PDF_RGB_255-0-0_0.35` (colour + line weight, the weight rounded to the DXF value), `PDF_RGB_255-0-0`, `PDF_0.35`, `PDF`. Fill outlines get `_FILL` instead of a weight, text goes to `PDF_TEXT`, hatch lines to `PDF_SCHRAFFUR`.
- White fills (all channels ≥ 250) are dropped: they mask other content, their outline is noise in CAD.
- Clip: rectangles with Liang–Barsky, other clips with segment–ring intersections and a point-in-polygon test on each piece (even-odd or non-zero as in the PDF). Arcs, circles and Béziers stay whole when they are completely inside, otherwise they are flattened and clipped. Text stays when its insertion point is inside. Nested clips are applied one after the other. Own code was enough, Clipper2 is not needed.
- Dedupe and join work on segments: lines and polylines are taken apart, deduplicated, and joined again. Segments on one line (direction and offset within the join tolerance) are merged per interval; every part keeps the attributes of the strongest piece covering it: stroke beats fill, a later piece (painted on top) beats an earlier one. Pieces of different PDF layers never merge. So a filled rectangle with an outline in another colour comes out once, as the stroke.
- Join: only pieces with equal layer, colour, line weight and dash join. End points within the tolerance are one node; chains end at junctions (three or more pieces); loops become closed polylines. With join off, the result is single lines.
- Glyph outlines and fills kept as HATCH do not take part in dedupe and join.
- Arcs, circles and texts are deduplicated separately (same geometry within the tolerance).
