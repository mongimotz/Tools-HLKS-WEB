// SPDX-License-Identifier: AGPL-3.0-or-later
// Schema → SVG string. Pure (no DOM): used by the editor, the CLI and the exports, so all show the same drawing.
import type { Component, Schema, Vec } from '../model/types.ts';
import { componentBox, isBackground, localToSheet, r, symbolTransform, unionBox, type Box } from '../model/geometry.ts';
import { MEDIA, medium } from '../model/media.ts';
import { frameBox, paperSize, titleBlockBox } from '../model/sheet.ts';
import { symbolOf } from '../symbols/library.ts';
import { placeMissing } from '../layout/place.ts';
import { routeAll, type Route } from '../layout/route.ts';
import { getActiveStyle, type Style } from './style.ts';
import { DEFAULT_TITLE_BLOCK, fillTemplate } from './titleblock.ts';
import { baseline, esc, textWidth } from './text.ts';
import { componentPinAt } from '../model/notes.ts';

export type Highlight = 'add' | 'remove' | 'change' | 'error' | 'warning' | 'select';

export interface RenderOptions {
  style?: Style;
  /** Editor only: grid, note pins. Never in exports. */
  grid?: boolean;
  notes?: boolean;
  /** Black and white: media differ by dash pattern and code. */
  mono?: boolean;
  highlight?: Record<string, Highlight>;
}

export interface RenderResult {
  svg: string;
  /** Schema with auto-placed positions filled in. */
  placed: Schema;
  routes: Map<string, Route>;
  failedRoutes: string[];
  /** Text boxes (labels, props) in sheet mm, for checks such as clipped text. */
  textBoxes: { id: string; box: Box; text: string }[];
  /** Group frames in sheet mm. */
  groupBoxes: { id: string; box: Box }[];
  /** Note pin tips in sheet mm (also without `notes`, for hit areas). */
  notePins: { id: string; at: Vec }[];
}

const HL_COLOR: Record<Highlight, string> = {
  add: '#1f9e5a',
  remove: '#d0342c',
  change: '#2f6fc9',
  error: '#d0342c',
  warning: '#e0a000',
  select: '#2f80ed',
};

const f = (n: number) => String(r(n));

export function renderSchema(input: Schema, opts: RenderOptions = {}): RenderResult {
  const base = opts.style ?? getActiveStyle();
  // Black and white: device frames and IDs in ink as well.
  const style = opts.mono ? { ...base, colors: { ...base.colors, unit: base.colors.ink, label: base.colors.ink } } : base;
  const s = placeMissing(input, style);
  const [W, H] = paperSize(s.sheet);
  const { routes, failed } = routeAll(s);
  const ink = style.colors.ink;
  const out: string[] = [];
  const textBoxes: RenderResult['textBoxes'] = [];
  const groupBoxes: RenderResult['groupBoxes'] = [];
  const hl = opts.highlight ?? {};
  const fam = esc(style.font.family);

  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}" font-family="${fam}" stroke-linecap="butt" stroke-linejoin="miter">`,
  );
  out.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="${style.colors.paper}" stroke="none"/>`);

  if (opts.grid) {
    const g = s.sheet.grid;
    out.push(
      `<defs><pattern id="grid-minor" width="${g}" height="${g}" patternUnits="userSpaceOnUse"><path d="M${g} 0V${g}H0" fill="none" stroke="${style.colors.grid}" stroke-width="0.05"/></pattern>` +
        `<pattern id="grid-major" width="${g * 4}" height="${g * 4}" patternUnits="userSpaceOnUse"><rect width="${g * 4}" height="${g * 4}" fill="url(#grid-minor)"/><path d="M${g * 4} 0V${g * 4}H0" fill="none" stroke="${style.colors.grid}" stroke-width="0.12"/></pattern></defs>`,
    );
    out.push(`<rect class="grid" x="0" y="0" width="${W}" height="${H}" fill="url(#grid-major)" stroke="none"/>`);
  }

  // Highlight halos behind everything else.
  const halo: string[] = [];
  for (const c of s.components) {
    const h = hl[c.id];
    if (!h || !c.pos) continue;
    const b = componentBox(c);
    const p = c.type === 'junction' ? 2 : 1.5;
    halo.push(
      `<rect x="${f(b.x - p)}" y="${f(b.y - p)}" width="${f(b.w + 2 * p)}" height="${f(b.h + 2 * p)}" rx="1" fill="${HL_COLOR[h]}" fill-opacity="0.18" stroke="${HL_COLOR[h]}" stroke-width="0.3"/>`,
    );
  }
  for (const con of s.connections) {
    const h = hl[con.id];
    const pts = routes.get(con.id);
    if (!h || !pts) continue;
    halo.push(
      `<path d="${polyline(pts)}" fill="none" stroke="${HL_COLOR[h]}" stroke-opacity="0.35" stroke-width="2.4" stroke-linejoin="round"/>`,
    );
  }
  if (halo.length) out.push(`<g class="highlight">${halo.join('')}</g>`);

  // Component markup first: group frames need the label extents.
  const cmpMarkup = new Map<string, string>();
  for (const c of s.components) if (c.pos) cmpMarkup.set(c.id, componentGroup(c, style, textBoxes));

  // Group frames: around members and their labels, with the group name above the content.
  for (const gr of s.groups) {
    if (!gr.frame) continue;
    const members = s.components.filter((c) => gr.members.includes(c.id) && c.pos);
    // Width from the symbols, height also from the member texts (labels above, values below).
    const sb = unionBox(members.map(componentBox));
    const tb = unionBox([
      ...members.map(componentBox),
      ...textBoxes.filter((t) => gr.members.includes(t.id)).map((t) => t.box),
    ]);
    if (!sb || !tb) continue;
    const pad = 4;
    const x = sb.x - pad,
      y = tb.y - 2 - style.font.small - 1,
      w = sb.w + 2 * pad,
      h = tb.h + 4 + style.font.small + 1;
    groupBoxes.push({ id: gr.id, box: { x, y, w, h } });
    out.push(
      `<g class="group" data-id="${esc(gr.id)}"><rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="none" stroke="${style.colors.unit}" stroke-width="${style.stroke.group}" stroke-dasharray="3 1.5"/>` +
        (gr.label
          ? `<text x="${f(x + 1.5)}" y="${f(y + 1.5 + baseline(style.font.small))}" font-size="${style.font.small}" fill="${ink}" stroke="none">${esc(gr.label)}</text>`
          : '') +
        `</g>`,
    );
  }

  // Background symbols (rooms, fire compartment borders) behind the lines.
  for (const c of s.components) if (c.pos && isBackground(c)) out.push(cmpMarkup.get(c.id)!);

  // Sensor stem tips: flow arrows keep clear of them.
  const stems: Vec[] = s.components
    .filter((c) => c.pos && symbolOf(c.type).obstacle)
    .map((c) => {
      const d = symbolOf(c.type);
      return localToSheet(d, c, [d.size[0] / 2, d.size[1]]);
    });

  // Connections.
  const crossings = findCrossings(s, routes);
  const usedMedia = new Set<string>();
  const flowLabels: string[] = [];
  for (const con of s.connections) {
    const pts = routes.get(con.id);
    if (!pts || pts.length < 2) continue;
    const m = medium(con.medium);
    usedMedia.add(con.medium);
    const signal = m?.kind === 'signal';
    const color = opts.mono ? ink : (style.colors.media[con.medium] ?? m?.color ?? ink);
    const dash = opts.mono ? m?.dash || '' : signal ? m?.dash || '' : '';
    const sw = lineWidth(con.medium, style);
    const d = pathWithCrossings(pts, crossings.get(con.id) ?? [], style.crossings);
    out.push(
      `<g class="con" data-id="${esc(con.id)}"><path d="${d}" fill="none" stroke="${color}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`,
    );
    if (!signal) {
      const seg = longestSegment(pts);
      if (seg && seg.len >= 15) out.push(arrowAvoiding(seg.a, seg.b, color, stems));
      if (seg && startsMediumRun(s, con.id) && m) {
        const horiz = Math.abs(seg.a[1] - seg.b[1]) < 1e-6;
        const size = style.font.small;
        const tw = textWidth(m.code, size, 600);
        if (seg.len >= tw + 4) {
          const dirx = Math.sign(seg.b[0] - seg.a[0]);
          const tx = horiz ? (dirx >= 0 ? seg.a[0] + 1.5 : seg.a[0] - 1.5 - tw) : seg.a[0] + 1.2;
          const ty = horiz ? seg.a[1] - 1.2 : Math.min(seg.a[1], seg.b[1]) + 1.5 + baseline(size);
          flowLabels.push(
            `<text x="${f(tx)}" y="${f(ty)}" font-size="${size}" font-weight="600" fill="${color}" stroke="none">${esc(m.code)}</text>`,
          );
          textBoxes.push({ id: con.id, box: { x: tx, y: ty - baseline(size), w: tw, h: size }, text: m.code });
        }
      }
    }
    out.push('</g>');
  }
  if (flowLabels.length) out.push(`<g class="flow-labels">${flowLabels.join('')}</g>`);

  // Components.
  for (const c of s.components) if (c.pos && !isBackground(c)) out.push(cmpMarkup.get(c.id)!);

  for (const t of s.texts) {
    out.push(
      `<text class="txt" data-id="${esc(t.id)}" x="${f(t.pos[0])}" y="${f(t.pos[1] + baseline(t.size))}" font-size="${t.size}" fill="${ink}" stroke="none">${esc(t.text)}</text>`,
    );
    textBoxes.push({
      id: t.id,
      box: { x: t.pos[0], y: t.pos[1], w: textWidth(t.text, t.size), h: t.size },
      text: t.text,
    });
  }

  // Frame, title block, legend.
  const fr = frameBox(s.sheet);
  out.push(
    `<rect class="frame" x="${fr.x}" y="${fr.y}" width="${fr.w}" height="${fr.h}" fill="none" stroke="${style.colors.frame}" stroke-width="${style.stroke.frame}"/>`,
  );
  const tb = titleBlockBox(s.sheet);
  out.push(
    `<g class="title-block" transform="translate(${f(tb.x)} ${f(tb.y)})" fill="${ink}" stroke="none">` +
      titleBlockStyle(style) +
      fillTemplate(style.titleBlock ?? DEFAULT_TITLE_BLOCK, s).replace(
        /class="(tb-[a-z]+)"/g,
        (_, k: string) => TB_ATTR(style)[k] ?? '',
      ) +
      `</g>`,
  );
  if (style.legend && s.sheet.legend && usedMedia.size) out.push(legend(s, [...usedMedia], style, !!opts.mono));

  const pins = notePinPositions(s, routes);
  if (opts.notes) out.push(notePins(s, pins));

  out.push('</svg>');
  return { svg: out.join('\n'), placed: s, routes, failedRoutes: failed, textBoxes, groupBoxes, notePins: pins };
}

function TB_ATTR(style: Style): Record<string, string> {
  return {
    'tb-line': `fill="none" stroke="${style.colors.frame}" stroke-width="${style.stroke.thin}"`,
    'tb-label': `font-size="${style.font.small * 0.8}" fill="${style.colors.group}"`,
    'tb-title': `font-size="${style.font.large}" font-weight="600"`,
    'tb-value': `font-size="${style.font.normal}"`,
  };
}

function titleBlockStyle(_style: Style): string {
  return '';
}

function componentGroup(c: Component, style: Style, textBoxes: RenderResult['textBoxes']): string {
  const def = symbolOf(c.type);
  const ink = style.colors.ink;
  return (
    `<g class="cmp" data-id="${esc(c.id)}"><g transform="${symbolTransform(def, c)}" fill="none" stroke="${ink}" color="${ink}" stroke-width="${style.stroke.symbol}" font-family="${esc(style.font.family)}">${def.svg}</g>` +
    componentText(c, style, textBoxes) +
    '</g>'
  );
}

function componentText(c: Component, style: Style, boxes: RenderResult['textBoxes']): string {
  const def = symbolOf(c.type);
  const size = style.font.label;
  // A symbol turned by 180° keeps its label on the same side horizontally (anchor mirrored vertically only).
  const anchor =
    c.rot === 180 ? localToSheet(def, { ...c, flip: !c.flip }, def.labelAnchor) : localToSheet(def, c, def.labelAnchor);
  const [cx, cy] = c.pos!;
  const dx = anchor[0] - cx,
    dy = anchor[1] - cy;
  const box = componentBox(c);
  let align: 'start' | 'middle' | 'end' = def.labelAlign ?? 'middle';
  let y = anchor[1];
  if (c.rot !== 0 || c.flip) {
    if (Math.abs(dx) > Math.abs(dy)) {
      align = dx > 0 ? 'start' : 'end';
      y = anchor[1] + baseline(size) / 2;
    } else {
      align = 'middle';
      y = dy < 0 ? anchor[1] : anchor[1] + baseline(size);
    }
  }
  const lines: { text: string; weight: 400 | 600 }[] = [];
  if (c.label) lines.push({ text: c.label, weight: 600 });
  const out: string[] = [];
  const put = (text: string, x: number, yy: number, weight: 400 | 600, a: typeof align) => {
    const w = textWidth(text, size, weight);
    const x0 = a === 'start' ? x : a === 'end' ? x - w : x - w / 2;
    boxes.push({ id: c.id, box: { x: x0, y: yy - baseline(size), w, h: size }, text });
    out.push(
      `<text x="${f(x)}" y="${f(yy)}" font-size="${size}"${weight === 600 ? ' font-weight="600"' : ''}${a !== 'start' ? ` text-anchor="${a}"` : ''} fill="${weight === 600 ? style.colors.label : style.colors.ink}" stroke="none">${esc(text)}</text>`,
    );
  };
  for (const l of lines) put(l.text, anchor[0], y, l.weight, align);
  // Property values below the symbol (or below a side label).
  const values = def.props.map((k) => c.props[k]).filter((v): v is string => !!v);
  const extra = Object.keys(c.props)
    .filter((k) => !def.props.includes(k))
    .map((k) => c.props[k]!)
    .filter(Boolean);
  const all = [...values, ...extra];
  const lh = size * 1.25;
  if (align === 'middle' || c.type === 'junction') {
    let yy = box.y + box.h + 1 + baseline(size);
    for (const v of all) {
      put(v, cx, yy, 400, 'middle');
      yy += lh;
    }
  } else {
    let yy = y + lh;
    for (const v of all) {
      put(v, anchor[0], yy, 400, align);
      yy += lh;
    }
  }
  return out.join('');
}

function polyline(pts: Vec[]): string {
  return pts.map((p, i) => `${i ? 'L' : 'M'}${f(p[0])} ${f(p[1])}`).join('');
}

function longestSegment(pts: Vec[]): { a: Vec; b: Vec; len: number } | null {
  let best: { a: Vec; b: Vec; len: number } | null = null;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!,
      b = pts[i]!;
    const len = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
    if (!best || len > best.len + 1e-6) best = { a, b, len };
  }
  return best;
}

function arrowAvoiding(a: Vec, b: Vec, color: string, stems: Vec[]): string {
  for (const t of [0.5, 0.35, 0.65, 0.25, 0.75]) {
    const m: Vec = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    if (!stems.some((p) => Math.abs(p[0] - m[0]) < 3 && Math.abs(p[1] - m[1]) < 3)) return arrow(a, b, color, t);
  }
  return '';
}

function arrow(a: Vec, b: Vec, color: string, t = 0.5): string {
  const mx = a[0] + (b[0] - a[0]) * t,
    my = a[1] + (b[1] - a[1]) * t;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const ux = (b[0] - a[0]) / len,
    uy = (b[1] - a[1]) / len;
  const L = 2.2,
    Wd = 0.8;
  const tip: Vec = [mx + ux * L * 0.5, my + uy * L * 0.5];
  const back: Vec = [mx - ux * L * 0.5, my - uy * L * 0.5];
  const p1: Vec = [back[0] - uy * Wd, back[1] + ux * Wd],
    p2: Vec = [back[0] + uy * Wd, back[1] - ux * Wd];
  return `<path d="M${f(tip[0])} ${f(tip[1])}L${f(p1[0])} ${f(p1[1])}L${f(p2[0])} ${f(p2[1])}Z" fill="${color}" stroke="none"/>`;
}

/** First connection of a run of one medium: its start component has no incoming connection of the same medium. */
function startsMediumRun(s: Schema, conId: string): boolean {
  const con = s.connections.find((c) => c.id === conId)!;
  const start = con.from[0];
  return !s.connections.some((o) => o.id !== con.id && o.medium === con.medium && o.to[0] === start);
}

type Cross = { seg: number; at: number };

/** Interior crossings of horizontal segments with vertical segments of other connections. */
function findCrossings(s: Schema, routes: Map<string, Route>): Map<string, Cross[]> {
  const res = new Map<string, Cross[]>();
  const verticals: { id: string; x: number; y0: number; y1: number }[] = [];
  for (const [id, pts] of routes)
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!,
        b = pts[i]!;
      if (Math.abs(a[0] - b[0]) < 1e-6)
        verticals.push({ id, x: a[0], y0: Math.min(a[1], b[1]), y1: Math.max(a[1], b[1]) });
    }
  const signal = new Set(s.connections.filter((c) => medium(c.medium)?.kind === 'signal').map((c) => c.id));
  for (const [id, pts] of routes) {
    const list: Cross[] = [];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!,
        b = pts[i]!;
      if (Math.abs(a[1] - b[1]) > 1e-6) continue;
      const x0 = Math.min(a[0], b[0]),
        x1 = Math.max(a[0], b[0]);
      for (const v of verticals) {
        if (v.id === id || signal.has(v.id) !== signal.has(id)) continue;
        if (v.x > x0 + 1.5 && v.x < x1 - 1.5 && a[1] > v.y0 + 1e-6 && a[1] < v.y1 - 1e-6)
          list.push({ seg: i, at: v.x });
      }
    }
    if (list.length) res.set(id, list);
  }
  return res;
}

function pathWithCrossings(pts: Vec[], cross: Cross[], mode: Style['crossings']): string {
  const R = 1.2;
  let d = `M${f(pts[0]![0])} ${f(pts[0]![1])}`;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!,
      b = pts[i]!;
    const here = cross.filter((c) => c.seg === i);
    if (here.length) {
      const dir = Math.sign(b[0] - a[0]);
      here.sort((p, q) => (p.at - q.at) * dir);
      for (const c of here) {
        d += `L${f(c.at - dir * R)} ${f(a[1])}`;
        if (mode === 'gap') d += `M${f(c.at + dir * R)} ${f(a[1])}`;
        else d += `A${R} ${R} 0 0 ${dir > 0 ? 1 : 0} ${f(c.at + dir * R)} ${f(a[1])}`;
      }
    }
    d += `L${f(b[0])} ${f(b[1])}`;
  }
  return d;
}

function legend(s: Schema, used: string[], style: Style, mono: boolean): string {
  const fr = frameBox(s.sheet);
  const tb = titleBlockBox(s.sheet);
  const size = style.font.small;
  const x0 = fr.x + 3,
    top = tb.y + 2;
  const rows = 4,
    colW = 42,
    rowH = 5.5;
  const items = MEDIA.filter((m) => used.includes(m.id));
  const parts = [
    `<g class="legend"><text x="${f(x0)}" y="${f(top + baseline(size))}" font-size="${size}" font-weight="600" fill="${style.colors.ink}" stroke="none">Legende</text>`,
  ];
  items.forEach((m, i) => {
    const col = Math.floor(i / rows),
      row = i % rows;
    const x = x0 + col * colW,
      y = top + 6 + row * rowH;
    if (x + colW > tb.x) return;
    const color = mono ? style.colors.ink : (style.colors.media[m.id] ?? m.color);
    const dash = mono || m.kind === 'signal' ? m.dash : '';
    parts.push(
      `<path d="M${f(x)} ${f(y + 1.2)}H${f(x + 10)}" stroke="${color}" stroke-width="${lineWidth(m.id, style)}"${dash ? ` stroke-dasharray="${dash}"` : ''} fill="none"/>` +
        `<text x="${f(x + 12)}" y="${f(y + 1.2 + baseline(size) / 2)}" font-size="${size}" fill="${style.colors.ink}" stroke="none"><tspan font-weight="600">${esc(m.code)}</tspan> ${esc(m.name)}</text>`,
    );
  });
  parts.push('</g>');
  return parts.join('');
}

/** Pin tip of every note (sheet mm), in list order. A note whose anchor is missing has no pin. */
export function notePinPositions(s: Schema, routes: Map<string, Route>): { id: string; at: Vec }[] {
  const out: { id: string; at: Vec }[] = [];
  for (const n of s.notes) {
    let at: Vec | null = null;
    if ('pos' in n.anchor) at = n.anchor.pos;
    else if ('component' in n.anchor) at = componentPinAt(s, n.anchor.component);
    else {
      const pts = routes.get(n.anchor.connection);
      const seg = pts && longestSegment(pts);
      if (seg) at = [(seg.a[0] + seg.b[0]) / 2, (seg.a[1] + seg.b[1]) / 2];
    }
    if (at) out.push({ id: n.id, at });
  }
  return out;
}

/** Centre of a pin's head relative to its tip (head: circle r 2.4 through (±1.4, −3.2)). */
export const PIN_HEAD: Vec = [0, -3.2 - Math.sqrt(2.4 ** 2 - 1.4 ** 2)];

function notePins(s: Schema, pins: { id: string; at: Vec }[]): string {
  const out: string[] = [];
  // Baseline so the digits sit centred in the head (cap height of Plex about 0.7 em).
  const ty = f(PIN_HEAD[1] + 0.35 * 2.2);
  for (const { id, at } of pins) {
    const i = s.notes.findIndex((n) => n.id === id);
    const n = s.notes[i]!;
    const color = n.status === 'open' ? '#e07b1a' : '#8c8c8c';
    out.push(
      `<g class="note-pin" data-id="${esc(n.id)}" transform="translate(${f(at[0])} ${f(at[1])})"><path d="M0 0L-1.4 -3.2A2.4 2.4 0 1 1 1.4 -3.2Z" fill="${color}" stroke="#fff" stroke-width="0.25"/><text x="0" y="${ty}" font-size="2.2" font-weight="600" text-anchor="middle" fill="#fff" stroke="none">${i + 1}</text></g>`,
    );
  }
  return `<g class="notes">${out.join('')}</g>`;
}

/** Stroke width of a line: air media as thick ducts, pipes thinner, Wirklinien thin. */
function lineWidth(mediumId: string, style: Style): number {
  if (medium(mediumId)?.kind === 'signal') return style.stroke.signal;
  return mediumId.startsWith('air.') ? style.stroke.duct : style.stroke.line;
}
