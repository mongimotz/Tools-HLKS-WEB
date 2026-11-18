// SPDX-License-Identifier: AGPL-3.0-or-later
// zod schema of the file. Shared by editor, CLI and assistant. Missing optional fields get their defaults,
// so hand-written files (e.g. by an agent) may omit them.
import { z } from 'zod';
import type { Schema } from './types.ts';

export const FORMAT = 'hlks-schema';
export const VERSION = 1;

const num = z.number().finite();
const vec = z.tuple([num, num]);
const id = z
  .string()
  .regex(/^[A-Za-z0-9_.-]+$/, 'ID: nur Buchstaben, Ziffern, _ . -')
  .min(1);

const meta = z.object({
  title: z.string().default(''),
  project: z.string().default(''),
  author: z.string().default(''),
  date: z.string().default(''),
  revision: z.string().default(''),
});

const sheet = z.object({
  size: z.enum(['A4', 'A3', 'A2', 'A1']).default('A3'),
  orientation: z.enum(['landscape', 'portrait']).default('landscape'),
  grid: num.positive().default(2.5),
  titleBlock: z.string().default('default'),
  legend: z.boolean().default(true),
});

const component = z.object({
  id,
  type: z.string().min(1),
  label: z.string().optional(),
  props: z.record(z.string(), z.union([z.string(), num]).transform(String)).default({}),
  pos: vec.nullable().default(null),
  rot: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).default(0),
  flip: z.boolean().default(false),
  pinned: z.boolean().default(false),
});

const portRef = z.tuple([id, z.string().min(1)]);

const connection = z.object({
  id,
  from: portRef,
  to: portRef,
  medium: z.string().min(1),
  waypoints: z.array(vec).default([]),
  pinned: z.boolean().default(false),
});

const group = z.object({
  id,
  label: z.string().default(''),
  members: z.array(id).default([]),
  frame: z.boolean().default(true),
});

const text = z.object({ id, pos: vec, text: z.string(), size: num.positive().default(3.5) });

const anchor = z.union([
  z.object({ component: id }).strict(),
  z.object({ connection: id }).strict(),
  z.object({ pos: vec }).strict(),
]);

const note = z.object({
  id,
  anchor,
  text: z.string(),
  status: z.enum(['open', 'done']).default('open'),
  created: z.string().default(''),
  reply: z.string().nullable().default(null),
});

export const schemaV1 = z.object({
  format: z.literal(FORMAT),
  version: z.literal(VERSION),
  meta: meta.default({ title: '', project: '', author: '', date: '', revision: '' }),
  sheet: sheet.default({ size: 'A3', orientation: 'landscape', grid: 2.5, titleBlock: 'default', legend: true }),
  style: z.string().default('default'),
  components: z.array(component).default([]),
  connections: z.array(connection).default([]),
  groups: z.array(group).default([]),
  texts: z.array(text).default([]),
  notes: z.array(note).default([]),
});

export class SchemaError extends Error {
  constructor(
    message: string,
    public readonly issues: { path: string; message: string }[] = [],
  ) {
    super(message);
  }
}

/** Parses an already migrated object. Throws SchemaError with JSON paths. */
export function parseSchema(raw: unknown): Schema {
  const r = schemaV1.safeParse(raw);
  if (!r.success) {
    const issues = r.error.issues.map((i) => ({ path: formatPath(i.path), message: i.message }));
    throw new SchemaError(`Ungültige Datei: ${issues.map((i) => `${i.path}: ${i.message}`).join('; ')}`, issues);
  }
  const s = r.data;
  return {
    ...s,
    components: s.components.map((c) => ({ ...c, label: c.label ?? c.id })),
  } as Schema;
}

export function formatPath(path: readonly PropertyKey[]): string {
  let out = '';
  for (const p of path) out += typeof p === 'number' ? `[${p}]` : out ? `.${String(p)}` : String(p);
  return out || '(Datei)';
}
