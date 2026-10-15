# Druckverlust Lüftung

This file records the tool's behavior for agents. Obey the shared rules in [../../AGENTS.md](../../AGENTS.md).
Keep interface labels in German. Keep usage instructions outside the product interface.

## Calculation reference

[../../docs/duct-pressure-loss-method.md](../../docs/duct-pressure-loss-method.md) defines formulas, assumptions, limits, catalogs, and dimension proposals.
Read it before you change the calculation. Sections 4 and 6 define flow direction, the critical path, balancing pressure, and the safety allowance.
Section 8 defines the Lindab size series and rectangular dimension proposals.

## Inputs and network editing

- A project stores `{ calculations: [{ id, system, sections }], catalogs, settings }` (input version 4). Each calculation has an independent system and network; section ids may repeat between calculations. Sections have no authoritative `parent` field: connections are derived from `nr` in `network.js`.
- `calculationInputs(projectInputs, id)` exposes live references for the unchanged single-network `compute()` API. `computeProject()` and `snapshotProjectOf()` cover all calculations.
- The shared calculation tabs sit below the project header and above the pressure summary. Labels use `system.name`, falling back to `Berechnung N`, and are edited in the tab (no `Anlage / Strang` field); the active calculation id stays in UI state only.
- `+` adds an empty calculation. Copy duplicates the whole network independently and adds `Kopie` to its name. Trash removes the active calculation with undo; the last calculation remains.
- The system inputs are flow direction, elevation, air temperature, humidity, available fan pressure, and the safety allowance.
- Users enter sections away from the fan. Positive integer numbers form the main run in ascending order; the first starts at the fan. Gaps are allowed: deleting main section `2` connects `3` to `1`.
- A dotted number branches from its exact prefix: `2.1` and `2.2` both start at `2`; `2.1.1` starts at `2.1`. Each dotted level adds one indentation level. Do not infer a connection from the previous visible row or treat `2.2` as a continuation of `2.1`.
- The table sorts by numeric components (`1`, `1.2`, `1.10`, `2`, `10`), after a number edit is committed, without moving the field while typing. Number changes affect connections; existing dotted descendants keep their numbers.
- Missing, malformed, duplicate numbers and missing or ambiguous prefixes produce errors that jump to the number field. Never silently connect such branches to the fan. Invalid connections and their descendants do not calculate as valid sections.
- The branch icon adds the first free suffix `.1`, `.2`, and so on below the selected number. The bottom add button adds the next main number. Duplicate chooses a free number at the same level. Each section keeps its own data and id when sorting.
- Deletion removes only the selected row and offers undo. Dotted descendants remain and report their missing prefix. Main continuations follow the preceding remaining main number.
- The arrow at the left opens section details: fittings, components, a separate temperature, a remark, dimension proposals, and intermediate values.
- There is no predecessor selector, drag handle, or manual up/down control: section numbers determine both row order and connections.
- A circular section shows `Ø` before the diameter. A click opens the Lindab sizes for SR spiral ducts, from 63 to 1600 mm.
- `↑` and `↓` select the next Lindab size. Direct entry permits other diameters. Rectangular sections accept free dimensions.

`Zuschlag` is a percentage of the critical path's pressure loss. Typical values are 10 to 20 %. A value of 0 % disables it.
It accounts for uncertain ζ values, fittings added on site, leakage, and contamination.
`Ventilator → Auslass` applies to supply and exhaust discharge air with positive pressure.
`Einlass → Ventilator` applies to extract and outdoor intake air with negative pressure.
The direction controls cross-section transition calculations, as defined in the method document.

## Results and visual behavior

- The top result is the required pressure, including the safety allowance. The reserve or shortfall appears to its right.
- The pressure bar separates friction, fittings, components, and the allowance. Its gray track represents the available pressure.
- The empty remainder of the track represents reserve. Hatching marks required pressure above the available pressure.
- The pressure chart shows the critical path. Friction increases linearly with length. Fittings and components create a step at each section's end.
- The network diagram shows all sections. Line thickness represents flow. The critical path has color, and other endpoints show their balancing pressure.
- A click on a section in the diagram opens its table row.
- A colored line at the left of the table marks the critical path. Its `Δp kum.` values have a colored background.
- A red line marks a section with an error.
- Use the shared `.workspace-head` from the root `AGENTS.md`: project name left, notices right.
- Notices cover every calculation. Selecting one activates its calculation and focuses the affected section field. Imported version and result changes use the same row and can be dismissed there.
- The `Spalten` menu above the table selects a result set. The browser stores this selection.
- Columns have fixed widths. A value that does not fit ends with `…`. A very small diameter can cause this overflow.

| Column set | Results |
| --- | --- |
| `Kompakt` | `v`, `Δp TS`, `Δp kum.`, `Drossel` |
| `Standard` | Compact results plus `d_h`, `R`, `Δp R·L`, `Δp Z` |
| `Alle` | Standard results plus `p_d`, `Re`, `λ` |

## Catalogs

The catalogs contain materials, fittings, component templates, velocity limits, and the maximum aspect ratio.
Each saved file includes its catalogs.
The project shares one set of catalogs and settings across all its calculations. The catalog button beside the calculation tabs opens the shared dialog.
Catalog deletion and reset must check uses in every calculation, including inactive networks.
Values are guidelines. Manufacturer data takes precedence.
`↺` restores a catalog's standard values.

## Saving and exports

- Drafts, JSON, and the PDF attachment contain the entire project, including all calculations and shared catalogs/settings. Input version 4 does not migrate earlier file schemas during beta.
- PDF and CSV always recalculate every calculation from the authoritative inputs, regardless of the active tab or a supplied result object.
- Each calculation starts on a new PDF page and has its name in the page header. The embedded snapshot covers all calculation ids, critical and required pressures, and critical paths.
- CSV adds a `Berechnung` column. It includes sections from all calculations and one named row for an empty calculation.
- PDF and CSV sort numerically like the table. The PDF omits the redundant predecessor column; CSV keeps a derived predecessor number for further processing.

## Symbols and keyboard controls

Shared file, theme, and history controls obey [../../AGENTS.md](../../AGENTS.md).
The section controls have these meanings:

| Symbol or key | Behavior |
| --- | --- |
| `↶`, `↷` | Undo, redo |
| Folder | Open |
| `↓ PDF` | Save PDF |
| `⋯` | More actions |
| Sun, moon | Light or dark theme (system setting until chosen) |
| Branch | Add a section attached to this row |
| Trash | Delete a section. The notification includes an undo icon. |
| `↺` | Restore a catalog's standard values |
| `→` in a notice | Jump to the section |
| `↑` after `v` | Velocity exceeds its limit |
| `Ø` | Circular section. Click for Lindab sizes or enter a custom size. |
| `Spalten` above the table | Select `Kompakt`, `Standard`, or `Alle` |
| `TS` | `Teilstrecke` |
| `Enter`, `Shift+Enter` | Same column in the next or previous row |
| `↑`, `↓` in the `Ø` field | Next Lindab diameter |
| `Ctrl+Z`, `Ctrl+Y` | Undo, redo |
| `Ctrl+S` | Save PDF |
| `Ctrl+O` | Open |
