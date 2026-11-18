// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { allSymbols } from '../../src/symbols/library.ts';

describe('symbol library', () => {
  const defs = allSymbols();
  it('index is up to date', () => {
    execFileSync('node', ['scripts/gen-symbol-index.mjs', '--check']);
  });
  it.each(defs.map((d) => [d.id, d] as const))(
    '%s: sizes on 5 mm, ports on the 2.5 mm grid and on the box edge',
    (_, d) => {
      expect(d.size.every((v) => v % 5 === 0)).toBe(true);
      for (const p of d.ports) {
        expect(p.at.every((v) => Math.abs(v / 2.5 - Math.round(v / 2.5)) < 1e-9)).toBe(true);
        const onEdge = { W: p.at[0] === 0, E: p.at[0] === d.size[0], N: p.at[1] === 0, S: p.at[1] === d.size[1] }[
          p.dir
        ];
        expect(onEdge, `${d.id}.${p.id}`).toBe(true);
      }
    },
  );
  it.each(defs.map((d) => [d.id, d] as const))('%s: no fixed stroke width or colour in the drawing', (_, d) => {
    expect(d.svg).not.toMatch(/stroke-width|#[0-9a-f]{3,6}|rgb\(/i);
    expect(d.svg).not.toMatch(/fill='(?!none|currentColor)/);
    expect(d.name).not.toMatch(/ß/);
  });
});
