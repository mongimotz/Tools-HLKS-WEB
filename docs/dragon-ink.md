# Dragon Ink

Colour scheme based on [Kanagawa Dragon](https://github.com/rebelot/kanagawa.nvim). Dark uses Dragon's own colours; light puts the same hues on paper. Every text colour passes WCAG AA on the backgrounds listed for it.

## Colours

| Token | Light | Dark | Use |
|---|---|---|---|
| `bg` | `#faf9f7` | `#181616` | Page background |
| `surface` | `#ffffff` | `#1d1c19` | Cards, panels, document page |
| `surface-sunken` | `#f2f1ee` | `#0d0c0c` | Table headers, code, input wells |
| `surface-hover` | `#e9e8e4` | `#282727` | Hover / selected rows |
| `surface-inverse` | `#181616` | `#e9e8e4` | Tooltips, toasts |
| `border` | `#dedcd8` | `#393836` | Dividers, hairlines |
| `border-strong` | `#847f7a` | `#847f7a` | Input and button borders |
| `text-strong` | `#181616` | `#e3e5e1` | Headings, totals |
| `text` | `#282727` | `#c5c9c5` | Body text |
| `text-muted` | `#625e5a` | `#9e9b93` | Captions, labels, metadata |
| `text-inverse` | `#faf9f7` | `#181616` | Text on surface-inverse |
| `primary` | `#356177` | `#8ba4b0` | Buttons, links, selection, doc headings |
| `primary-hover` | `#245065` | `#a1bcc9` | Hover on primary fills |
| `on-primary` | `#ffffff` | `#181616` | Text on primary fills |
| `primary-subtle` | `#e4eff5` | `#212d35` | Selected rows, info callouts |
| `accent` | `#c3a76b` | `#c4b28a` | Gold highlight (fills, rules), once per screen |
| `accent-text` | `#76602d` | `#c4b28a` | Gold as text |
| `on-accent` | `#181616` | `#181616` | Text on accent fills |
| `accent-subtle` | `#f5eedc` | `#332d1f` | Highlighted row / note |
| `success` | `#456f46` | `#87a987` | OK, within tolerance |
| `success-subtle` | `#e7f2e6` | `#242f24` | Success badge background |
| `warning` | `#9a5a12` | `#e3a165` | Attention, near limit |
| `warning-subtle` | `#faecdd` | `#3b2a1b` | Warning badge background |
| `danger` | `#b33736` | `#dd766f` | Error, out of tolerance |
| `danger-subtle` | `#fceae8` | `#3d2321` | Error badge background |

## Charts

Use the series colours in this order. Never skip or repeat a slot.

| Token | Hue | Light | Dark |
|---|---|---|---|
| `chart-1` | Blue | `#2578a6` | `#4998c8` |
| `chart-2` | Red | `#973f3a` | `#a64c46` |
| `chart-3` | Gold | `#a5802e` | `#b18c3b` |
| `chart-4` | Plum | `#9b6196` | `#b074aa` |
| `chart-5` | Green | `#4a844c` | `#64a066` |
| `chart-6` | Violet | `#5a5a9f` | `#797ac2` |
| `chart-7` | Orange | `#b66d37` | `#c57b45` |
| `chart-8` | Aqua | `#009592` | `#24a39f` |

- Sequential (low → high), light: `#d9ebf7` `#b0d3eb` `#84b9dc` `#569ac6` `#317ca8` `#1a5e84` `#10425d`
- Sequential (low → high), dark: `#1e394a` `#27526c` `#337094` `#498eb9` `#70add4` `#9dc7e4` `#c6dff0`

## Rules

- Mostly neutrals. `primary` is the only brand colour; `accent` (gold) appears once per screen or slide.
- Body text on `bg`, `surface` or `surface-sunken`. Text on a coloured fill uses the matching `on-*` colour.
- Status colours (`success`, `warning`, `danger`) always come with an icon or a word.
- Documents and anything printed use the light column only.
- Fonts: IBM Plex Sans for text, IBM Plex Mono for code and numbers.
