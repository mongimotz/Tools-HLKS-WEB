# Design guidelines

Applies to every page and to the PDF reports. Tools may differ in layout where it helps the task, but colours, type and sizes come from `assets/css/tokens.css`. Never hard-code a colour or font in a tool stylesheet; add a token instead (`tests/theme.test.js` checks this).

## Changing the look

| What | Where | Reaches |
|---|---|---|
| Colours (light and dark) | `assets/css/tokens.css` | all pages, charts (CSS classes), PDF reports (light column, read at runtime by `lib/core/pdf.js`) |
| Favicon colours | `assets/favicon.svg` | a copy of `--primary` / `--on-primary`; `npm test` fails if it drifts |
| Font family | replace the two variable fonts in `assets/fonts/source/`, set their names at the top of `scripts/build-fonts.py`, run it | web (`sans.woff2`, `mono.woff2`) and PDF (`pdf/*.ttf`); file names stay generic, so no CSS or JS change. The family names `HLKS Sans` / `HLKS Mono` in `tokens.css` are internal aliases |
| Type scale, spacing, radius | `assets/css/tokens.css` (`--fs-*`, `--sp-*`, `--r-*`, `--stretch-brand`) | all pages |
| PDF type sizes | point sizes in `lib/core/pdf.js` (components) and the tool's `report.js` | that report |

The brand mark is inline SVG in each page header and uses `currentColor`, so it follows the tokens.

## Principles (set by the owner, these win over everything below)

1. Keep the amount of purely aesthetic elements minimal.
2. Never explain decisions or functions in the product unless it is specified. Keep the README brief. Shared behavior belongs in `AGENTS.md`, tool behavior in `tools/<tool-id>/AGENTS.md`, and formulas and limits in German method documents (e.g. `docs/duct-pressure-loss-method.md`).
3. Use symbols over words for design elements where sensible (icon buttons with `title` + `aria-label`).
4. No harsh gradients.
5. Red-green colourblind compatible wherever colour carries an important function.
6. Simplicity, speed and functionality come first. Beautifying layouts and interfaces comes second.

What these mean in practice:

| Principle | Do | Don't |
|---|---|---|
| 1 | One visual idea per page at most (start page: the discipline networks) | Decorative accents, ornaments, constant animation |
| 2 | Labels, units, values, short status messages (`TS 1: v = 6.2 m/s > 6.0 m/s`), no sub-lines that repeat what is shown elsewhere | Intro texts, hints under headings, "how to" placeholders (`z. B. …`), chart captions, explanatory toasts or tooltips, a help tab |
| 3 | Icon-only buttons for open, undo/redo, theme, add, delete, branch, duplicate, reset; `→` to jump, `↑` for "over limit" | Text buttons where a common icon exists |
| 4 | Flat fills; hard-stop patterns (hatching, dashes) are fine | Colour fades |
| 5 | Status = colour + icon or word; chart series validated for CVD (`--chart-1..3` pass, deutan ΔE ≥ 13.7) | Red vs green as the only cue |
| 6 | Undo instead of confirm dialogs; heavy code (pdf-lib, fontkit) loaded on demand; charts redrawn once per frame | Modal confirmations, blocking animations |

## Character

Technical and quiet. The start page shows the tools as one small network per discipline, in HLKS order (2 × 2 on wide screens, one column on phones). It is the only illustrative element. Tool pages are plain so the numbers stand out.

All four networks share one drawing language: a source symbol in a circle, lines in `--text-muted` (placeholder branches in `--border-strong`), the moving medium in `--primary`, valves and dampers shut while idle. The source symbols have balanced visual size within their circles. Each discipline has its own idiom:

| Discipline | Source | Network | Branch control | Terminal | Medium |
|---|---|---|---|---|---|
| Heizung | flame | Tichelmann (reverse return): supply, return collector, return to the boiler; every radiator has the same circuit length | valve (filled = shut) | radiator | water, short dashes |
| Lüftung | four-blade fan | duct with two walls, tees | damper (across = shut) | supply diffuser, air jets | air, long dashes |
| Klima | snowflake | paired refrigerant feed and return lines with 45° Y branches (refnet) | flap of the unit | wall unit, air downwards | refrigerant, dots |
| Sanitär | water drop with one reflection stroke | manifold with one line per tap (Einzelzuleitungen), bent corners | lever (flat = shut) | compact outlined tap, falling water | water, short dashes |

The geometry is built in `assets/js/home.js` (one function per discipline); styles and motion are in `assets/css/home.css`.

Each discipline initially shows three entries. Lüftung has three ready tools. The other disciplines use numbered grey placeholders with no destination. The registry generates them from a count, and the network geometry follows the number of entries.

Tools without a discipline (registry group `general`) sit below the networks as tiles: an untitled row, centred, wrapping, one tile per tool with its icon (28 px) and the name in the same style as the tool names of the networks. Tiles are still; hover and focus colour the tile border and name in `--primary`. Placeholders are grey. A single tile stands in the middle.

## Colour

**Source of truth: [`dragon-ink.md`](dragon-ink.md)** (Kanagawa Dragon based). `assets/css/tokens.css` uses exactly its token names (`--bg`, `--surface`, `--text-muted`, `--primary`, `--chart-1` …) for light and dark.

- Mostly neutrals. `--primary` is the only brand colour (actions, links, critical path, air in the ducts).
- `--accent` (gold) is currently unused. Dragon Ink allows it once per screen at most; only use it if it carries meaning.
- Editable cells sit in `--surface-sunken` wells; results are plain on `--surface`.
- Status (`--success`, `--warning`, `--danger`) always with an icon or a word. Toasts use `--surface-inverse` with the `--inverse-*` status colours.
- Charts take `--chart-1`, `--chart-2`, `--chart-3` … in this order, never skipping a slot.
- PDF reports use the light column only: `loadInk()` in `lib/core/pdf.js` reads it from `tokens.css`, so there is no second copy.
- Dark mode follows the OS; the theme button (System → Hell → Dunkel, icon shows the state) overrides it.

## Type

Only IBM Plex Sans and IBM Plex Mono (SIL OFL). Sources: `assets/fonts/source/` (variable roman TTFs from the official package).

- **IBM Plex Sans** for all text. The wordmark and tool names use its width axis (`font-stretch: var(--stretch-brand)`, 85 %).
- **IBM Plex Mono** for numbers in tables, inputs, results and the PDF (decimals line up). Mono has no Greek, so symbol labels (λ, ζ, Δp) stay in Sans.
- `python scripts/build-fonts.py` builds the subset files with generic names: variable WOFF2 for the web (`assets/fonts/sans.woff2`, `mono.woff2`), static TTF for PDF embedding (`assets/fonts/pdf/sans-400.ttf` …).
- Missing glyphs in Plex: no ▭ ◯ ▲ or superscript minus. Use words, arrows (↑ → ↓ exist) or `<sup>`.
- Sizes: `--fs-2xs` 11 (chart labels), `--fs-xs` 12, `--fs-sm` 13, `--fs-md` 15 (body), `--fs-brand` 17 (app bar wordmark), `--fs-lg` 18, `--fs-xl` 24, `--fs-2xl` 36 (key result).
- Sentence case everywhere. No all-caps labels.

## Numbers and units

- Swiss format: `6’000.5` (`fmt()` in `lib/core/format.js`). Inputs accept `6000`, `6'000`, `6’000`, `1,5` and `1.5`.
- Units sit in the column header or next to the label, never inside the input.
- Inputs are right-aligned in the number font.

## Layout and components

- 4 px spacing grid (`--sp-1` … `--sp-8`). Radius: inputs 4, buttons 6, panels 10.
- App bar on every tool page: brand (back to start), tool name, icon actions; the primary action is "PDF" ("DXF" in PDF → DXF, which saves nothing else).
- Footer on every page: one muted code icon (`</>`) linking to the source code (`mountSourceLink()`, AGPL). Nothing else in the footer.
- Calculation tools use the shared `.workspace-head`: project name on the left, notices on the right. The row stays below the app bar.
- Keep this row 32 px high through `--issue-bar-h`, including the empty notice state. Do not add separate project or notice blocks.
- The project name stays visible and editable inline. An icon button opens the remaining fields in a dropdown overlay: Projekt-Nr., Bearbeiter, Datum.
- Result strip directly below `.workspace-head`: the one number that matters, big. No sub-lines below it.
- Tables with results use fixed column widths (`table-layout: fixed`); a value that does not fit is clipped with `…` instead of moving the layout.
- Number fields with standard sizes (e.g. Lindab diameters) use the combobox in `lib/core/combo.js`: free entry, list on click, ↑ / ↓ step through the sizes, the list is never filtered.
- Reuse `mountProjectInfo()` and `createIssuePanel()` from `lib/core/project-info.js` and `lib/core/issues.js`. The root `AGENTS.md` defines their shared behavior.
- Notices show the most serious short summary with its severity icon. Selecting the summary jumps to the affected input (→).
- The count opens all notices in an overlay. Project details use an overlay too. Neither overlay changes the workspace layout.
- Put technical details in the expanded list or beside the affected result. Keep repeated indicators short.
- Keep severity colors and icons together. The empty state keeps a check icon on the left and `0 Hinweise` on the right, without repeating `Keine Hinweise` visibly. Keep its accessible label and the row height. Neutral PDF status messages remain visible. The check does not certify the calculation.
- Overlays support keyboard controls, Escape, and outside dismissal. Preserve focus when their contents change.
- PDF → DXF has no project fields. Its shared notice row stays above the preview.
- Calculation tabs below the shared header use `lib/core/calculation-tabs.js`. Keep the tab strip compact, with one key result and shared add, duplicate, and delete icons.
- Catalogue editors use a small book icon beside the tabs. Their modal window uses `lib/core/catalog-dialog.js` and keeps the workspace in place.
- PDF → DXF places independent settings above the preset selector and all preset-controlled options below it. While a named preset applies, dim its labels, values and borders together, using the existing tokens without extra selection outlines. Keep the controls editable and restore full visibility on keyboard focus. A changed value switches the preset to `Benutzerdefiniert`.
- Phone width works (16 px gutter, wide tables scroll inside their panel, never the page).

Patterns of the PDF → DXF tool (reuse them for drawing previews):

- **Preview canvas:** paper in `--surface` on `--surface-sunken`, content in its own colours, black and white content in `--text-strong` (like colour 7 in CAD). Wheel or two fingers zoom about the pointer, dragging pans, "four corners" fits the page. Interaction graphics (snap marker, measured line, selection rectangle) in `--primary` on a separate overlay canvas. A raster of the source can lie underneath at 45 % opacity (image icon toggles it).
- **Modes** are toggle buttons in the preview toolbar (`aria-pressed`, pressed = `--primary-subtle` fill): ruler = calibrate, crop corners = select an area. Esc leaves a mode. Calibration asks for the length in a strip under the toolbar (`--primary-subtle`), prefilled with the current value; Enter applies.
- **Layer list:** checkbox, colour swatch (12 px, inline `--sw`), name (ellipsis), count in the number font. Off = struck through and muted. Filters for colours and line weights are toggle chips; off = struck through and faded, never colour alone.
- **Status line** under the preview: counts before → after and time, in one fixed-height row. Long work shows a thin progress bar with × to cancel after 300 ms. Warnings use the shared notice bar. A click on `Massstab kalibrieren` starts calibration.

## Motion

Motion only answers an action: on the start page, hovering or focusing a ready tool opens its valve or damper, starts the source (fan turns, flame lights, snowflake turns, drop falls) and lets the medium run from the source to the terminal; a row flashes after jumping to it. Nothing animates on its own, nothing delays content, no scroll-triggered reveals. `prefers-reduced-motion` turns all of it off.

## Writing

German, Swiss spelling (ss, not ß). In the product: short labels and short status messages, no explanations (principle 2).

Never use the middle dot (·) as a separator in UI text or in PDFs. Use nothing at all (separate lines, own columns) or ` | `. The dot stays only as a multiplication sign (`R·L`, `1.62·10⁻⁵`). Errors name what is wrong (`PDF nicht lesbar`). User documentation (`README.md`, `docs/*-method.md`, test checklists) is German, plain and active. Agent and developer documents are English.
