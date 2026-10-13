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

## Phase 9: performance and robustness

Heavy plan generated at test time (`tests/helpers/heavy-pdf.js`, A1 landscape, 2.2 MB): 30 000 rectangles, furniture polylines, groups of hatch lines, 30 000 door swings as Béziers, 400 texts; 300 000 segments, 141 400 paths. Node 24 on the owner's laptop, preset Nova-Unterlage:

| Step | Time |
|---|---|
| open | 5 ms |
| extract (MuPDF device → IR) | 449 ms |
| pipeline | 2'456 ms (select 56, curves 27, clip 3, dedupe 1'528, hatch 87, join 309) |
| DXF (14 MB) | 270 ms |
| total | 3.2 s (`npm test`: 4.2 s including reading the DXF back) — limit 15 s |

Result: 50 572 entities (11 713 polylines, 27 993 lines, 10 466 arcs, 400 texts). Dedupe is the most expensive step; it is fast enough, so it stays as it is.

In the browser (in-app Chromium, pane hidden): the heavy PDF opens and shows 141'400 → 51'584 objects after 3.6 s; switching "Linien verbinden" off runs again in 1.4 s (228'806 objects). No long tasks over 50 ms were reported on the page during the run (PerformanceObserver; the pane was hidden, so this is only a hint). The progress bar appears after 300 ms; "Abbrechen" ends the run ("Abgebrochen"), the old result stays, the next change runs normally in the new worker.

Fuzz: 200 option sets (seed 20261012) over the ten vector fixtures and a few runs of scan_clean with vectorising on; every DXF passes the JS reader, version as chosen (1.1 s).

Error cases: empty file → "PDF nicht lesbar"; a PDF without pages → "PDF ohne Seiten"; a truncated PDF → not readable or no pages; AES-256 with a user password (written by MuPDF) → "PDF mit Passwort geschützt"; only an owner password → opens; a blank page → 0 objects and a valid empty DXF; page index out of range → "Seite fehlt".

Real plans: `tests/fixtures/pdf-to-dxf/real/` is empty on this machine, the test is skipped. See TODO-OWNER.md.

Loading: a test follows the static imports of the start page and every tool page: none reaches `lib/vendor/mupdf/` or `backend.js`. Only the worker imports the backend, and the backend imports MuPDF with `await import()`.

## Phase 10: final check on the branch

`node scripts/pdf-to-dxf.mjs` on every fixture with the final code: preset Nova-Unterlage with "Jede Seite einzeln" (14 files, both scans vectorised) and preset Maximale Kompatibilität (R12, 10 files). `scripts/check-dxf.py`: all 24 files 0 errors, 0 fixes.

Sub-path: `node scripts/serve.mjs 8083 --base Tools-HLKS-WEB`; the start page, the tile, the hand-over of a foreign PDF, the worker, the backend and MuPDF's WebAssembly load under `/Tools-HLKS-WEB/`, and curves.pdf converts (13 → 6).

`npm test`: 176 tests, 175 pass, 1 skipped (real plans). The live site is not updated yet (release waits for the owner).
