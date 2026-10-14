# Kanalrechner

This file records the tool's behavior for agents. Obey the shared rules in [../../AGENTS.md](../../AGENTS.md).
Keep interface labels in German. Keep usage instructions outside the product interface.

## Calculation reference and layout

The tool sizes or checks circular, rectangular, and flat oval ventilation ducts.
[../../docs/duct-sizing-method.md](../../docs/duct-sizing-method.md) defines SIA 382/1:2025 tables 49 and 50, formulas, rounding, assumptions, and limits.
Read it before you change calculations. Section 4 defines equivalent electrical full-load hours. Section 6 defines modes, size series, and drag increments.
The input panel is at the left. The drawing and result are in the center. Pinned results are at the right.

## Independent calculations

- The project contains `calculations: [{ id, system, current, positions }]`, shared `catalogs`, and shared pressure-gradient `settings`.
- Use the shared calculation tab strip below `.workspace-head`. The tab name comes from the current input's `Bezeichnung`, with `Berechnung N` as the fallback.
- Add starts an independent default calculation. Duplicate copies all its inputs, operating stages, and pins. Delete keeps at least one calculation and offers undo.
- Selection is UI state. Switching tabs must not change the saved inputs.
- `calculationInputs(inputs, id)` provides a writable single-calculation view with references to the shared catalogues and settings. `compute()` retains its single-calculation contract.
- `computeProject()` and `snapshotProjectOf()` cover every calculation. Recalculate all results for exports and imported snapshots.
- The shared notice area covers every calculation. A jump selects its calculation and focuses its input, pin, or catalogue field. Do not change inputs merely to navigate to a pin.

## Inputs

- `Luftmenge` contains a free description and the design flow. The description appears in pins and the PDF.
- The flow slider spans 10 to 100'000 m³/h on a logarithmic scale and selects rounded values.
- `↑` and `↓` in the flow field use two significant digits. With `Shift`, they use one significant digit.
- For example, an upward step changes `5'800` to `5'900`. With `Shift`, the example becomes `7'000`.
- Simple mode uses only table 49's 2'000 h/a column, without a reduction factor.
- Outside simple mode, the user enters electrical full-load hours. A click shows 2'000, 4'000, and 8'000 h/a. Direct entry permits intermediate values.
- The expandable `Betriebsstufen` panel contains flow percentages relative to the design flow and durations in h/a.
- The exponent `n` defaults to 2.5, or 1.5 for systems with flow controllers. The `↑` button shows and copies the result to the full-load-hours field.
- `Querschnitt` selects `Rund`, `Eckig`, or `Oval`, and one of the modes below.
- `Raster` rounds rectangular sides and oval widths upward in increments from 1 to 100 mm.
- In `Prüfen`, the grid controls drag and arrow-key increments.

| Shape | Mode | Behavior |
| --- | --- | --- |
| `Rund` | `Auslegen` | Select the diameter |
| `Rund` | `Prüfen` | Check an entered diameter `Ø` |
| `Eckig`, `Oval` | `Verhältnis` | Calculate `B` and `H` for the selected aspect ratio |
| `Eckig`, `Oval` | `Höhe` | Calculate `B` for an entered `H`, such as a ceiling height limit |
| `Eckig`, `Oval` | `Prüfen` | Check entered `B` and `H` |

A click on `Ø` shows the standard size series. `↑` and `↓` select the next diameter.
Oval `H` uses the same controls for standard heights. `B` and rectangular `H` use one grid increment per arrow step.
If a newly selected mode has an empty field, that field receives the last calculated dimension.
If a new shape lacks dimensions, the tool calculates them with `Auslegen` or `Verhältnis`.

## Drawing interactions

- Circles on the cross-section are drag handles.
- For a circular duct, the handle at the lower right of the perimeter changes `Ø` along the standard series.
- For rectangular and oval ducts, the right handle changes `B`. The bottom handle changes `H`.
- The diagonal handle beside the lower-right corner changes both dimensions.
- The width appears above the drawing. The height appears at the left, clear of the handles.
- `B` and rectangular `H` use the grid. Oval `H` uses standard heights.
- Dragging switches the mode to `Prüfen`. Velocity and utilization update while the edge stays beneath the pointer.
- `Tab` selects a handle. Arrow keys change its dimension by one increment.
- Dimensions appear in mm. The drawing is not to scale: its size grows with the square root of the duct size.
- A diameter of 80 mm remains visible, and 2'000 mm fills the drawing area. The aspect ratio remains correct.

The exact drawing scale and rounding behavior are in section 6 of the method document.

## Results and warnings

Use the shared `.workspace-head` from the root `AGENTS.md`: project name left, notices right.
A notice opens the appropriate tab and focuses the affected input or catalogue field. Imported version and result changes use the same row and can be dismissed there.
A velocity warning includes the necessary size.
Other messages cover aspect ratios below 1/5 and dimensions above the standard series.

| Label | Meaning or display rule |
| --- | --- |
| `Abmessung` | Standard size |
| `v` | Velocity and utilization `v / v_max` |
| Check mark for `v` | Utilization up to 92 % |
| Warning symbol for `v` | Utilization above 92 % |
| Error symbol and red `v` | Velocity above the limit |
| `v_max` | Table 49 limit, multiplied by `f` for rectangular and oval ducts |
| `f_va,du` | Table 50 factor for the actual aspect ratio. Rectangular and oval only, outside simple mode. |
| `R` | Pressure gradient of a straight section in Pa/m |
| `erforderlich` | Dimension before rounding |

## Pins and exports

- The pin beside the dimension stores the result. Pins appear at the right with numbers.
- A line at the left of a pin marks the current input.
- A click on a pin loads its input. `×` removes one pin. Trash removes all pins.
- The deletion notification includes an undo icon.
- Pins belong to one calculation and are part of the saved file. The PDF and CSV contain every calculation and every pin.
- If the current input is not pinned, the PDF and CSV also contain it.
- Each calculation starts a named PDF section on a new page. The CSV includes the calculation name in its own column.

## Catalogs

The catalogue icon beside the calculation tabs opens a modal window with tables 49 and 50, circular standard sizes, flat oval standard heights, roughness, and air temperature for `R`.
The catalogues and pressure-gradient settings apply to every calculation in the project.
List entries use spaces as separators. `↺` restores a catalog's standard values. Every saved file includes its catalogs.

## Symbols and keyboard controls

Shared file and history controls obey [../../AGENTS.md](../../AGENTS.md).

| Symbol or key | Behavior |
| --- | --- |
| Circle on the cross-section | Drag handle for dimensions |
| Pin | Pin the result |
| `×`, trash | Remove one pin or all pins |
| `+` beside operating stages | Add a stage |
| `↑` beside operating stages | Copy the result to electrical full-load hours |
| `↺` | Restore a catalog's standard values |
| `↑` after `v` in a pin | Velocity exceeds its limit |
| `Ctrl+Z`, `Ctrl+Y` | Undo, redo |
| `Ctrl+S` | Save PDF |
| `Ctrl+O` | Open |
