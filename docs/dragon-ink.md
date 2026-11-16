# Dragon Ink and Wave Ink

Two colour palettes based on [Kanagawa](https://github.com/rebelot/kanagawa.nvim), with the same token names:

- **Dragon Ink** (Kanagawa Dragon): warm grey-black ink. Dark uses Dragon's own colours; light puts the same hues on paper.
- **Wave Ink** (Kanagawa Wave, the default Kanagawa): blue-black ink with crystal blue; text is a neutral light grey instead of Fuji white. Light uses Kanagawa Lotus hues on a neutral, faintly cool paper, darkened where needed for contrast.

Every text colour passes WCAG AA on `bg`, `surface` and `surface-sunken`; `tests/theme.test.js` checks it for both palettes, light and dark.

## Switching the palette (owner only)

The site shows one palette for everyone; visitors only switch Hell / Dunkel. The values live in `docs/palettes/<id>.json`. To switch, run one command, check the pages, commit and push:

```
node scripts/palette.mjs wave      # or: dragon
node scripts/palette.mjs           # shows the active palette
```

The script writes the palette block at the end of `assets/css/tokens.css` and the favicon colours. Never edit that block by hand: change the JSON and run the script again. The PDF reports read the light column of the active palette. `npm test` fails when the block, the favicon or this table drift from the JSON.

## Colours

| Token | Dragon light | Dragon dark | Wave light | Wave dark | Use |
|---|---|---|---|---|---|
| `bg` | `#faf9f7` | `#181616` | `#f4f4f7` | `#1f1f28` | Page background |
| `surface` | `#ffffff` | `#1d1c19` | `#ffffff` | `#24242f` | Cards, panels, document page |
| `surface-sunken` | `#f2f1ee` | `#0d0c0c` | `#ebebf0` | `#16161d` | Table headers, code, input wells |
| `surface-hover` | `#e9e8e4` | `#282727` | `#e1e1e8` | `#2a2a37` | Hover / selected rows |
| `surface-inverse` | `#181616` | `#e9e8e4` | `#1f1f28` | `#d4d4dd` | Tooltips, toasts |
| `border` | `#d6d3ce` | `#393836` | `#d3d3dc` | `#363646` | Dividers, hairlines |
| `border-strong` | `#7a756f` | `#847f7a` | `#74748a` | `#727169` | Input and button borders |
| `text-strong` | `#181616` | `#e3e5e1` | `#1f1f28` | `#ededf2` | Headings, totals |
| `text` | `#232222` | `#c5c9c5` | `#2a2a37` | `#d4d4dd` | Body text |
| `text-muted` | `#57534e` | `#9e9b93` | `#545464` | `#a09cb0` | Captions, labels, metadata |
| `text-inverse` | `#faf9f7` | `#181616` | `#f4f4f7` | `#1f1f28` | Text on surface-inverse |
| `primary` | `#356177` | `#8ba4b0` | `#4d699b` | `#7e9cd8` | Buttons, links, selection, doc headings |
| `primary-hover` | `#245065` | `#a1bcc9` | `#3c5482` | `#9cb4e4` | Hover on primary fills |
| `on-primary` | `#ffffff` | `#181616` | `#ffffff` | `#1f1f28` | Text on primary fills |
| `primary-subtle` | `#e4eff5` | `#212d35` | `#e3e9f4` | `#223249` | Selected rows, info callouts |
| `accent` | `#c3a76b` | `#c4b28a` | `#c0a36e` | `#c0a36e` | Gold highlight (fills, rules), once per screen |
| `accent-text` | `#76602d` | `#c4b28a` | `#6e6838` | `#e6c384` | Gold as text |
| `on-accent` | `#181616` | `#181616` | `#1f1f28` | `#1f1f28` | Text on accent fills |
| `accent-subtle` | `#f5eedc` | `#332d1f` | `#f2ebd6` | `#3a3324` | Highlighted row / note |
| `success` | `#456f46` | `#87a987` | `#526a39` | `#98bb6c` | OK, within tolerance |
| `success-subtle` | `#e7f2e6` | `#242f24` | `#e9efdf` | `#283024` | Success badge background |
| `warning` | `#8f5310` | `#e3a165` | `#9a5400` | `#ffa066` | Attention, near limit |
| `warning-subtle` | `#faecdd` | `#3b2a1b` | `#f8eadb` | `#3e2c22` | Warning badge background |
| `danger` | `#b33736` | `#dd766f` | `#b5384b` | `#e46876` | Error, out of tolerance |
| `danger-subtle` | `#fceae8` | `#3d2321` | `#fbe8ea` | `#40232b` | Error badge background |
| `inverse-success` | `#87a987` | `#456f46` | `#98bb6c` | `#5b7440` | Success icon on surface-inverse (toasts) |
| `inverse-warning` | `#e3a165` | `#9a5a12` | `#ffa066` | `#a15800` | Warning icon on surface-inverse |
| `inverse-danger` | `#dd766f` | `#b33736` | `#e46876` | `#b5384b` | Error icon on surface-inverse |

## Charts

Use the series colours in this order. Never skip or repeat a slot.

| Token | Hue | Dragon light | Dragon dark | Wave light | Wave dark |
|---|---|---|---|---|---|
| `chart-1` | Blue | `#2578a6` | `#4998c8` | `#4d699b` | `#7e9cd8` |
| `chart-2` | Red | `#973f3a` | `#a64c46` | `#b5384b` | `#e46876` |
| `chart-3` | Gold | `#9a772a` | `#b18c3b` | `#9a7520` | `#e6c384` |
| `chart-4` | Plum | `#9b6196` | `#b074aa` | `#a3577a` | `#d27e99` |
| `chart-5` | Green | `#4a844c` | `#64a066` | `#5e7f45` | `#98bb6c` |
| `chart-6` | Violet | `#5a5a9f` | `#797ac2` | `#624c83` | `#957fb8` |
| `chart-7` | Orange | `#b66d37` | `#c57b45` | `#c0650a` | `#ffa066` |
| `chart-8` | Aqua | `#008a87` | `#24a39f` | `#3f8a8a` | `#7aa89f` |

- Sequential (low → high), light: `#d9ebf7` `#b0d3eb` `#84b9dc` `#569ac6` `#317ca8` `#1a5e84` `#10425d`
- Sequential (low → high), dark: `#1e394a` `#27526c` `#337094` `#498eb9` `#70add4` `#9dc7e4` `#c6dff0`

## Map

Water on maps (Klimastation) uses two steps of the sequential blue.

| Token | Dragon light | Dragon dark | Wave light | Wave dark | Use |
|---|---|---|---|---|---|
| `water` | `#d9ebf7` | `#1e394a` | `#dce6ef` | `#223249` | Lake fill |
| `water-line` | `#84b9dc` | `#337094` | `#8aaecb` | `#3d6a8c` | Rivers, lake shores |

## Annotations

Colours the PDF-Editor writes into documents (markup, shapes, measurements, highlight). They are document colours: the same in light and dark, and print-safe on white paper. Based on the Okabe-Ito set, with a stronger red for revision marks. Every pair keeps CIEDE2000 ΔE ≥ 10 under protanopia and deuteranopia simulation (Machado 2009, full severity); `tests/pdf-editor.colors.test.js` checks it.

| Token | Hue | Value | Default use |
|---|---|---|---|
| `annot-1` | Red | `#d42a20` | Shapes, pen, clouds, callouts, strike-out |
| `annot-2` | Blue | `#0072b2` | Measurements, underline |
| `annot-3` | Green | `#009e73` | Squiggly |
| `annot-4` | Yellow | `#f0e442` | Highlight, notes |
| `annot-5` | Black | `#000000` | Text |
| `annot-6` | Orange | `#e69f00` | |
| `annot-7` | Magenta | `#cc79a7` | |
| `annot-8` | Cyan | `#56b4e9` | |
| `annot-9` | White | `#ffffff` | Whiteout (not in the CVD check) |

## Rules

- Mostly neutrals. `primary` is the only brand colour; `accent` (gold) appears once per screen or slide.
- Body text on `bg`, `surface` or `surface-sunken`. Text on a coloured fill uses the matching `on-*` colour.
- Status colours (`success`, `warning`, `danger`) always come with an icon or a word.
- Documents and anything printed use the light column only.
- Fonts: IBM Plex Sans for text, IBM Plex Mono for code and numbers.
