# Design guidelines

Applies to every page and to the PDF reports. Tools may differ in layout where it helps the task, but colours, type and sizes come from `assets/css/tokens.css`. Never hard-code a colour or font in a tool stylesheet; add a token instead.

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
| 1 | One visual idea per page at most (start page: the duct network) | Decorative accents, ornaments, constant animation |
| 2 | Labels, units, values, short status messages (`TS 1: v = 6.2 m/s > 6.0 m/s`) | Intro texts, hints under headings, "how to" placeholders (`z. B. …`), chart captions, explanatory toasts or tooltips, a help tab |
| 3 | Icon-only buttons for open, undo/redo, theme, add, delete, branch, duplicate, reset; `→` to jump, `↑` for "over limit" | Text buttons where a common icon exists |
| 4 | Flat fills; hard-stop patterns (hatching, dashes) are fine | Colour fades |
| 5 | Status = colour + icon or word; chart series validated for CVD (`--chart-1..3` pass, deutan ΔE ≥ 13.7) | Red vs green as the only cue |
| 6 | Undo instead of confirm dialogs; heavy code (pdf-lib, fontkit) loaded on demand; charts redrawn once per frame | Modal confirmations, blocking animations |

## Character

Technical and quiet. The start page shows the tools as a duct network (fan, main duct, one branch per tool, closed damper for planned tools). It is the only illustrative element. Tool pages are plain so the numbers stand out.

## Colour

**Source of truth: [`dragon-ink.md`](dragon-ink.md)** (Kanagawa Dragon based). `assets/css/tokens.css` uses exactly its token names (`--bg`, `--surface`, `--text-muted`, `--primary`, `--chart-1` …) for light and dark.

- Mostly neutrals. `--primary` is the only brand colour (actions, links, critical path, air in the ducts).
- `--accent` (gold) is currently unused. Dragon Ink allows it once per screen at most; only use it if it carries meaning.
- Editable cells sit in `--surface-sunken` wells; results are plain on `--surface`.
- Status (`--success`, `--warning`, `--danger`) always with an icon or a word. Toasts use `--surface-inverse` with the `--inverse-*` status colours.
- Charts take `--chart-1`, `--chart-2`, `--chart-3` … in this order, never skipping a slot.
- PDF reports use the light column only (`INK` in `lib/core/pdf.js`).
- Dark mode follows the OS; the theme button (System → Hell → Dunkel, icon shows the state) overrides it.

## Type

Only IBM Plex Sans and IBM Plex Mono (SIL OFL). Sources: `assets/fonts/source/` (variable roman TTFs from the official package).

- **IBM Plex Sans** for all text. The wordmark and tool names use its width axis (`font-stretch: 85%`).
- **IBM Plex Mono** for numbers in tables, inputs, results and the PDF (decimals line up). Mono has no Greek, so symbol labels (λ, ζ, Δp) stay in Sans.
- `python scripts/build-fonts.py` builds the subset files: variable WOFF2 for the web (`assets/fonts/`), static TTF for PDF embedding (`assets/fonts/pdf/`).
- Missing glyphs in Plex: no ▭ ◯ ▲ or superscript minus. Use words, arrows (↑ → ↓ exist) or `<sup>`.
- Sizes: `--fs-xs` 12, `--fs-sm` 13, `--fs-md` 15 (body), `--fs-lg` 18, `--fs-xl` 24, `--fs-2xl` 36 (key result).
- Sentence case everywhere. No all-caps labels.

## Numbers and units

- Swiss format: `6’000.5` (`fmt()` in `lib/core/format.js`). Inputs accept `6000`, `6'000`, `6’000`, `1,5` and `1.5`.
- Units sit in the column header or next to the label, never inside the input.
- Inputs are right-aligned in the number font.

## Layout and components

- 4 px spacing grid (`--sp-1` … `--sp-8`). Radius: inputs 4, buttons 6, panels 10.
- App bar on every tool page: brand (back to start), tool name, icon actions; the primary action is "PDF".
- Shared project header (`lib/core/project-info.js`): Projekt, Projekt-Nr., Bearbeitung, Datum.
- Result strip directly under the project header: the one number that matters, big.
- Warnings are listed under "Hinweise"; a row with a section jumps to it (→).
- Phone width works (16 px gutter, wide tables scroll inside their panel, never the page).

## Motion

Motion only answers an action: air flows on the start page while a ready tool is hovered or focused, a row flashes after jumping to it. Nothing animates on its own, nothing delays content, no scroll-triggered reveals. `prefers-reduced-motion` turns all of it off.

## Writing

German, Swiss spelling (ss, not ß). In the product: short labels and short status messages, no explanations (principle 2). Errors name what is wrong (`PDF nicht lesbar`). User documentation (`README.md`, `docs/*.md`) is German, plain and active.
