# Plan: tool "Schalldämpfer" (`tools/silencer/`)

Implementation plan for the silencer tool. Set by the owner on 2026-10-12. AGENTS.md and docs/DESIGN.md apply as for every tool. Data: `tools/silencer/data/` and `docs/silencer-data.md` (complete, do not research again).

When this plan leaves a decision open or you want to deviate: ask the owner, do not guess.

**Overhaul 2026-10-13 (owner, after using version 1: "viel zu kompliziert").** Version 2 (`CALC_VERSION` 2.0.0, `INPUT_VERSION` 2) replaces the parts of this plan that differ; `docs/silencer-method.md` describes the current state.

- Structure (sections 3, 4.1, 4.2): no tree. A file holds **paths** (source → one receiver), each a plain list of rows like the Excel sheet: `source` (+ L_W), `loss` (− D), `silencer` (− D_e, + flow noise), `branch` (− ΔL from V̇ before / after, or typed in; sets V̇ for the rows after it). Shared parts of several paths are repeated per path (duplicate a path to copy them). Rows can be dragged.
- Units: every level line (source, manual flow noise) is in dB or dB(A); the calculation runs in dB(A) per octave, a dB line shows an A-weighting line below it. Sum and receiver always in dB(A).
- Layout: level list left (focus), design of the selected silencer right. Type chips per series (Trox XK, MK; Schako MWK-OB, MWK-MB; Trox CA, CK; Schako RS-N, RS-M; Lindab SLU; Hand).
- Rectangular silencers (4.3, 4.4): the user gives the housing B × H. n = round(B / (d + s)), splitters evenly spaced, real gap s′ = B / n − d, A_free = n·s′·H; D_e from the row for s, deviation reported. Front view to scale on the page and in the PDF.
- Mode "Vorschlag" (section 5) is gone: the design panel lists variants of the selected series for the given housing (rect: d / s with |s′ − s| ≤ 20 % of s) or diameter (round: insulation / core), each with the shortest L that meets everything; a click takes it.
- Beta: no migration of version-1 files (AGENTS.md).

## 1. Goal

One tool that calculates the sound level from the noise sources of a ventilation system to the receiver, per octave band, and sizes the silencers on the way.

- The user enters known values only: sound power levels from data sheets (air handling unit at the duct connection, VAV unit, other components) and insertion losses of other components.
- The tool calculates the silencers itself from the manufacturer data: insertion loss, pressure loss and flow noise.
- Two modes, selectable by the user:
  - **Prüfen**: the user selects the silencers; the tool shows whether the targets are met.
  - **Vorschlag**: the tool lists suitable silencers from the data for a silencer position, ranked; the user picks one.
- Core rule for both modes: a silencer is judged by its net effect `(L_W,in − D_e) ⊕ L_W,flow`, never by D_e alone. Narrow gaps give more D_e but a higher velocity and more flow noise; at some point a narrower silencer is worse.

Not in scope: duct attenuation, bends, end reflection or fan noise estimated by formulas (VDI 2081). The user enters such values by hand as a component when they are known.

## 2. Reference: the owner's current Excel sheet ("Beispiel Kilian")

The sheet the tool replaces is one linear chain, one row per element, values per octave 63 … 8000 Hz:

| Row | Values [dB] | Operation |
|---|---|---|
| Ventilator | 78 85 87 89 78 79 78 74 | start |
| Schalldämpfer 1 | 4 15 28 38 43 33 18 11 | subtract |
| Strömungsgeräusch SD 1 | 41 36 32 28 25 22 19 15 | add energetically |
| VAV | 69 61 53 50 50 53 48 43 | add energetically |
| Schalldämpfer 2 | 6 14 21 43 50 50 35 26 | subtract |
| Strömungsgeräusch SD 2 | 49 44 40 36 32 28 25 22 | add energetically |
| A-Bewertung | −26.2 −16.1 −8.6 −3.2 0 1.2 1.0 −1.1 | add |

Result: L_WA = 46.4 dB(A) total. Sound pressure at r = 2 m, Q = 2: L_pA = L_WA + 10·lg(Q / (4πr²)) = 32.4 dB(A).

In the sheet the user picks an operation per row. In the tool the element type fixes the operation. The sheet only has the free-field term; the tool adds the room term (section 4.6).

This example is regression test 1 (section 8).

## 3. Structure

A calculation file holds one or more **strands** (Stränge), for example AUL, ZUL, ABL, FOL of one air handling unit. Strands do not influence each other (no cross talk, no casing radiation). One strand is the default; the strand selector only appears when there is more than one.

A strand is a **tree** of elements, like the sections in `duct-pressure-loss`: every element has a predecessor (`after`), the first element is the source. An element with two or more successors is a branch point. A strand without branches is a simple chain, and the branch feature stays invisible until the user adds a branch (same icon and numbering pattern as `duct-pressure-loss`).

Sound propagates from the source in air direction only. Self-noise of a component downstream does not travel back into other branches (common simplification, state it in the method doc).

## 4. Calculation model (`calc.js`, pure functions)

All spectra are arrays of 8 values for `OCTAVES`. Energetic sum: `L1 ⊕ L2 = 10·lg(10^(L1/10) + 10^(L2/10))`. A-weighted total: `L_A = 10·lg Σ 10^((L_i + A_i)/10)`.

### 4.1 Air flow

The strand has a design air flow V̇ [m³/h]. Every element inherits V̇ from its predecessor unless it sets its own. Only silencers and branches need V̇.

### 4.2 Element types

| Type | Input | Effect on the spectrum |
|---|---|---|
| `source` (Quelle) | L_W per octave | first element: start value. Later in the strand: `L ⊕ L_W` |
| `component` (Bauteil) | optional D per octave, optional L_W per octave | `(L − D) ⊕ L_W` (VAV, fire damper, known end reflection …) |
| `silencer` (Schalldämpfer) | see 4.3 | `(L − D_e) ⊕ L_W,flow` |
| `receiver` (Empfänger) | see 4.6 | end of a path, gives L_p |

A branch point needs no own type: when an element's V̇ is smaller than its predecessor's V̇, apply `ΔL = 10·lg(V̇ / V̇_predecessor)` to all octaves before the element (branch split, see docs/silencer-data.md). Allow a manual dB value instead.

### 4.3 Silencer element

Source of the values, selectable:

- **Datenbank**: rectangular (series, d, s, L, n, H) or round (series, dn, L, insulation, core). Only rows that exist in the data are selectable. No interpolation in L or s in the first version.
- **Hand**: D_e, Δp and L_W,flow per octave typed in (Kilian case, products not in the data).

For a database silencer the element stores a copy of the used row (D_e, Δp points, series id, `DATA_VERSION`). The file stays reproducible when the data changes. The full database is not part of `inputs` (too large); this is a deliberate exception to "catalogues are part of inputs". Show a hint after import when the stored row differs from the current data.

Results per silencer:

| Value | Rectangular | Round |
|---|---|---|
| geometry | B = n·(d + s), A_free = n·s·H, edge gap s/2 | A_duct = π/4·dn², A_free per docs/silencer-data.md |
| velocity | v_s = V̇ / A_free | per `dpModel` |
| D_e | table row | table row |
| Δp | ζ from table (interpolated over v) × installation factor | per `dpModel` |
| L_W,flow | Trox table at v_s, + 10·lg(B·H), spectrum `dl` | per docs/silencer-data.md (none without core) |

Warnings (icon + short text under "Hinweise", no blocking): v_s > `LIMITS.vGapMax`, Δp > `LIMITS.dpPerSilencer`, flow noise less than `LIMITS.flowNoiseMargin` below `L − D_e` (compare A-weighted totals), Trox gap rule violated, row has a `note`, H ≠ 1000 mm with Trox Δp.

### 4.4 Rectangular geometry input

The user gives H and either n (B follows) or a fixed B. With a fixed B the possible pairs (n, s) follow from `s = B/n − d`; only pairs whose s exists in the table are valid. The edge-gap correction for B ≠ n·(d + s) (docs/silencer-data.md, own derivations) is milestone 6, not version 1; until then show a warning.

### 4.5 Result per element

The table shows, per element, the spectrum after the element and its A-weighted total. Silencer rows also show v, Δp and L_WA,flow. Values one decimal, Swiss format.

### 4.6 Receiver

Input: distance r [m], directivity Q (1, 2, 4, 8), room absorption A [m²] or room volume V [m³] with reverberation time T [s] (A = 0.163·V / T), target (room type, LSV or a value, see section 10).

```
L_p,i = L_W,i + 10·lg( Q / (4π r²) + 4 / A )      A empty → free field only (outdoor, as in the Excel sheet)
L_pA  = 10·lg Σ 10^((L_p,i + A_i)/10)
```

Result: L_pA (LSV: L_r for day and night), margin to the target, status (icon + word). The result strip shows the worst receiver of the file (or of the selected strand): the judged level and the target.

## 5. Mode "Vorschlag"

The user marks one silencer element as "auslegen" and sets the constraints:

- Rectangular: H (fixed), B max (optional), L max (optional), series filter.
- Round: dn fixed (from the duct) or dn range, outer diameter max (optional), L max, series filter.
- Both: v max (default `LIMITS.vGapPlan`), Δp max (default `LIMITS.dpPerSilencer`).

Search: for every candidate row (rectangular: every row × n = 1 … n_max with B ≤ B max) calculate the silencer and then all receivers downstream with the rest of the strand unchanged. Keep candidates where every downstream receiver meets its target and all limits hold. Rank by Δp, then by L. Show the best 10 in a table: product, geometry, D_e (compact), v, Δp, L_WA,flow, worst margin. A click takes the candidate into the element (copy, as in 4.3) and switches the element back to normal display.

With several silencers on one path, the search changes one element at a time; the others stay as selected. A few hundred candidates × a few elements is fast; no worker needed. If nothing fits, show the best candidate and by how much it misses.

## 6. Inputs (envelope `inputs`, `INPUT_VERSION = 1`)

Sketch; refine in milestone 1 and keep `normalizeInputs` idempotent.

```js
{
  mode: 'check' | 'propose',
  density: 1.2,
  strands: [
    {
      id, name, flow,                        // m³/h
      elements: [
        { id, after, type: 'source', name, lw: [8] },
        { id, after, type: 'component', name, flow?, d?: [8], lw?: [8] },
        { id, after, type: 'silencer', name, flow?, kind: 'rect' | 'round' | 'manual',
          install: 'duct' | 'freeInlet' | 'freeOutlet',
          rect?: { series, d, s, L, n, H, B? },
          round?: { series, dn, L, insulation, core },
          manual?: { de: [8], dp, lwFlow: [8] },
          row?: { ...copy of the data row, dataVersion },
          propose?: { constraints } },
        { id, after, type: 'receiver', name, r, q, area?, volume?, reverb?, target },
      ],
    },
  ],
}
```

## 7. Files

As in AGENTS.md: `tools/silencer/{index.html, app.js, calc.js, defaults.js, labels.js, report.js, csv.js, charts.js, style.css}` plus the existing `data/`. `docs/silencer-method.md` (German, user-facing: formulas, assumptions, limits, including every own assumption from docs/silencer-data.md). README: tool table row and a section like the other tools. Registry: `status: 'ready'` only at the end.

`tools/silencer/style.css` exists as a placeholder (needed by `tests/theme.test.js`); replace its content.

UI follows docs/DESIGN.md: octave columns in the number font, editable cells in wells, no explanations in the page, icons for add, branch, delete, undo. Chart: spectra per octave (source, after silencer, at receiver) with `--chart-1 …`, and the target as a hatched or dashed line, not as colour alone.

## 8. Tests (`tests/silencer-calc.test.js`)

1. **Kilian chain** (section 2): manual values only. Expect per octave after the chain 69.24, 56.75, 42.53, 36.01, 32.00, 28.02, 28.15, 37.18 dB (±0.01), L_WA = 46.38 dB(A), L_pA (r = 2 m, Q = 2, no room) = 32.37 dB(A).
2. **Database splitter**: Trox XK, d = 200, s = 100, L = 1500, n = 4, H = 1000, V̇ = 10’000 m³/h. Expect B = 1200 mm, v_s = 6.944 m/s, D_e = 5 12 22 44 50 46 30 19, ζ = 0.6525 (linear in v between 6 and 10 m/s), Δp = 18.9 Pa, L_WA,flow = 35.35 dB(A), L_W,flow per octave 39.3 33.3 34.3 33.3 30.3 27.3 21.3 17.3 dB.
3. Branch split: V̇ 6000 → 2000 m³/h gives −4.77 dB in every octave.
4. Receiver with room term: A = 20 m², r = 1 m, Q = 2 → 10·lg(2/(4π) + 4/20) = −4.45 dB.
5. Each `dpModel` once (duct, flow-points, velocity-table) with a hand-checked value.
6. Proposal: the flow-noise trade-off is visible. Example: high flow, narrow gaps rejected because L_W,flow exceeds the margin; result ranked by Δp.
7. Envelope round trip and `normalizeInputs` idempotence, as for the other tools.

`tests/silencer-data.test.js` already exists and must stay green.

## 9. Milestones

Run `npm test` after every milestone and give a short summary. Stop after milestone 1 for review.

1. `calc.js` + `defaults.js` (schema, `normalizeInputs`, example = Kilian chain) + tests 1 to 5. **Stop, show results and open questions.**
2. UI for one strand without branches, mode "Prüfen", manual and database silencers, receiver, Hinweise.
3. Several strands, branches, undo/draft (lib/core/store.js), open/save JSON.
4. Mode "Vorschlag" + test 6.
5. PDF (`report.js`), CSV, fixtures (`npm run fixtures`), `docs/silencer-method.md`, README, registry `ready`.
6. Later: edge-gap correction (4.4), interpolation in L, scaled estimates for d = 150/160/250 mm.

## 10. Decisions taken (owner can change them)

| Topic | Decision |
|---|---|
| Branch split | by volume flow share, manual dB possible |
| Flow noise Schako splitters | Trox table (no Schako data) |
| Flow noise round with core | Trox table with v in the free cross-section, A = duct area |
| Flow noise round without core | none |
| Δp CA / SLU | straight duct |
| Target | per receiver, three bases (2026-10-12): room type (indoor: noise sensitivity per SIA 2024 Anhang A, table 12; limit L_H for continuous noise per SIA 181:2020, minimum or raised requirement, or the recommended design value of SIA 2024 where given), LSV (outdoor: Anhang 6, ES I to IV, day and night, Planungswert or Immissionsgrenzwert, L_r = L_pA + K1 + K2 + K3 + 10·lg(t/t0), Art. 42 business rooms +5 dB) or a value typed in. No NR curves in version 1 |
| Room types | the 45 room uses of SIA 2024:2021, Anhang A, table 12 (supplied by the owner on 2026-10-12), ids = SIA codes; footnotes as info hints; the catalogue is saved with every file |
| LSV, several strands | version 1 judges each receiver within its strand; summing the openings of one installation (AUL + FOL at the same window) is a later extension, stated in the method doc |
| Housing B ≠ n·(d + s) | version 2: B is given, splitters evenly spaced with s′ = B / n − d; v, Δp, flow noise with s′, D_e of the row for s; info, warning above 20 % deviation |
| Trox CK free cross-section | π/4·dn² − T·dn (splitter across the full diameter, as RS-M) |
| Installation factor | splitter silencers only |
| Δp model `duct` | ν of air at 20 °C, k = 0.15 mm, ρ from the inputs; ζ from tables always with ρ = 1.2 |
| Velocity of round silencers | shown and checked in the free cross-section (CA, SLU: duct velocity) |
| Extra hints | branch without own flow (no split), successors with more air than the predecessor, manual D_e > 50 dB; targets judged on the shown value (one decimal) |
| Variants (version 2) | one per d / s (rect, fitting the housing) or insulation / core (round, at dn); per variant the shortest L that keeps v ≤ 12 m/s, Δp ≤ 100 Pa, flow noise margin 10 dB and the target, else the L with the lowest L_pA; ranking: fitting first by Δp then L, then limits kept, then L_pA |
| Interpolation | none in L or s in version 1; Δp and flow noise interpolated over v |
