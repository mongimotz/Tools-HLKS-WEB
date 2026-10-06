# Design guidelines

Applies to every page. Tools may differ in layout where it helps the task, but colours, type and sizes come from `assets/css/tokens.css`. Never hard-code a colour or font in a tool stylesheet; add a token instead.

## Character

Technical, calm, fast. The look borrows from HVAC drawings: ducts drawn as double lines, a fan symbol, diffusers. The start page is the one place for a bold visual (the duct network). Tool pages stay quiet so the numbers stand out.

## Colour

**Source of truth: [`dragon-ink.md`](../dragon-ink.md)** (Kanagawa Dragon based). `assets/css/tokens.css` uses exactly its token names (`--bg`, `--surface`, `--text-muted`, `--primary`, `--chart-1` …) for light and dark.

- Mostly neutrals. `--primary` is the only brand colour (actions, links, critical path, air in the ducts).
- `--accent` (gold) once per screen: result strip rule on tool pages, the active diffuser on the start page, the rule under the PDF title.
- Editable cells sit in `--surface-sunken` wells; results are plain on `--surface`.
- Status (`--success`, `--warning`, `--danger`) always with an icon or a word. Toasts use `--surface-inverse` with the `--inverse-*` status colours.
- Charts take `--chart-1`, `--chart-2`, `--chart-3` … in this order, never skipping a slot.
- PDF reports use the light column only (`INK` in `lib/core/pdf.js`).
- Dark mode follows the OS; the theme button (System → Hell → Dunkel) overrides it.

## Type

Only the IBM Plex fonts provided in `IBM Plex/` (SIL OFL):

- **IBM Plex Sans** for all text. The wordmark and tool names use its width axis (`font-stretch: 85%`).
- **IBM Plex Mono** for numbers in tables, inputs, results and the PDF (decimals line up). Mono has no Greek, so symbol labels (λ, ζ, Δp) stay in Sans.
- `python scripts/build-fonts.py` builds the subset files: variable WOFF2 for the web (`assets/fonts/`), static TTF for PDF embedding (`assets/fonts/pdf/`).
- Missing glyphs in Plex: no ▭ ◯ ▲ or superscript minus. Use words or `<sup>`.
- Sizes: `--fs-xs` 12, `--fs-sm` 13, `--fs-md` 15 (body), `--fs-lg` 18, `--fs-xl` 24, `--fs-2xl` 36 (key result).
- Sentence case everywhere. No all-caps labels.

## Numbers and units

- Swiss format: `6’000.5` (`fmt()` in `lib/core/format.js`). Inputs accept `6000`, `6'000`, `6’000`, `1,5` and `1.5`.
- Units sit in the column header or next to the label, never inside the input.
- Inputs are right-aligned in the number font.

## Layout and components

- 4 px spacing grid (`--sp-1` … `--sp-8`). Radius: inputs 4, buttons 6, panels 10.
- App bar on every tool page: brand (back to start), tool name, actions. Primary action = "PDF speichern".
- Shared project header (`lib/core/project-info.js`): Projekt, Projekt-Nr., Bearbeitung, Datum.
- Result strip directly under the project header: the one number that matters, big.
- Warnings are listed in a "Hinweise" block with a link to the affected row.
- Phone width works (16 px gutter, wide tables scroll inside their panel, never the page).

## Motion

Animations must never delay anything. Content is there immediately; motion only decorates (air flowing in the ducts) or confirms an action (row flash after jumping to it). No scroll-triggered reveals. `prefers-reduced-motion` turns all of it off.

## Writing

German, plain, active. Buttons say what happens ("PDF speichern", "Teilstrecke hinzufügen"). Errors say what is wrong and what to do. Swiss spelling (ss, not ß).
