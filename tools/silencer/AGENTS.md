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

- A `Weg` runs from a source to a receiver, such as `Zuluft Büro`. Its description and starting flow `V̇` appear above the list.
- Multiple paths appear as adjacent tabs. Each tab shows the receiver's `L_pA` in red if it exceeds the target.
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
| Rectangular splitter silencer | Trox XK and MK, Schako MWK-OB and MWK-MB |
| Circular silencer | Trox CA and CK, Schako RS-N and RS-M, Lindab SLU |
| `Hand` | Manual values for products outside the database |

For `Kulisse`, the user enters the casing's internal dimensions `B × H` in mm.
The installation modes are `Kanal`, `Ansaugung frei`, and `Ausblasen frei`.
The front view shows the casing with its correct aspect ratio and its splitters.
Splitter thickness `d`, gap `s`, and length `L` have only values from manufacturer tables.

The splitter count `n` comes from the casing width: `n = B / (d + s)`, rounded.
The splitters have equal spacing, with actual gap `s′ = B / n − d`.
A notice states the difference if `s′` differs from the selected gap `s`.
Section 4.2 of the method document defines minimum count, wall gaps, pressure models, and warning thresholds.

For `Rohr`, the user selects diameter, insulation thickness, core width where available, and length.
For `Hand`, the user enters `D_e` and flow noise in the level list, and `Δp` in the right panel.
Section 4 of the method document defines the pressure and flow-noise models and their assumptions.

## Variants

- The list below the design values shows variants for the selected casing or circular diameter.
- A splitter variant has a thickness and gap that fit the casing. Its actual gap differs from the table gap by at most 20 %.
- A circular variant has an insulation thickness and core width.
- Each variant shows the shortest length that meets the target and limits.
- If no length meets the target, the variant uses the length with the lowest receiver `L_pA` within its limits.
- Variants that meet every condition appear first, sorted by pressure loss. Gray variants fail at least one condition.
- The conditions are `v ≤ 12 m/s`, `Δp ≤ 100 Pa`, flow noise at least 10 dB below the attenuated level, and receiver target compliance.
- A click on a variant row applies it.

Section 7 of the method document defines duplicate-gap handling, length selection, full ordering, and selection with multiple silencers.

## Row editing and notices

- The six-dot handle changes row order through dragging. A silencer moves together with its flow-noise row. `Esc` cancels dragging.
- Pasting eight octave values from an Excel row into the first octave field distributes them across all octave fields.
- Notices identify limits that a row does not meet, such as excessive flow noise. The notice arrow jumps to that row.
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
