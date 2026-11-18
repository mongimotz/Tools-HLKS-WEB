// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { applyOps, OpError, parseOps } from '../../src/ops/ops.ts';
import { validate } from '../../src/model/validate.ts';
import { comp, con, schema } from './helpers.ts';

const run = (ops: unknown[], s = schema()) => applyOps(s, parseOps(ops));

describe('operations', () => {
  it('add_chain builds components, connections and default media (AUL → ZUL after the first treatment)', () => {
    const r = run([
      {
        op: 'add_chain',
        strand: 'supply',
        items: [{ type: 'air.intake' }, { type: 'air.filter' }, { type: 'air.heater' }, { type: 'air.fan' }],
      },
    ]);
    expect(r.schema.components.map((c) => c.id)).toEqual(['AF01', 'FI01', 'ER01', 'VE01']);
    expect(r.schema.connections.map((c) => c.medium)).toEqual(['air.outdoor', 'air.outdoor', 'air.supply']);
    expect(r.schema.components.every((c) => c.pos)).toBe(true);
    expect(validate(r.schema).filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('extract chains switch ABL → FOL after the WRG side', () => {
    const r = run([
      { op: 'add_component', id: 'WRG01', type: 'air.hrc.plate' },
      { op: 'add_chain', strand: 'supply', items: [{ type: 'air.intake' }, 'WRG01.a', { type: 'air.fan' }] },
      {
        op: 'add_chain',
        strand: 'extract',
        items: [{ type: 'air.fan', id: 'VE02' }, 'WRG01.b', { type: 'air.outlet' }],
      },
    ]);
    const ex = r.schema.connections.filter(
      (c) => c.from[0] === 'VE02' || (c.from[0] === 'WRG01' && c.from[1] === 'b.out'),
    );
    expect(ex.map((c) => c.medium)).toEqual(['air.extract', 'air.exhaust']);
    const wrg = r.schema.components.find((c) => c.id === 'WRG01')!;
    const ve2 = r.schema.components.find((c) => c.id === 'VE02')!;
    expect(ve2.pos![0]).toBeGreaterThan(wrg.pos![0]); // extract flows right → left
    expect(ve2.pos![1]).toBeLessThan(wrg.pos![1]); // and lies above the supply row
  });

  it('insert_into_connection splits a line and keeps its medium', () => {
    const s = schema({
      components: [
        comp('FI01', 'air.filter', [50, 100], { pinned: true }),
        comp('VE01', 'air.fan', [100, 100], { pinned: true }),
      ],
      connections: [con('c1', ['FI01', 'out'], ['VE01', 'in'])],
    });
    const r = run([{ op: 'insert_into_connection', connection: 'c1', type: 'air.heater', id: 'ER01' }], s);
    expect(r.schema.connections.map((c) => [c.from.join('.'), c.to.join('.'), c.medium])).toEqual([
      ['FI01.out', 'ER01.in', 'air.supply'],
      ['ER01.out', 'VE01.in', 'air.supply'],
    ]);
    expect(r.schema.components.find((c) => c.id === 'ER01')!.pos).not.toBeNull();
    // Pinned neighbours stay.
    expect(r.schema.components.find((c) => c.id === 'FI01')!.pos).toEqual([50, 100]);
  });

  it('is atomic: one invalid op aborts all and names its index', () => {
    const s = schema();
    expect(() =>
      run(
        [
          { op: 'add_component', type: 'air.fan', id: 'VE01' },
          { op: 'connect', from: 'VE01.out', to: 'NOPE.in', medium: 'air.supply' },
        ],
        s,
      ),
    ).toThrow(/Operation 2: Komponente "NOPE"/);
    expect(s.components).toEqual([]);
  });

  it('rejects unknown ops, types, media and busy ports with clear messages', () => {
    expect(() => parseOps([{ op: 'explode' }])).toThrow(/unbekannte Operation "explode"/);
    expect(() => run([{ op: 'add_component', type: 'air.unicorn' }])).toThrow(/unbekannter Symboltyp/);
    const s = schema({
      components: [comp('A', 'air.fan', [50, 50]), comp('B', 'air.fan', [80, 50]), comp('C', 'air.fan', [110, 50])],
      connections: [con('c1', ['A', 'out'], ['B', 'in'])],
    });
    expect(() => run([{ op: 'connect', from: 'C.out', to: 'B.in', medium: 'air.supply' }], s)).toThrow(/schon belegt/);
    expect(() => run([{ op: 'connect', from: 'B.out', to: 'C.in', medium: 'water.hot' }], s)).toThrow(
      /unbekanntes Medium/,
    );
    expect(() => run([{ op: 'connect', from: 'B.out', to: 'C.nope', medium: 'air.supply' }], s)).toThrow(
      /keinen Anschluss "nope"/,
    );
  });

  it('move needs force for pinned components and pins what it moves', () => {
    const s = schema({
      components: [comp('A', 'air.fan', [50, 50], { pinned: true }), comp('B', 'air.fan', [80, 50])],
    });
    expect(() => run([{ op: 'move', id: 'A', pos: [60, 60] }], s)).toThrow(/fixiert/);
    expect(run([{ op: 'move', id: 'A', pos: [61, 59], force: true }], s).schema.components[0]!.pos).toEqual([60, 60]);
    expect(run([{ op: 'move', id: 'B', pos: [90, 50] }], s).schema.components[1]!.pinned).toBe(true);
  });

  it('remove takes connections and group membership along', () => {
    const s = schema({
      components: [comp('A', 'air.fan', [50, 50]), comp('B', 'air.fan', [80, 50])],
      connections: [con('c1', ['A', 'out'], ['B', 'in'])],
      groups: [{ id: 'G1', label: '', members: ['A', 'B'], frame: true }],
    });
    const r = run([{ op: 'remove', id: 'A' }], s);
    expect(r.schema.connections).toEqual([]);
    expect(r.schema.groups[0]!.members).toEqual(['B']);
    expect(r.removed).toEqual(['A', 'c1']);
  });

  it('notes: add and resolve', () => {
    const s = schema({ components: [comp('A', 'air.fan', [50, 50])] });
    const r = run(
      [
        { op: 'add_note', id: 'n1', anchor: { component: 'A' }, text: 'Doppelventilator' },
        { op: 'resolve_note', id: 'n1', reply: 'erledigt' },
      ],
      s,
    );
    expect(r.schema.notes[0]).toMatchObject({ status: 'done', reply: 'erledigt' });
  });

  it('parseOps accepts { ops: [...] } and "ID.port" or [ID, port]', () => {
    expect(parseOps({ ops: [{ op: 'connect', from: ['A', 'out'], to: 'B.in', medium: 'air.supply' }] })).toHaveLength(
      1,
    );
    expect(() => parseOps('nope')).toThrow(OpError);
  });
});
