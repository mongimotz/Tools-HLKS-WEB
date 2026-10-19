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

- Open: folder button, Strg+O, drag and drop, empty-state button (slot `empty` of the viewer), start-page hand-over (`takeFileHandoff`). A password-protected file shows the viewer's own password prompt; the notice row says `Kennwort erforderlich`. A file the viewer cannot read shows `PDF nicht lesbar`.
- Save (↓ PDF, Strg+S): `documents.download()` writes incrementally (changes appended), so existing digital signatures stay valid. The file keeps its original name.
- `→ DXF`: the current bytes (with all changes) go to PDF → DXF through `stashFileHandoff`.
