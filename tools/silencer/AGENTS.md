# Schalldämpfer

This file records the tool's behavior for agents. Obey the shared rules in [../../AGENTS.md](../../AGENTS.md).
Keep interface labels in German. Keep usage instructions outside the product interface.

## Calculation reference and layout

The tool calculates octave levels from 63 to 8000 Hz, from a source to a receiver.
[../../docs/silencer-method.md](../../docs/silencer-method.md) defines formulas, manufacturer data, assumptions, limits, targets, and variant selection.
Read it before you change calculations. [../../docs/silencer-data.md](../../docs/silencer-data.md) records the data sources and dates.
[../../docs/silencer-plan.md](../../docs/silencer-plan.md) records implementation status and open work.

The left panel is a level list like an Excel table. It has one row for each source, attenuation, silencer, and branch.
The right panel sizes the selected silencer from manufacturer data: insertion loss, pressure loss, and flow noise.

## Paths, rows, and receiver

- A `Weg` runs from a source to a receiver, such as `Zuluft Büro`. Its name is edited in its tab (fallback `Weg N`); its starting flow `V̇` appears above the list.
- Multiple paths use the shared calculation tabs from `lib/core/calculation-tabs.js`. Each tab shows the receiver's `L_pA`, with a severity icon and color if it exceeds the target. Arrow keys, Home, and End select tabs.
- `+` adds a path. The copy icon duplicates it. Trash deletes it.
- Buttons below the list append rows of the types below.
- The receiver appears below the list. Its fields are distance `r`, directivity `Q`, and room data.
- Room data is absorption area `A`, or volume `V` with reverberation time `T`. Without room data, the receiver uses free field outdoors.
- Interior targets use a room type: SIA 2024 use, SIA 181 requirement, or recommended design value.
- Exterior targets use LSV sensitivity class with day and night periods. A manually entered target value is also available.

| Row | Input and effect |
| --- | --- |
| `Quelle` (`+`) | Octave sound power `L_W`, such as a fan or VAV. The preceding level and source add energetically. |
| `Dämpfung` (`−`) | Octave attenuation `D`, such as a bend or terminal reflection |
| `Schalldämpfer` (`−`) | Insertion loss `D_e`. Its flow noise appears below it as a `+` row. |
| `Abzweig` (`−`) | Flow after the branch. Sound power divides by the flow ratio. An entered `ΔL` overrides the calculated loss. |

After a branch, downstream silencers use the new flow. Section 3 of the method document defines `ΔL = 10 · lg(V̇_before / V̇_after)`.

## dB and dB(A)

- Each level row has a `dB` or `dB(A)` button in the unit column.
- A click changes the unit's meaning but keeps the entered numbers unchanged.
- A `dB` row has an A-weighting row beneath it. Its first correction is −26.2 dB, and its last is −1.1 dB.
- A `dB(A)` row is blue and has no A-weighting row.
- Attenuations, `D_e`, and `ΔL` are differences. They have no unit button and apply equally to dB and dB(A).
- The sum and receiver always use dB(A). The `Σ` column shows each row's A-weighted total.

Section 1 of the method document gives all eight A-weighting corrections and the level equations.

## Silencer design panel

A click in a silencer row selects it in the right panel.

| `Typ` | Available series |
| --- | --- |
| Rectangular splitter silencer | Trox XK and MK, Schako MWK-OB, MWK-MB, MWK-LL and MWK-LB; marked Prod. RIO and Prod. Schmidlin estimates |
| Circular silencer | Trox CA and CK, Schako RS-N and RS-M, Lindab SLU |
| `Hand` | Manual values for products outside the database |

Trox RK is intentionally omitted (owner decision, 2026-10-14): its source publishes only 63–250 Hz, not a complete eight-band spectrum.

For `Kulisse`, the user enters the casing's internal dimensions `B × H` in mm.
The installation modes are `Kanal`, `Ansaugung frei`, and `Ausblasen frei`.
The front view shows the casing with its correct aspect ratio and its splitters.
Splitter thickness `d` and length `L` use available data values. Gap `s` is freely editable with standard choices from the shared combobox. Interpolate actual gaps only inside the supported range at exact d and L. Outside that range show an error, use conservative zero attenuation and no pressure result, and reject the geometry as a fitting variant.

The splitter count `n` comes from the casing width: `n = B / (d + s)`, rounded.
The splitters have equal spacing, with actual gap `s′ = B / n − d`.
A notice states the difference if `s′` differs from the selected gap `s`. Attenuation and pressure use interpolated data for `s′`. Saved row copies use that actual gap, while `rect.s` retains the entered reference spacing.
Section 4.2 of the method document defines minimum count, wall gaps, pressure models, and warning thresholds.

For `Rohr`, the user selects diameter, insulation thickness, core width where available, and length.
For `Hand`, the user enters `D_e` and flow noise in the level list, and `Δp` in the right panel.
Section 4 of the method document defines the pressure and flow-noise models and their assumptions.

## Variants

Owner decision, 2026-10-14: one form instead of the modes `Frei` and `Maximalmasse`, a `Fix` toggle beside `B` and `H`, no explicit search button and no progress display, variants restricted and ordered by attenuation.

- The variants keep the selected series and length `L`. Circular variants use the length nearest to the selected one. The length stays a choice between the data lengths and is not searched.
- `B` and `H` each have a `Fix` toggle, stored as `design: { fixB, fixH, maxB, maxH }` (default: both fixed). A fixed side edits `rect.B` or `rect.H`, and the variants keep it. A free side edits `maxB` or `maxH` and is labelled `B max.` or `H max.`. Setting a side free copies its current size as the maximum. The front view shows the size of the silencer itself.
- A free side is searched in 50 mm steps (`SIZE_STEP`) from 100 mm (`SIZE_MIN`) up to its maximum. Per group, the variant uses the smallest housing B × H that meets every condition. If none does, it uses the housing with the lowest receiver `L_pA` within the limits; `L_pA` within 0.05 dB counts as equal, then the smaller housing wins.
- Groups: with `B` fixed, one variant per splitter thickness `d` and splitter count `n`; with `B` free, one per `d`. Circular: one per insulation thickness and core width at the same diameter.
- The actual gap `s′ = B / n − d` must lie within the data range at `d` and `L` (bounded interpolation). Taking a variant stores `s′`, rounded to 0.1 mm, as `rect.s`.
- The conditions are `v ≤ 12 m/s`, `Δp ≤ 100 Pa`, flow noise at least 10 dB below the attenuated level, no calculation error in the path, and receiver target compliance (if the receiver has a target).
- Order: variants within the limits first, then the lowest `L_pA` (best attenuation), then the lowest `Δp`. Gray variants fail at least one condition.
- The list updates with every input (the search takes milliseconds). A click on a variant row applies it.
- Products are grouped by supplier. RIO and Schmidlin remain explicitly marked as estimates in UI and exports. Only open Trox XK and Schako MWK-OB support their estimates; never use MK/RK/MB/LL/LB. The full estimation rule is in the method and rectangular audit.
- Trox pressure data refer to H = 1000 mm, not its attenuation. No numerical height correction or error bound is established. Schako H < 200 mm uses another frame and gets a notice.
- Schako noise source spectra and their printed totals are retained in stored row profiles. Graph shapes, interpolation laws, extensions and fallback estimates remain documented assumptions. Show `geschätzt` for model values outside source coverage.

Section 7 of the method document defines the search, the selection within a group, the ordering, and selection with multiple silencers.

## Row editing and notices

- The six-dot handle changes row order through dragging. A silencer moves together with its flow-noise row. `Esc` cancels dragging.
- Pasting eight octave values from an Excel row into the first octave field distributes them across all octave fields.
- Use the shared `.workspace-head` from the root `AGENTS.md`: project name left, notices right.
- Notices identify limits that a row does not meet, such as excessive flow noise. Selecting a notice jumps to its row or receiver, including on another path. Exact receiver target values appear at the receiver. The status overview uses a short summary.
- File compatibility and manufacturer-data notices use the same panel. Each file notice can be dismissed; the manufacturer-data notice keeps its update action.
- A red line at the row's left indicates an error. An orange line indicates a warning.
- Trash deletes a row. The deletion notification includes an undo icon.

## Manufacturer data in saved files

Each saved file contains a copy of the manufacturer table rows that it uses.
A saved file keeps its data values when the database changes. This is separate from support for earlier input schemas during beta.
After import, a notice identifies silencers whose manufacturer data changed. The notice's `↺` icon applies the current data.
Obey the root beta policy for schema compatibility.

## Symbols and keyboard controls

Shared file and history controls obey [../../AGENTS.md](../../AGENTS.md).

| Symbol or key | Behavior |
| --- | --- |
| Six dots | Drag a row |
| `dB`, `dB(A)` | Change the row's unit |
| Trash | Delete a row. The notification includes undo. |
| `+`, copy, trash beside tabs | Add, duplicate, or delete a path |
| `↺` in the import notice | Apply current manufacturer data |
| `Enter`, `Shift+Enter` | Same octave in the next or previous row |
| `Ctrl+Z`, `Ctrl+Y` | Undo, redo |
| `Ctrl+S` | Save PDF |
| `Ctrl+O` | Open |
