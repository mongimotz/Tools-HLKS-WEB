# PDF → DXF

This file records the tool's behavior and controls for agents. Obey the repository's root `AGENTS.md` and `docs/DESIGN.md`.

The tool converts PDF plans into DXF geometry at the correct scale. Its main target is an underlay for Trimble Nova. Conversion runs in a browser worker. The PDF never leaves the device.

## References and scope

- [Method](../../docs/pdf-to-dxf-method.md): coordinate conversion, arc detection, clipping, text, layers, scans, tolerances, DXF structure, and limits.
- [Nova checklist](../../docs/pdf-to-dxf-nova-test.md): expected CAD results and the owner's pending import tests.
- [Decisions](../../docs/dev/pdf-to-dxf/DECISIONS.md): backend, intermediate representation, pipeline order, writer, UI, and scan implementation.
- [Test report](../../docs/dev/pdf-to-dxf/TESTREPORT.md): DXF audits, browser checks, scan accuracy, performance, and error cases.
- [Progress](../../docs/dev/pdf-to-dxf/PROGRESS.md) and [owner tasks](../../docs/dev/pdf-to-dxf/TODO-OWNER.md): build history and release notes. Their worktree instructions describe the completed build, not the current checkout.

Detailed formulas remain in the German method document. Keep German UI labels in `labels.js`. Keep usage explanations in documentation.

## Files and saved state

- `app.js` and `preview.js` control the DOM.
- `worker.js` handles messages. `convert.js` supplies the same conversion service to the worker and Node tests.
- `backend.js` loads MuPDF with `await import()`. No page or shared module may import MuPDF.
- `ir.js`, `pipeline.js`, `geometry.js`, `dxf.js`, `scan.js`, `defaults.js`, and `labels.js` remain independent of the DOM.
- Save only DXF. Do not add a PDF report, JSON, CSV, an envelope, or a ⋯ menu.
- The browser draft stores settings, not the source PDF. Undo and redo apply to settings.
- A new PDF resets the page, scan switch, crop area, and disabled layers, colors, and line weights.
- A calibrated scale belongs to one PDF. A new PDF clears calibration and restores the nearest standard scale.
- The start page passes PDFs without HLKS `data.json` through IndexedDB with `stashFileHandoff`.

## Layout and workflow

Settings stand on the left, the preview in the center, and the layers on the right. Preserve the responsive layout in `style.css`.

The sidebar shows independent settings first: page thumbnails and page export mode when needed, scale, output unit and origin, fallback layers and hidden PDF layers, minimum length, tolerances, and scan settings when enabled. The preset selector follows these controls. Every `PRESET_FIELDS` control appears below that selector in one final fieldset: DXF version, true color, text, fills, hatches, curves, dashes, arcs, clipping, duplicate removal, and line joining. Do not place independent settings below the selector or preset-controlled settings above it.

1. Open a PDF with the folder button, Strg+O, or drag and drop.
2. For multiple pages, select a thumbnail or use ‹ and › above the preview.
3. Select the plan scale from 1:1 through 1:1000, or enter a free value such as 98.7.
4. Use the default `NOVA`, or select another preset in the settings.
5. Disable unwanted layers, colors, and line weights in the panel on the right.
6. Save with ↓ DXF or Strg+S.

The preview shows the export result. Disabled content does not enter the DXF. Black and white lines use the page's text color, as ACI color 7 does in CAD.

The mouse wheel and a two-finger gesture zoom the preview. Dragging pans it. The image button shows or hides the source PDF beneath the vectors.

## Calibration and crop area

The ruler starts calibration. Select the two endpoints of a known distance, such as a dimension chain. The clicks snap to the nearest line endpoint within 10 screen pixels.

Enter the true length in millimeters. Enter applies it, and Esc cancels. The tool calculates the scale and shows it above the preview, for example `1:98.7`.

The crop button starts area selection. Drag a rectangle. The export contains only content inside it, with lines clipped at the boundary.

The × above the preview removes the area. Esc ends area selection. The area belongs to its page and resets when the page changes.

## Controls

| Symbol or key | Behavior |
|---|---|
| Folder, Strg+O | Open a PDF |
| ↓ DXF, Strg+S | Save DXF |
| ↶ ↷, Strg+Z, Strg+Y | Undo and redo settings |
| Four corners | Show the entire page |
| Ruler | Calibrate with two points and a true length in mm |
| Crop corners | Select an area |
| × above the preview | Remove the area |
| Image | Show or hide the PDF image beneath the preview |
| Frame with line | Vectorize a scan. Show this control only for scanned pages |
| ‹ › | Select the previous or next page |
| × in the status line | Cancel the conversion |
| Esc | End calibration or area selection |

## Pages and output

Show the `Seiten` field only for a PDF with multiple pages.

| German option | Export behavior |
|---|---|
| `Aktuelle Seite` | Save the selected page |
| `Jede Seite einzeln` | Save one DXF per page. Multiple downloads can cause a browser permission prompt |
| `Alle nebeneinander` | Save all pages in one DXF, with a 20 mm gap measured on paper |

The unit defaults to mm. Also support cm and m. The DXF declares its unit to CAD.

`Seitenecke` places the origin at the displayed page's bottom left corner. `Mitte` places it at the center of the drawing.

R2000 is the default format. R12 supports old programs, but has no splines, filled areas, true colors, or line weights. It uses POLYLINE instead of LWPOLYLINE.

`Echtfarben` adds the exact color to the nearest AutoCAD color in R2000. Black and white always use color 7.

## Presets

| German preset | Conversion options |
|---|---|
| `NOVA` | R2000, connected lines, detected arcs, text as TEXT, hatches on their own layer, fill outlines, and clipping |
| `Nur Geometrie` | The same options, with no text, hatches, or fills |
| `Maximale Kompatibilität` | R12, only lines and polylines. Arcs become polylines, and text becomes glyph outlines |
| `Benutzerdefiniert` | Appears when conversion settings no longer match a preset |

Presets change conversion options only. They preserve the scale, unit, origin, filters, and crop area. See `PRESETS` and `presetOf` in `defaults.js` for the complete option values.

While a named preset applies, only its `PRESET_FIELDS` controls use strongly dimmed neutral styling. Selected values and checked states remain visible. Keyboard focus restores full contrast; buttons retain their hover feedback. The controls remain editable and keyboard accessible. Changing a preset value recomputes the matching preset, usually `Benutzerdefiniert`. Scale, units, origin, pages, scan settings, and filters keep their normal appearance. Dimming adds no disabled state; the existing R12 restriction on true color still applies.

## Content options

- `Layer ohne PDF-Ebenen`: PDF layers keep their names. Other content uses color and line weight, color, line weight, or a single layer.
- These fallback names are `PDF_RGB_255-0-0_0.35`, `PDF_RGB_255-0-0`, `PDF_0.35`, and `PDF`.
- Dedicated layers are `PDF_TEXT`, `PDF_SCHRAFFUR`, `…_FILL` for fill outlines, and `SCAN_…` for scanned lines.
- `Ausgeblendete PDF-Ebenen` includes layers disabled in the PDF. The layer list marks them `ausgeblendet`.
- `Text` writes TEXT objects with the PDF's height, position, and rotation. CAD uses Arial.
- Text option `Umriss` writes each glyph as a closed polyline. `Aus` omits text.
- Text without character mapping always becomes an outline, except when text is `Aus`.
- `Füllungen` option `Umriss` writes the perimeter as a polyline. `Fläche` writes a solid HATCH in R2000 only. `Aus` omits fills.
- White fills always disappear. They cover other lines in the PDF and must not create geometry.
- `Schraffuren` recognizes at least eight short, parallel lines with equal spacing.
- Hatch option `Eigener Layer` assigns them to `PDF_SCHRAFFUR`. `Entfernen` omits them. `Lassen` disables detection.
- Stairs can satisfy the hatch test. `Eigener Layer` preserves their geometry. The method document contains all detection thresholds.
- `Kurven` converts curves other than circular arcs to polylines or, in R2000 only, splines.
- `Strichlierung` option `Linientyp` writes continuous geometry with DASHED or DASHDOT. `Einzelstriche` writes each dash as a separate line.
- `Bögen erkennen` creates ARC and CIRCLE objects from circular PDF curves.
- `Clipping anwenden` clips geometry hidden outside a PDF crop, such as a plan detail. Without it, concealed geometry also enters the DXF.
- `Doppelte entfernen` keeps duplicate and overlapping lines once. A stroke takes priority over a fill boundary.
- `Linien verbinden` connects common endpoints into polylines when layer, color, line weight, and dash pattern match.
- `Mindestlänge` removes lines shorter than the given paper length. Zero disables the filter.

## Tolerances and scan settings

The expandable `Toleranzen` section uses millimeters on paper.

| German field | Default | Meaning |
|---|---|---|
| `Verbinden` | 0.05 mm | Endpoint equality and collinear segments |
| `Bogen` | 0.02 mm | Permitted deviation from a circle |
| `Kurven` | 0.05 mm | Permitted polyline deviation from a curve |

Show scan settings only when vectorization is enabled. `Mittellinie` is the default and creates one line per stroke. `Umriss` creates closed polylines around each stroke.

Resolution ranges from 200 to 600 dpi, with 300 dpi as the default. `Fang 0° / 90°` snaps near-horizontal and near-vertical lines. The default angle is 2°. Zero disables snapping.

## Scanned plans

A scanned page has almost no vector geometry and mainly contains an image. The shared notice rail shows `Seite ist ein Bild`. The preview shows the image, and the scan button appears.

Vectorization separates lines from the background, removes specks, measures skew, extracts lines, and rotates the result to remove skew. The notice rail shows the detected angle.

The corrected vectors can appear slightly tilted against the original image beneath them. The tool corrects the vectors, not the source image.

A scan has no reliable scale. Until calibration, the notice rail shows `Massstab kalibrieren`. Clicking this message starts calibration.

A scan supplies an underlay for tracing, with the accuracy of the scan. Text in scans becomes short lines.

## Status, warnings, and errors

The fixed-height status line shows the source object count, exported object count, and conversion time. A longer conversion shows a progress bar with × to cancel.

The tool has no project fields. It keeps the shared notice row above the preview, as defined in the root `AGENTS.md`.
Clicking a warning focuses its relevant control or the preview. Calibration starts from its warning.
Conversion errors persist there with a retry action. File-open errors remain transient toasts.
Before a PDF opens, during processing, and after cancellation, the row uses a neutral state.

| German warning | Meaning or required check |
|---|---|
| `Text ohne Zeichenzuordnung` | The PDF has no character mapping. The text becomes a glyph outline |
| `Seite ist ein Bild` | The page contains almost no lines and mainly an image. The scan control can vectorize it |
| `Bilder` | Images, including logos, photos, and raster plan details, do not enter the vector DXF |
| `Verläufe` | PDF gradients do not enter the DXF |
| `PDF teilweise beschädigt` | MuPDF read only part of the page. Check the DXF with particular care |
| `Schräglage` | The tool detected and corrected this scan angle |
| `Massstab kalibrieren` | The scan scale needs calibration |

Keep these error labels: `PDF nicht lesbar` for a damaged file, `PDF mit Passwort geschützt`, `PDF ohne Seiten`, and `Keine PDF`.

To open a password-protected PDF, the user must first save an unprotected copy. `labels.js` also defines errors for a missing page, cancellation, conversion failure, and unavailable module workers.

## Limits and checks

- DXF contains geometry, not building semantics. A wall remains two lines. Dimensions remain lines and text, not dimension objects.
- Arial text length and spacing can differ from the PDF font.
- Images, gradients, and PDF pattern fills do not enter the DXF. Vectorization handles scan images separately.
- Hatch detection is a heuristic. Check the `PDF_SCHRAFFUR` layer.
- Scans retain the source scan's accuracy. They do not become precise plans.
- Passwords required to open a PDF prevent conversion. The method document records other clipping and font limits.

Use the Node tests, CLI, fixture corpus, and external DXF audit described in the root `AGENTS.md`. Preserve the lazy-import and sub-path checks.

The Nova checklist remains pending owner work. Do not present the existing automated DXF checks as a completed Trimble Nova test.

## Development helpers

Run CLI conversions with the tool's own code:

```bash
node scripts/pdf-to-dxf.mjs plan.pdf --out output
```

The CLI prints statistics for each page. It supports these options:

- `--preset nova|geometry|compat`
- `--scale 100`
- `--unit mm|cm|m`
- `--version R2000|R12`
- `--pages current|each|sideBySide`
- `--page 1`
- `--scan`
- `--json`

Rewrite the test PDFs and their expected data only when the corpus must change:

```bash
node scripts/make-pdf-to-dxf-fixtures.mjs
```

The output goes into `tests/fixtures/pdf-to-dxf/`. Routine code changes do not require a corpus rewrite.

For an external DXF check, install ezdxf and run the helper:

```bash
pip install ezdxf
python scripts/check-dxf.py output/plan.dxf
```

The helper uses ezdxf recovery and audit. It is separate from `npm test`.

Place local vector and scanned plans in `tests/fixtures/pdf-to-dxf/real/`. Git ignores this folder. `npm test` converts every PDF there and checks the resulting DXF.
