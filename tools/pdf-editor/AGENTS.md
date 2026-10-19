# PDF-Editor

This file records the tool's behavior and controls for agents. Obey the repository's root `AGENTS.md` and `docs/DESIGN.md`.

The editor is a client-side PDF editor for plans: view, mark up, measure with scale, stamp, sign, fill and design forms, edit pages, and run document tools. It is assembled from EmbedPDF (viewer and editor UI on PDFium, Apache-2.0) and MuPDF.js (document tools in a worker, AGPL-3.0); own code is glue, theming, symbols, document tools and tests. The PDF never leaves the device.

## References

- [Build plan](../../docs/dev/pdf-editor/PLAN.md), [decisions](../../docs/dev/pdf-editor/DECISIONS.md), [progress](../../docs/dev/pdf-editor/PROGRESS.md) and [owner checks](../../docs/dev/pdf-editor/TODO-OWNER.md).
- [Method](../../docs/pdf-editor-method.md) (German): measuring with scale, OCR, compression, limits.
- Vendored viewer: `lib/vendor/embedpdf/` with `VERSION` and `PATCHES.md`; update only with `node scripts/vendor-embedpdf.mjs <version>`.

## Files and saved state

- `app.js` (page controller), `bridge.js` (the only module that talks to the EmbedPDF API and the only one that imports it, with `await import()`), `theme.js` (site look → viewer), `library.js` (libraries in the viewer), `tools-ui.js` (Symbole panel, dialogs), `client.js` (worker client) touch the DOM.
- `defaults.js`, `labels.js`, `viewer-strings.js` (generated), `svg.js`, `svg-render.js`, `stamps.js` and the document-tool modules (`engine.js`, `pages.js`, `images.js`, `compress.js`, `ocr.js`, `zip.js`) are DOM-free and run in Node tests. `worker.js` runs `engine.js` (MuPDF, `await import()`).
- Save only the edited PDF: no envelope, no `data.json`, no JSON or CSV.
- Settings are a browser draft (`hlks-tools:pdf-editor:settings`, `normalizeSettings`, idempotent): name for stamps, date format, default colours by role, plan scales, own stamps.
- Autosave keeps the open PDF in IndexedDB on this device only.

## Page and viewer

App bar (like every tool): theme, source link, ↶ ↷, folder, ↓ PDF (primary), `→ DXF`, ⋯ (document tools). The notice row stands alone above the viewer (no project fields). The `<embedpdf-viewer>` element fills the rest.

Viewer configuration (`app.js` `viewerConfig()`):

- Locale `de`, Swiss spelling through `viewer-strings.js` (generated: every German viewer string with ß, written with ss) and own words in `labels.js` (`VIEWER_STRINGS`, also given as the English fallback).
- Theme: `--epdf-*` on the element map to our tokens in `style.css`; `theme.js` keeps the viewer's light/dark preference in step with the theme button.
- Annotation colours: `--annot-1 … --annot-9` from `tokens.css`. They become the style panel's swatches (vendor patch `swatches`, `globalThis.HLKS_ANNOT_SWATCHES` set before the viewer loads) and the tool defaults (`toolDefinitions()`): markup red, measurements blue, highlight and notes yellow, text black. Shapes and lines 1 pt.
- Text annotations use IBM Plex Sans (`assets/fonts/pdf/sans-*.ttf`, registered as engine fonts `plex-sans`, `plex-sans-semibold`), so `Ø Δ ≤ ≥ ² ³ ’` survive a save and reopen. Free text has no frame; callouts keep a frame.
- Measurement: default scale 1:1 in metres, presets from the settings' plan scales (`1:n`). Every page scale is kept in Swiss number format (`5’000.00 mm`): `bridge.js` rewrites a scale after calibration or a preset.
- Layout: one document (no tabs); the viewer's document menu keeps print and full screen (open and save are in the app bar and run through the overridden `document:open` / `document:download` commands); undo / redo are removed from the mode bars (app bar). Own tools: `Revisionswolke` (`tool:cloud`, a polygon with cloudy border, in Formen) and `Abdecken` (`tool:whiteout`, a white square without border, in Schwärzen). Own mode `Seiten`: rotate left / right, blank page after, duplicate, move forward / back, delete.
- Page edits are not in the viewer's history. Deleting a page offers undo in its toast (the page is extracted first and inserted again).

## Symbols, stamps, signatures

All three are stamp libraries of the viewer's stamp plugin (one PDF per library, one page per asset; the `/Names /Pages` tree names each page `<id>=<label>`, `/PieceInfo /EMBD_StampLibrary /Private /Id` gives a stable id). The viewer keeps every library except its own standard set in IndexedDB (`embedpdf-stamps`) and restores it on start. `library.js` waits for that restore (`settleLibraries`), removes copies, and imports a built-in library again only when its source changed (category `src:<fingerprint>`).

- **Schema symbols** (`symbols/*.svg`, `symbols/manifest.json` with `id`, `name`, `category`, `file`, `norm`): 25 monochrome SVGs (`currentColor`), 12 mm, 0.35 mm lines. `node scripts/build-symbol-library.mjs` writes one library PDF per category (`symbols/<category>.pdf`, black, kind `symbols`) and `symbols/libraries.json`; commit both. `tests/pdf-editor.svg.test.js` fails when a PDF is older than its sources. The drawings follow Swiss/European plan practice and still need the owner's review (TODO-OWNER).
- **Symbole panel** (own panel `symbols`, light DOM `slot="panel:symbols"`, button in the Einfügen bar): built-in libraries in HLKS order, then `Eigene`. A click arms the symbol; an overlay panel closes so the next click on the page places it. `+` adds SVG files (also by dropping them on the panel or anywhere on the page); `svg.js` sanitises them and the worker draws them. The own library is saved and opened as one PDF (share with colleagues). Deleting an own symbol offers undo. An empty own library is removed (the viewer would restore it with a blank page).
- **Stamps** (`stamps/*.svg`, `stamps/manifest.json`): Geprüft, Freigegeben (green), Entwurf (orange), Ungültig (red), Zur Kenntnis (blue), with `{name}` and `{datum}` from the settings; own stamps from the settings (text, colour, frame rect / round / none). The worker draws the library `Stempel` (`stamps.js`) on start and after a settings change; it shows in the viewer's own Stempel panel. The viewer's standard stamps are off (`stamp.standard: false`).
- **SVG drawing**: the MuPDF.js build has no SVG reader, so `svg-render.js` draws the common SVG subset into PDF content (paths, shapes, transforms, styles and simple `<style>` rules, gradients as their first colour, text in IBM Plex Sans, inline PNG/JPEG); clip paths, masks, filters and patterns are left out.
- **Signatures**: the viewer's signature plugin (draw or upload; typed signatures are off because only Plex is allowed: `signature.fonts: []`). Each person is a library of kind `signatures`, kept by the viewer in this browser only. Without a key the mark is drawn into the field, not sealed.

## Document tools (⋯ menu)

Order (plan section 5): `PDFs anhängen`, `Seiten teilen / extrahieren`, `Wasserzeichen`, `Seitenzahlen`, `Kopf- und Fusszeile`, `Seiten als Bilder`, `Bilder als Seiten`, `Reduzieren`, `Komprimieren`, `Kennwort`, `Texterkennung (OCR)`, `Lesezeichen`, `Eigenschaften`, `Neues Dokument`, then `Einstellungen` after a separator. Entries that need a document are disabled without one; all except `Einstellungen` are disabled while a tool runs (one at a time).

- Dialogs are in `tools-ui.js` (`ask…()`, shared catalogue-window look). Each starts from the options of its last run in this visit (memory only). Invalid fields are marked (`aria-invalid`) and keep the dialog open; ranges are checked with `parseRanges` against the page count. Fields that do not apply are hidden (`data-when`).
- Page choice: `Alle`, `Aktuelle Seite`, `Bereich` (`1-3, 5, 8-`; also `-3`, `;`), `Ungerade`, `Gerade`.
- Flow (`app.js`): `bridge.bytes()` (every change) → worker (`engine.js` op) → result. Tools that change the document reopen the result as the same document (name, current page and password kept, counts as changed) and show `Verlauf nach Dokumentwerkzeug zurückgesetzt` (dismissable): the viewer's history starts new. Tools that make other files download them and leave the document unchanged.
- Progress and cancel: the notice row shows the tool (with % when the operation reports it) and an `Abbrechen` action. Loops stop between steps; a worker that does not answer within 1.5 s is replaced.
- Password: the viewer unlocks a file itself and does not tell the page. When the worker answers `password`, the page asks for it (`Kennwort`, marked when wrong) and keeps it in memory for this document.
- Errors: German toasts from `ENGINE_ERRORS` (labels.js); a cancel shows nothing.

| Entry | Operation | Result |
|---|---|---|
| PDFs anhängen | viewer `pageEdit.insertFromBytes` (no worker) | pages at the end, at the start or after the current page; files keep their order; toast with the number of pages; files that fail are named |
| Seiten teilen / extrahieren | `split`: one file for the range, one per range, every n pages, each page, odd, even | `<name>_Seite-3.pdf`, `<name>_Seiten-1-3.pdf`, `<name>_Seiten-1,3,5.pdf`; several files as `<name>_Seiten.zip` |
| Wasserzeichen | `watermark`: text (Plex semibold, colour 1–8, size pt) or PNG/JPG (size in % of the shorter page side), opacity, angle, position or tiled, pages | reload |
| Seitenzahlen | `pageNumbers`: template (`{n}`, `{total}`, suggestions `Seite {n}`, `Seite {n} von {total}`, `{n}/{total}`), position (9), start number, size, pages | reload |
| Kopf- und Fusszeile | `headerFooter`: six slots with `{n}`, `{total}`, `{datei}` (file name), `{datum}` (today, settings date format), size, pages | reload |
| Seiten als Bilder | `toImages`: PNG or JPG, 72–600 dpi, pages; pages above 100 Mpx are rendered smaller (warning toast) | `<name>_Seite-3.png`; several as `<name>_Bilder.zip` |
| Bilder als Seiten | `imagesToPdf`: JPG/PNG, image size or A4/A3 (orientation auto/portrait/landscape, margin mm) | into the open file (viewer insert) or a new document named after the first image |
| Reduzieren | `flatten` (MuPDF `bake`): annotations and/or form fields | reload |
| Komprimieren | `compress`: lossless rewrite, images optionally to 300/200/150 dpi | reload and toast `alt → neu`; `Keine Verkleinerung möglich` keeps the file |
| Kennwort | `password`: set (open password and/or permission password, AES-256, permissions print, copy, modify, annotate, forms) or remove | reload with the new open password |
| Lesezeichen | `readOutline` → dialog (title, page, level; indent, outdent, remove, add for the current page) → `writeOutline` | reload when changed |
| Eigenschaften | viewer metadata plugin (title, author, subject, keywords) | no reload; part of the next save |
| Neues Dokument | `blank`: A4 or A3, portrait or landscape | opens `Dokument.pdf` |

Engine ops (`engine.js`, no DOM, Node tests) answer `{ value, transfer }` or throw `EngineError` with a code: `damaged`, `password`, `empty`, `range`, `image`, `not-svg`, `cancelled`, `input`, `internal`. Inserted text uses IBM Plex Sans from `assets/fonts/pdf/` (glyph ids, ToUnicode, searchable).

## Settings dialog

⋯ → `Einstellungen`: name for stamps, date format (`TT.MM.JJJJ`, `JJJJ-MM-TT`), default colours for markup, measurement, highlight and text (swatches with colour names), plan scales (`1:50, 1:100, …`), own stamps. Applying re-registers the tool defaults (`tools.register`), updates the measurement presets and redraws the stamp library.

## Keyboard

| Key | Behavior |
|---|---|
| Strg+O | Open a PDF |
| Strg+S | Save the PDF under its original name |
| Strg+Z, Strg+Y, Strg+Shift+Z | Undo, redo in the viewer's history. In a text field they stay with the field |

The page listens in the capture phase on `window`, so these shortcuts run once even when the viewer has focus. All other shortcuts are the viewer's (zoom, pages, search, delete, Escape).

## Open, save, hand-over

- Open: folder button, Strg+O, drag and drop, empty-state button (slot `empty` of the viewer), start-page hand-over (`takeFileHandoff`). A password-protected file shows the viewer's own password prompt; the notice row says `Kennwort erforderlich`. A file the viewer cannot read is repaired by MuPDF in the worker and opened again (`PDF repariert`, warning); when MuPDF cannot read it either, the notice row shows `PDF nicht lesbar`.
- Save (↓ PDF, Strg+S): `documents.download()` writes incrementally (changes appended), so existing digital signatures stay valid. The file keeps its original name.
- `→ DXF`: the current bytes (with all changes) go to PDF → DXF through `stashFileHandoff`.
