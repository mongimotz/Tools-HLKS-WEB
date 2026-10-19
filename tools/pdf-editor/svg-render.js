// SPDX-License-Identifier: AGPL-3.0-or-later
// SVG → PDF content stream, for symbols and stamps. No DOM, no MuPDF (pure; svg.js assembles the page).
// The MuPDF.js build has no SVG document handler, so this draws the common subset itself:
//   svg (nested), g, defs, symbol, use, path (all commands), rect (rx/ry), circle, ellipse, line, polyline,
//   polygon, text / tspan (one line each, IBM Plex Sans), image (inline PNG / JPEG data URI);
//   transform, fill, stroke and their parameters, fill-rule, opacity, color / currentColor, display,
//   visibility, style attributes and <style> rules with tag, .class and #id selectors;
//   gradients paint with their first stop colour. Clip paths, masks, filters and patterns are ignored.

// ---- XML ------------------------------------------------------------------------------------------------

const ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITIES[e.toLowerCase()] ?? m;
  });

/** A small XML parser: elements { name, attrs, children } and text nodes { text }. */
export function parseXml(src) {
  const root = { name: '#root', attrs: {}, children: [] };
  const stack = [root];
  const re = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!(?:DOCTYPE|ENTITY)[\s\S]*?>|<\/\s*([\w:.-]+)\s*>|<([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/gi;
  let m;
  while ((m = re.exec(src))) {
    const top = stack[stack.length - 1];
    if (m[1] != null) top.children.push({ text: m[1] });
    else if (m[2]) {
      if (stack.length > 1 && stack[stack.length - 1].name === m[2]) stack.pop();
    } else if (m[3]) {
      const attrs = {};
      for (const a of m[4].matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1]] = decode(a[2] ?? a[3] ?? '');
      const el = { name: m[3].replace(/^svg:/, ''), attrs, children: [] };
      top.children.push(el);
      if (!m[5]) stack.push(el);
    } else if (m[6] != null && m[6].trim()) top.children.push({ text: decode(m[6]) });
  }
  return root.children.find((c) => c.name === 'svg') ?? null;
}

// ---- numbers, lengths, colours, transforms --------------------------------------------------------------

const NUM = /[+-]?(?:\d*\.\d+|\d+\.?)(?:e[+-]?\d+)?/gi;
const nums = (s) => (String(s ?? '').match(NUM) ?? []).map(Number);
const UNIT = { '': 1, px: 1, pt: 4 / 3, pc: 16, mm: 96 / 25.4, cm: 96 / 2.54, in: 96 };

/** A length in user units (px); `em` relative to `fontSize`, % relative to `ref`. */
export function length(v, ref = 0, fontSize = 16) {
  const m = String(v ?? '').trim().match(/^([+-]?(?:\d*\.\d+|\d+\.?)(?:e[+-]?\d+)?)\s*(px|pt|pc|mm|cm|in|em|ex|%)?$/i);
  if (!m) return null;
  const n = Number(m[1]);
  const u = (m[2] ?? '').toLowerCase();
  if (u === '%') return (n / 100) * ref;
  if (u === 'em') return n * fontSize;
  if (u === 'ex') return n * fontSize * 0.5;
  return n * UNIT[u];
}

const NAMED = {
  black: [0, 0, 0], white: [255, 255, 255], red: [255, 0, 0], green: [0, 128, 0], lime: [0, 255, 0], blue: [0, 0, 255],
  yellow: [255, 255, 0], orange: [255, 165, 0], gray: [128, 128, 128], grey: [128, 128, 128], silver: [192, 192, 192],
  maroon: [128, 0, 0], navy: [0, 0, 128], purple: [128, 0, 128], magenta: [255, 0, 255], fuchsia: [255, 0, 255],
  cyan: [0, 255, 255], aqua: [0, 255, 255], teal: [0, 128, 128], olive: [128, 128, 0], brown: [165, 42, 42],
  darkgray: [169, 169, 169], darkgrey: [169, 169, 169], lightgray: [211, 211, 211], lightgrey: [211, 211, 211],
};

/** [r, g, b] in 0…1, 'none', or null when unknown. */
export function parseColor(v, current = [0, 0, 0]) {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s || s === 'none' || s === 'transparent') return 'none';
  if (s === 'currentcolor') return current;
  let m = s.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    const h = m[1];
    const full = h.length <= 4 ? [...h.slice(0, 3)].map((c) => c + c).join('') : h.slice(0, 6);
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  }
  m = s.match(/^rgba?\(([^)]*)\)$/);
  if (m) {
    const parts = m[1].split(/[\s,/]+/).filter(Boolean).slice(0, 3);
    return parts.map((p) => (p.endsWith('%') ? Number(p.slice(0, -1)) / 100 : Number(p) / 255)).map((x) => Math.min(1, Math.max(0, x || 0)));
  }
  return NAMED[s] ? NAMED[s].map((x) => x / 255) : null;
}

const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
const IDENTITY = [1, 0, 0, 1, 0, 0];

/** An SVG transform list as one matrix [a b c d e f]. */
export function parseTransform(s) {
  let m = IDENTITY;
  for (const [, fn, args] of String(s ?? '').matchAll(/(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g)) {
    const a = nums(args);
    let t = IDENTITY;
    const rad = ((a[0] ?? 0) * Math.PI) / 180;
    if (fn === 'matrix' && a.length === 6) t = a;
    else if (fn === 'translate') t = [1, 0, 0, 1, a[0] ?? 0, a[1] ?? 0];
    else if (fn === 'scale') t = [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0];
    else if (fn === 'rotate') {
      const [c, sn] = [Math.cos(rad), Math.sin(rad)];
      t = [c, sn, -sn, c, 0, 0];
      if (a.length === 3) t = mul(mul([1, 0, 0, 1, a[1], a[2]], t), [1, 0, 0, 1, -a[1], -a[2]]);
    } else if (fn === 'skewX') t = [1, 0, Math.tan(rad), 1, 0, 0];
    else if (fn === 'skewY') t = [1, Math.tan(rad), 0, 1, 0, 0];
    m = mul(m, t);
  }
  return m;
}

// ---- path data → absolute cubic path --------------------------------------------------------------------

/** Path data as segments: ['M', x, y], ['L', x, y], ['C', x1, y1, x2, y2, x, y], ['Z']. */
export function parsePath(d) {
  // numbers stay text until read, so packed arc flags ("a1 1 0 0110 10") can be split
  const tokens = [];
  const re = /([MmLlHhVvCcSsQqTtAaZz])|([+-]?(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?)/g;
  for (const t of String(d ?? '').matchAll(re)) tokens.push(t[1] ? { cmd: t[1] } : t[2]);
  const out = [];
  let i = 0;
  let cmd = null;
  let [x, y, sx, sy] = [0, 0, 0, 0];
  let [cx, cy] = [0, 0]; // last control point (for S / T)
  let lastQ = null;
  const num = () => (typeof tokens[i] === 'string' ? Number(tokens[i++]) : NaN);
  const flag = () => {
    const t = tokens[i];
    if (typeof t !== 'string' || !/^[01]/.test(t)) return NaN;
    if (t.length > 1 && /^[01]\d/.test(t)) {
      tokens[i] = t.slice(1);
      return Number(t[0]);
    }
    i++;
    return Number(t) ? 1 : 0;
  };
  while (i < tokens.length) {
    if (typeof tokens[i] === 'object') cmd = tokens[i++].cmd;
    else if (!cmd) break;
    const rel = cmd === cmd.toLowerCase() && cmd !== 'z';
    const C = cmd.toUpperCase();
    const ox = rel ? x : 0;
    const oy = rel ? y : 0;
    if (C === 'Z') {
      out.push(['Z']);
      [x, y] = [sx, sy];
      cmd = null;
      lastQ = null;
      continue;
    }
    if (C === 'M') {
      const [nx, ny] = [num() + ox, num() + oy];
      if (Number.isNaN(nx + ny)) break;
      out.push(['M', nx, ny]);
      [x, y, sx, sy, cx, cy] = [nx, ny, nx, ny, nx, ny];
      cmd = rel ? 'l' : 'L';
      lastQ = null;
      continue;
    }
    let seg = null;
    if (C === 'L') seg = ['L', num() + ox, num() + oy];
    else if (C === 'H') seg = ['L', num() + ox, y];
    else if (C === 'V') seg = ['L', x, num() + oy];
    else if (C === 'C') seg = ['C', num() + ox, num() + oy, num() + ox, num() + oy, num() + ox, num() + oy];
    else if (C === 'S') {
      const [rx, ry] = out.at(-1)?.[0] === 'C' ? [2 * x - cx, 2 * y - cy] : [x, y];
      seg = ['C', rx, ry, num() + ox, num() + oy, num() + ox, num() + oy];
    } else if (C === 'Q' || C === 'T') {
      let qx;
      let qy;
      if (C === 'Q') [qx, qy] = [num() + ox, num() + oy];
      else [qx, qy] = lastQ ? [2 * x - lastQ[0], 2 * y - lastQ[1]] : [x, y];
      const [ex, ey] = [num() + ox, num() + oy];
      seg = ['C', x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), ex + (2 / 3) * (qx - ex), ey + (2 / 3) * (qy - ey), ex, ey];
      if (!seg.some(Number.isNaN)) {
        out.push(seg);
        [cx, cy] = [seg[3], seg[4]];
        [x, y] = [ex, ey];
        lastQ = [qx, qy];
      }
      if (seg.some((v) => Number.isNaN(v))) break;
      continue;
    } else if (C === 'A') {
      const [rx, ry, rot] = [num(), num(), num()];
      const [large, sweep] = [flag(), flag()];
      const [ex, ey] = [num() + ox, num() + oy];
      if ([rx, ry, rot, large, sweep, ex, ey].some(Number.isNaN)) break;
      for (const c of arcToCubics(x, y, rx, ry, rot, large, sweep, ex, ey)) out.push(c);
      [x, y, cx, cy] = [ex, ey, ex, ey];
      lastQ = null;
      continue;
    }
    if (!seg || seg.slice(1).some((v) => Number.isNaN(v))) break;
    out.push(seg);
    [x, y] = seg.slice(-2);
    if (seg[0] === 'C') [cx, cy] = [seg[3], seg[4]];
    else [cx, cy] = [x, y];
    lastQ = null;
  }
  return out;
}

/** An elliptical arc (SVG endpoint form) as cubic segments. */
export function arcToCubics(x1, y1, rx, ry, phiDeg, large, sweep, x2, y2) {
  if (x1 === x2 && y1 === y2) return [];
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  if (!rx || !ry) return [['L', x2, y2]];
  const phi = (phiDeg * Math.PI) / 180;
  const [cs, sn] = [Math.cos(phi), Math.sin(phi)];
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cs * dx + sn * dy;
  const y1p = -sn * dx + cs * dy;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const k = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cxp = (k * rx * y1p) / ry;
  const cyp = (-k * ry * x1p) / rx;
  const cx = cs * cxp - sn * cyp + (x1 + x2) / 2;
  const cy = sn * cxp + cs * cyp + (y1 + y2) / 2;
  const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  const n = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2)));
  const step = dt / n;
  const alpha = (4 / 3) * Math.tan(step / 4);
  const point = (t) => [cx + rx * Math.cos(t) * cs - ry * Math.sin(t) * sn, cy + rx * Math.cos(t) * sn + ry * Math.sin(t) * cs];
  const deriv = (t) => [-rx * Math.sin(t) * cs - ry * Math.cos(t) * sn, -rx * Math.sin(t) * sn + ry * Math.cos(t) * cs];
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = t1 + i * step;
    const b = a + step;
    const [p0, p3] = [point(a), point(b)];
    const [d0, d3] = [deriv(a), deriv(b)];
    out.push(['C', p0[0] + alpha * d0[0], p0[1] + alpha * d0[1], p3[0] - alpha * d3[0], p3[1] - alpha * d3[1], ...(i === n - 1 ? [x2, y2] : p3)]);
  }
  return out;
}

// ---- styles ---------------------------------------------------------------------------------------------

const INHERITED = ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'fill-rule', 'fill-opacity', 'stroke-opacity', 'color', 'font-size', 'font-weight', 'font-family', 'text-anchor', 'visibility'];
const OWN = ['opacity', 'display', 'transform'];

const declarations = (s) =>
  Object.fromEntries(
    String(s ?? '')
      .split(';')
      .map((d) => d.split(':'))
      .filter((p) => p.length >= 2)
      .map(([k, ...v]) => [k.trim().toLowerCase(), v.join(':').replace(/!important/i, '').trim()]),
  );

/** Rules of all <style> elements: [{ test(el), decl }] for tag, .class, #id and tag.class selectors. */
function styleRules(root) {
  const rules = [];
  const walk = (el) => {
    if (el.name === 'style') {
      const css = el.children.map((c) => c.text ?? '').join('').replace(/\/\*[\s\S]*?\*\//g, '');
      for (const [, sel, body] of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
        const decl = declarations(body);
        for (const one of sel.split(',').map((s) => s.trim())) {
          const m = one.match(/^([a-z][\w-]*)?(?:\.([\w-]+))?(?:#([\w-]+))?$/i);
          if (!m || !(m[1] || m[2] || m[3])) continue;
          rules.push({ test: (e) => (!m[1] || e.name === m[1]) && (!m[2] || (e.attrs.class ?? '').split(/\s+/).includes(m[2])) && (!m[3] || e.attrs.id === m[3]), decl });
        }
      }
    }
    for (const c of el.children ?? []) if (c.name) walk(c);
  };
  walk(root);
  return rules;
}

// ---- renderer -------------------------------------------------------------------------------------------

const f = (v) => {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
};

/**
 * Render an SVG into PDF content for a page of `width` × `height` points (its own size).
 * options.text(str, bold) → { hex, width } encodes a string for the fonts /F1 (regular) and /F2 (semibold)
 * and gives its advance width in em. Returns { width, height, content, alphas: [ca], images: [{ name, bytes }], fonts: Set }.
 */
export function renderSvg(src, { text: encodeText, color = [0, 0, 0] } = {}) {
  const root = typeof src === 'string' ? parseXml(src) : src;
  if (!root) throw new Error('not-svg');
  const rules = styleRules(root);
  const ids = new Map();
  const index = (el) => {
    if (el.attrs?.id) ids.set(el.attrs.id, el);
    for (const c of el.children ?? []) if (c.name) index(c);
  };
  index(root);

  const vb = nums(root.attrs.viewBox);
  const wUser = length(root.attrs.width) ?? (vb.length === 4 ? vb[2] : 300);
  const hUser = length(root.attrs.height) ?? (vb.length === 4 ? vb[3] : 150);
  const width = (/%/.test(root.attrs.width ?? '') && vb.length === 4 ? vb[2] : wUser) * 0.75;
  const height = (/%/.test(root.attrs.height ?? '') && vb.length === 4 ? vb[3] : hUser) * 0.75;
  const ops = [`1 0 0 -1 0 ${f(height)} cm`, '0.75 0 0 0.75 0 0 cm'];
  ops.push(...viewBoxOps(vb, width / 0.75, height / 0.75, root.attrs.preserveAspectRatio));
  const alphas = [];
  const images = [];
  const fonts = new Set();
  const alphaName = (a) => {
    const k = f(a);
    let i = alphas.indexOf(k);
    if (i < 0) i = alphas.push(k) - 1;
    return `/GA${i}`;
  };

  const styleOf = (el, parent) => {
    const own = {};
    for (const r of rules) if (r.test(el)) Object.assign(own, r.decl);
    for (const k of [...INHERITED, ...OWN]) if (el.attrs[k] != null) own[k] = el.attrs[k];
    Object.assign(own, declarations(el.attrs.style));
    const s = { ...parent };
    for (const k of INHERITED) if (own[k] != null && own[k] !== 'inherit') s[k] = own[k];
    s.opacity = (parent.opacityAll ?? 1) * (Number(own.opacity ?? 1) || 0);
    s.opacityAll = s.opacity;
    s.display = own.display;
    s.transform = own.transform;
    return s;
  };

  const paintOf = (value, s) => {
    const current = parseColor(s.color, color);
    const ref = String(value ?? '').match(/url\(\s*#([^)\s]+)\s*\)/);
    if (ref) {
      const g = ids.get(ref[1]);
      const stop = g?.children?.find((c) => c.name === 'stop');
      if (!stop) return 'none';
      const st = { ...declarations(stop.attrs.style), ...stop.attrs };
      return parseColor(st['stop-color'] ?? 'black', current === 'none' ? color : current) ?? [0, 0, 0];
    }
    const c = parseColor(value, current === 'none' ? color : current);
    return c ?? [0, 0, 0];
  };

  const drawPath = (segs, s, closedShape) => {
    if (!segs.length) return;
    const fill = paintOf(s.fill ?? 'black', s);
    const stroke = paintOf(s.stroke ?? 'none', s);
    if (fill === 'none' && stroke === 'none') return;
    const out = ['q'];
    const fa = s.opacity * Number(s['fill-opacity'] ?? 1);
    const sa = s.opacity * Number(s['stroke-opacity'] ?? 1);
    if (fill !== 'none') out.push(`${fill.map(f).join(' ')} rg`);
    if (stroke !== 'none') {
      out.push(`${stroke.map(f).join(' ')} RG`);
      out.push(`${f(length(s['stroke-width'] ?? 1) ?? 1)} w`);
      out.push(`${{ round: 1, square: 2 }[s['stroke-linecap']] ?? 0} J`);
      out.push(`${{ round: 1, bevel: 2 }[s['stroke-linejoin']] ?? 0} j`);
      if (s['stroke-miterlimit']) out.push(`${f(Number(s['stroke-miterlimit']) || 4)} M`);
      const dash = s['stroke-dasharray'] && s['stroke-dasharray'] !== 'none' ? nums(s['stroke-dasharray']) : [];
      if (dash.length && dash.some((d) => d > 0)) out.push(`[${(dash.length % 2 ? [...dash, ...dash] : dash).map(f).join(' ')}] ${f(Number(s['stroke-dashoffset']) || 0)} d`);
    }
    if (fa < 1 || sa < 1) {
      // one ExtGState for the lower of both (a simplification: same alpha for fill and stroke)
      out.push(`${alphaName(Math.min(fill !== 'none' ? fa : 1, stroke !== 'none' ? sa : 1))} gs`);
    }
    for (const seg of segs) {
      if (seg[0] === 'M') out.push(`${f(seg[1])} ${f(seg[2])} m`);
      else if (seg[0] === 'L') out.push(`${f(seg[1])} ${f(seg[2])} l`);
      else if (seg[0] === 'C') out.push(`${seg.slice(1).map(f).join(' ')} c`);
      else out.push('h');
    }
    const even = s['fill-rule'] === 'evenodd' ? '*' : '';
    if (fill !== 'none' && stroke !== 'none') out.push(`B${even}`);
    else if (fill !== 'none') out.push(`f${even}`);
    else out.push(closedShape ? 's' : 'S');
    out.push('Q');
    ops.push(...out);
  };

  const ellipse = (cx, cy, rx, ry) => {
    const k = 0.5522847498;
    return [
      ['M', cx + rx, cy],
      ['C', cx + rx, cy + k * ry, cx + k * rx, cy + ry, cx, cy + ry],
      ['C', cx - k * rx, cy + ry, cx - rx, cy + k * ry, cx - rx, cy],
      ['C', cx - rx, cy - k * ry, cx - k * rx, cy - ry, cx, cy - ry],
      ['C', cx + k * rx, cy - ry, cx + rx, cy - k * ry, cx + rx, cy],
      ['Z'],
    ];
  };

  const textOf = (el) => (el.children ?? []).map((c) => (c.text != null ? c.text : textOf(c))).join('');

  const visit = (el, parent, depth = 0) => {
    if (!el.name || depth > 64) return;
    if (['defs', 'style', 'title', 'desc', 'metadata', 'clipPath', 'mask', 'linearGradient', 'radialGradient', 'pattern', 'symbol', 'marker', 'filter'].includes(el.name)) return;
    const s = styleOf(el, parent);
    if (s.display === 'none') return;
    const a = el.attrs;
    const n = (k, ref = 0) => length(a[k], ref, length(s['font-size']) ?? 16) ?? 0;
    const tf = s.transform ? parseTransform(s.transform) : null;
    if (tf) ops.push('q', `${tf.map(f).join(' ')} cm`);
    const hidden = s.visibility === 'hidden' || s.visibility === 'collapse';
    switch (el.name) {
      case 'svg':
      case 'g':
      case 'a':
        if (el.name === 'svg' && el !== root) {
          const v = nums(a.viewBox);
          ops.push('q', `1 0 0 1 ${f(n('x'))} ${f(n('y'))} cm`, ...viewBoxOps(v, n('width') || v[2] || 0, n('height') || v[3] || 0, a.preserveAspectRatio));
          for (const c of el.children) visit(c, s, depth + 1);
          ops.push('Q');
        } else for (const c of el.children) visit(c, s, depth + 1);
        break;
      case 'use': {
        const ref = ids.get((a.href ?? a['xlink:href'] ?? '').replace(/^#/, ''));
        if (ref && ref !== el) {
          ops.push('q', `1 0 0 1 ${f(n('x'))} ${f(n('y'))} cm`);
          if (ref.name === 'symbol') for (const c of ref.children) visit(c, styleOf(ref, s), depth + 1);
          else visit(ref, s, depth + 1);
          ops.push('Q');
        }
        break;
      }
      case 'path':
        if (!hidden) drawPath(parsePath(a.d), s, false);
        break;
      case 'rect': {
        const [x, y, w, h] = [n('x'), n('y'), n('width'), n('height')];
        if (hidden || !(w > 0 && h > 0)) break;
        let rx = a.rx != null ? n('rx') : a.ry != null ? n('ry') : 0;
        let ry = a.ry != null ? n('ry') : rx;
        rx = Math.min(rx, w / 2);
        ry = Math.min(ry, h / 2);
        if (rx > 0 && ry > 0) {
          const k = 0.5522847498;
          drawPath(
            [
              ['M', x + rx, y], ['L', x + w - rx, y], ['C', x + w - rx + k * rx, y, x + w, y + ry - k * ry, x + w, y + ry],
              ['L', x + w, y + h - ry], ['C', x + w, y + h - ry + k * ry, x + w - rx + k * rx, y + h, x + w - rx, y + h],
              ['L', x + rx, y + h], ['C', x + rx - k * rx, y + h, x, y + h - ry + k * ry, x, y + h - ry],
              ['L', x, y + ry], ['C', x, y + ry - k * ry, x + rx - k * rx, y, x + rx, y], ['Z'],
            ],
            s,
            true,
          );
        } else drawPath([['M', x, y], ['L', x + w, y], ['L', x + w, y + h], ['L', x, y + h], ['Z']], s, true);
        break;
      }
      case 'circle':
        if (!hidden && n('r') > 0) drawPath(ellipse(n('cx'), n('cy'), n('r'), n('r')), s, true);
        break;
      case 'ellipse':
        if (!hidden && n('rx') > 0 && n('ry') > 0) drawPath(ellipse(n('cx'), n('cy'), n('rx'), n('ry')), s, true);
        break;
      case 'line':
        if (!hidden) drawPath([['M', n('x1'), n('y1')], ['L', n('x2'), n('y2')]], { ...s, fill: 'none' }, false);
        break;
      case 'polyline':
      case 'polygon': {
        const p = nums(a.points);
        if (hidden || p.length < 4) break;
        const segs = [['M', p[0], p[1]]];
        for (let i = 2; i + 1 < p.length; i += 2) segs.push(['L', p[i], p[i + 1]]);
        if (el.name === 'polygon') segs.push(['Z']);
        drawPath(segs, el.name === 'polyline' ? { ...s, fill: s.fill ?? 'black' } : s, el.name === 'polygon');
        break;
      }
      case 'text': {
        const str = textOf(el).replace(/\s+/g, ' ').trim();
        if (hidden || !str || !encodeText) break;
        const tspan = el.children.find((c) => c.name === 'tspan');
        const x = a.x != null ? nums(a.x)[0] : tspan?.attrs.x != null ? nums(tspan.attrs.x)[0] : 0;
        const y = a.y != null ? nums(a.y)[0] : tspan?.attrs.y != null ? nums(tspan.attrs.y)[0] : 0;
        const size = length(s['font-size'] ?? 16) ?? 16;
        const bold = /bold|[6-9]00/.test(String(s['font-weight'] ?? ''));
        const fill = paintOf(s.fill ?? 'black', s);
        if (fill === 'none') break;
        const { hex, width: em } = encodeText(str, bold);
        const shift = { middle: 0.5, end: 1 }[s['text-anchor']] ?? 0;
        fonts.add(bold ? 'F2' : 'F1');
        ops.push('q', `${fill.map(f).join(' ')} rg`);
        if (s.opacity < 1) ops.push(`${alphaName(s.opacity)} gs`);
        ops.push('BT', `/${bold ? 'F2' : 'F1'} ${f(size)} Tf`, `1 0 0 -1 ${f(x - shift * em * size)} ${f(y)} Tm`, `<${hex}> Tj`, 'ET', 'Q');
        break;
      }
      case 'image': {
        const href = a.href ?? a['xlink:href'] ?? '';
        const m = href.match(/^data:image\/(png|jpe?g|gif|webp);base64,([\s\S]+)$/i);
        if (hidden || !m) break;
        const [x, y, w, h] = [n('x'), n('y'), n('width'), n('height')];
        if (!(w > 0 && h > 0)) break;
        const name = `Im${images.length}`;
        images.push({ name, base64: m[2].replace(/\s+/g, '') });
        ops.push('q', `${f(w)} 0 0 ${f(-h)} ${f(x)} ${f(y + h)} cm`, `/${name} Do`, 'Q');
        break;
      }
    }
    if (tf) ops.push('Q');
  };

  const base = { fill: 'black', stroke: 'none', color: 'black', opacityAll: 1 };
  for (const c of root.children) visit(c, styleOf(root, base));
  return { width, height, content: ops.join('\n'), alphas, images, fonts };
}

/** The viewBox → viewport transform (preserveAspectRatio, default xMidYMid meet). */
function viewBoxOps(vb, w, h, par = '') {
  if (vb.length !== 4 || !(vb[2] > 0 && vb[3] > 0) || !(w > 0 && h > 0)) return [];
  const [, align = 'xMidYMid', slice] = String(par).trim().match(/^(\w+)?\s*(slice)?/) ?? [];
  let sx = w / vb[2];
  let sy = h / vb[3];
  if (align !== 'none') sx = sy = slice ? Math.max(sx, sy) : Math.min(sx, sy);
  const ax = /xMid/.test(align) ? 0.5 : /xMax/.test(align) ? 1 : 0;
  const ay = /YMid/.test(align) ? 0.5 : /YMax/.test(align) ? 1 : 0;
  const tx = align === 'none' ? 0 : ax * (w - vb[2] * sx);
  const ty = align === 'none' ? 0 : ay * (h - vb[3] * sy);
  return [`${f(sx)} 0 0 ${f(sy)} ${f(tx - vb[0] * sx)} ${f(ty - vb[1] * sy)} cm`];
}
