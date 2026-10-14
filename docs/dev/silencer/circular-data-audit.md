# Circular silencer data audit

Date: 2026-10-14.

The owner requested a new audit against the local manufacturer PDFs. This request overrides the earlier freeze in `docs/silencer-data.md`.

## Sources and coverage

The source folder is `C:/Users/Fabio/Downloads/Schalldämpfer/`.
Page numbers below are the PDF page numbers, starting at 1.

| File | Printed document | Data pages | Configurations |
| --- | --- | --- | ---: |
| `Trox CA.pdf` | CA, PD-04/2024, DE/de | 3–4: insertion loss and pressure statement. 7: dimensions. 10: definitions. | 52 |
| `Trox CS.pdf` | CK, PD-04/2024, DE/de | 3–5: insertion loss. 5–6: pressure. 9: dimensions. 13: definitions. | 81 |
| `Schako RS.pdf` | RS, 08.05.2024 | 4–5: dimensions and availability. 7–9: pressure. 10–14: insertion loss. 15: definitions. | 267 |
| `Lindab SLU.pdf` | SLU, 2025-06-25 | 2: 50 mm insulation. 3: 100 mm insulation. | 62 |

`Trox CS.pdf` contains CK throughout, including its cover and order key. The owner confirmed that CK is the intended product.
The catalog retains the correct CK name. It does not relabel CK as CS.

SHA-256 identifies the exact source files:

| File | SHA-256 |
| --- | --- |
| `Trox CA.pdf` | `15d7fd928a10a6c83df7ae68c6ff0f5387d5d6ee3154d7525c738fa8cd83f997` |
| `Trox CS.pdf` | `a6bd99a72ea49dc11ce5e387c201f9d8969e4068cec172dd4c03d3de6c901c9b` |
| `Schako RS.pdf` | `8e170fa5a3f19d00867a47de2b991ad3b0ffc4b1192da912bae5ced80bbe6a49` |
| `Lindab SLU.pdf` | `a707615824471e8e9263a7cb3f1a3fc1aa45dea256079041ae9228caa41d69a8` |

The audit extracted every table cell with `pdfplumber` and compared complete keyed rows against `ROUND_ROWS`.
It also rendered and examined all data pages, including the drawings, headings and footnotes.

The comparison covered all 462 configurations and their 3696 octave insertion losses.
It covered 124 printed Schako pressure rows with 11 velocities each and all 126 printed CK pressure values.
It checked every available diameter, insulation, core, length and casing diameter.
The Schako availability matrices contain exactly the 196 RS-N and 71 RS-M products in the catalog.

## Results and changes

All existing numeric cells match the supplied documents. No insertion-loss or pressure value required correction.

The data now includes the dimensions needed to distinguish order length from product size:

| Field | Definition |
| --- | --- |
| `L` | Nominal order length. The insertion-loss table uses this value. |
| `bodyLength` | Trox: acoustic absorber length L1. Schako: casing length L. Lindab: body length l. |
| `overallLength` | Standard product length including its standard connection ends. |
| `dOuter` | Casing diameter from the source table. |
| `dOuterMax` | Largest casing diameter, including ribs or seams, excluding optional accessories. |

Trox CA and CK have `overallLength = L` and `bodyLength = L − 120 mm`.
Schako RS has `bodyLength = L` and `overallLength = L + 100 mm` for standard KA0 spigots.
The Schako drawings show a 50 mm spigot at each end. Optional flange connections require separate dimensions.

Lindab supplies both l and L for each product. For example, SLU 200/900/50 has a 990 mm body and 1068 mm overall length.
Its casing diameter is 300 mm, but its maximum diameter is 306 mm.
For SLU ≥ 400 mm, the stated product length excludes the loose NPU connectors shown beside the body.

The catalog now warns about the Schako RS-M NW 1000 connection diameter.
Page 5 prints 989 mm, while the RS-N table prints 998 mm. The catalog retains 989 mm and marks it as unresolved.

## Source quirks retained

- CA 80/1000/25 prints 32 dB at 8000 Hz, while CA 100/1000/25 prints 22 dB.
- CK NW 315 pressure values are much lower than the neighboring nominal sizes.
- Schako prints NW 225 in pressure tables and NW 224 in product tables. The catalog maps that pressure line to NW 224.
- Schako omits pressure rows for some product diameters. Those products retain the nearest available diameter and the `dpFromDn` notice.
- Schako RS-N L 1950, P 100 has lower 1000 Hz attenuation than L 1450 for several sizes.
- Schako RS-N L 1950, NW ≥ 800 has a pressure decrease between 10 and 11 m/s.
- Schako RS-M 350/950/150 prints 28 dB at 500 Hz. The adjacent NW 355 prints 37 dB.
- Schako RS-M NW 1000 prints an outside spigot diameter of 989 mm.
- SLU 500/900/100 and 630/900/100 print l = L = 600 mm. Their nominal order length remains 900 mm, with a warning.

The audit does not infer replacement values for these source conflicts.

## Limits of the calculation models

The sources do not supply every quantity that the application calculates.
Matching their numeric tables does not validate the separate model assumptions below.

- Trox CA states that pressure loss equals a smooth pipe of the same length. The calculation uses its straight-duct model.
- Lindab supplies no pressure or flow-noise table. Its straight-duct pressure model remains an estimate.
- None of these circular documents supplies a numeric flow-noise table. The existing core-noise estimate and zero additional noise without a core are assumptions.
- Schako defines velocity in the free cross-section. Its drawing labels ød as the outside spigot diameter, not an exact clear bore.
- The calculation approximates Schako's bore with that ød value. It ignores sheet thickness in the area calculation.
- A core reduces free area by `T × dIn`. This is a simple strip approximation, not a measured free area from Schako or Trox.
- A nearest-diameter pressure row is an estimate, even when every copied source cell is correct.

## Regression checks

`tests/silencer-round-data.test.js` stores one SHA-256 digest per series from the independently extracted source cells.
Each digest covers geometry, insertion loss, pressure and the full product dimensions.
It also checks source conflicts and examples where nominal and overall lengths differ.

Command: `node --test tests/silencer-round-data.test.js`.
Result: 7 tests passed.
