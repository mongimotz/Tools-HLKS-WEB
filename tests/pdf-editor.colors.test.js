// SPDX-License-Identifier: AGPL-3.0-or-later
// Annotation colours (--annot-* in tokens.css): one value for both schemes, listed in dragon-ink.md, and
// every pair distinguishable for red-green colour blindness (DESIGN.md principle 5).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

/** --annot-N values per block of tokens.css: [light, ...dark blocks]. */
function annotBlocks(css) {
  return css.split(/@media|:root\[data-theme='dark'\]/).map((block) => Object.fromEntries([...block.matchAll(/--(annot-\d+)\s*:\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2].toLowerCase()])));
}

// ---- colour maths: sRGB → CVD simulation (Machado et al. 2009, severity 1) → CIELAB → CIEDE2000 -------------

const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const gam = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const MATRIX = {
  normal: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
};

function simulate(hex, kind) {
  const l = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255));
  return MATRIX[kind].map((row) => gam(Math.min(1, Math.max(0, row[0] * l[0] + row[1] * l[1] + row[2] * l[2]))));
}

function lab(rgb) {
  const [r, g, b] = rgb.map(lin);
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

function deltaE2000([L1, a1, b1], [L2, a2, b2]) {
  const rad = Math.PI / 180;
  const Cb = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const hue = (b, a) => ((Math.atan2(b, a) / rad) + 360) % 360;
  const h1p = hue(b1, a1p);
  const h2p = hue(b2, a2p);
  let dh = h2p - h1p;
  if (C1p * C2p === 0) dh = 0;
  else if (dh > 180) dh -= 360;
  else if (dh < -180) dh += 360;
  const dL = L2 - L1;
  const dC = C2p - C1p;
  const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin((dh * rad) / 2);
  const Lb = (L1 + L2) / 2;
  const Cbp = (C1p + C2p) / 2;
  let hb = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) > 180) hb += hb < 360 ? 360 : -360;
    hb /= 2;
  }
  const T = 1 - 0.17 * Math.cos((hb - 30) * rad) + 0.24 * Math.cos(2 * hb * rad) + 0.32 * Math.cos((3 * hb + 6) * rad) - 0.2 * Math.cos((4 * hb - 63) * rad);
  const SL = 1 + (0.015 * (Lb - 50) ** 2) / Math.sqrt(20 + (Lb - 50) ** 2);
  const SC = 1 + 0.045 * Cbp;
  const SH = 1 + 0.015 * Cbp * T;
  const RT = -2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7)) * Math.sin(60 * Math.exp(-(((hb - 275) / 25) ** 2)) * rad);
  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH));
}

test('annotation colours: nine tokens, one value for both schemes, listed in dragon-ink.md', async () => {
  const [light, ...dark] = annotBlocks(await read('assets/css/tokens.css'));
  assert.deepEqual(Object.keys(light), Array.from({ length: 9 }, (_, i) => `annot-${i + 1}`));
  for (const block of dark) assert.deepEqual(block, {}, 'annotation colours are document colours, not themed');
  const doc = await read('docs/dragon-ink.md');
  for (const [name, value] of Object.entries(light)) assert.ok(doc.includes(`| \`${name}\` |`) && doc.includes(`\`${value}\``), `${name} ${value} in dragon-ink.md`);
});

test('annotation colours 1–8: CIEDE2000 ≥ 10 between every pair, also for protan and deutan vision', async () => {
  const [light] = annotBlocks(await read('assets/css/tokens.css'));
  const colours = Object.entries(light).filter(([name]) => name !== 'annot-9');
  for (const kind of Object.keys(MATRIX)) {
    for (let i = 0; i < colours.length; i++) {
      for (let j = i + 1; j < colours.length; j++) {
        const d = deltaE2000(lab(simulate(colours[i][1], kind)), lab(simulate(colours[j][1], kind)));
        assert.ok(d >= 10, `${kind}: ${colours[i][0]} / ${colours[j][0]} ΔE ${d.toFixed(1)}`);
      }
    }
  }
});
