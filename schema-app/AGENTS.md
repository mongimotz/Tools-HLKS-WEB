# AGENTS.md – Prinzipschema editor (`schema-app/`, served at `/schema/`)

Short guide for AI agents that edit `.schema` files or this app. User-facing text is German (Swiss spelling, no ß); code and these docs are English.

## Working on a `.schema` file

1. Prefer the CLI over hand edits: `npm run cli -- ops plan.schema ops.json` (atomic, validated, laid out).
2. After every change run `npm run cli -- validate plan.schema` and `npm run cli -- render plan.schema -o out.png`, then **look at the PNG**. Zoom into details with `--crop x,y,w,h` (mm) and `--dpi 300`.
3. Never change positions of components with `"pinned": true` (`move` needs `"force": true`; use it only when asked).
4. Live sync: when the file is open in the editor (Chrome/Edge), the editor checks it every second and reloads it (one undo step). Write the whole file at once (the CLI does); a half-written file is skipped and retried. If the user has unsaved edits, the editor asks which version to keep.
5. Notes: `npm run cli -- notes plan.schema --open` → make the change → `npm run cli -- resolve plan.schema <noteId> "Antwort"`.
   The user sets notes in the editor (tool «Anmerkung», key `N`) on a component, a line or a free spot; the editor saves them into the file. After `resolve` the editor shows the note as done after the next live-sync reload. Notes of a removed component or line stay as free notes (`anchor.pos`) at the old spot; remove a note itself with `{"op":"remove","id":"N01"}`.

All CLI commands: `validate`, `render`, `ops`, `notes`, `resolve`, `new --template empty|ahu-basic`. Run them from `schema-app/` (`npm ci` once).

## File format (version 1)

JSON, 2-space indent, stable key order (one component per line). Coordinates are **mm on the sheet**, origin top left, on the grid (`sheet.grid`, default 2.5).

| Key | Content |
|---|---|
| `format`, `version` | `"hlks-schema"`, `1` |
| `meta` | `title`, `project`, `author`, `date`, `revision` (title block) |
| `sheet` | `size` A4/A3/A2/A1, `orientation`, `grid`, `titleBlock`, `legend` |
| `components[]` | `id`, `type` (symbol id), `label`, `props` (strings), `pos` (symbol **centre**, `null` = place automatically), `rot` 0/90/180/270 (clockwise), `flip` (mirror left/right), `pinned` |
| `connections[]` | `id`, `from` `[componentId, portId]`, `to`, `medium`, `waypoints` (corner points; empty = automatic route), `pinned`. **from → to is the flow direction.** |
| `groups[]` | `id`, `label`, `members`, `frame` (dash-dot frame, e.g. "Monoblock") |
| `texts[]` | `id`, `pos` (top left), `text`, `size` (mm) |
| `notes[]` | `id`, `anchor` `{component}` / `{connection}` / `{pos}`, `text`, `status` open/done, `created`, `reply` |

Branches always go through a `junction` component (ports `n`, `e`, `s`, `w`). A port takes one connection.

Media: `air.outdoor` AUL, `air.supply` ZUL, `air.extract` ABL, `air.exhaust` FOL, `air.recirc` UML, `air.mixed` MIL, `air.transfer` ÜBL, `water.hrc` KVS, `signal` (Wirklinie).

Symbols: `examples/symbol-catalog.schema` shows all of them; definitions in `src/symbols/<category>/*.json` (ports, props, prefix for new IDs). WRG symbols (`air.hrc.plate`, `air.hrc.rotor`) have two sides: ports `a.in`/`a.out` (supply, bottom) and `b.in`/`b.out` (extract, top).

## Operations (CLI `ops` and assistant)

A list (or `{ "ops": [...] }`); the first invalid op aborts everything. Ports may be `"ID.port"` or `["ID", "port"]`.

| op | fields |
|---|---|
| `add_component` | `type`, `id?`, `label?`, `props?`, `pos?` (given pos ⇒ pinned), `rot?`, `flip?` |
| `remove` | `id` (component with its connections, connection, group, text or note) |
| `connect` / `disconnect` | `from`, `to`, `medium`, `id?` / `id` |
| `insert_into_connection` | `connection`, new `type` (+ `id?`, `props?`) or existing `id`, `in`/`out` ports (default in/out) |
| `set_props` (`replace?`), `set_label`, `set_medium` | `id` + value |
| `move` | `id`, `pos`, `force?` |
| `add_chain` | `strand` supply/extract, `items` (`{type, id?, props?, then?}` or existing `"WRG01.a"`), `after?` (port to start from). Supply: AUL → ZUL, left → right, ZUL from the first treatment (WRG, heater, cooler, fan). Extract: ABL → FOL, right → left above, FOL after the WRG (else after the fan). `then` sets the medium of the line leaving an item. Sensors (`control.sensor.*`) in a chain sit on the duct after the previous item. |
| `group` | `label`, `members`, `id?`, `frame?` |
| `add_note`, `resolve_note` | `anchor`, `text` / `id`, `reply?` |
| `set_meta` | `title?`, `project?`, `author?`, `date?`, `revision?`, `size?`, `orientation?` |
| `relayout_unpinned` | `all?` (also pinned) |

Example: `[{"op":"add_chain","strand":"supply","items":[{"type":"air.intake"},{"type":"air.filter","props":{"Klasse":"ePM1 55%"}},{"type":"air.fan"}]}]`

## In-browser assistant

The editor's assistant (OpenRouter, user's own key) uses the same operations through one tool `apply_operations` (`{ "ops": [...] }`). Its system prompt (`src/assistant/prompt.ts`) holds the symbols, media, layout rules and the schema in compact form. When you add an op or a symbol, the tool schema and prompt follow automatically; keep the rules in `prompt.ts` in line with this file.

## Developing the app

- Stack: TypeScript strict, Vite, React 18, Zustand + Immer, zod, own SVG canvas. Decisions with reasons: `DECISIONS.md`. Status: `PROGRESS.md`.
- `src/render/` is pure (no DOM): the editor, the CLI and the exports draw with the same code.
- `npm test` (Vitest: model, ops, layout, symbols, examples, PNG references in `tests/visual/`), `npm run test:e2e` (Playwright), `npm run lint`, `npm run build`.
- PNG references change only deliberately: `UPDATE_VISUAL=1 npx vitest run tests/unit/visual.test.ts`, and say so in the commit message.
- Examples are generated: `npx tsx scripts/make-examples.ts`, `npx tsx scripts/make-catalog.ts`. New symbols: add the JSON, run `npm run symbols`.
- Symbols: drawn from scratch in SVG following the norm descriptions; size multiple of 5 mm, ports on the 2.5 mm grid and on the box edge, no stroke widths or colours (`currentColor` only). Norm PDFs live only in `_local/normen/` (git-ignored). Never copy norm graphics or text into the repo.
- No company data (logos, title blocks, example schemas) in the repo.
