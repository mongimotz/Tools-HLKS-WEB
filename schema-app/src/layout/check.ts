// SPDX-License-Identifier: AGPL-3.0-or-later
// Drawing checks on a rendered schema: overlapping texts, texts on symbols, lines through symbols,
// content outside the drawing area. Used by `cli validate`, the editor's notice list and the example tests.
import type { Issue, Schema } from '../model/types.ts';
import { boxesOverlap, componentBox, isBackground, obstacleBox, type Box } from '../model/geometry.ts';
import { frameBox, titleBlockBox } from '../model/sheet.ts';
import type { RenderResult } from '../render/render.ts';

const shrink = (b: Box, d: number): Box => ({ x: b.x + d, y: b.y + d, w: b.w - 2 * d, h: b.h - 2 * d });

function segHitsBox(a: [number, number], b: [number, number], box: Box): boolean {
  const x0 = Math.min(a[0], b[0]),
    x1 = Math.max(a[0], b[0]),
    y0 = Math.min(a[1], b[1]),
    y1 = Math.max(a[1], b[1]);
  return x1 > box.x && x0 < box.x + box.w && y1 > box.y && y0 < box.y + box.h;
}

export function checkDrawing(r: RenderResult): Issue[] {
  const s: Schema = r.placed;
  const issues: Issue[] = [];
  const add = (code: string, message: string, ids: string[]) =>
    issues.push({ severity: 'warning', code, path: 'Zeichnung', message, ids });
  const comps = s.components.filter((c) => c.pos && !isBackground(c));
  const texts = r.textBoxes;

  for (let i = 0; i < texts.length; i++)
    for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i]!,
        b = texts[j]!;
      if (a.id === b.id) continue;
      if (boxesOverlap(shrink(a.box, 0.15), shrink(b.box, 0.15)))
        add('text-overlap', `Texte «${a.text}» (${a.id}) und «${b.text}» (${b.id}) überlappen.`, [a.id, b.id]);
    }

  for (const t of texts)
    for (const c of comps) {
      if (c.id === t.id || c.type === 'junction') continue;
      if (boxesOverlap(shrink(t.box, 0.15), shrink(obstacleBox(c), 0.2)))
        add('text-on-symbol', `Text «${t.text}» (${t.id}) liegt auf ${c.id}.`, [t.id, c.id]);
    }

  for (const con of s.connections) {
    const pts = r.routes.get(con.id);
    if (!pts) continue;
    for (const c of comps) {
      if (c.id === con.from[0] || c.id === con.to[0] || c.type === 'junction') continue;
      const box = shrink(obstacleBox(c), 0.3);
      for (let k = 1; k < pts.length; k++)
        if (segHitsBox(pts[k - 1]!, pts[k]!, box)) {
          add('line-through-symbol', `Leitung ${con.id} läuft durch ${c.id}.`, [con.id, c.id]);
          break;
        }
    }
  }

  // Group frames must not cut through other symbols.
  for (const g of r.groupBoxes) {
    const members = s.groups.find((x) => x.id === g.id)?.members ?? [];
    const edges: Box[] = [
      { x: g.box.x, y: g.box.y, w: g.box.w, h: 0.01 },
      { x: g.box.x, y: g.box.y + g.box.h, w: g.box.w, h: 0.01 },
      { x: g.box.x, y: g.box.y, w: 0.01, h: g.box.h },
      { x: g.box.x + g.box.w, y: g.box.y, w: 0.01, h: g.box.h },
    ];
    for (const c of comps) {
      if (members.includes(c.id) || c.type === 'junction') continue;
      const b = shrink(obstacleBox(c), 0.2);
      if (edges.some((e) => boxesOverlap(e, b)))
        add('frame-through-symbol', `Rahmen ${g.id} schneidet ${c.id}.`, [g.id, c.id]);
    }
  }

  const fr = frameBox(s.sheet),
    tb = titleBlockBox(s.sheet);
  const inside = (b: Box) => b.x >= fr.x && b.y >= fr.y && b.x + b.w <= fr.x + fr.w && b.y + b.h <= fr.y + fr.h;
  for (const c of s.components.filter((x) => x.pos)) {
    const b = componentBox(c);
    if (!inside(b)) add('outside', `${c.id} liegt ausserhalb des Zeichenfelds.`, [c.id]);
    else if (boxesOverlap(b, tb)) add('on-title-block', `${c.id} liegt auf dem Schriftfeld.`, [c.id]);
  }
  for (const t of texts)
    if (!inside(t.box))
      add('text-outside', `Text «${t.text}» (${t.id}) ist abgeschnitten (ausserhalb des Zeichenfelds).`, [t.id]);
  for (const id of r.failedRoutes) add('route-failed', `Verbindung ${id}: kein freier Weg gefunden.`, [id]);
  return issues;
}
