// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Component, Connection, Schema } from '../../src/model/types.ts';
import { emptySchema } from '../../src/model/create.ts';

export function comp(
  id: string,
  type: string,
  pos: [number, number] | null = null,
  extra: Partial<Component> = {},
): Component {
  return { id, type, label: id, props: {}, pos, rot: 0, flip: false, pinned: false, ...extra };
}

export function con(
  id: string,
  from: [string, string],
  to: [string, string],
  medium = 'air.supply',
  extra: Partial<Connection> = {},
): Connection {
  return { id, from, to, medium, waypoints: [], pinned: false, ...extra };
}

export function schema(parts: Partial<Schema> = {}): Schema {
  return { ...emptySchema('Test', '2026-11-18'), ...parts };
}
