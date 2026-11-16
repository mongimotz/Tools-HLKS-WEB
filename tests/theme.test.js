// SPDX-License-Identifier: AGPL-3.0-or-later
// assets/css/tokens.css is the single source of colours. The PDF reads it at runtime;
// the favicon cannot (a separate file), so this test keeps its copy in sync.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

import { parseLightTokens, loadInk, INK } from '../lib/core/pdf.js';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

/** Colour tokens of the dark column (the explicit [data-theme='dark'] block). */
function darkTokens(css) {
  const block = css.slice(css.indexOf(":root[data-theme='dark']"));
  return Object.fromEntries([...block.matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2].toLowerCase()]));
}

test('PDF colours come from the light tokens', async () => {
  const light = parseLightTokens(await read('assets/css/tokens.css'));
  await loadInk();
  assert.equal(INK.primary, light.primary);
  assert.equal(INK.strong, light['text-strong']);
  assert.equal(INK.chart1, light['chart-1']);
});

test('favicon uses --primary and --on-primary (light and dark)', async () => {
  const css = await read('assets/css/tokens.css');
  const svg = (await read('assets/favicon.svg')).toLowerCase();
  const light = parseLightTokens(css);
  const dark = darkTokens(css);
  const [lightPart, darkPart] = svg.split('@media');
  assert.ok(lightPart.includes(`fill:${light.primary}`), `light background should be ${light.primary}`);
  assert.ok(lightPart.includes(`stroke:${light['on-primary']}`), `light mark should be ${light['on-primary']}`);
  assert.ok(darkPart.includes(`fill:${dark.primary}`), `dark background should be ${dark.primary}`);
  assert.ok(darkPart.includes(`stroke:${dark['on-primary']}`), `dark mark should be ${dark['on-primary']}`);
});

test('no hard-coded colours or font names outside tokens.css', async () => {
  const tools = await readdir(new URL('../tools/', import.meta.url));
  const files = ['assets/css/base.css', 'assets/css/home.css', ...tools.map((t) => `tools/${t}/style.css`)];
  for (const f of files) {
    const css = await read(f);
    assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/, `${f}: colour literal, use a token`);
    assert.doesNotMatch(css, /font-family:(?!\s*var\()/, `${f}: font name, use var(--font-sans) / var(--font-num)`);
  }
});

// ---- palettes (docs/palettes/*.json, switched site-wide by scripts/palette.mjs) ----

import { listPalettes, readPalette, activePalette, paletteBlock } from '../scripts/palette.mjs';

const lum = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255]
    .map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
};
const contrast = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

test('tokens.css holds one palette exactly as generated', async () => {
  const css = await read('assets/css/tokens.css');
  const id = activePalette(css);
  assert.ok((await listPalettes()).includes(id), `unknown palette ${id}`);
  assert.ok(css.endsWith(paletteBlock(id, await readPalette(id))), 'palette block drifted: run node scripts/palette.mjs ' + id);
});

test('every palette has the same tokens and passes WCAG contrast', async () => {
  const ids = await listPalettes();
  const keys = Object.keys((await readPalette(ids[0])).light).sort();
  const text = ['text-strong', 'text', 'text-muted', 'primary', 'accent-text', 'success', 'warning', 'danger'];
  for (const id of ids) {
    const p = await readPalette(id);
    for (const [scheme, c] of Object.entries({ light: p.light, dark: p.dark })) {
      const at = `${id} ${scheme}`;
      assert.deepEqual(Object.keys(c).sort(), keys, `${at}: token names`);
      for (const t of text) for (const bg of ['bg', 'surface', 'surface-sunken']) {
        assert.ok(contrast(c[t], c[bg]) >= 4.5, `${at}: ${t} on ${bg} ${contrast(c[t], c[bg]).toFixed(2)}`);
      }
      assert.ok(contrast(c['text-muted'], c['surface-hover']) >= 4.5, `${at}: text-muted on surface-hover`);
      assert.ok(contrast(c['on-primary'], c.primary) >= 4.5, `${at}: on-primary`);
      assert.ok(contrast(c['on-accent'], c.accent) >= 4.5, `${at}: on-accent`);
      assert.ok(contrast(c['text-inverse'], c['surface-inverse']) >= 4.5, `${at}: text-inverse`);
      for (const t of ['inverse-success', 'inverse-warning', 'inverse-danger']) assert.ok(contrast(c[t], c['surface-inverse']) >= 3, `${at}: ${t}`);
      assert.ok(contrast(c['border-strong'], c.surface) >= 3, `${at}: border-strong`);
      for (let i = 1; i <= 8; i++) assert.ok(contrast(c[`chart-${i}`], c.surface) >= 3, `${at}: chart-${i} ${contrast(c[`chart-${i}`], c.surface).toFixed(2)}`);
    }
  }
});

test('docs/dragon-ink.md lists every palette value', async () => {
  const doc = await read('docs/dragon-ink.md');
  for (const id of await listPalettes()) {
    const p = await readPalette(id);
    for (const [k, v] of Object.entries(p.light)) {
      if (!v.startsWith('#')) continue;
      const row = doc.split('\n').find((l) => l.startsWith(`| \`${k}\` |`));
      assert.ok(row?.includes(`\`${v}\``) && row.includes(`\`${p.dark[k]}\``), `${id}: ${k} missing in dragon-ink.md`);
    }
  }
});
