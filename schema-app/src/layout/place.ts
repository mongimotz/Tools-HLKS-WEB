// SPDX-License-Identifier: AGPL-3.0-or-later
// Incremental placement: components without `pos` get a free spot next to a placed neighbour (in the
// direction of the connecting port), else the first free spot in the drawing area. Placed ones never move.
import type { Component, Schema, Vec } from '../model/types.ts';
import { DIR_VEC, boxesOverlap, componentBox, isBackground, portPlace, snapVec, type Box } from '../model/geometry.ts';
import { drawingArea } from '../model/sheet.ts';
import { DEFAULT_STYLE, type Style } from '../render/style.ts';

function inside(b: Box, area: Box): boolean {
  return b.x >= area.x && b.y >= area.y && b.x + b.w <= area.x + area.w && b.y + b.h <= area.y + area.h;
}

export function placeMissing(s: Schema, style: Style = DEFAULT_STYLE): Schema {
  if (s.components.every((c) => c.pos)) return s;
  const area = drawingArea(s.sheet);
  const g = s.sheet.grid;
  const comps: Component[] = s.components.map((c) => ({ ...c }));
  const byId = new Map(comps.map((c) => [c.id, c]));
  const placedBoxes = (): Box[] =>
    comps.filter((c) => c.pos && c.type !== 'junction' && !isBackground(c)).map(componentBox);
  const free = (c: Component, pos: Vec) => {
    const b = componentBox({ ...c, pos });
    return inside(b, area) && !placedBoxes().some((o) => boxesOverlap(b, o, style.layout.minGap - 0.01));
  };

  let progress = true;
  while (progress) {
    progress = false;
    for (const c of comps) {
      if (c.pos) continue;
      // Neighbour through a connection, preferring the port direction of the placed side.
      for (const con of s.connections) {
        const mine = con.from[0] === c.id ? 'from' : con.to[0] === c.id ? 'to' : null;
        if (!mine) continue;
        const other = byId.get(con[mine === 'from' ? 'to' : 'from'][0]);
        if (!other?.pos) continue;
        const op = portPlace(other, con[mine === 'from' ? 'to' : 'from'][1]);
        if (!op) continue;
        const v = DIR_VEC[op.dir];
        const ob = componentBox(other);
        const self = componentBox({ ...c, pos: [0, 0] });
        for (let k = 0; k < 30 && !c.pos; k++) {
          const dist = style.layout.gap + k * g;
          const base: Vec = [
            op.at[0] + v[0] * (dist + self.w / 2),
            v[1] === 0 ? op.at[1] : op.at[1] + v[1] * (dist + self.h / 2),
          ];
          if (v[0] === 0) base[0] = op.at[0];
          void ob;
          const p = snapVec(base, g);
          if (free(c, p)) c.pos = p;
        }
        if (c.pos) break;
      }
      if (c.pos) {
        progress = true;
        continue;
      }
    }
    if (!progress) {
      const c = comps.find((x) => !x.pos);
      if (!c) break;
      // Scan the drawing area row by row.
      outer: for (let y = area.y + 10; y < area.y + area.h; y += 5 * g)
        for (let x = area.x + 10; x < area.x + area.w; x += 2 * g) {
          const p = snapVec([x, y], g);
          if (free(c, p)) {
            c.pos = p;
            break outer;
          }
        }
      if (!c.pos) c.pos = snapVec([area.x + area.w / 2, area.y + area.h / 2], g);
      progress = true;
    }
  }
  return { ...s, components: comps };
}
