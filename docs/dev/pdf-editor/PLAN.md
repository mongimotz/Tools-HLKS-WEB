# PDF-Editor – build plan

Tool id `pdf-editor`, German name `PDF-Editor`, registry group `general` (tile on the start page).
Goal: a client-side PDF editor in the HLKS-Tools site with the feature set of PDFescape plus plan tools (measure with scale, revision clouds, schema symbols, stamps, signatures). Everything runs in the browser. No backend, no upload, no account.

The editor is **assembled from existing open-source projects**, not written from scratch. Own code is glue, theming, the symbol library, document tools on MuPDF, and tests.

---

## 0. How to work (read first)

- **Work through the whole plan in one go, without stopping to ask the owner.** The owner is not available during the run.
- Where a decision is open, take the choice written in this plan. Where the plan says nothing, take the option that best fits `AGENTS.md` and `docs/DESIGN.md`. Record every such decision in `docs/dev/pdf-editor/DECISIONS.md` (one line each: decision, reason, how to change it).
- If something blocks a stage, use the fallback named in that stage, note it in `DECISIONS.md`, and continue. Never stop the run because of a blocker that has a workaround.
- After each stage: `npm test` passes, `docs/dev/pdf-editor/PROGRESS.md` is updated, commit, push.
- At the end: `PROGRESS.md` lists what is done, what is open, and the exact README changes the owner must make. `docs/dev/pdf-editor/TODO-OWNER.md` lists the manual checks (section 9).
- Follow `AGENTS.md` everywhere (no build step, no CDN, relative paths, SPDX headers, German UI with Swiss spelling, English code and dev docs). Do not edit `README.md`.

---

## 1. Building blocks

| Block | What it gives | License | How it is used |
|---|---|---|---|
| **EmbedPDF v3** (`@embedpdf/viewer` 3.0.0-next.15, [repo](https://github.com/embedpdf/embed-pdf-viewer)) | Complete viewer and editor UI on a PDFium WASM engine: thumbnails, zoom, search, text selection, undo/redo, annotations (note, free text, callout, highlight, underline, strike-out, squiggly, ink, line, arrow, square, circle, polygon, polyline, cloudy borders, image, link), insert/replace text, redaction, **measurement** (calibrate, distance, perimeter, area; scale stored per page in the PDF), **stamp libraries**, **signatures**, **form filling and form field creation** (text field, checkbox, radio, combo box, list box, signature field), page editing, outline, metadata, attachments. German locale included. Theme tokens. | Apache-2.0 | Vendored prebuilt into `lib/vendor/embedpdf/`. The page mounts `<embedpdf-viewer>`. |
| **MuPDF.js 1.28.1** (already in the repo) | Document operations the viewer lacks: split, extract, watermark, page numbers, header/footer, PDF → images, images → PDF, compression, encryption, flatten, OCR text layer, SVG → PDF for symbols | AGPL-3.0 | Own worker `tools/pdf-editor/worker.js`, lazy import, same pattern as PDF → DXF. |
| **BentoPDF** ([repo](https://github.com/alam00000/bentopdf)) | Proven logic for the document tools (option sets, page-range parsing, watermark/page-number layout, OCR via tesseract + hOCR → text layer, bookmark editing, image compression) | AGPL-3.0-only | **Source for ports only.** Port the needed logic from TypeScript to plain JS, adapt it to MuPDF where it uses pdf-lib/pdf.js, keep attribution. Do not vendor BentoPDF, Ghostscript, PyMuPDF or LibreOffice WASM. |
| **tesseract.js** + core + `deu`/`eng` fast models | OCR | Apache-2.0 | Vendored into `lib/vendor/tesseract/`, all paths local, loaded only when OCR starts. |
| **pdf-lib** (already in the repo) | Only if a document tool is clearly simpler with it than with MuPDF | MIT | Optional. |

Feature coverage:

| Feature | Source |
|---|---|
| Viewer, thumbnails, zoom, search, undo/redo | EmbedPDF |
| Notes, textboxes, callouts, highlight/underline/strike-out, pen, lines, arrows, shapes, clouds, images | EmbedPDF |
| Measure with scale (calibrate, length, perimeter, area) | EmbedPDF measurement plugin |
| Stamps (Geprüft, Freigegeben, …) and schema symbols | EmbedPDF stamp libraries + own generated library PDFs (section 4) |
| Signatures (draw, upload) | EmbedPDF signature plugin |
| Whiteout, redaction | EmbedPDF (white square annotation; redaction plugin) |
| Edit existing text | EmbedPDF insert/replace text (where the engine supports it) |
| Form filling and form designer | EmbedPDF form plugin |
| Page rotate, delete, reorder, insert blank, crop | EmbedPDF page-edit plugin; gaps via MuPDF |
| Bookmarks, metadata | EmbedPDF outline and metadata plugins; gaps via MuPDF |
| Merge, split, extract | MuPDF (logic ported from BentoPDF) |
| Watermark, page numbers, header/footer | MuPDF (logic ported from BentoPDF) |
| PDF → images, images → PDF | MuPDF (+ store-only ZIP writer) |
| Flatten, compress | MuPDF (`bake`, `saveToBuffer` options, image rewrite ported from BentoPDF) |
| Password (set, remove) | MuPDF (`saveToBuffer` encryption options) |
| Search + OCR | EmbedPDF search; OCR via tesseract.js → invisible text layer written with MuPDF |
| Autosave | own code, IndexedDB |

---

## 2. Rule changes (apply them, record them in `AGENTS.md`)

These are owner-approved for this tool. Write them into `AGENTS.md` (shared rules) and `tools/pdf-editor/AGENTS.md` (tool rules) in the existing style.

1. **MuPDF:** may be loaded by `tools/pdf-to-dxf/worker.js` and `tools/pdf-editor/worker.js`, always with `await import()`, never by a page module. Extend the import-graph test in `tests/pdf-to-dxf.robust.test.js` (or move it to a shared test) accordingly.
2. **EmbedPDF and tesseract:** may be imported only by `tools/pdf-editor/` and only with `await import()` (EmbedPDF on page start of the editor, tesseract inside the worker on first OCR). Add both to the import-graph test.
3. **Start-page handoff:** a PDF without HLKS-Tools `data.json` now opens in the PDF-Editor. The editor has an icon button `→ DXF` that hands the current file to PDF → DXF with the existing `stashFileHandoff`. Update the shared rule and the start page.
4. **Save exception (like PDF → DXF):** the editor saves only the edited PDF. No envelope, no `data.json`, no JSON/CSV. Its ⋯ menu holds the document tools instead of the standard entries. Settings are a browser draft (`defaults.js`, `normalizeSettings`, idempotent). Autosave keeps the user's PDF in IndexedDB on this device only.
5. **Licenses:** EmbedPDF (Apache-2.0) and tesseract.js (Apache-2.0) go to `lib/vendor/<name>/` with their `LICENSE`. Files ported from BentoPDF carry `// SPDX-License-Identifier: AGPL-3.0-only` and a comment line with the source path and commit; extend `tests/spdx.test.js` to accept that identifier for files that also carry the BentoPDF attribution line. List all new third-party code for the README license table in `PROGRESS.md`.
6. **Design inside the viewer:** EmbedPDF draws its own UI in a shadow DOM. Map its theme tokens to `assets/css/tokens.css` (section 3) and accept its layout and icons inside the viewer. The page around it (app bar, notice row, dialogs of own tools) follows `docs/DESIGN.md` fully.

---

## 3. Integration

### 3.1 Vendoring EmbedPDF

- Take `@embedpdf/viewer@3.0.0-next.15` from npm (`npm pack`), copy `dist/` without `*.map` into `lib/vendor/embedpdf/`, plus `LICENSE` and a `VERSION` file with the exact version.
- Check that nothing loads from a CDN at runtime (wasm, worker, fonts, icons). The dist uses relative asset URLs; verify under `node scripts/serve.mjs 8080 --base Tools-HLKS-WEB`.
- Add `scripts/vendor-embedpdf.mjs` that repeats this for a given version, so an update is one command.

### 3.2 The page

```
tools/pdf-editor/
  AGENTS.md        local contracts
  index.html       app bar + notice row + <embedpdf-viewer> filling the rest
  style.css
  app.js           mount viewer, open/save, shortcuts, ⋯ menu, → DXF, autosave, handoff
  bridge.js        thin wrapper around the EmbedPDF API: get bytes, load bytes, current page, selection, events
  theme.js         reads tokens.css values and builds the EmbedPDF theme config (light + dark)
  library.js       symbol and stamp libraries: built-in + own SVGs, IndexedDB
  tools-ui.js      dialogs of the document tools (German labels, DESIGN.md rules)
  worker.js        message loop (DXF worker pattern)
  engine.js        MuPDF document operations, no DOM, runs in Node tests
  pages.js         range parser, split, extract, merge, watermark, page numbers, header/footer (no DOM)
  images.js        PDF → PNG/JPG, images → PDF (no DOM)
  compress.js      flatten, garbage/compress, image downsampling (no DOM)
  ocr.js           tesseract → hOCR → invisible text layer (no DOM, worker only)
  svg.js           SVG sanitising, placeholder fill, SVG → PDF page via MuPDF (no DOM)
  zip.js           store-only ZIP writer (no DOM)
  defaults.js      settings defaults + normalizeSettings
  labels.js        German strings for own UI
  symbols/         built-in SVG symbols + manifest.json
  stamps/          stamp templates (SVG with {name}, {datum}, {text})
```

- Registry line: `{ id: 'pdf-editor', group: GENERAL, name: 'PDF-Editor', path: 'tools/pdf-editor/', status: 'ready', icon: 'pdfEdit' }`. Add the `pdfEdit` icon to `lib/core/ui.js`.
- App bar like all tools: folder (open), ↓ PDF, ⋯, `→ DXF`, source link, theme. Undo/redo comes from the viewer; Strg+Z / Strg+Y go to the viewer's history.
- Shared notice row (`createIssuePanel()`) above the viewer, no project fields: password needed, damaged file, autosave available, OCR / document-tool progress, errors.
- Locale `de`. Where the bundled German strings use ß or non-Swiss terms, override them through the `strings` option.
- Layout: remove tools that are not needed, add own entries through `layout` and slots: `Symbole`, `Stempel` (if the built-in stamp picker does not show the libraries well), document tools in ⋯.
- Theme: `accent` = `--primary`, `background` = `--bg`, `surface` = `--surface`, `surface-raised`, `text`, `text-muted`, `border`, `hover`, `canvas`, `radius`, `font` = IBM Plex Sans from `assets/fonts/`. Dark mode follows the site's theme button (`Hell` / `Dunkel`); update the viewer's `theme` when the button changes.
- Annotation default colours: add `--annot-1 … --annot-8` to `tokens.css` and `docs/dragon-ink.md` (red, blue, green, yellow highlight, black, orange, magenta, cyan), print-safe and checked for red-green colour blindness like the chart colours. Pass them as the viewer's colour presets.

### 3.3 Open, save, round trips

- Open: folder button, Strg+O, drag-and-drop, start-page handoff (`takeFileHandoff`). Password files: let the viewer prompt; if it cannot, prompt in the notice row and pass the password.
- Save: ↓ PDF and Strg+S export the viewer's current bytes as `<name>.pdf` (keep the original name; no suffix). If the source has digital signatures, prefer the viewer's incremental save if it exists; otherwise note the limit in `tools/pdf-editor/AGENTS.md`.
- Document tools work on bytes: viewer → bytes → MuPDF worker → result bytes → viewer loads them (same document, undo history may reset; show it in the notice row). Tools that produce other files (split parts, images, ZIP) download them and leave the open document unchanged.

---

## 4. Symbols and stamps

EmbedPDF stamp libraries are PDFs with one stamp per page. Symbols and stamps are therefore delivered as library PDFs.

**Built-in schema symbols:** `tools/pdf-editor/symbols/*.svg`, monochrome, `currentColor`, plus `manifest.json` (`id`, `name`, `category`, `file`, `norm`). First set:
- Lüftung: Ventilator, Klappe, Brandschutzklappe, Volumenstromregler, Filter, Wärmerückgewinnung, Schalldämpfer, Zuluftauslass, Abluftauslass, Lufterhitzer, Luftkühler
- Heizung: Pumpe, Absperrventil, Regelventil, Dreiwegventil, Rückschlagventil, Heizkörper, Wärmeerzeuger
- Sanitär: Absperrventil, Rückflussverhinderer, Wasserzähler, Druckreduzierventil
- Allgemein: Nordpfeil, Höhenkote, Revisionsdreieck

Draw them after common Swiss/European plan practice (SN EN 12792 / DIN 1946 for ventilation, SN EN 806 / SVGW for sanitary, SIA 410 where it applies) and write the reference into `norm`. Mark in `TODO-OWNER.md` that the owner reviews the drawings.

`scripts/build-symbol-library.mjs` converts the SVGs with MuPDF (SVG → PDF page, one page per symbol, page size = symbol bounds) into `tools/pdf-editor/symbols/symbols.pdf`, one library per category if the viewer groups by library. Commit the generated PDF (no build step at runtime). A test checks that the PDF is up to date with the SVGs.

**Own symbols:** drop SVG files on the `Symbole` panel → `svg.js` sanitises them (remove `script`, event attributes, external references, `foreignObject`) → the worker turns them into library pages → stored in IndexedDB as the user's library `Eigene`, registered with the viewer. Export/import of own libraries as one PDF file to share with colleagues.

**Stamps:** templates in `tools/pdf-editor/stamps/` (`Geprüft`, `Freigegeben`, `Entwurf`, `Ungültig`, `Zur Kenntnis`) with placeholders `{name}`, `{datum}`, `{text}`. Name and date format come from the settings. When the user changes the name, the worker regenerates the stamp library. A small dialog creates own stamps (text, colour, frame) the same way.

**Signatures:** use the viewer's signature plugin (draw, upload). Stored only in this browser. No typed signatures with script fonts (only Plex is allowed).

Fallback if the stamp plugin cannot load libraries at runtime: place symbols and stamps as image annotations with a high-resolution render (600 DPI PNG) and note the loss of vector quality in `DECISIONS.md`.

---

## 5. Document tools (⋯ menu)

All run in the MuPDF worker. Port the option sets and edge cases from BentoPDF; the file names below are the starting points in that repo (`src/js/logic/` and `src/js/utils/`).

| Menu entry (German) | Function | BentoPDF reference |
|---|---|---|
| `PDFs anhängen` | merge other PDFs at a position | `merge-pdf-page.ts` |
| `Seiten teilen / extrahieren` | ranges (`1-3, 5, 8-`), every N pages, selected pages; one PDF or ZIP | `split-pdf-page.ts`, `split-pdf-helpers.ts`, `extract-pages-page.ts` |
| `Wasserzeichen` | text or image, angle, opacity, position, page range | `add-watermark-page.ts` |
| `Seitenzahlen` | template `{n}`, `{total}`, position, start number, page range | `page-numbers-page.ts`, `bates-numbering-page.ts` |
| `Kopf- und Fusszeile` | left/centre/right text with `{n}`, `{total}`, `{datei}`, `{datum}` | `header-footer-page.ts` |
| `Seiten als Bilder` | PNG/JPG, 72–600 DPI, selected pages, ZIP for several | `pdf-to-png-page.ts`, `pdf-to-jpg-page.ts` |
| `Bilder als Seiten` | JPG/PNG → pages; image size / A4 / A3, orientation auto, margin; into the open file or new | `image-to-pdf-page.ts`, `images-to-pdf-lib.ts` |
| `Reduzieren` | flatten annotations and/or form fields | `flatten-pdf-page.ts`, `flatten-annotations.ts` |
| `Komprimieren` | garbage/compress + optional image downsampling to 150/200/300 DPI; shows old and new size; never writes a bigger file | `compress-pdf-page.ts`, `compress.ts`, `image-compress.ts` |
| `Kennwort` | set open password and/or permission password (AES-256), remove when known | `protect-pdf-page.ts`, `unlock-pdf-page.ts` |
| `Texterkennung (OCR)` | section 6 | `ocr-pdf-page.ts`, `ocr.ts`, `hocr-transform.ts`, `tesseract-runtime.ts` |
| `Lesezeichen`, `Eigenschaften` | only if the viewer's outline/metadata plugins do not cover editing | `bookmark-pdf.ts`, `edit-metadata-page.ts` |
| `Neues Dokument` | blank A4/A3 document | – |

Inserted text (watermark, page numbers, headers) uses IBM Plex Sans from `assets/fonts/pdf/`. Check the subset covers German, French, Italian and `° ² ³ ± Ø Δ ≤ ≥`; if not, extend the subset with `scripts/build-fonts.py`.

---

## 6. OCR

- Vendor `tesseract.js`, its WASM core (SIMD + non-SIMD) and `deu` + `eng` from `tessdata_fast` into `lib/vendor/tesseract/`. Set `workerPath`, `corePath`, `langPath` to local paths.
- Flow in the worker: pages without text (or selected pages) → MuPDF render at 300 DPI → tesseract (`deu+eng`) → hOCR words with boxes → invisible text layer (render mode 3, Plex Sans, horizontal scaling per word to fit its box) appended as a content stream with MuPDF → bytes back to the viewer.
- Progress and cancel in the notice row. After OCR, search, selection and highlight work on scans.

---

## 7. Autosave

- After each change (viewer history event, debounced 2 s) export bytes and store them in IndexedDB: one slot per file name + size, at most 3 slots, slots older than 14 days removed.
- On opening the same file or on page load with a slot present: notice `Ungesicherte Änderungen` with restore and discard icons.
- Settings (name for stamps, date format, default colours, own symbols and stamps, scale presets) are a separate browser draft.

---

## 8. Stages

Do them in this order. Each ends with green tests, `PROGRESS.md`, commit, push.

1. **Spike EmbedPDF v3.** Vendor it, mount it on a bare `tools/pdf-editor/index.html`, open a real plan from `tests/fixtures/`, place each annotation type, measure after calibration, export, reopen the export in MuPDF in Node and check the annotations exist. Acceptance: no CDN requests, works under the GitHub Pages sub-path, export reopens without repair.
   **Fallback:** if v3 fails acceptance, use the stable EmbedPDF v2 snippet (`@embedpdf/snippet` 2.x) for viewer and annotations, and build measurement, stamp libraries and form creation on MuPDF in `engine.js` as separate panels. Record the reason.
2. **Page shell.** Registry, icon, app bar, notice row, theme mapping, annotation colour tokens, German strings, open/save, Strg shortcuts, start-page handoff and `→ DXF`, rule changes from section 2.
3. **Symbols, stamps, signatures.** Symbol SVGs, library generator script, own-symbol import, stamp templates and generator, signature check.
4. **Document tools.** Worker + engine, then the menu entries of section 5 in table order, with ZIP writer.
5. **OCR.**
6. **Autosave.**
7. **Finish.** Method doc `docs/pdf-editor-method.md` (German: measuring with scale and its accuracy limit, OCR and compression limits, what is not supported), `tools/pdf-editor/AGENTS.md` complete, mobile check (view, fill forms, simple markup), keyboard check, final `PROGRESS.md` and `TODO-OWNER.md`.

---

## 9. Tests

All non-DOM modules run in Node with the real MuPDF (as `tests/pdf-to-dxf.*` do). Generated fixtures go to `tests/fixtures/pdf-editor/`.

- `pdf-editor.engine.test.js`: open normal, rotated, cropped, encrypted, damaged files; every document tool produces a file that reopens in MuPDF **and** pdf-lib.
- `pdf-editor.pages.test.js`: range parser (incl. invalid input), split, extract, merge order, page-number and header templates.
- `pdf-editor.compress.test.js`: output never larger than input; flatten removes annotations as objects but keeps their appearance.
- `pdf-editor.crypt.test.js`: encrypted output needs the password; removing the password works.
- `pdf-editor.svg.test.js`: sanitising removes scripts, handlers, external references; placeholders fill; every built-in symbol produces a non-empty page; `symbols.pdf` matches the SVG sources.
- `pdf-editor.ocr.test.js`: scan fixture → a known word is found after OCR (skipped with a message when the tesseract files are missing).
- `pdf-editor.vendor.test.js`: EmbedPDF and tesseract files exist, `VERSION` matches, no absolute `https://` asset URLs that would be fetched at runtime.
- `zip.test.js`: archive structure and CRC.
- Import-graph test extended (section 2). SPDX and theme tests stay green.

`TODO-OWNER.md` (manual checks): open exports in Acrobat Reader, Edge, Bluebeam (if available) and Trimble Nova; annotations stay editable; a measurement on a known plan dimension is correct; symbols and stamps print sharp; forms fill in Acrobat; review the symbol drawings; update the README tool and license tables with the text from `PROGRESS.md`.

---

## 10. Limits (method doc, not the UI)

- Editing existing text depends on the viewer engine; complex layouts may not reflow. The safe way stays whiteout or redaction plus a new textbox.
- EmbedPDF v3 is a pre-release. The version is pinned; updates go through `scripts/vendor-embedpdf.mjs` and the tests.
- OCR quality depends on the scan; handwriting is not recognised.
- Compression gains are small for vector plans.
- XFA forms are not supported.
- Very large files (> 200 MB or > 1000 pages) can exceed browser memory, especially on phones.
