// SPDX-License-Identifier: AGPL-3.0-or-later
// Note anchors: where a note's pin sits, and keeping notes when their anchor is deleted.
import type { Note, Schema, Vec } from './types.ts';
import { componentBox, portPlace, snapVec } from './geometry.ts';

/** Pin tip of a note anchored to a component: top right corner of its box. */
export function componentPinAt(s: Schema, id: string): Vec | null {
  const c = s.components.find((x) => x.id === id);
  if (!c?.pos) return null;
  const b = componentBox(c);
  return [b.x + b.w, b.y];
}

/** Midpoint between the two ports of a connection (used when no route is known). */
export function connectionMidpoint(s: Schema, id: string): Vec | null {
  const con = s.connections.find((x) => x.id === id);
  if (!con) return null;
  const ends = [con.from, con.to].map(([cid, pid]) => {
    const c = s.components.find((x) => x.id === cid);
    return c?.pos ? portPlace(c, pid)?.at : undefined;
  });
  if (!ends[0] || !ends[1]) return null;
  return [(ends[0][0] + ends[1][0]) / 2, (ends[0][1] + ends[1][1]) / 2];
}

/**
 * Notes whose component or connection is removed become free notes at the old spot, so review
 * comments are not lost. `s` is the schema before the removal, with positions filled in.
 */
export function detachNotes(s: Schema, removed: Set<string>): Note[] {
  return s.notes.map((n) => {
    const a = n.anchor;
    const id = 'component' in a ? a.component : 'connection' in a ? a.connection : null;
    if (!id || !removed.has(id)) return n;
    const at = 'component' in a ? componentPinAt(s, id) : connectionMidpoint(s, id);
    return { ...n, anchor: { pos: snapVec(at ?? [10, 10], s.sheet.grid) } };
  });
}
