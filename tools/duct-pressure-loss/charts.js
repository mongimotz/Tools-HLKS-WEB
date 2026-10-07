// SVG charts for the duct tool: pressure profile along the critical path and the network schematic.

import { fmt } from '../../lib/core/format.js';
import { branchLevel } from './calc.js';
import { esc } from '../../lib/core/ui.js';

function niceMax(v) {
  if (!(v > 0)) return 10;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * exp >= v) return m * exp;
  return 10 * exp;
}

function ticks(max, count = 5) {
  const step = niceMax(max / count);
  const out = [];
  for (let v = 0; v <= max + 1e-9; v += step) out.push(v);
  return out;
}

const label = (nrOf, id) => nrOf(id) || '?';

// ---- pressure profile ---------------------------------------------------------------

/**
 * Cumulative pressure along the critical path. Friction rises linearly over the length,
 * fittings and components are drawn as a step at the end of each section.
 */
export function renderProfile(el, result, inputs, nrOf) {
  const path = result.path.map((id) => result.sections.get(id));
  if (!path.length || result.totals.critical <= 0) {
    el.innerHTML = '';
    return;
  }
  const W = Math.max(320, el.clientWidth || 640);
  const H = 260;
  const m = { top: 26, right: 18, bottom: 40, left: 52 };
  const iw = W - m.left - m.right;
  const ih = H - m.top - m.bottom;

  const useLength = result.totals.length > 0;
  // x position of each section start/end (metres, or index if no lengths are given)
  let x = 0;
  const segs = path.map((r, i) => {
    const len = useLength ? (r.status === 'ok' ? r.length : 0) : 1;
    const seg = { r, i, x0: x, x1: x + len };
    x += len;
    return seg;
  });
  const xMax = x || 1;

  const available = result.totals.available;
  const showAvailable = available != null && available <= result.totals.required * 3;
  const yMax = niceMax(Math.max(result.totals.required, showAvailable ? available : 0) * 1.05);
  const sx = (v) => m.left + (v / xMax) * iw;
  const sy = (v) => m.top + ih - (v / yMax) * ih;

  // polyline points
  const pts = [[0, 0]];
  let base = 0;
  for (const s of segs) {
    const r = s.r;
    pts.push([s.x1, base + r.dpFriction]);
    pts.push([s.x1, base + r.dp]);
    base += r.dp;
  }
  const line = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${sx(px).toFixed(1)},${sy(py).toFixed(1)}`).join('');
  const area = `${line}L${sx(xMax).toFixed(1)},${sy(0)}L${sx(0)},${sy(0)}Z`;

  let svg = `<svg class="profile" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Druckverlauf im kritischen Strang, total ${fmt(result.totals.critical, 0)} Pa">`;
  // grid + y labels
  for (const t of ticks(yMax)) {
    svg += `<line class="grid" x1="${m.left}" x2="${W - m.right}" y1="${sy(t)}" y2="${sy(t)}"/>`;
    svg += `<text class="tick" x="${m.left - 8}" y="${sy(t) + 4}" text-anchor="end">${fmt(t, 0)}</text>`;
  }
  svg += `<text class="axis-title" x="${m.left - 8}" y="${m.top - 14}" text-anchor="end">Pa</text>`;
  // section boundaries + labels
  let lastLabelX = -Infinity;
  for (const s of segs) {
    const xm = sx((s.x0 + s.x1) / 2);
    svg += `<line class="boundary" x1="${sx(s.x1)}" x2="${sx(s.x1)}" y1="${m.top}" y2="${sy(0)}"/>`;
    if (xm - lastLabelX > 26) {
      svg += `<text class="tick" x="${xm}" y="${sy(0) + 16}" text-anchor="middle">${esc(label(nrOf, s.r.id))}</text>`;
      lastLabelX = xm;
    }
  }
  if (useLength) svg += `<text class="axis-title" x="${sx(xMax)}" y="${sy(0) + 32}" text-anchor="end">${fmt(xMax, 0)} m</text>`;
  // reference line: available pressure
  if (showAvailable) {
    svg += `<line class="ref" x1="${m.left}" x2="${W - m.right}" y1="${sy(available)}" y2="${sy(available)}"/>`;
    svg += `<text class="ref-label" x="${W - m.right}" y="${sy(available) - 6}" text-anchor="end">verfügbar ${fmt(available, 0)} Pa</text>`;
  }
  if (result.totals.margin > 0) {
    svg += `<line class="ref ref-required" x1="${m.left}" x2="${W - m.right}" y1="${sy(result.totals.required)}" y2="${sy(result.totals.required)}"/>`;
    svg += `<text class="ref-label" x="${m.left + 6}" y="${sy(result.totals.required) - 6}">mit Zuschlag ${fmt(result.totals.required, 0)} Pa</text>`;
  }
  svg += `<line class="axis" x1="${m.left}" x2="${W - m.right}" y1="${sy(0)}" y2="${sy(0)}"/>`;
  svg += `<path class="area" d="${area}"/><path class="line" d="${line}"/>`;
  svg += `<circle class="end-dot" cx="${sx(xMax)}" cy="${sy(result.totals.critical)}" r="4"/>`;
  svg += `<text class="end-label" x="${sx(xMax) - 8}" y="${sy(result.totals.critical) - 9}" text-anchor="end">${fmt(result.totals.critical, 0)} Pa</text>`;
  // hover layer
  svg += `<line class="crosshair" x1="0" x2="0" y1="${m.top}" y2="${sy(0)}" visibility="hidden"/>`;
  for (const s of segs) {
    svg += `<rect class="hit" data-i="${s.i}" x="${sx(s.x0)}" y="${m.top}" width="${Math.max(2, sx(s.x1) - sx(s.x0))}" height="${ih}"/>`;
  }
  svg += '</svg><div class="tooltip" hidden></div>';
  el.innerHTML = svg;

  const tip = el.querySelector('.tooltip');
  const cross = el.querySelector('.crosshair');
  const show = (i) => {
    const s = segs[i];
    const r = s.r;
    const cx = sx(s.x1);
    cross.setAttribute('x1', cx);
    cross.setAttribute('x2', cx);
    cross.setAttribute('visibility', 'visible');
    tip.innerHTML = `<strong>Teilstrecke ${esc(label(nrOf, r.id))}</strong>
      <span>Reibung</span><span class="num">${fmt(r.dpFriction, 1)} Pa</span>
      <span>Formstücke</span><span class="num">${fmt(r.dpFittings, 1)} Pa</span>
      <span>Einbauteile</span><span class="num">${fmt(r.dpComponents, 1)} Pa</span>
      <span>kumuliert</span><span class="num">${fmt(r.cum, 1)} Pa</span>`;
    tip.hidden = false;
    const left = Math.min(Math.max(cx + 12, 0), W - 190);
    tip.style.left = `${cx + 200 > W ? cx - 200 : left}px`;
    tip.style.top = `${m.top}px`;
  };
  el.querySelectorAll('.hit').forEach((h) => {
    h.addEventListener('pointerenter', () => show(Number(h.dataset.i)));
  });
  el.querySelector('svg').addEventListener('pointerleave', () => {
    tip.hidden = true;
    cross.setAttribute('visibility', 'hidden');
  });
}

// ---- network schematic ----------------------------------------------------------------

/**
 * Orthogonal duct schematic. The child with the parent's branch level (3 after 2, 2.2 after 2.1)
 * continues straight, branches (2.1 after 2) go below. Line width follows the volume flow.
 */
export function renderNetwork(el, result, inputs, nrOf, onSelect) {
  const ids = result.order;
  if (!ids.length) {
    el.innerHTML = '';
    return;
  }
  const res = result.sections;
  const segW = 132;
  const rowH = 58;
  const x0 = 46;
  const top = 34;

  // rows: depth-first, the continuation keeps the parent's row
  const row = new Map();
  let nextRow = 0;
  const roots = ids.filter((id) => !res.get(id).parent);
  const level = (id) => branchLevel(nrOf(id));
  const place = (id, r) => {
    row.set(id, r);
    const kids = [...res.get(id).children].sort((a, b) => (level(a) > level(id)) - (level(b) > level(id)));
    kids.forEach((c, i) => place(c, i === 0 ? r : ++nextRow));
  };
  roots.forEach((id, i) => place(id, i === 0 ? 0 : ++nextRow));
  const rows = nextRow + 1;
  const maxDepth = Math.max(...ids.map((id) => res.get(id).depth));
  const W = x0 + (maxDepth + 1) * segW + 120;
  const H = top + rows * rowH;
  const maxFlow = Math.max(1, ...ids.map((id) => res.get(id).flow || 0));
  const xs = (d) => x0 + d * segW;
  const ys = (r) => top + r * rowH;
  const width = (r) => 2 + 9 * Math.sqrt((r.flow || 0) / maxFlow);
  // a section runs from its parent's end node (or the fan) to its own end node
  const startX = (r) => (r.depth === 0 ? x0 - 13 : xs(r.depth) - 10);
  const endX = (r) => xs(r.depth + 1) - 10;

  let svg = `<svg class="network" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Strangschema">`;
  // fan symbol at the start
  const fy = ys(0);
  svg += `<g class="fan" transform="translate(${x0 - 26},${fy})"><circle r="13"/><path d="M-7,-7.5 L9,0 L-7,7.5"/></g>`;

  // Children first, so a parent duct covers the start of its branches. A branch is one path
  // (down from the parent's end node, then along its row), which gives a clean corner.
  for (const id of [...ids].reverse()) {
    const r = res.get(id);
    const y = ys(row.get(id));
    const parentRow = r.parent ? row.get(r.parent) : 0;
    const xa = startX(r);
    const xb = endX(r);
    const cls = `duct ${r.critical ? 'is-critical' : ''} ${r.status !== 'ok' ? 'is-incomplete' : ''}`;
    const d = row.get(id) !== parentRow ? `M${xa},${ys(parentRow)} V${y} H${xb}` : `M${xa},${y} H${xb}`;
    svg += `<g class="seg" data-id="${esc(id)}" tabindex="0" role="button" aria-label="Teilstrecke ${esc(label(nrOf, id))} öffnen">`;
    svg += `<path class="${cls}" stroke-width="${width(r)}" d="${d}"/>`;
    svg += `<circle class="node ${r.critical ? 'is-critical' : ''}" cx="${xb}" cy="${y}" r="3.5"/>`;
    svg += `<text class="seg-nr" x="${(xa + xb) / 2}" y="${y - 10}" text-anchor="middle">${esc(label(nrOf, id))}</text>`;
    svg += `<text class="seg-val" x="${(xa + xb) / 2}" y="${y + 19}" text-anchor="middle">${r.status === 'ok' ? `${fmt(r.flow, 0)} m³/h` : '–'}</text>`;
    if (r.terminal) {
      const t = r.critical ? `${fmt(r.cum, 0)} Pa` : `${fmt(r.cum, 0)} Pa | Drossel ${fmt(r.throttle, 0)} Pa`;
      svg += `<text class="seg-end ${r.critical ? 'is-critical' : ''}" x="${xb + 10}" y="${y + 4}">${t}</text>`;
    }
    svg += `<rect class="hit" x="${xa}" y="${y - 24}" width="${xb - xa + 4}" height="48"/>`;
    svg += '</g>';
  }
  svg += '</svg>';
  el.innerHTML = svg;

  el.querySelectorAll('.seg').forEach((g) => {
    const go = () => onSelect(g.dataset.id);
    g.addEventListener('click', go);
    g.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        go();
      }
    });
  });
}
