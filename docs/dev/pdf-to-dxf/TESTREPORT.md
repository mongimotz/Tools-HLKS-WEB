# PDF → DXF: test report

Results that `npm test` does not show by itself: external DXF checks, manual UI checks, scan quality, timings.

## Phase 3: DXF structure checked with ezdxf

`scripts/check-dxf.py` (ezdxf 1.4.4, `recover.readfile` + `audit`), 2026-10-12. Every vector fixture converted at 1:100 with the phase 3 pipeline (no cleanup yet), R2000 and R12. `curves` with SPLINE entities, `hatch` with a solid HATCH.

| File | Version | Errors | Fixes | Entities |
|---|---|---|---|---|
| clip | R2000 / R12 | 0 / 0 | 0 / 0 | LINE 6, LWPOLYLINE 1 (R12: POLYLINE) |
| curves | R2000 | 0 | 0 | SPLINE 13 |
| dash | R2000 / R12 | 0 / 0 | 0 / 0 | LINE 3, LWPOLYLINE 1 |
| dupes | R2000 / R12 | 0 / 0 | 0 / 0 | LINE 14, LWPOLYLINE 2 |
| hatch | R2000 / R12 | 0 / 0 | 0 / 0 | HATCH 1, LINE 30, LWPOLYLINE 1 (R12: outlines) |
| layers | R2000 / R12 | 0 / 0 | 0 / 0 | LINE 4, LWPOLYLINE 4 |
| lines | R2000 / R12 | 0 / 0 | 0 / 0 | LINE 2, LWPOLYLINE 3 |
| multipage (page 1) | R2000 / R12 | 0 / 0 | 0 / 0 | LINE 1, LWPOLYLINE 1 |
| rotated | R2000 / R12 | 0 / 0 | 0 / 0 | LWPOLYLINE 2 |
| text | R2000 / R12 | 0 / 0 | 0 / 0 | TEXT 5 |

R12 skips SPLINE (the pipeline flattens curves for R12, see convert.js).

## Phase 6: pipeline output checked with ezdxf and rendered

`node scripts/pdf-to-dxf.mjs` (preset Nova-Unterlage, 1:100) for every vector fixture, then `scripts/check-dxf.py`: 0 errors, 0 fixes in all files. `curves`: ARC 3, CIRCLE 1, LWPOLYLINE 2 (S curve, ellipse). `text`: TEXT 4 plus the unmapped text as 19 glyph outlines on `PDF_TEXT`. `text` with preset "Maximale Kompatibilität" (R12): POLYLINE 70, 0 errors.

Rendered with `python -m ezdxf draw`: circle and arcs in place, "Büro 3.50 m²", "Ø 160", "Schräg 30°" and the 90° text correct; the TEXT height (0.7 × font size) matches the height of the outlined text next to it.

## Phase 7: user interface, checked in the browser (2026-10-12)

Dev server on port 8081, in-app browser (Chromium). Files were dropped by script (`DragEvent` with a `DataTransfer`), downloads were intercepted and read back instead of saved.

| Check | Result |
|---|---|
| Start page: tile "PDF → DXF" below the four networks, centred (tile centre = section centre at 1280 px), source link below | ok |
| Start page: PDF without `data.json` (curves.pdf) dropped → opens in PDF → DXF (hand-over via IndexedDB), 13 → 6 objects | ok |
| Start page: HLKS PDF (Kanalrechner fixture) still opens in the Kanalrechner | ok |
| Open by drop: hatch.pdf → 3 layers (`PDF_RGB_0-0-0_0.18`, `…_FILL`, `PDF_SCHRAFFUR` 30), colours and widths as chips | ok |
| Calibration: clicks 1.5 px next to the ends of the 100 mm control line snap onto them; length field shows 10000 (mm) at 1:100; input 5000 → 1:50 in the toolbar and the scale field | ok |
| Area: rectangle dragged around the first rectangle of lines.pdf → 5 → 1 objects, "Bereich aufheben" appears | ok |
| Multi-page: 3 thumbnails, page 3 selected (pager 3 / 3), "Alle nebeneinander" → one file `multipage.dxf` with 3 frames and 6 lines (R2000) | ok |
| Undo / redo with Strg+Z / Strg+Y on "Bögen erkennen"; preset switches to "Benutzerdefiniert" | ok |
| Settings survive a reload (draft), per-document fields reset when another PDF opens | ok |
| 375 × 812 (light): one column (preview, layers, settings), no horizontal scroll, DXF button as icon | ok |
| Dark theme: black lines drawn in `--text-strong` | ok |
| Console errors | none (after making `setPointerCapture` tolerant of synthetic pointers) |

Playwright was not used (see DECISIONS D11); the scripted checks above cover its planned smoke test (open → preset → scale → export → DXF valid).

## Phase 8: scans

Truth: 18 lines of the vector plan behind the scans (`expect.lines`). A line counts as found when at least 90 % of its length (sampled every 0.5 mm) lies within 1 mm on paper of an output segment of similar direction (`tests/helpers/scan-score.js`). Node 24, one core.

| File | dpi | Mode | Skew found (truth) | Lines found | Output pieces | Time (render + vectorise) |
|---|---|---|---|---|---|---|
| scan_clean | 300 | centre line | 0° (0°) | 18 / 18 = 100 % | 24 | 46 + 170 ms |
| scan_dirty | 300 | centre line | 1.50° (1.5°) | 18 / 18 = 100 % | 29 | 38 + 165 ms |
| scan_clean | 200 | centre line | 0° | 18 / 18 | 25 | 53 + 103 ms |
| scan_dirty | 200 | centre line | 1.51° | 18 / 18 | 32 | 44 + 85 ms |
| scan_clean | 600 | centre line | 0° | 18 / 18 | 24 | 119 + 547 ms |
| scan_dirty | 600 | centre line | 1.50° | 18 / 18 | 29 | 110 + 519 ms |
| scan_clean | 300 | outline | 0° | 18 / 18 | 10 rings | 46 + 137 ms |
| scan_dirty | 300 | outline | 1.50° | 18 / 18 | 10 rings | 38 + 132 ms |

Plan targets: clean ≥ 90 %, dirty ≥ 70 % and skew left < 0.2° — met with margin. The dirty scan had 1'047 specks and blots removed (300 dpi). Measured stroke widths: 0.71–0.76 mm for the 0.71 mm walls, 0.42–0.43 for 0.42, 0.25 for 0.25, 0.15–0.17 for 0.18 mm. The only output pieces off the truth lines are the door swing (an arc, flattened).

The first version split long lines at 600 dpi into ~260 pieces: Douglas–Peucker with a fixed 1 px tolerance followed the one-pixel steps of the de-skewed skeleton. The tolerance is now 0.1 mm (at least 1 px).

In the browser: scan_dirty.pdf shows "Seite ist ein Bild" and the scan button; the raster is shown under the preview. Scan on → 29 → 15 objects on `SCAN_0.15` … `SCAN_0.70`, status "Schräglage 1.5°" and the button "Massstab kalibrieren".
