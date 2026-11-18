// SPDX-License-Identifier: AGPL-3.0-or-later
// SVG → PNG with resvg and the app's own fonts (same look as the browser).
import { Resvg } from '@resvg/resvg-js';
import { fileURLToPath } from 'node:url';

const FONTS = ['plex-sans-400.ttf', 'plex-sans-600.ttf'].map((f) =>
  fileURLToPath(new URL(`../public/fonts/${f}`, import.meta.url)),
);

export function svgToPng(svg: string, dpi = 150): Buffer {
  const r = new Resvg(svg, {
    fitTo: { mode: 'zoom', value: dpi / 25.4 / (96 / 25.4) },
    font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: 'IBM Plex Sans Var' },
    background: 'white',
  });
  return r.render().asPng();
}
