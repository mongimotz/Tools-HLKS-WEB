// SPDX-License-Identifier: AGPL-3.0-or-later
// Stable, diff-friendly JSON: fixed key order, 2-space indent, short arrays and small objects on one line.
import type { Schema } from './types.ts';

const ORDER: Record<string, string[]> = {
  root: ['format', 'version', 'meta', 'sheet', 'style', 'components', 'connections', 'groups', 'texts', 'notes'],
  meta: ['title', 'project', 'author', 'date', 'revision'],
  sheet: ['size', 'orientation', 'grid', 'titleBlock', 'legend'],
  component: ['id', 'type', 'label', 'props', 'pos', 'rot', 'flip', 'pinned'],
  connection: ['id', 'from', 'to', 'medium', 'waypoints', 'pinned'],
  group: ['id', 'label', 'members', 'frame'],
  text: ['id', 'pos', 'text', 'size'],
  note: ['id', 'anchor', 'text', 'status', 'created', 'reply'],
};

function ordered(obj: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (k in obj && obj[k] !== undefined) out[k] = obj[k];
  for (const k of Object.keys(obj).sort()) if (!(k in out) && obj[k] !== undefined) out[k] = obj[k];
  return out;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

function normaliseNumbers(v: unknown): unknown {
  if (typeof v === 'number') return round(v);
  if (Array.isArray(v)) return v.map(normaliseNumbers);
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) o[k] = normaliseNumbers(x);
    return o;
  }
  return v;
}

const INLINE_MAX = 220;

function inline(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(inline).join(', ')}]`;
  const e = Object.entries(v as Record<string, unknown>);
  return e.length ? `{ ${e.map(([k, x]) => `${JSON.stringify(k)}: ${inline(x)}`).join(', ')} }` : '{}';
}

function fmt(v: unknown, indent: string, depth: number): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  const one = inline(v);
  // Elements of top-level arrays (one component per line) and anything deeper stay on one line if short.
  if (depth >= 2 && one.length + indent.length <= INLINE_MAX) return one;
  const next = indent + '  ';
  if (Array.isArray(v)) {
    if (v.length === 0) return '[]';
    if (v.every((x) => x === null || typeof x !== 'object')) return one;
    return `[\n${v.map((x) => next + fmt(x, next, depth + 1)).join(',\n')}\n${indent}]`;
  }
  const entries = Object.entries(v as Record<string, unknown>);
  if (entries.length === 0) return '{}';
  return `{\n${entries.map(([k, x]) => `${next}${JSON.stringify(k)}: ${fmt(x, next, depth + 1)}`).join(',\n')}\n${indent}}`;
}

export function toPlain(s: Schema): Record<string, unknown> {
  return ordered(
    {
      ...s,
      meta: ordered(s.meta as never, ORDER.meta!),
      sheet: ordered(s.sheet as never, ORDER.sheet!),
      components: s.components.map((c) => ordered({ ...c, props: ordered(c.props, []) } as never, ORDER.component!)),
      connections: s.connections.map((c) => ordered(c as never, ORDER.connection!)),
      groups: s.groups.map((g) => ordered(g as never, ORDER.group!)),
      texts: s.texts.map((t) => ordered(t as never, ORDER.text!)),
      notes: s.notes.map((n) => ordered(n as never, ORDER.note!)),
    } as never,
    ORDER.root!,
  );
}

export function serialize(s: Schema): string {
  return fmt(normaliseNumbers(toPlain(s)), '', 0) + '\n';
}
