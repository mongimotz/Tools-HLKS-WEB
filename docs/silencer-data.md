# Silencer data

Developer reference for `tools/silencer/data/`. The data package is complete and checked. Do not research it again and do not change values. If a value looks wrong, keep it, add a `note` to the row, and tell the owner.

Data version: `2026-10-12` (`DATA_VERSION` in every module). Collected and transcribed from the manufacturer documents listed in `sources.js`. Tables were read from the PDF text layer, not retyped. `tests/silencer-data.test.js` guards the counts and spot values.

## Files

| File | Content |
|---|---|
| `data/index.js` | Re-exports everything. The tool imports from here. |
| `data/splitter.js` | `OCTAVES`, `SPLITTER_SERIES` (4), `SPLITTER_ROWS` (305): rectangular splitter silencers |
| `data/round.js` | `ROUND_SERIES` (5), `ROUND_ROWS` (462): round duct silencers |
| `data/flow-noise.js` | Flow noise tables and fits, relative octave spectrum |
| `data/coefficients.js` | A-weighting, ζ formulas, installation factors, planning limits |
| `data/sources.js` | `SOURCES` Q01 … Q22 with URL and date |

All modules are plain ES modules with no imports, so `calc.js` and Node tests can use them.

## Conventions

- **Octaves:** every `de` array has 8 values for 63, 125, 250, 500, 1000, 2000, 4000 and 8000 Hz (`OCTAVES`).
- **Units:** lengths in mm, velocities in m/s, volume flow in m³/h, pressure in Pa, levels in dB / dB(A).
- **Insertion loss D_e** is measured to EN ISO 7235. It belongs to the whole silencer, not to one splitter. It depends only on the cell geometry (d, s, L), not on the number of splitters n.
- **Cap at 50 dB:** Trox and Lindab print lab values above 50 dB as 50 dB. Schako splitter tables print `>50`. Both are stored as `50`. Treat 50 as "at least 50" and never extrapolate above it.
- **Flags** (splitters only): `flags.de[<Hz>] = '>'` = source printed `>50`. `flags.dp[<v>] = '<'` = source printed `<10` (stored as 10, an upper bound). `'>'` on Δp = source printed `>10`, probably a misprint for `<10`.
- **Notes:** `note` on a row describes a source quirk. The value stays as printed. Show it in the tool as a warning (icon + short text), not as an error.

## Rectangular splitter silencers (`splitter.js`)

| Series | d [mm] | s [mm] | L [mm] | Δp at v_s [m/s] |
|---|---|---|---|---|
| `trox-xk` Trox XK (housing XS) | 100, 200, 230, 300 | 50 … 300 | 500 … 3000 | 6, 10, 14 |
| `trox-mk` Trox MK (housing MS) | 100, 200, 230 | 50 … 200 | 500 … 3000 | 6, 10, 14 |
| `schako-mwk-ob` Schako MWK-OB / -LL | 100, 200 | 50 … 200 | 500 … 3000 | 6 … 13 |
| `schako-mwk-mb` Schako MWK-MB / -LB | 100, 200 | 50 … 200 | 500 … 3000 | 6 … 13 |

Geometry of a splitter silencer with n splitters of thickness d and gap s:

```
B      = n · (d + s)          duct / housing width; contains two edge gaps of s/2
s_R    = s / 2                edge gap to the duct wall (the wall acts as a mirror)
A_free = n · s · H            free cross-section
v_s    = V̇ / A_free           gap velocity: reference for ALL Δp and flow noise tables
```

- No table exists for d = 150, 160 or 250 mm. Do not invent rows. If needed later, scale from the next table (see the scaling rule below) and mark it as an estimate.
- Trox Δp values are valid for H = 1000 mm (`dpValidHeight`). Lower H has a larger wall share, so Δp is somewhat higher. Show a note, no correction.
- Trox XK and MK share the same Δp. Schako OB/LL and MB/LB share the same Δp.

## Round duct silencers (`round.js`)

| Series | dn [mm] | L [mm] | Insulation [mm] | Core | Δp model |
|---|---|---|---|---|---|
| `trox-ca` Trox CA | 80 … 800 | 500, 1000, 1500 | 25, 50, 100 | none | `duct` |
| `trox-ck` Trox CK | 250 … 1000 | 500, 1000, 1500 | 50, 100 | splitter T = 50 … 300, two widths per size | `flow-points` |
| `schako-rs-n` Schako RS-N | 71 … 1120 | 500, 950, 1450, 1950 | 50, 100, 150 | none | `velocity-table` |
| `schako-rs-m` Schako RS-M | 350 … 1120 | 950, 1450, 1950 | 50, 100, 150 | middle baffle T = 60/75/100/150, fixed per size | `velocity-table` |
| `lindab-slu` Lindab SLU | 63 … 800 | 300 … 1500 | 50, 100 | none | `duct` |

Not every combination exists. Only the rows in `ROUND_ROWS` are products.

### Pressure loss models

All models end in `Δp = ζ · ρ/2 · v²`. Compute ζ from the source points, then apply it at the actual velocity.

| `dpModel` | Row data | Velocity v | How to get Δp |
|---|---|---|---|
| `duct` | `dp: null` | V̇ / (π/4 · dn²) | Straight duct of length L: `Δp = λ · L/dn · ρ/2 · v²`, λ from `lib/core/air.js`, roughness of galvanised duct. Trox states this for CA. Lindab gives no Δp; same assumption. |
| `flow-points` | `dp: { q, pa }` (m³/h, Pa) | V̇ / (π/4 · dn²) | ζ_i = pa_i / (ρ/2 · v_i²) with v_i from q_i. Use the mean of ζ_i. |
| `velocity-table` | `dp: { v, pa }` | V̇ / A_free | ζ_i per table point, interpolate ζ linearly over v, hold the end values outside the table. |
| splitters | `dp: { v, pa }` | v_s = V̇ / (n·s·H) | Same as `velocity-table`. Multiply by the installation factor (`INSTALL_FACTORS`). |

Free cross-section for `velocity-table`:

- RS-N: `A_free = π/4 · dIn²` (`dIn` = clear inner diameter ød from the source).
- RS-M: `A_free = π/4 · dIn² − T · dIn`. Assumption: the middle baffle spans the full diameter. Schako does not state A_free.

Rows with `dpFromDn` have no own Δp line in the source; the line of the nearest nominal size was copied (see `note`).

ρ: use 1.2 kg/m³ unless the tool takes the air state from `lib/core/air.js`; the tables are referenced to standard air.

## Flow noise (`flow-noise.js`)

Manufacturer data exists only for the Trox splitter series (`TROX_FLOW_NOISE`). Everything else is an estimate from it.

```
L_WA      = interp(TROX_FLOW_NOISE over lg v) + 10 · lg(A / 1 m²)      [dB(A)]
L_W,oct   = L_WA + FLOW_NOISE_SPECTRUM.dl[i]                            [dB]
```

| Silencer | v | A | Basis |
|---|---|---|---|
| Trox XK, MK | v_s | B · H | Trox table (Q03) |
| Schako MWK | v_s | B · H | Trox table. Schako publishes L_W1 only as diagrams (not included). Estimate. |
| Trox CK, Schako RS-M (core) | V̇ / A_free | π/4 · dn² | Trox table. Own assumption, no manufacturer data. |
| Trox CA, Schako RS-N, Lindab SLU (no core) | – | – | No flow noise: the free cross-section equals the duct, like a straight duct. Own assumption. |

- `TROX_FLOW_NOISE`: interpolate linearly over lg(v). Below 4 m/s or above 20 m/s, extrapolate with `TROX_FLOW_NOISE_FIT` and warn above 20 m/s (`LIMITS.vGapMax`).
- `TROX_FLOW_NOISE_FIT` (L_WA = −12.7 + 56·lg v + 10·lg A) matches the table within 0.5 dB.
- `VDI_FLOW_NOISE_FIT` (Kluth, back-calculated from VDI 2081): plausibility check only.
- `FLOW_NOISE_SPECTRUM.dl` sums back to L_WA within 0.1 dB with A-weighting.
- `SCHAKO_KF`: Schako's area correction (≈ 10·lg A). Kept for reference.

## Coefficients and limits (`coefficients.js`)

- `A_WEIGHTING`: −26.2, −16.1, −8.6, −3.2, 0, +1.2, +1.0, −1.1 dB.
- `ZETA_SPLITTER`: ζ = a·lg(d/s) + b·L/s + c. Ackermann (round or square leading edge, about 33 % above Trox tables) and an own fit on the Trox tables (±13 % rms). Only for geometries without table values.
- `INSTALL_FACTORS`: Δp × 1.0 in a duct on both sides, × 1.1 free inlet, × 1.3 free outlet.
- `LIMITS`: warnings, not hard stops.

| Key | Value | Meaning |
|---|---|---|
| `vGapMax` | 20 m/s | Maximum gap velocity (abrasion of the glass fibre fleece) |
| `vGapPlan` | 12 m/s | Planning value for the gap velocity |
| `dpPerSilencer` | 100 Pa | Upper planning value per silencer (80 … 100 Pa) |
| `flowNoiseMargin` | 10 dB | Flow noise at least 10 dB below the level after the silencer |
| `insertionLossCap` | 50 dB | More than 50 dB per octave is not reachable with one silencer |
| `troxGapMin` | 40 mm | Trox: gap ≥ 0.25·d and ≥ 40 mm |
| `troxGapMaxFactor` | 2 | Trox: gap ≤ 2·d |
| `beamingEta` | 1.5 | Sound beams through the gaps above η = s·f/c > 1.5; D_e falls off |

## Rules from the sources (for `docs/silencer-method.md` and warnings)

1. Edge gap between the outer splitter and the duct wall = s/2. Then B = n·(d + s).
2. Keep gaps constant over length and height. A larger gap lowers D_e; a smaller gap raises Δp and flow noise.
3. Close gaps between splitter frames and the duct with absorbing filling (flanking path).
4. Install splitters standing; lying only up to 1200 mm splitter height (Trox).
5. Straight inflow of at least 1.5 × the larger side (Trox: 1.5·H or 2.5·B depending on direction).
6. Insertion loss, flow noise and Δp are measured to EN ISO 7235. Linear interpolation between table values is allowed (Trox).
7. Flow has no relevant effect on D_e up to 20 m/s.

## Own derivations (not from a manufacturer)

- **Edge gap ≠ s/2:** the silencer is a set of parallel channels. With area share a_i and D_i per channel:
  `D_total = −10 · lg Σ a_i · 10^(−D_i/10)`. A wall channel of width w behaves like an inner gap of width 2w (mirror). Example: 70 % inner gaps at 40 dB and 30 % wall channels at 20 dB give 25 dB.
- **Scaling to other thicknesses:** same Λ = d/s and the same absorber give the same curve over η = s·f/c. Scaling d and s by k shifts frequencies by 1/k and D_e per metre by 1/k. Use only as an estimate.
- **Branch split:** sound power splits with the volume flow share, ΔL = 10·lg(V̇_branch / V̇_upstream). VDI 2081 uses the area share; with similar velocities this is the same.

## Known gaps

- No rectangular splitter data for d = 150, 160 and 250 mm (Trox CK has round silencers with 150/250 mm splitters).
- Schako splitter flow noise (L_W1 diagrams) and Wildeboer nomograms are not included.
- VDI 2081 Blatt 1, chapter 13.2, was not available.
- Lindab SLCU is not included: its 50 mm table is contradictory (longer silencers attenuate less). Trox CF (flexible) and CAK (cross talk) are not included.
- Round silencers: no manufacturer flow noise data in the data sheets used.

## Known source quirks (kept as printed, row has a `note`)

- Schako MWK-OB d 100, s 50, L 2000: 250 Hz = 18 dB (neighbours 21 to 25 dB).
- Schako MWK-OB d 200, s 200, L 2500: 1000 Hz = 50 dB, higher than s = 180.
- Schako MWK d 100, s 100, L 2000: Δp at 7 m/s `<10`, lower than at L 1000/1500.
- Schako MWK d 200, L 3000, s 180/200: Δp at 6 m/s `>10`, probably `<10`.
- Trox CK NS 315: Δp much lower than NS 250 and 400 (ζ ≈ 0.3 instead of 1 to 4).
- Schako RS-N L 1950, P 100: D_e at 1000 Hz lower than at L 1450 for NW 400 … 710.
- Schako RS-N L 1950, NW ≥ 800: Δp at 10 m/s higher than at 11 m/s.
- Schako RS-M-150, L 950, NW 350: 500 Hz = 28 dB (NW 355: 37 dB).
- Schako RS: Δp table uses NW 0225, insertion loss uses 0224. Stored as 224.
- Lindab SLU 100 mm, Ø 500 and 630, lnom 900: source gives l = 600 mm.

## Changing the data

1. Change the row in the module, keep the header comment.
2. Add or update the `note` and the source ID if a new source is used (add it to `sources.js`).
3. Update counts and spot values in `tests/silencer-data.test.js`.
4. Bump `DATA_VERSION` in all modules. Saved files keep the values they used (see the plan), so old calculations stay reproducible.
