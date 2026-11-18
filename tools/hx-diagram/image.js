// SPDX-License-Identifier: AGPL-3.0-or-later
// PNG of the diagram of one calculation, as on screen but on white paper with the light colours of the PDF.
// DOM (canvas); imported by app.js only when the image is saved.

import { loadInk } from '../../lib/core/pdf.js';
import { buildChart } from './chart.js';
import { chartSvg, overlayOf, overlaySvg, defsSvg } from './svg.js';
import { COLORS } from './defaults.js';

const SCALE = 3; // pixels per box unit: sharp enough for print and documents

async function fontData() {
  const bytes = new Uint8Array(await (await fetch(new URL('../../assets/fonts/sans.woff2', import.meta.url))).arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** The rules of style.css for the diagram and the overlay, with fixed light colours. */
function sheetCss(ink, font) {
  const chart = Object.fromEntries(COLORS.map((c) => [c, ink[`chart${c.slice(-1)}`]]));
  return `@font-face{font-family:Plex;src:url(data:font/woff2;base64,${font}) format('woff2')}
text{font-family:Plex,sans-serif;fill:${ink.strong}}
.hx-paper{fill:#fff}
.hx-lines path{fill:none}
.hx-fine{stroke:${ink.border};stroke-width:.5}
.hx-norm{stroke:${ink.muted};stroke-width:.75}
.hx-bold{stroke:${ink.text};stroke-width:1.4}
.hx-dash{stroke:${ink.muted};stroke-width:.75;stroke-dasharray:6 4}
.knock{paint-order:stroke;stroke:#fff;stroke-width:3px;stroke-linejoin:round}
svg{--tone:${ink.muted}}
.tone-heat{--tone:${ink.danger}}.tone-cool{--tone:${ink.chart1}}.tone-humid{--tone:${ink.chart8}}
${COLORS.map((c) => `.c-${c}{--tone:${chart[c]}}`).join('')}
.hx-zone{fill:var(--tone);fill-opacity:.12;stroke:var(--tone);stroke-width:1.5}
.hx-zone:not([class*=' c-']){--tone:${ink.chart5}}
.hx-seg{stroke:var(--tone);stroke-width:2;fill:none}
.hx-mix,.hx-line{stroke-dasharray:6 4}
marker path{fill:var(--tone)}
.hx-hit{fill:none}
.hx-dot{fill:var(--tone);stroke:#fff;stroke-width:1}
.is-given .hx-dot{fill:#fff;stroke:${ink.strong};stroke-width:2}
.is-given[class*=' c-'] .hx-dot{stroke:var(--tone)}
.hx-pt text{font-weight:600}`;
}

/** PNG bytes of the calculation's diagram in a box of the given size (box units = CSS px). */
export async function buildPng(result, calc, pressure, { width, height, font }) {
  const [ink, data] = await Promise.all([loadInk(), fontData()]);
  const chart = buildChart(pressure, calc.range, { width, height, font });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width * SCALE}" height="${height * SCALE}" viewBox="0 0 ${width} ${height}"><style>${sheetCss(ink, data)}</style>${defsSvg(chart.map)}<rect class="hx-paper" width="${width}" height="${height}"/>${chartSvg(chart)}<g clip-path="url(#hx-clip)">${overlaySvg(overlayOf(result, calc.blocks), chart.map, null)}</g></svg>`;
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = width * SCALE;
    canvas.height = height * SCALE;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}
