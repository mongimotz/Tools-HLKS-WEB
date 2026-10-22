# h,x-Diagramm

This file records the tool's behavior for agents. Obey the shared rules in [../../AGENTS.md](../../AGENTS.md) and [../../docs/DESIGN.md](../../docs/DESIGN.md).
Keep interface labels in German. Formulas, process models and limits are in [../../docs/hx-diagram-method.md](../../docs/hx-diagram-method.md); read it before you change a calculation.

## Scope (owner decisions, 2026-10-21)

- The tool draws states and air treatment processes in a Mollier h,x diagram and calculates their powers. The look follows the owner's Typst sheet (`hx-diagramm.typ`): skewed axes with the 0 °C isotherm horizontal, the same line set and labels.
- The paper-only parts of the sheet are left out on purpose: the stepped x scale, the Δh/Δx edge scale (wheel) and the note grid. The x scale is one straight line at the bottom.
- The diagram is not a fixed A4 sheet (owner decision, 2026-10-21): it fills its box (canvas on screen, page in the PDF), and each calculation has its own visible range. The default range is the sheet's (−20 … 50 °C, 0 … 20 g/kg). Zooming changes the range and redraws the lines; their spacing follows the scale.
- The page starts with an empty diagram (no example) when there is no draft.
- Layout: diagram on the left, building blocks on the right. `+` adds a block; the user builds the process from these blocks.
- The cooler model is the simple straight line towards the coil point (owner approved). Greek letters and symbols stay upright (the PDF fonts have no italic).
- The site altitude is an input; the pressure follows from it (ICAO). There is no separate pressure input.

## Files

- `psychro.js`: moist air (Hyland-Wexler over water and ice, enhancement factor), `stateFrom()` for any two of t, φ, x, h, t_τ, t_f.
- `chart.js`: `buildChart(p, range, { width, height, font })` gives the diagram as items in box units (px on screen, pt in the PDF) and `sheetMap()` (state ↔ box). Line steps are 1, 2, 5 × 10ⁿ from the scale (`niceStep`). Lines carry the property they keep constant (`q`, `v`); `tests/hx-diagram.test.js` checks every vertex against it at several altitudes, ranges and sizes. `cleanRange()` validates a range (limits in `RANGE_LIMITS`). Cached per pressure, range and box.
- `svg.js`: SVG strings of the chart and of the overlay; `overlayOf()` and `placeLabels()` are shared with `report.js`, so screen and PDF draw the same processes and label positions.
- `calc.js`: processes and the calculation; `defaults.js`: schema, normalisation, example; `labels.js`: German texts; `report.js`: PDF; `csv.js`: CSV.

## Data

- `inputs = { site: { altitude }, calculations: [{ id, name, flow, range, blocks }] }`. `site` belongs to the project; `flow` (V̇, m³/h), `range` ({ tMin, tMax, xMin, xMax }) and `blocks` to the calculation (tab).
- A block is a `point` (`given`: the two last edited properties `{ key, value }`, phi in %, optional own `flow`) or a process with `from` (and `to` for `mix`, `line`, `hrv`) and its parameters (`BLOCKS` in `defaults.js`). Block ids (`b1`, `b2`, …) are point ids; the second outlet of a WRG is `<id>.b`.
- A process may only use points of blocks above it. A missing or later reference gives `Eintritt fehlt`; there is no reordering of blocks.
- Labels: the block's `label` (WRG: `label2` for the extract outlet, up to `LABEL_MAX` = 24 characters, e.g. `ZUL nach LE1`), else the running number of the point. The label field takes the free width of the card head.
- Mass flow: a given point gets ṁ = V̇ ρ / (1 + x) from its own V̇ or the calculation's V̇. Processes pass ṁ on. Mixing with `Anteil` uses the share of the first input and the calculation's V̇ at the mixed state; with `V̇` it adds both input mass flows. Without ṁ the powers show `–` and an information notice.

## Page

- Shared app bar, `.workspace-head`, calculation tabs (one tab per case, e.g. Winter, Sommer). The tab shows the larger of heating and cooling power. No catalogue dialog.
- Above the blocks: `Höhe` (project-wide), `p` (read only), `V̇` (calculation).
- Point card: six fields t, φ, x, h, t_τ, t_f. The two given values sit in input wells; typing into a third field makes it given and drops the older given one. Derived values read like results.
- Process card: inputs (selects of earlier points), mode buttons (target), parameters, then the outlet state(s) and the powers. The first error shows in the card; all notices go to the shared notice row, and a notice jumps to its block.
- Diagram toolbar: lock, crosshair (point placing), four corners (default range), crop (range around the points of the calculation), then the range fields t min – max and x min – max. The lock is on at every page load (owner decision, 2026-10-22): the wheel scrolls the page and dragging the paper does nothing, so the view cannot change by accident. Unlocked, the wheel zooms about the pointer and dragging empty paper pans (mouse; on touch only when zoomed, otherwise the page scrolls); both change the range, which is saved, and give one history step. The lock state is not saved. Points outside the range are clipped and give an information notice. The crosshair button toggles point placing: each click adds a given point (t, x rounded to 0.1); Esc leaves. Given points can be dragged and moved with the arrow keys when focused (←/→ x, ↑/↓ t, 0.1 per step, Shift 1); they keep the kind of their two given values. Result points are not draggable. Hover shows t, φ, x, h, ρ in the toolbar.
- Process colours (owner decision, 2026-10-22) show what the process does to the air: heating `--danger` (Lufterhitzer, Ventilator, the warming side of a WRG), cooling `--chart-1` (Luftkühler, the cooling side of a WRG), humidifying `--chart-8` (Dampf- and Adiabatbefeuchter), neutral `--text-muted` (Mischung and `Verbindung`, dashed). Red, blue and aqua stay apart under red-green colour blindness (CIEDE2000 ≥ 12, both schemes). A result point takes the colour of its process; given points are rings in `--text-strong`. The PDF uses the same tokens (light column). The selected block is drawn thicker.
- Dark scheme: the paper lines step back (lower stroke opacity, bold lines and labels in `--text-muted`) so the diagram does not glare and the processes stand out.
- WRG extract side: drawn as a polyline from `values.path` (straight while dry, then along the saturation line).

## Exports

- PDF (A4 portrait): per calculation one diagram sheet with the calculation's range, filling the page (title, p and H, fields Objekt = project name, Anlage = calculation name, Datum; the processes drawn on it, clipped to the frame) and one table page (states, processes, notices). `data.json` as usual.
- ⋯ menu: the standard entries plus `Leeres Diagramm`: the blank sheet at the current altitude and range, without data.
- CSV: one row per state and one per process for every calculation.
