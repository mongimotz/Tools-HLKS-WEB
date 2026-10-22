// SPDX-License-Identifier: AGPL-3.0-or-later
// SVG markup of the diagram (chart.js items) and of the process overlay. Strings only, no DOM, so the
// overlay model is shared with the PDF report.

import { esc } from '../../lib/core/ui.js';

const STYLES = ['fine', 'norm', 'bold', 'dash'];

/** The empty diagram: one path per line style, then the labels. */
export function chartSvg(chart) {
  const paths = Object.fromEntries(STYLES.map((s) => [s, []]));
  const texts = [];
  for (const it of chart.items) {
    if (it.k === 'line') paths[it.s].push(`M${it.a[0]} ${it.a[1]}L${it.b[0]} ${it.b[1]}`);
    else if (it.k === 'poly') paths[it.s].push(`M${it.pts.map((q) => `${q[0]} ${q[1]}`).join('L')}`);
    else texts.push(textSvg(it));
  }
  return `<g class="hx-lines">${STYLES.map((s) => `<path class="hx-${s}" d="${paths[s].join('')}"/>`).join('')}</g><g class="hx-labels">${texts.join('')}</g>`;
}

const BASELINE = { top: 'hanging', middle: 'central', bottom: 'alphabetic' };

function textSvg(it) {
  const [x, y] = it.at;
  const rot = it.angle ? ` transform="rotate(${Math.round(it.angle * 100) / 100} ${x} ${y})"` : '';
  const cls = it.knock ? ' class="knock"' : '';
  return `<text x="${x}" y="${y}" font-size="${Math.round(it.size * 100) / 100}" text-anchor="${it.anchor}" dominant-baseline="${BASELINE[it.base]}"${rot}${cls}>${esc(it.text)}</text>`;
}

// ---- overlay ---------------------------------------------------------------------------------

/** Colour of a process line: heating, cooling, humidifying, or neutral (mixing, connection). */
const TONES = { heater: 'heat', fan: 'heat', cooler: 'cool', steam: 'humid', adiabatic: 'humid' };
const warmer = (a, b) => (b.t > a.t ? 'heat' : 'cool');

/**
 * Overlay model of one calculation result, in states (x, h): segments and points.
 * segments: { path: [{ x, h }…], kind: 'arrow' | 'mix' | 'line', tone, blockId };
 * points: { id, blockId, x, h, label, given, tone }.
 */
export function overlayOf(result, blocks) {
  const segments = [];
  const tones = new Map();
  const at = (id) => result.points.get(id)?.state ?? null;
  const xh = (s) => ({ x: s.x, h: s.h });
  for (const b of blocks) {
    const r = result.blocks.get(b.id);
    if (!r) continue;
    if (b.type === 'point') continue;
    const a = at(b.from);
    if (b.type === 'line') {
      const c = at(b.to);
      if (a && c) segments.push({ path: [xh(a), xh(c)], kind: 'line', tone: 'neutral', blockId: b.id });
      continue;
    }
    const out = at(b.id);
    if (!a || !out) continue;
    if (b.type === 'mix') {
      const c = at(b.to);
      if (c) segments.push({ path: [xh(a), xh(c)], kind: 'mix', tone: 'neutral', blockId: b.id });
      tones.set(b.id, 'neutral');
      continue;
    }
    const tone = TONES[b.type] ?? warmer(a, out);
    segments.push({ path: [xh(a), xh(out)], kind: 'arrow', tone, blockId: b.id });
    tones.set(b.id, tone);
    if (b.type === 'hrv') {
      const e = at(b.to);
      const f = at(`${b.id}.b`);
      if (e && f) {
        const back = warmer(e, f);
        segments.push({ path: r.values.path ?? [xh(e), xh(f)], kind: 'arrow', tone: back, blockId: b.id });
        tones.set(`${b.id}.b`, back);
      }
    }
  }
  const points = [];
  for (const pt of result.points.values()) {
    if (pt.state) points.push({ id: pt.id, blockId: pt.blockId, x: pt.state.x, h: pt.state.h, label: pt.label, given: pt.given, tone: tones.get(pt.id) ?? 'neutral' });
  }
  return { segments, points };
}

/**
 * Label position of every overlay point (sheet units): the first corner around the point where the label
 * covers neither another label nor a point. { x, y, anchor, base } per point. Sizes relative to the label font.
 */
export function placeLabels(points, map) {
  const f = map.font * 1.06;
  const gap = 0.45 * f;
  const dots = points.map((q) => map.ph(q.x, q.h));
  const boxes = dots.map(([x, y]) => [x - 0.4 * f, y - 0.4 * f, x + 0.4 * f, y + 0.4 * f]);
  const hits = (box) => boxes.some((b) => b[0] < box[2] && box[0] < b[2] && b[1] < box[3] && box[1] < b[3]);
  return points.map((q, i) => {
    const [x, y] = dots[i];
    const w = 0.66 * f * [...q.label].length + 0.2 * f;
    const h = 1.05 * f;
    const options = [[1, -1], [1, 1], [-1, -1], [-1, 1]].map(([sx, sy]) => {
      const bx = sx > 0 ? x + gap : x - gap - w;
      const by = sy < 0 ? y - gap - h : y + gap;
      return { sx, sy, box: [bx, by, bx + w, by + h] };
    });
    const pick = options.find((o) => !hits(o.box)) ?? options[0];
    boxes.push(pick.box);
    return { x: x + gap * pick.sx, y: y + gap * pick.sy, anchor: pick.sx > 0 ? 'start' : 'end', base: pick.sy < 0 ? 'bottom' : 'top' };
  });
}

/** Overlay as SVG in sheet coordinates; `selected` is a block id. */
export function overlaySvg(overlay, map, selected) {
  const sel = (id) => (id === selected ? ' is-selected' : '');
  const pos = (s) => map.ph(s.x, s.h).map((v) => Math.round(v * 100) / 100);
  const segs = overlay.segments.map((s) => {
    const d = `M${s.path.map((q) => pos(q).join(' ')).join('L')}`;
    const marker = s.kind === 'arrow' ? ` marker-end="url(#hx-arrow-${s.tone})"` : '';
    return `<path class="hx-seg hx-${s.kind} tone-${s.tone}${sel(s.blockId)}" data-block="${esc(s.blockId)}" d="${d}"${marker}/>`;
  });
  const labels = placeLabels(overlay.points, map);
  const pts = overlay.points.map((q, i) => {
    const [x, y] = pos(q);
    const l = labels[i];
    return `<g class="hx-pt tone-${q.tone}${q.given ? ' is-given' : ''}${sel(q.blockId)}" data-point="${esc(q.id)}" data-block="${esc(q.blockId)}" tabindex="${q.given ? 0 : -1}">`
      + `<circle class="hx-hit" cx="${x}" cy="${y}" r="${(map.font * 1.1).toFixed(2)}"/><circle class="hx-dot" cx="${x}" cy="${y}" r="${(map.font * 0.36).toFixed(2)}"/>`
      + `<text class="knock" x="${l.x.toFixed(2)}" y="${l.y.toFixed(2)}" text-anchor="${l.anchor}" dominant-baseline="${BASELINE[l.base]}" font-size="${(map.font * 1.06).toFixed(2)}">${esc(q.label)}</text></g>`;
  });
  return `<g class="hx-overlay">${segs.join('')}${pts.join('')}</g>`;
}

export const TONE_NAMES = ['heat', 'cool', 'humid', 'neutral'];

/** Arrow heads (one per tone) and the clip of the plot frame. */
export function defsSvg(map) {
  const frame = map.frame().map((q) => q.map((v) => Math.round(v * 100) / 100).join(' ')).join(' ');
  const arrows = TONE_NAMES.map((t) => `<marker id="hx-arrow-${t}" class="tone-${t}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse" markerUnits="strokeWidth"><path d="M0 1L10 5L0 9z"/></marker>`);
  return `<defs>${arrows.join('')}`
    + `<clipPath id="hx-clip"><polygon points="${frame}"/></clipPath></defs>`;
}
