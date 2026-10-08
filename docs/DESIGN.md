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
2. Never explain decisions or functions in the product unless it is specified. Explanations go into documentation: `README.md` (user guide, German) and `docs/*.md` (e.g. `docs/duct-pressure-loss-method.md`).
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

All four networks share one drawing language: a source symbol in a circle, lines in `--text-muted` (planned branches in `--border-strong`), the moving medium in `--primary`, valves and dampers shut while idle. Each discipline has its own idiom:

| Discipline | Source | Network | Branch control | Terminal | Medium |
|---|---|---|---|---|---|
| Heizung | flame | Tichelmann (reverse return): supply, return collector, return to the boiler; every radiator has the same circuit length | valve (filled = shut) | radiator | water, short dashes |
| Lüftung | four-blade fan | duct with two walls, tees | damper (across = shut) | supply diffuser, air jets | air, long dashes |
| Klima | snowflake | refrigerant line with 45° Y branches (refnet) | flap of the unit | wall unit, air downwards | refrigerant, dots |
| Sanitär | tap with drop | manifold with one line per tap (Einzelzuleitungen), bent corners | lever (flat = shut) | wall tap, falling water | water, short dashes |

The geometry is built in `assets/js/home.js` (one function per discipline); styles and motion are in `assets/css/home.css`.

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
- App bar on every tool page: brand (back to start), tool name, icon actions; the primary action is "PDF".
- Shared project header (`lib/core/project-info.js`): Projekt, Projekt-Nr., Bearbeiter, Datum.
- Result strip directly under the project header: the one number that matters, big. No sub-lines under it.
- Tables with results use fixed column widths (`table-layout: fixed`); a value that does not fit is clipped with `…` instead of moving the layout.
- Number fields with standard sizes (e.g. Lindab diameters) use the combobox in `lib/core/combo.js`: free entry, list on click, ↑ / ↓ step through the sizes, the list is never filtered.
- Warnings are listed under "Hinweise"; a row with a section jumps to it (→).
- Phone width works (16 px gutter, wide tables scroll inside their panel, never the page).

## Motion

Motion only answers an action: on the start page, hovering or focusing a ready tool opens its valve or damper, starts the source (fan turns, flame lights, snowflake turns, drop falls) and lets the medium run from the source to the terminal; a row flashes after jumping to it. Nothing animates on its own, nothing delays content, no scroll-triggered reveals. `prefers-reduced-motion` turns all of it off.

## Writing

German, Swiss spelling (ss, not ß). In the product: short labels and short status messages, no explanations (principle 2).

Never use the middle dot (·) as a separator in UI text or in PDFs. Use nothing at all (separate lines, own columns) or ` | `. The dot stays only as a multiplication sign (`R·L`, `1.62·10⁻⁵`). Errors name what is wrong (`PDF nicht lesbar`). User documentation (`README.md`, `docs/*.md`) is German, plain and active.
