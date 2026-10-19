# PDF-Editor

This file records the tool's behavior and controls for agents. Obey the repository's root `AGENTS.md` and `docs/DESIGN.md`.

The editor is a client-side PDF editor for plans: view, mark up, measure with scale, stamp, sign, fill and design forms, edit pages, and run document tools. It is assembled from EmbedPDF (viewer and editor UI on PDFium, Apache-2.0) and MuPDF.js (document tools in a worker, AGPL-3.0); own code is glue, theming, symbols, document tools and tests. The PDF never leaves the device.

## References

- [Build plan](../../docs/dev/pdf-editor/PLAN.md), [decisions](../../docs/dev/pdf-editor/DECISIONS.md), [progress](../../docs/dev/pdf-editor/PROGRESS.md) and [owner checks](../../docs/dev/pdf-editor/TODO-OWNER.md).
- [Method](../../docs/pdf-editor-method.md) (German): measuring with scale, OCR, compression, limits.
- Vendored viewer: `lib/vendor/embedpdf/` with `VERSION` and `PATCHES.md`; update only with `node scripts/vendor-embedpdf.mjs <version>`.

## Files and saved state

- `app.js` (page controller), `bridge.js` (the only module that talks to the EmbedPDF API and the only one that imports it, with `await import()`), `theme.js` (site look → viewer), `library.js`, `tools-ui.js` touch the DOM.
- `defaults.js`, `labels.js`, `viewer-strings.js` (generated) and the document-tool modules (`engine.js`, `pages.js`, `images.js`, `compress.js`, `ocr.js`, `svg.js`, `zip.js`) are DOM-free and run in Node tests. `worker.js` is the MuPDF worker.
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
