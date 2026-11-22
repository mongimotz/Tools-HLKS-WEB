// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { migrate, parseText } from '../../src/model/migrate.ts';
import { SchemaError } from '../../src/model/schema.ts';
import { serialize } from '../../src/model/serialize.ts';
import { validate } from '../../src/model/validate.ts';
import { localToSheet, portPlace, rotateDir } from '../../src/model/geometry.ts';
import { symbolOf } from '../../src/symbols/library.ts';
import { comp, con, schema } from './helpers.ts';

const codes = (s: ReturnType<typeof schema>) =>
  validate(s)
    .map((i) => i.code)
    .sort();

describe('file parsing and migration', () => {
  it('fills defaults for a minimal hand-written file', () => {
    const s = migrate({ format: 'hlks-schema', version: 1, components: [{ id: 'VE01', type: 'air.fan' }] });
    expect(s.sheet).toEqual({
      size: 'A3',
      orientation: 'landscape',
      grid: 2.5,
      titleBlock: 'default',
      legend: true,
      show: { ids: true, media: true, values: true },
    });
    expect(s.components[0]).toMatchObject({ label: 'VE01', pos: null, rot: 0, flip: false, pinned: false, props: {} });
  });
  it('rejects a foreign format, an unknown and a newer version with a clear message', () => {
    expect(() => migrate({ format: 'x', version: 1 })).toThrow(/Kein Prinzipschema/);
    expect(() => migrate({ format: 'hlks-schema', version: 'a' })).toThrow(/Unbekannte Dateiversion/);
    expect(() => migrate({ format: 'hlks-schema', version: 9 })).toThrow(/Version 9/);
  });
  it('reports the JSON path of invalid fields', () => {
    try {
      migrate({ format: 'hlks-schema', version: 1, components: [{ id: 'A', type: 'air.fan', rot: 45 }] });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(SchemaError);
      expect((e as SchemaError).issues[0]!.path).toBe('components[0].rot');
    }
  });
  it('reports line and column of JSON syntax errors', () => {
    expect(() => parseText('{\n  "format": "hlks-schema",\n  "version": 1,,\n}')).toThrow(/Zeile 3/);
  });
  it('serialises with stable key order and round-trips', () => {
    const s = schema({ components: [comp('VE01', 'air.fan', [100, 100], { props: { V: '3,5 m³/s' } })] });
    const text = serialize(s);
    expect(text).toContain('"V": "3,5 m³/s"');
    expect(text.indexOf('"format"')).toBeLessThan(text.indexOf('"meta"'));
    expect(serialize(parseText(text))).toBe(text);
    expect(text.split('\n').filter((l) => l.includes('"VE01"'))).toHaveLength(1);
  });
});

describe('topology rules', () => {
  const base = () =>
    schema({
      components: [comp('FI01', 'air.filter', [50, 50]), comp('VE01', 'air.fan', [80, 50])],
      connections: [con('c1', ['FI01', 'out'], ['VE01', 'in'])],
    });
  it('a valid chain has only open-port warnings at its ends', () => {
    const issues = validate(base());
    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(issues.map((i) => i.code)).toEqual(['open-port', 'open-port']);
  });
  it('duplicate IDs', () => {
    const s = base();
    s.components.push(comp('VE01', 'air.fan', [120, 50]));
    expect(codes(s)).toContain('duplicate-id');
  });
  it('unknown component, port and type', () => {
    const s = base();
    s.connections.push(con('c2', ['XX', 'out'], ['VE01', 'nope']));
    s.components.push(comp('Q1', 'air.nonsense', [150, 50]));
    expect(codes(s)).toEqual(expect.arrayContaining(['unknown-component', 'unknown-port', 'unknown-type']));
  });
  it('a port takes only one connection', () => {
    const s = base();
    s.components.push(comp('ER01', 'air.heater', [30, 80]));
    s.connections.push(con('c2', ['ER01', 'out'], ['VE01', 'in']));
    expect(codes(s)).toContain('port-used');
  });
  it('medium must fit the port', () => {
    const s = base();
    s.connections[0]!.medium = 'signal';
    expect(codes(s)).toContain('medium-mismatch');
  });
  it('unknown medium, overlap, off-grid, bad group member, bad note anchor', () => {
    const s = base();
    s.connections[0]!.medium = 'water.hot';
    s.components.push(comp('VE02', 'air.fan', [82.5, 51.2]));
    s.groups.push({ id: 'G1', label: '', members: ['NOPE'], frame: true });
    s.notes.push({ id: 'n1', anchor: { component: 'GONE' }, text: 'x', status: 'open', created: '', reply: null });
    expect(codes(s)).toEqual(
      expect.arrayContaining(['unknown-medium', 'overlap', 'off-grid', 'unknown-member', 'note-anchor']),
    );
  });
});

describe('geometry', () => {
  it('rotates and flips port positions and directions', () => {
    const fan = symbolOf('air.fan');
    const c = comp('VE01', 'air.fan', [100, 100]);
    expect(localToSheet(fan, c, [10, 5])).toEqual([105, 100]);
    expect(portPlace({ ...c, rot: 90 }, 'out')).toMatchObject({ at: [100, 105], dir: 'S' });
    expect(portPlace({ ...c, flip: true }, 'out')).toMatchObject({ at: [95, 100], dir: 'W' });
    expect(rotateDir('N', 270, false)).toBe('W');
  });
});
