// SPDX-License-Identifier: AGPL-3.0-or-later
// Operations on a schema: one vocabulary for the CLI (`ops`), the assistant (tool calls) and tests.
// A list of operations is atomic: the first invalid one aborts the whole list and nothing changes.
import { z } from 'zod';
import type { Component, Connection, Note, Schema, Vec } from '../model/types.ts';
import { findSymbol, symbolOf } from '../symbols/library.ts';
import { MEDIUM_IDS, medium } from '../model/media.ts';
import { portPlace, snapVec } from '../model/geometry.ts';
import { autoLayout } from '../layout/auto.ts';
import { placeMissing } from '../layout/place.ts';

const vec = z.tuple([z.number(), z.number()]);
const portRef = z.union([
  z.tuple([z.string(), z.string()]),
  z.string().regex(/^[^.]+\..+$/, 'Anschluss als "ID.port" oder [ID, port]'),
]);
const props = z.record(z.string(), z.union([z.string(), z.number()]).transform(String));

const chainItem = z.union([
  z.string(),
  z.object({
    id: z.string().optional(),
    type: z.string().optional(),
    label: z.string().optional(),
    props: props.optional(),
    /** Medium of the connection leaving this item (default: continues). */
    then: z.string().optional(),
  }),
]);

export const OP_SCHEMAS = {
  add_component: z.object({
    op: z.literal('add_component'),
    id: z.string().optional(),
    type: z.string(),
    label: z.string().optional(),
    props: props.optional(),
    pos: vec.optional(),
    rot: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).optional(),
    flip: z.boolean().optional(),
    pinned: z.boolean().optional(),
  }),
  remove: z.object({ op: z.literal('remove'), id: z.string() }),
  connect: z.object({
    op: z.literal('connect'),
    id: z.string().optional(),
    from: portRef,
    to: portRef,
    medium: z.string(),
  }),
  disconnect: z.object({ op: z.literal('disconnect'), id: z.string() }),
  insert_into_connection: z.object({
    op: z.literal('insert_into_connection'),
    connection: z.string(),
    id: z.string().optional(),
    type: z.string().optional(),
    label: z.string().optional(),
    props: props.optional(),
    in: z.string().default('in'),
    out: z.string().default('out'),
    /** Position for the new component (no relayout then), e.g. where it was dropped on the line. */
    pos: vec.optional(),
    rot: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).optional(),
    flip: z.boolean().optional(),
  }),
  set_props: z.object({ op: z.literal('set_props'), id: z.string(), props, replace: z.boolean().default(false) }),
  set_label: z.object({ op: z.literal('set_label'), id: z.string(), label: z.string() }),
  set_medium: z.object({ op: z.literal('set_medium'), id: z.string(), medium: z.string() }),
  move: z.object({ op: z.literal('move'), id: z.string(), pos: vec, force: z.boolean().default(false) }),
  add_chain: z.object({
    op: z.literal('add_chain'),
    /** supply: AUL → ZUL, left → right. extract: ABL → FOL, right → left, above. */
    strand: z.enum(['supply', 'extract']),
    items: z.array(chainItem).min(1),
    /** Connect the first item's input to this port (e.g. a junction). */
    after: portRef.optional(),
  }),
  group: z.object({
    op: z.literal('group'),
    id: z.string().optional(),
    label: z.string().default(''),
    members: z.array(z.string()).min(1),
    frame: z.boolean().default(true),
  }),
  add_note: z.object({
    op: z.literal('add_note'),
    id: z.string().optional(),
    anchor: z.union([
      z.object({ component: z.string() }),
      z.object({ connection: z.string() }),
      z.object({ pos: vec }),
    ]),
    text: z.string().min(1),
  }),
  resolve_note: z.object({ op: z.literal('resolve_note'), id: z.string(), reply: z.string().optional() }),
  set_meta: z.object({
    op: z.literal('set_meta'),
    title: z.string().optional(),
    project: z.string().optional(),
    author: z.string().optional(),
    date: z.string().optional(),
    revision: z.string().optional(),
    size: z.enum(['A4', 'A3', 'A2', 'A1']).optional(),
    orientation: z.enum(['landscape', 'portrait']).optional(),
  }),
  relayout_unpinned: z.object({ op: z.literal('relayout_unpinned'), all: z.boolean().default(false) }),
} as const;

export const opSchema = z.discriminatedUnion('op', Object.values(OP_SCHEMAS) as never);
export type Op = { [K in keyof typeof OP_SCHEMAS]: z.infer<(typeof OP_SCHEMAS)[K]> }[keyof typeof OP_SCHEMAS];
export type OpName = keyof typeof OP_SCHEMAS;

export class OpError extends Error {
  constructor(
    public readonly index: number,
    message: string,
  ) {
    super(`Operation ${index + 1}: ${message}`);
  }
}

export interface ApplyResult {
  schema: Schema;
  /** IDs created or changed, for highlighting. */
  added: string[];
  removed: string[];
  changed: string[];
  /** Sheet-fit suggestion from the layout, if any. */
  suggestion: string | null;
}

function ref(r: z.infer<typeof portRef>): [string, string] {
  if (Array.isArray(r)) return [r[0], r[1]];
  const i = r.indexOf('.');
  return [r.slice(0, i), r.slice(i + 1)];
}

export function nextId(s: Schema, prefix: string): string {
  const used = new Set([...s.components, ...s.connections, ...s.groups, ...s.texts, ...s.notes].map((x) => x.id));
  for (let n = 1; ; n++) {
    const id = `${prefix}${String(n).padStart(2, '0')}`;
    if (!used.has(id)) return id;
  }
}

function allIds(s: Schema): Set<string> {
  return new Set([...s.components, ...s.connections, ...s.groups, ...s.texts, ...s.notes].map((x) => x.id));
}

/** Parses raw JSON ops (array or { ops: [...] }); throws OpError with the index. */
export function parseOps(raw: unknown): Op[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { ops?: unknown }).ops)
      ? (raw as { ops: unknown[] }).ops
      : null;
  if (!list) throw new OpError(-1, 'Erwartet eine Liste von Operationen oder { "ops": [...] }.');
  return list.map((o, i) => {
    const r = opSchema.safeParse(o);
    if (!r.success) {
      const name = (o as { op?: unknown })?.op;
      const known = Object.keys(OP_SCHEMAS);
      if (typeof name !== 'string' || !known.includes(name))
        throw new OpError(i, `unbekannte Operation ${JSON.stringify(name)} (bekannt: ${known.join(', ')})`);
      throw new OpError(i, r.error.issues.map((x) => `${x.path.join('.') || name}: ${x.message}`).join('; '));
    }
    return r.data as Op;
  });
}

export function applyOps(input: Schema, ops: Op[]): ApplyResult {
  let s: Schema = structuredClone(input);
  const added: string[] = [],
    removed: string[] = [],
    changed: string[] = [];
  let needLayout = false;
  let relayout: { all: boolean } | null = null;

  const comp = (i: number, id: string) => {
    const c = s.components.find((x) => x.id === id);
    if (!c) throw new OpError(i, `Komponente "${id}" gibt es nicht.`);
    return c;
  };
  const checkPort = (i: number, [cid, pid]: [string, string]) => {
    const c = comp(i, cid);
    const def = findSymbol(c.type);
    if (def && !def.ports.some((p) => p.id === pid))
      throw new OpError(
        i,
        `${cid} (${def.name}) hat keinen Anschluss "${pid}" (vorhanden: ${def.ports.map((p) => p.id).join(', ')}).`,
      );
    const busy = s.connections.find(
      (x) => (x.from[0] === cid && x.from[1] === pid) || (x.to[0] === cid && x.to[1] === pid),
    );
    if (busy) throw new OpError(i, `Anschluss ${cid}.${pid} ist schon belegt (${busy.id}).`);
  };
  const checkMedium = (i: number, m: string) => {
    if (!medium(m)) throw new OpError(i, `unbekanntes Medium "${m}" (erlaubt: ${MEDIUM_IDS.join(', ')}).`);
  };
  const newComponent = (
    i: number,
    o: {
      id?: string;
      type: string;
      label?: string;
      props?: Record<string, string>;
      pos?: Vec;
      rot?: 0 | 90 | 180 | 270;
      flip?: boolean;
      pinned?: boolean;
    },
  ): Component => {
    const def = findSymbol(o.type);
    if (!def) throw new OpError(i, `unbekannter Symboltyp "${o.type}".`);
    const id = o.id ?? nextId(s, def.prefix);
    if (allIds(s).has(id)) throw new OpError(i, `ID "${id}" gibt es schon.`);
    const c: Component = {
      id,
      type: o.type,
      label: o.label ?? id,
      props: o.props ?? {},
      pos: o.pos ? snapVec(o.pos, s.sheet.grid) : null,
      rot: o.rot ?? 0,
      flip: o.flip ?? false,
      pinned: o.pinned ?? !!o.pos,
    };
    s.components.push(c);
    added.push(id);
    if (!c.pos) needLayout = true;
    return c;
  };
  const newConnection = (
    i: number,
    from: [string, string],
    to: [string, string],
    m: string,
    id?: string,
  ): Connection => {
    checkMedium(i, m);
    checkPort(i, from);
    checkPort(i, to);
    const cid = id ?? nextId(s, 'L');
    if (allIds(s).has(cid)) throw new OpError(i, `ID "${cid}" gibt es schon.`);
    const con: Connection = { id: cid, from, to, medium: m, waypoints: [], pinned: false };
    s.connections.push(con);
    added.push(cid);
    return con;
  };

  ops.forEach((op, i) => {
    switch (op.op) {
      case 'add_component':
        newComponent(i, op);
        break;
      case 'remove': {
        const id = op.id;
        const before = allIds(s);
        if (!before.has(id)) throw new OpError(i, `"${id}" gibt es nicht.`);
        const cons = s.connections.filter((c) => c.id === id || c.from[0] === id || c.to[0] === id).map((c) => c.id);
        s.components = s.components.filter((c) => c.id !== id);
        s.connections = s.connections.filter((c) => !cons.includes(c.id));
        s.groups = s.groups
          .filter((g) => g.id !== id)
          .map((g) => ({ ...g, members: g.members.filter((m) => m !== id) }));
        s.texts = s.texts.filter((t) => t.id !== id);
        s.notes = s.notes.filter((n) => n.id !== id);
        removed.push(id, ...cons.filter((c) => c !== id));
        break;
      }
      case 'connect':
        newConnection(i, ref(op.from), ref(op.to), op.medium, op.id);
        break;
      case 'disconnect': {
        if (!s.connections.some((c) => c.id === op.id)) throw new OpError(i, `Verbindung "${op.id}" gibt es nicht.`);
        s.connections = s.connections.filter((c) => c.id !== op.id);
        removed.push(op.id);
        break;
      }
      case 'insert_into_connection': {
        const con = s.connections.find((c) => c.id === op.connection);
        if (!con) throw new OpError(i, `Verbindung "${op.connection}" gibt es nicht.`);
        let c: Component;
        if (op.type)
          c = newComponent(i, {
            id: op.id,
            type: op.type,
            label: op.label,
            props: op.props,
            pos: op.pos,
            rot: op.rot,
            flip: op.flip,
          });
        else if (op.id) c = comp(i, op.id);
        else throw new OpError(i, 'type (neue Komponente) oder id (bestehende) angeben.');
        const def = symbolOf(c.type);
        for (const p of [op.in, op.out])
          if (!def.ports.some((x) => x.id === p)) throw new OpError(i, `${c.id} hat keinen Anschluss "${p}".`);
        const to = con.to;
        con.to = [c.id, op.in];
        con.waypoints = [];
        changed.push(con.id);
        s.connections.push({
          id: nextId(s, 'L'),
          from: [c.id, op.out],
          to,
          medium: con.medium,
          waypoints: [],
          pinned: false,
        });
        added.push(s.connections[s.connections.length - 1]!.id);
        if (!c.pos) {
          // Room on the line: relayout of unpinned elements makes the gap.
          needLayout = true;
          relayout = relayout ?? { all: false };
        }
        break;
      }
      case 'set_props': {
        const c = comp(i, op.id);
        c.props = op.replace ? { ...op.props } : { ...c.props, ...op.props };
        for (const [k, v] of Object.entries(c.props)) if (v === '') delete c.props[k];
        changed.push(c.id);
        break;
      }
      case 'set_label': {
        const el = [...s.components, ...s.groups].find((x) => x.id === op.id);
        if (!el) throw new OpError(i, `"${op.id}" gibt es nicht.`);
        el.label = op.label;
        changed.push(op.id);
        break;
      }
      case 'set_medium': {
        const con = s.connections.find((c) => c.id === op.id);
        if (!con) throw new OpError(i, `Verbindung "${op.id}" gibt es nicht.`);
        checkMedium(i, op.medium);
        con.medium = op.medium;
        changed.push(con.id);
        break;
      }
      case 'move': {
        const c = comp(i, op.id);
        if (c.pinned && !op.force)
          throw new OpError(i, `${c.id} ist fixiert (pinned). Nur mit "force": true verschieben.`);
        c.pos = snapVec(op.pos, s.sheet.grid);
        c.pinned = true;
        changed.push(c.id);
        break;
      }
      case 'add_chain': {
        const created: {
          c: Component;
          port: { in: string | null; out: string | null };
          then?: string;
          sensor: boolean;
        }[] = [];
        for (const it of op.items) {
          if (typeof it === 'string') {
            // Existing component, optionally with side: "WRG01.a" → ports a.in / a.out.
            const [cid, side] = it.split('.') as [string, string | undefined];
            const c = comp(i, cid);
            const pair = side ? [`${side}.in`, `${side}.out`] : ['in', 'out'];
            created.push({ c, port: { in: pair[0]!, out: pair[1]! }, sensor: false });
            continue;
          }
          if (!it.type) throw new OpError(i, `Kettenelement ohne type (${JSON.stringify(it)}).`);
          const def = findSymbol(it.type);
          if (!def) throw new OpError(i, `unbekannter Symboltyp "${it.type}".`);
          const c = newComponent(i, { id: it.id, type: it.type, label: it.label, props: it.props });
          const sensor = def.category === 'control';
          const ids = def.ports.map((p) => p.id);
          const port = sensor
            ? { in: null, out: null }
            : { in: ids.includes('in') ? 'in' : null, out: ids.includes('out') ? 'out' : null };
          if (!sensor && !port.in && !port.out) throw new OpError(i, `${def.name} hat weder "in" noch "out".`);
          created.push({ c, port, then: it.then, sensor });
        }
        // Default media: supply AUL until the WRG / first treatment, then ZUL; extract ABL until the WRG (else the fan), then FOL.
        const inline = created.filter((x) => !x.sensor);
        const isHrc = (c: Component) => c.type.startsWith('air.hrc');
        const firstTreat = inline.findIndex(
          (x) => isHrc(x.c) || ['air.heater', 'air.cooler', 'air.fan', 'air.humidifier'].includes(x.c.type),
        );
        const hrcIdx = inline.findIndex((x) => isHrc(x.c));
        const fanIdx = inline.findIndex((x) => x.c.type === 'air.fan');
        const switchAt = op.strand === 'supply' ? firstTreat : hrcIdx >= 0 ? hrcIdx : fanIdx;
        const [m1, m2] = op.strand === 'supply' ? ['air.outdoor', 'air.supply'] : ['air.extract', 'air.exhaust'];
        let cur = switchAt < 0 || switchAt === -1 ? m2 : m1;
        if (switchAt === 0 && op.strand === 'supply') cur = m1;
        if (op.after) {
          const first = inline[0]!;
          if (!first.port.in) throw new OpError(i, `${first.c.id} hat keinen Eingang für "after".`);
          newConnection(i, ref(op.after), [first.c.id, first.port.in], cur);
        }
        for (let k = 0; k + 1 < inline.length; k++) {
          const a = inline[k]!,
            b = inline[k + 1]!;
          if (k === switchAt) cur = m2;
          if (a.then) cur = a.then;
          if (!a.port.out) throw new OpError(i, `${a.c.id} hat keinen Ausgang, die Kette geht nicht weiter.`);
          if (!b.port.in) throw new OpError(i, `${b.c.id} hat keinen Eingang.`);
          newConnection(i, [a.c.id, a.port.out], [b.c.id, b.port.in], cur);
        }
        // Sensors sit on the duct after the previous inline item: layout reserves room there.
        created.forEach((x, k) => {
          if (!x.sensor) return;
          const host = created
            .slice(0, k)
            .reverse()
            .find((y) => !y.sensor);
          if (host) (x.c as Component & { _after?: string })._after = host.c.id;
        });
        needLayout = true;
        relayout = relayout ?? { all: false };
        break;
      }
      case 'group': {
        for (const m of op.members) comp(i, m);
        const id = op.id ?? nextId(s, 'G');
        if (allIds(s).has(id)) throw new OpError(i, `ID "${id}" gibt es schon.`);
        s.groups.push({ id, label: op.label, members: op.members, frame: op.frame });
        added.push(id);
        break;
      }
      case 'add_note': {
        const a = op.anchor;
        if ('component' in a) comp(i, a.component);
        if ('connection' in a && !s.connections.some((c) => c.id === a.connection))
          throw new OpError(i, `Verbindung "${a.connection}" gibt es nicht.`);
        const id = op.id ?? nextId(s, 'N');
        if (allIds(s).has(id)) throw new OpError(i, `ID "${id}" gibt es schon.`);
        const note: Note = {
          id,
          anchor: a as Note['anchor'],
          text: op.text,
          status: 'open',
          created: new Date().toISOString().slice(0, 16),
          reply: null,
        };
        s.notes.push(note);
        added.push(id);
        break;
      }
      case 'resolve_note': {
        const n = s.notes.find((x) => x.id === op.id);
        if (!n) throw new OpError(i, `Anmerkung "${op.id}" gibt es nicht.`);
        n.status = 'done';
        if (op.reply !== undefined) n.reply = op.reply;
        changed.push(n.id);
        break;
      }
      case 'set_meta': {
        const { op: _o, size, orientation, ...meta } = op;
        s.meta = { ...s.meta, ...Object.fromEntries(Object.entries(meta).filter(([, v]) => v !== undefined)) };
        if (size) s.sheet.size = size;
        if (orientation) s.sheet.orientation = orientation;
        if (size || orientation) relayout = relayout ?? { all: false };
        changed.push('meta');
        break;
      }
      case 'relayout_unpinned':
        relayout = { all: op.all };
        break;
    }
  });

  let suggestion: string | null = null;
  if (relayout || needLayout) {
    // Sensors from chains: put them on their duct (layout reserves room after the host).
    const hosts = s.components.filter((c) => (c as Component & { _after?: string })._after);
    const extra: Record<string, number> = {};
    for (const h of hosts) {
      const host = (h as Component & { _after?: string })._after!;
      extra[host] = (extra[host] ?? 0) + 15;
    }
    if (relayout) {
      const r = autoLayout(s, { all: (relayout as { all: boolean }).all, extraAfter: extra });
      s = r.schema;
      suggestion = r.suggestion;
      placeSensors(s, hosts as (Component & { _after?: string })[]);
    } else s = placeMissing(s);
    for (const c of s.components) delete (c as Component & { _after?: string })._after;
  }
  return { schema: s, added, removed, changed, suggestion };
}

function placeSensors(s: Schema, hosts: (Component & { _after?: string })[]) {
  const byHost = new Map<string, (Component & { _after?: string })[]>();
  for (const h of hosts) byHost.set(h._after!, [...(byHost.get(h._after!) ?? []), h]);
  for (const [, list] of byHost) placeSensorGroup(s, list);
}

function placeSensorGroup(s: Schema, hosts: (Component & { _after?: string })[]) {
  for (const [k, h] of hosts.entries()) {
    const c = s.components.find((x) => x.id === h.id)!;
    const con = s.connections.find(
      (x) =>
        x.from[0] === h._after &&
        !findSymbol(s.components.find((y) => y.id === x.to[0])?.type ?? '')?.category.startsWith('control'),
    );
    if (!con) continue;
    const a = s.components.find((x) => x.id === con.from[0]),
      b = s.components.find((x) => x.id === con.to[0]);
    if (!a?.pos || !b?.pos) continue;
    const pa = portPlace(a, con.from[1]),
      pb = portPlace(b, con.to[1]);
    if (!pa || !pb) continue;
    const def = symbolOf(c.type);
    // The row line is the downstream port (a hanging terminal's port is off the row). Sensors share the gap evenly.
    const aOnRow = symbolOf(a.type).ports.length > 1;
    const y = aOnRow ? pa.at[1] : pb.at[1];
    const x0 = aOnRow ? pa.at[0] : a.pos[0];
    const bOnRow = symbolOf(b.type).ports.length > 1;
    const x1 = bOnRow ? pb.at[0] : b.pos[0];
    // From the host side: 12.5 mm after an inline host's port, 15 mm from a hanging terminal's centre, 15 mm apart.
    const dir = Math.sign(x1 - x0) || 1;
    const x = x0 + dir * ((aOnRow ? 12.5 : 15) + 15 * k);
    c.pos = snapVec([x, y - def.size[1] / 2], s.sheet.grid);
    c.rot = 0;
    c.flip = false;
  }
}
