# Handoff – Prinzipschema editor

Updated: 2026-11-22. Plan phases 0–8 merged (PR 1). Owner feedback of 2026-11-22 built on branch `schema-editor`.
PR: https://github.com/mongimotz/Tools-HLKS-WEB/pull/1 (open; the owner merges, not the agent).
Background: `AGENTS.md` (how to work), `DECISIONS.md` (why), `PROGRESS.md` (what) in this folder.

## Owner to-dos

1. **PR 1 is merged.** Pushes to `schema-editor` need a new PR to reach hlks.org.
2. **Chrome check (cannot be automated):** open a `.schema` file and save it with the native pickers; restart Chrome and use «Wieder öffnen»; confirm the «Beide als Kopie» behaviour in the conflict dialog (DECISIONS.md, "Live sync details").
3. **Assistant with a real key:** never called against OpenRouter (no key here). In the editor: tab «Assistent» → key → a task. Or `OPENROUTER_API_KEY=… npx vitest run tests/unit/assistant.test.ts` (optional `OPENROUTER_MODEL`, default `anthropic/claude-sonnet-5.5`).
4. **Look at the new examples:** «Heizgruppe mit Beimischung», «Kältekreis», «Trinkwasser mit Wassererwärmer», and the symbol catalogue (now A2).

5. **Check the new ventilation and MSR symbols** against your sample (symbol catalogue example, A1). Deliberate differences: WRG 40 mm high (rows 20 mm apart), cooler always «\\», MSR symbols larger than on the sheet, filter text default «F7». Say which to change.

## Open points

- IEC 81346 reference designations: not done (optional in the plan); component IDs serve for now.
- Own symbol drawings (marked «*», not in EN 1861 / EN 806-1): boiler, heat pump, chiller, consumer, radiator, balancing valve, strainer, water heater, expansion vessel, tap, motor valve, network connection. Owner may want different shapes.
- Assistant prompt rules (German, `src/assistant/prompt.ts`) are untested with a real model. A run that ends after 3 rounds with errors still shows a preview if earlier rounds changed something.
- Lighthouse not run; help is the shortcut dialog (`?`) only.
- Automatic row wrapping on overfull sheets is not built (layout suggests a bigger sheet instead).
- Root `npm test`: 3 local failures come from an untracked `tools/.DS_Store` (also on `main`); delete that file.
- Local only: `.claude/launch.json` has an extra config `schema-editor-alt` (port 5182) for a second dev server; commit or drop it.

## Working rules (owner, 2026-11-18)

Lean: coarse plans, build without asking, minimal tests (existing suite + a look at the output), no go-ahead question between pieces of work. Commit `schema: <what>` + `Co-Authored-By` trailer, push to `schema-editor`.
