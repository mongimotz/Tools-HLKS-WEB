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
