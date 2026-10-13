# Druckverlust Lüftung

This file records the tool's behavior for agents. Obey the shared rules in [../../AGENTS.md](../../AGENTS.md).
Keep interface labels in German. Keep usage instructions outside the product interface.

## Calculation reference

[../../docs/duct-pressure-loss-method.md](../../docs/duct-pressure-loss-method.md) defines formulas, assumptions, limits, catalogs, and dimension proposals.
Read it before you change the calculation. Sections 4 and 6 define flow direction, the critical path, balancing pressure, and the safety allowance.
Section 8 defines the Lindab size series and rectangular dimension proposals.

## Inputs and network editing

- The system inputs are flow direction, elevation, air temperature, humidity, available fan pressure, and the safety allowance.
- Users enter sections away from the fan. Each section has a predecessor toward the fan. `Venti` means that the section starts at the fan.
- The branch icon adds a section whose predecessor is the current row. Its number uses the parent number plus `.1`, `.2`, and so on.
- For example, a branch from section `2` becomes `2.1`. The number controls indentation: `2.1` has one level, `2.1.1` has two.
- The arrow at the left opens section details: fittings, components, a separate temperature, a remark, dimension proposals, and intermediate values.
- A different predecessor moves the row below that predecessor and its branches. The user changes the section number separately.
- The six-dot handle changes row order through dragging. It does not change the predecessor. `Esc` cancels dragging.
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
- The `Spalten` menu above the table selects a result set. The browser stores this selection.
- Columns have fixed widths. A value that does not fit ends with `…`. A very small diameter can cause this overflow.

| Column set | Results |
| --- | --- |
| `Kompakt` | `v`, `Δp TS`, `Δp kum.`, `Drossel` |
| `Standard` | Compact results plus `d_h`, `R`, `Δp R·L`, `Δp Z` |
| `Alle` | Standard results plus `p_d`, `Re`, `λ` |

## Catalogs

The catalogs contain materials, fittings, component templates, velocity limits, and the maximum aspect ratio.
Each saved file includes its catalogs. A catalog edit applies only to that calculation.
Values are guidelines. Manufacturer data takes precedence.
`↺` restores a catalog's standard values.

## Symbols and keyboard controls

Shared file, theme, and history controls obey [../../AGENTS.md](../../AGENTS.md).
The section controls have these meanings:

| Symbol or key | Behavior |
| --- | --- |
| `↶`, `↷` | Undo, redo |
| Folder | Open |
| `↓ PDF` | Save PDF |
| `⋯` | More actions |
| Half-circle, sun, moon | System, light, dark theme |
| Six dots | Drag a row |
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
