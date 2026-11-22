// SPDX-License-Identifier: AGPL-3.0-or-later
// Setting a symbol into a line (Strang): from the palette (drag or click with a selected line) or by moving
// an unconnected component onto a line. One undo step.
import type { Schema, Vec } from '../model/types.ts';
import { useEditor } from './store.ts';
import { placeOnSegment } from './actions.ts';

/** Merges the last `n` undo steps into one. */
export function mergeLastSteps(label: string, n = 2) {
  useEditor.setState((s) => {
    const k = s.past.length;
    if (k < n) return s;
    const steps = s.past.slice(k - n);
    return {
      past: [
        ...s.past.slice(0, k - n),
        {
          label,
          redo: steps.flatMap((x) => x.redo),
          undo: [...steps].reverse().flatMap((x) => x.undo),
        },
      ],
    };
  });
}

/**
 * Inserts a new component (type, variant) into line `conId` at point p of segment a–b, or an existing
 * unconnected component `existing` (moved there). `placed`: the schema with auto positions filled in.
 * Returns the new component's ID, or null if the symbol does not fit into a line.
 */
export function insertIntoLine(
  placed: Schema,
  conId: string,
  seg: { a: Vec; b: Vec },
  p: Vec,
  what: { type: string; variant?: string; existing?: string },
): string | null {
  const st = useEditor.getState();
  const place = placeOnSegment(what.type, seg.a, seg.b, p, placed.sheet.grid, what.variant ?? '');
  if (!place) return null;
  const n0 = st.past.length;
  // Auto-placed positions (and a moved component) become part of the file in the same step.
  let base = placed;
  if (what.existing)
    base = {
      ...placed,
      components: placed.components.map((c) =>
        c.id === what.existing ? { ...c, pos: place.pos, rot: place.rot, flip: place.flip, pinned: true } : c,
      ),
    };
  st.commit('Einsetzen', base);
  const res = useEditor.getState().ops(
    'Einsetzen',
    what.existing
      ? [{ op: 'insert_into_connection', connection: conId, id: what.existing, in: 'in', out: 'out' }]
      : [
          {
            op: 'insert_into_connection',
            connection: conId,
            type: what.type,
            ...(what.variant ? { variant: what.variant } : {}),
            pos: place.pos,
            rot: place.rot,
            flip: place.flip,
            in: 'in',
            out: 'out',
          },
        ],
  );
  const steps = useEditor.getState().past.length - n0;
  if (res && steps > 1) mergeLastSteps('In Leitung einsetzen', steps);
  if (!res) return null;
  const id =
    what.existing ?? res.added.find((x) => useEditor.getState().doc.components.some((c) => c.id === x)) ?? null;
  if (id) useEditor.getState().select([id]);
  return id;
}
