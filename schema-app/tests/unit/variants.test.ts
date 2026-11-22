// SPDX-License-Identifier: AGPL-3.0-or-later
// Variants (Ausführungen), text inside symbols, own symbols in the file, clipboard.
import { describe, expect, it } from 'vitest';
import { applyOps, parseOps } from '../../src/ops/ops.ts';
import { serialize } from '../../src/model/serialize.ts';
import { parseText } from '../../src/model/migrate.ts';
import { renderSchema } from '../../src/render/render.ts';
import { findSymbol, registerSymbols, unregisterSymbol } from '../../src/symbols/library.ts';
import { copySelection, pasteClip, setVariant } from '../../src/editor/actions.ts';
import { comp, con, schema } from './helpers.ts';

describe('variants and inner text', () => {
  it('add_component / set_variant keep variant and text through a save round trip', () => {
    const r = applyOps(
      schema(),
      parseOps([
        { op: 'add_component', id: 'KL01', type: 'air.damper', variant: 'gegen', pos: [50, 50] },
        { op: 'add_component', id: 'FI01', type: 'air.filter', text: 'ePM1', pos: [80, 50] },
        { op: 'add_component', id: 'TT01', type: 'control.sensor', variant: 'p', pos: [110, 50] },
        { op: 'set_variant', id: 'KL01', variant: 'jalousie' },
      ]),
    );
    const back = parseText(serialize(r.schema));
    expect(back.components.find((c) => c.id === 'KL01')!.variant).toBe('jalousie');
    expect(back.components.find((c) => c.id === 'FI01')!.text).toBe('ePM1');
    // Variant prefix: a pressure sensor gets PT.
    expect(applyOps(back, parseOps([{ op: 'add_component', type: 'control.sensor', variant: 'p' }])).added[0]).toBe(
      'PT01',
    );
    const svg = renderSchema(back).svg;
    expect(svg).toContain('>ePM1</text>');
    expect(svg).toContain('>p</text>');
    expect(serialize(back)).toBe(serialize(r.schema));
  });

  it('rejects an unknown variant', () => {
    expect(() =>
      applyOps(schema(), parseOps([{ op: 'add_component', type: 'air.damper', variant: 'gibtsnicht' }])),
    ).toThrow(/Ausführung/);
  });

  it('a variant without a port removes the lines on it', () => {
    const s = schema({
      components: [comp('A', 'air.fan', [20, 50]), comp('SD', 'air.silencer', [50, 50])],
      connections: [con('c1', ['A', 'out'], ['SD', 'in'])],
    });
    // Both silencer variants have in/out: the line stays.
    expect(setVariant(s, 'SD', 'rohr').connections).toHaveLength(1);
  });
});

describe('own symbols in the file', () => {
  it('are embedded on save and known again after opening', () => {
    registerSymbols(
      [
        {
          id: 'user.test-box',
          name: 'Testkasten',
          category: 'user',
          norm: '',
          checked: false,
          size: [10, 10],
          ports: [{ id: 'in', at: [0, 5], dir: 'W', media: ['air.*'] }],
          labelAnchor: [5, -1.5],
          props: [],
          prefix: 'TK',
          svg: "<rect x='0' y='0' width='10' height='10' onclick='x()'/>",
        },
      ],
      true,
    );
    const s = schema({ components: [comp('TK01', 'user.test-box', [50, 50])] });
    const text = serialize(s);
    unregisterSymbol('user.test-box');
    expect(findSymbol('user.test-box')).toBeUndefined();
    const back = parseText(text);
    expect(back.symbols.map((d) => d.id)).toEqual(['user.test-box']);
    // Registered from the file, drawing sanitised.
    expect(findSymbol('user.test-box')!.svg).toBe("<rect x='0' y='0' width='10' height='10'/>");
    expect(serialize(back)).toBe(text);
    unregisterSymbol('user.test-box');
  });
});

describe('clipboard', () => {
  it('copies components, lines between them and texts; pastes with new IDs', () => {
    const s = schema({
      components: [comp('A', 'air.fan', [20, 50]), comp('B', 'air.filter', [50, 50]), comp('C', 'air.fan', [80, 50])],
      connections: [con('c1', ['A', 'out'], ['B', 'in']), con('c2', ['B', 'out'], ['C', 'in'])],
      texts: [{ id: 'T1', pos: [20, 30], text: 'Hallo', size: 3.5 }],
    });
    const clip = copySelection(s, ['A', 'B', 'T1'])!;
    expect(clip.connections.map((c) => c.id)).toEqual(['c1']);
    const r = pasteClip(s, JSON.parse(JSON.stringify(clip)), [100, 100], 0);
    expect(r.ids).toHaveLength(3);
    expect(r.schema.components).toHaveLength(5);
    expect(r.schema.connections).toHaveLength(3);
    const ids = new Set([...r.schema.components, ...r.schema.connections, ...r.schema.texts].map((x) => x.id));
    expect(ids.size).toBe(5 + 3 + 2);
  });
});
