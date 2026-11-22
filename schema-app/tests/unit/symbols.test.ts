// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { allSymbols, symbolVariant } from '../../src/symbols/library.ts';
import { sanitizeSvg } from '../../src/symbols/sanitize.ts';

describe('symbol library', () => {
  // Every variant is checked like a symbol of its own.
  const defs = allSymbols().flatMap((d) =>
    d.variants?.length ? d.variants.map((v) => ({ ...symbolVariant(d.id, v.id), id: `${d.id}#${v.id}` })) : [d],
  );
  it('index is up to date', () => {
    execFileSync('node', ['scripts/gen-symbol-index.mjs', '--check']);
  });
  it.each(defs.map((d) => [d.id, d] as const))(
    '%s: sizes and ports on the 2.5 mm grid, ports on the box edge',
    (_, d) => {
      expect(d.size.every((v) => v % 2.5 === 0)).toBe(true);
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
    expect(d.svg).not.toMatch(/stroke='(?!none|currentColor|\{\{)/);
    expect(d.name).not.toMatch(/ß/);
  });
});

describe('sanitizeSvg (own symbols)', () => {
  it('keeps shapes, drops scripts, handlers, links, styles and colours', () => {
    const dirty =
      "<path d='M0 0L5 5' onclick='alert(1)'/><script>alert(1)</script><g><rect x='0' y='0' width='2' height='2' fill='red' stroke='currentColor'/></g>" +
      "<a href='javascript:alert(1)'><circle cx='1' cy='1' r='1'/></a><text x='1' y='1' fill='currentColor'>A&lt;b<tspan>c</tspan></text>" +
      "<foreignObject><div>x</div></foreignObject><image href='x.png'/><circle cx='1' cy='1' r='1' style='fill:red'/>";
    expect(sanitizeSvg(dirty)).toBe(
      "<path d='M0 0L5 5'/><g><rect x='0' y='0' width='2' height='2' stroke='currentColor'/></g>" +
        "<text x='1' y='1' fill='currentColor'>A&lt;b<tspan>c</tspan></text><circle cx='1' cy='1' r='1'/>",
    );
  });
});
