# h,x-Diagramm – build plan

Tool id `hx-diagram`, German name `h,x-Diagramm`, registry group `cooling` (Klima). It takes the slot of `Platzhalter 1`, so Klima shows Klimastation, h,x-Diagramm, Platzhalter 1.

## 0. Owner changes (2026-10-21, these win over the sections below)

- Build everything in one go; the owner reviews at the end.
- Layout: the empty h,x diagram on the left, the building blocks on the right. `+` adds a point or a process as a small block card; the user works with these blocks.
- The cooler model (surface temperature, straight line to the coil point) is fine. Upright Greek letters are fine.
- Do not copy the paper layout literally. The stepped x scale and the Δh/Δx wheel exist only for space on paper: the web diagram uses one straight x scale at the bottom and no wheel, and no note grid. The principle (skewed Mollier chart, line set, labels) stays.
- The altitude stays an input.

Goal: draw and calculate air treatment processes in a Mollier h,x diagram. The diagram looks like the owner's Typst sheet (`hx-diagramm.typ`, A4 portrait, skewed axes, 0 °C isotherm horizontal) on screen and in the PDF. All calculations run locally.

---

## 1. Principles

- **One drawing, two outputs.** `chart.js` (no DOM) builds the diagram as a list of primitives in mm on an A4 sheet: lines, polylines, text with anchor, angle and white knock-out. `svg.js` renders them on screen, `report.js` renders the same list with pdf-lib. Screen and print match by construction.
- **Port, don't redesign.** The Typst file is the reference for geometry, line weights, label positions, the x scale in steps, the pD scale, the density lines, the Δh/Δx edge scale and the 5 mm note grid. Same equations (ASHRAE Fundamentals ch. 1, Hyland-Wexler over water and ice, enhancement factor).
- **Lean scope.** Core job: states, processes, powers, print. No climate data, no room-load optimisation, no unit catalogue.

## 2. Files

```
tools/hx-diagram/
  AGENTS.md      local contracts
  index.html     page (app bar, workspace head, tabs, panel, diagram, results)
  app.js         UI: steps panel, diagram interaction, results, notices (DOM)
  svg.js         primitives → SVG, process overlay, hit testing (DOM)
  psychro.js     moist air state functions (no DOM)
  chart.js       diagram geometry in mm, port of the Typst sheet (no DOM)
  calc.js        states and processes → results, CALC_VERSION (no DOM)
  defaults.js    INPUT_VERSION, defaults, example, normalizeInputs (no DOM)
  labels.js      German labels, notice texts (no DOM)
  report.js      PDF: diagram pages + table page, blank sheet (no DOM, lazy)
  csv.js         states and processes (no DOM)
  style.css
docs/hx-diagram-method.md   German: equations, process models, assumptions, limits
tests/hx-diagram.*.test.js
```

`psychro.js` stays in the tool. Move it to `lib/core/` only when a second tool needs it.

## 3. Psychrometrics (`psychro.js`)

Pressure p from altitude (ICAO, same as `lib/core/air.js`) or entered directly. Functions, all in °C, g/kg, kJ/kg, Pa:

- `ps(t)` saturation pressure (Hyland-Wexler, ice below 0 °C), `fE(p)` enhancement factor
- `xFromPd`, `pdFromX`, `xPhi(t, φ)`, `xSat(t)`, `h(t, x)`, `rho(t, x)`, specific volume
- `dewPoint(x)` (frost point below 0 °C), `wetBulb(t, x)` (iterative, psychrometer equation, ice below 0 °C)
- `state(given)`: a state from **any two** of t, φ, x, h, t_tau, t_f. Pairs without a unique solution (x + t_tau, h + t_f approximately) are rejected with a notice.
- States in the fog region (x > x_sat): t, x and h stay valid, φ is shown as `> 100 %`, liquid water x − x_sat is reported.

Tests: reference values from ASHRAE tables (e.g. 20 °C / 50 % at 101 325 Pa → x ≈ 7.29 g/kg, h ≈ 38.6 kJ/kg), wet bulb and dew point round trips, every pair of `state()` round-trips to the same point.

## 4. Diagram geometry (`chart.js`)

- Range as in the sheet: t −20 … 50 °C, x 0 … 19 g/kg. Ordinate h − r0·x. Fixed range in version 1; points outside are drawn clipped at the frame edge with a warning.
- Output: `{ size: [210, 297], items: [{ kind: 'line'|'poly'|'text'|'grid', points, style, text, anchor, angle, knockout }] }`, plus the mapping functions `toSheet(t, x)` and `fromSheet(X, Y)` for interaction.
- Styles map to tokens: line weights fine / normal / bold / dashed / grid as in Typst. On screen the diagram ink is `--text` on `--surface` paper, the grid `--border`. In the PDF the light column (`INK`).
- Cache per pressure (the geometry depends on p only). Build time target < 30 ms.
- Labels: Plex Sans, no italic (the PDF fonts have none; ρ, t, x, h stay upright). Text widths for knock-out boxes: fontkit in the PDF, an approximate width table on screen (only the white boxes depend on it).

Check: render the Typst PDF and the tool's PDF to PNG at the same scale and overlay them; differences only in fonts.

## 5. Data model (`defaults.js`)

```js
inputs = {
  site: { altitude: 500, pressure: null },          // project-wide, null = from altitude
  calculations: [{
    id, name,                                        // tab = one case, e.g. Winter, Sommer
    points: [{ id, label, given: { t: 22, phi: 50 }, flow: null }],   // flow in m³/h, optional
    processes: [{ id, type, from: [pointId…], to: [pointId…], params: {…} }],
  }],
}
```

- A point is **given** (two properties) or the **result** of a process (`given` empty, its process computes it).
- Editing a third property of a given point replaces the older of the two given ones (the field order of the last edits is kept in `given`).
- Point labels number automatically 1, 2, 3 …; the user may rename them (AU, ZU, AB, FO …).
- Mass flow: a given point with `flow` defines ṁ = V̇ · ρ(point). Processes pass ṁ on; mixing adds; WRG has two streams. Points without a known ṁ show specific values only (kJ/kg, g/kg), powers stay `–`.
- `normalizeInputs` idempotent, never throws, beta rule: no migration, bump `INPUT_VERSION` on schema changes.
- Example (`Beispiel laden`, `project.name = 'Beispiel'`): winter case AU −8 °C / 80 % → WRG (Φ = 0.75, AB 22 °C / 35 %) → Lufterhitzer to 20 °C → Dampfbefeuchter to 6 g/kg, 5'000 m³/h.

## 6. Processes (`calc.js`)

Each process takes its input state(s) and parameters, returns output state(s) and powers. Parameters: one target per process, chosen by a small selector (the other options greyed out).

| Type | German | Model | Target options | Results |
|---|---|---|---|---|
| `heater` | Lufterhitzer | x = const | t_out, Q | Q, Δt |
| `cooler` | Luftkühler | straight line from inlet towards the coil point (mean surface temperature t_O on saturation); dry when t_O ≥ dew point (x = const) | t_out, Q, bypass factor | Q total, sensible, latent, condensate kg/h |
| `steam` | Dampfbefeuchter | Δh = Δx · h_D(t_D), steam temperature default 100 °C (nearly isothermal) | x_out, φ_out, steam kg/h | steam kg/h, Q |
| `adiabatic` | Adiabatbefeuchter | Δh = Δx · c_w · t_w (t_w default = wet bulb, i.e. h ≈ const) | efficiency η, x_out, φ_out | water kg/h |
| `hrv` | WRG | temperature efficiency Φ_t; with moisture recovery (rotor) also Φ_x; exhaust side by energy balance; condensation on the exhaust side limited to saturation | Φ_t, (Φ_x), t_out | Q recovered, supply and exhaust outlet, condensate, frost notice (exhaust out < 0 °C at saturation) |
| `mix` | Mischung | mass and enthalpy balance | shares from flows or share in % | ṁ, mixed state |
| `fan` | Ventilator | Δt (default 1 K), x = const | Δt, P_el | Q |
| `line` | Verbindung | no physics, two existing points | – | Δh, Δx, Δh/Δx, Q if ṁ known |

Rules:
- Outputs crossing saturation (steam, adiabatic, cooler beyond the coil point, mixing in the fog region) give a warning with the liquid water content; the state stays in the fog region (no silent clipping).
- Process order is a graph, solved by topological order; cycles (e.g. a WRG fed by its own exhaust downstream) are solved by fixed-point iteration (max 50 steps) or reported as an error.
- `CALC_VERSION` bump whenever results change; reference fixtures via `npm run fixtures`.

Tests: energy and mass balances close (mixing, WRG two sides, heater Q = ṁ Δh), heater keeps x, adiabatic keeps h within c_w t_w Δx, steam at 100 °C raises t by < 1 K for typical Δx, cooler below dew point gives condensate = ṁ Δx, normalize round trip, example case snapshot.

## 7. Page and interaction (`app.js`, `svg.js`)

Layout (desktop): steps panel left, diagram center (A4 sheet, fits the height), results right. Phone: one column, diagram first.

- Shared app bar, `.workspace-head` (project + notices), calculation tabs (one tab = one case). Book icon: none (no catalogues).
- **Site** row at the top of the panel: `Höhe m ü. M.` and `p mbar` (one derives the other; project-wide).
- **Steps panel:** one row per point (label, t, φ, x, h, V̇; the two given values in input wells, derived ones plain) and one row per process (type icon, from → to, target field). `+` menu adds a point or a process type; drag handle reorders (`lib/core/drag.js`); delete with undo toast.
- **Diagram:**
  - hover shows a crosshair and a fixed readout line under the sheet: t, φ, x, h, ρ;
  - a point tool (toggle button) adds a given point at the click (t and x, rounded to 0.1);
  - given points can be dragged (snap 0.1 K / 0.1 g/kg, arrow keys with the point selected, Shift = 1 K / 1 g/kg); result points are not draggable;
  - processes are drawn as arrows from input to output, numbered points with labels; the selected step is drawn in `--primary`, others in `--text-strong`; mixing shows the mixing line dashed;
  - wheel / pinch zoom about the pointer, drag on empty paper pans, `four corners` fits (preview canvas pattern of DESIGN.md).
- **Results:** table of states (label, t, φ, x, h, ρ, t_tau, t_f, ṁ) and of processes (type, Q kW, water kg/h, Δh/Δx). Key result per tab: the largest heating or cooling power.
- **Notices:** fog region, outside diagram range, missing flow for powers, ambiguous state pair, frost risk in WRG, target not reachable (e.g. heater target below inlet).
- Undo/redo via `DocumentStore`, browser draft, Strg+S = PDF.

## 8. PDF and print (`report.js`)

- Page per calculation: the A4 portrait sheet exactly as the Typst sheet, header fields filled (Objekt = project name, Anlage = calculation name, Datum), process lines and points drawn in `--primary` (prints dark blue; readable in grey-scale print).
- In the 5 mm note area of the sheet: a compact state table (Nr, t, φ, x, h) when it fits; otherwise it moves to the table page.
- Final page(s) A4 portrait: states and processes with all values and powers, site, project data.
- `data.json` envelope as usual; start-page import via the registry.
- ⋯ menu: standard entries plus `Leeres Diagramm` (blank sheet for the current pressure, no envelope; this is the owner's printable sheet).
- `buildPdf` currently takes one page size; the report uses A4 portrait for all pages (`pageSize: A4_PORTRAIT`), no change to `lib/core/pdf.js` needed. Vector drawing goes straight to `writer.page` (pdf-lib `drawLine`, `drawSvgPath`, `drawText` with `rotate`).

## 9. Stages (each ends with `npm test` green and a commit)

1. `psychro.js` + tests.
2. `chart.js` + `svg.js` + a static page that shows the blank sheet; visual check against the Typst PDF.
3. `defaults.js`, `calc.js` with all processes + tests.
4. `app.js`: panel, interaction, results, notices, tabs, undo, draft.
5. `report.js` (process sheet, table page, blank sheet), `csv.js`, fixtures.
6. Registry entry, `AGENTS.md` (table, structure, inventory), `tools/hx-diagram/AGENTS.md`, `docs/hx-diagram-method.md`, README rows (tool table, Rechenwege). Browser check desktop, phone, dark, sub-path server.

## 10. Later (not in version 1)

- Room process from sensible and latent loads (Δh/Δx edge scale), supply state from room state.
- Adjustable diagram range (e.g. x up to 25 g/kg for tropical cases).
- Sorption dehumidification, sequences per hour of a year.
