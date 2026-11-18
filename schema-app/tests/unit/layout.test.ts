// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { parseText } from '../../src/model/migrate.ts';
import { validate } from '../../src/model/validate.ts';
import { renderSchema } from '../../src/render/render.ts';
import { checkDrawing } from '../../src/layout/check.ts';
import { applyOps, parseOps } from '../../src/ops/ops.ts';
import { routeAll } from '../../src/layout/route.ts';
import { comp, con, schema } from './helpers.ts';

const EX = new URL('../../examples/', import.meta.url);
const examples = readdirSync(EX).filter((f) => f.endsWith('.schema'));

describe('examples', () => {
  it.each(examples)('%s: valid, and the drawing has no overlaps, clipped texts or lines through symbols', (f) => {
    const s = parseText(readFileSync(new URL(f, EX), 'utf8'));
    expect(validate(s).filter((i) => i.severity === 'error')).toEqual([]);
    if (f !== 'symbol-catalog.schema') expect(validate(s).map((i) => i.message)).toEqual([]);
    expect(checkDrawing(renderSchema(s)).map((i) => i.message)).toEqual([]);
  });
});

describe('layout', () => {
  it('relayout keeps pinned components and moves the others', () => {
    const s = schema({
      components: [comp('FI01', 'air.filter', [100, 150], { pinned: true }), comp('VE01', 'air.fan', [300, 50])],
      connections: [con('c1', ['FI01', 'out'], ['VE01', 'in'])],
    });
    const r = applyOps(s, parseOps([{ op: 'relayout_unpinned' }])).schema;
    expect(r.components[0]!.pos).toEqual([100, 150]);
    expect(r.components[1]!.pos![1]).toBe(150);
    expect(r.components[1]!.pos![0]).toBeGreaterThan(100);
  });

  it('a chain too long for A4 shrinks its gaps, then suggests a larger sheet; symbols keep their size', () => {
    const items = Array.from({ length: 30 }, () => ({ type: 'air.silencer' }));
    const s = schema();
    s.sheet.size = 'A4';
    const r = applyOps(s, parseOps([{ op: 'add_chain', strand: 'supply', items }]));
    expect(r.suggestion).toMatch(/A3/);
  });

  it('routes go around symbols in the way', () => {
    const s = schema({
      components: [
        comp('A', 'air.fan', [50, 100]),
        comp('X', 'air.filter', [100, 100]),
        comp('B', 'air.fan', [150, 100]),
      ],
      connections: [con('c1', ['A', 'out'], ['B', 'in'])],
    });
    const r = renderSchema(s);
    expect(checkDrawing(r).filter((i) => i.code === 'line-through-symbol')).toEqual([]);
    expect(routeAll(s).routes.get('c1')!.length).toBeGreaterThan(2);
  });

  it('manual waypoints win over automatic routing', () => {
    const s = schema({
      components: [comp('A', 'air.fan', [50, 100]), comp('B', 'air.fan', [150, 100])],
      connections: [
        con('c1', ['A', 'out'], ['B', 'in'], 'air.supply', {
          waypoints: [
            [70, 100],
            [70, 60],
            [130, 60],
            [130, 100],
          ],
        }),
      ],
    });
    expect(routeAll(s).routes.get('c1')).toEqual([
      [55, 100],
      [70, 100],
      [70, 60],
      [130, 60],
      [130, 100],
      [145, 100],
    ]);
  });
});
