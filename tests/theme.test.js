// assets/css/tokens.css is the single source of colours. The PDF reads it at runtime;
// the favicon cannot (a separate file), so this test keeps its copy in sync.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

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
  const files = ['assets/css/base.css', 'assets/css/home.css', 'tools/duct-pressure-loss/style.css'];
  for (const f of files) {
    const css = await read(f);
    assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/, `${f}: colour literal, use a token`);
    assert.doesNotMatch(css, /font-family:(?!\s*var\()/, `${f}: font name, use var(--font-sans) / var(--font-num)`);
  }
});
