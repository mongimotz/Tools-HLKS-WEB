# Handoff – Prinzipschema editor

Updated: 2026-11-22. Everything is on `main` (deployed to https://hlks.org/schema/ by the Pages workflow on every push).
Background: `AGENTS.md` (how to work), `DECISIONS.md` (why), `PROGRESS.md` (what) in this folder.

## Owner to-dos

1. **Check the ventilation and MSR symbols** against your sample sheet (example «Symbolübersicht», A1). Deliberate differences: cooler always «\\», MSR symbols about 1.6 × the sheet's size, filter text default «F7», WRG plate 25 × 25 mm and rotor 15 × 40 mm (rows 20 mm apart). Say which to change.
2. **Try the new editing** in a real schema: Ausführung (Properties or key V), set into a line by dragging, delete inside a line (the line stays), drag into a «Monoblock» frame (joins the group), tabs, own component («Eigene Bauteile» +), Ctrl+C / Ctrl+V between tabs, sheet format in the toolbar.
3. **Chrome check (cannot be automated):** open a `.schema` file and save it with the native pickers; restart Chrome and use «Wieder öffnen»; confirm «Beide als Kopie» in the conflict dialog. New: live sync with several tabs open (only the active tab is watched; a tab checks its file again when activated).
4. **Assistant with a real key:** never called against OpenRouter. In the editor: tab «Assistent» → key → a task. Or `OPENROUTER_API_KEY=… npx vitest run tests/unit/assistant.test.ts`.

## Open points

- Rooms have no membership in the file: what lies inside a room belongs to it by position only (moving the room moves it along). Groups («Monoblock») have members; moving a member out of its frame makes the frame grow (leave the group in Properties «Gruppe»).
- Symbol editor is basic: line, rectangle, circle, text, text field, ports, move, delete, SVG code. No variants for own symbols, no resize handles.
- Own hydraulic drawings (not in EN 1861 / EN 806-1): boiler, heat pump, chiller, consumer, radiator, balancing valve, strainer, water heater, expansion vessel, tap, motor valve, network connection. Heating and sanitary symbols were not reworked after the ventilation sample.
- IEC 81346 reference designations: not done; component IDs serve for now.
- Assistant prompt rules are untested with a real model.
- Automatic row wrapping on overfull sheets is not built (layout suggests a bigger sheet).
- Root `npm test`: 3 local failures come from an untracked `tools/.DS_Store`; delete that file.

## Working rules (owner)

Lean: coarse plans, build without asking, minimal tests (existing suite + a look at the output), no go-ahead question between pieces of work. Commit `schema: <what>` + `Co-Authored-By` trailer and push directly to `main` (owner, 2026-11-22: no pull requests, no feature branch).
