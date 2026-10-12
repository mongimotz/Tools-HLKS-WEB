// SPDX-License-Identifier: AGPL-3.0-or-later
// Scanned pages → vectors for the PDF → DXF tool. Own code, no DOM, works on Uint8Array images.
//
// Steps (vectorizeScan):
//   1. adaptive threshold with an integral image (Bradley): ink where a pixel is clearly darker than its
//      surroundings, so grey or uneven backgrounds stay white
//   2. closing (3 × 3) fills one-pixel holes and gaps; components smaller than minSpeckMm are removed
//   3. skew from projection profiles (rows and columns of ink, ±maxSkew degrees)
//   4a. centre lines: Zhang–Suen thinning, staircase pixels removed, skeleton traced into paths
//   4b. outlines: marching squares on the ink
//   5. Douglas–Peucker, snap to 0° / 90°, collinear pieces merged, corners and T joints closed
//   6. pixels → pt, skew undone around the page centre
// Image coordinates: x right, y down, pixel (x, y) is at index y · w + x. Ink = 1.

import { simplify } from './geometry.js';

const MM_PT = 72 / 25.4;

// ---- 1. threshold -----------------------------------------------------------------------------------

/**
 * Bradley's adaptive threshold: ink when the pixel is darker than (1 − t) times the mean of a
 * win × win window around it, and darker than `maxInk` (so faint paper texture never counts).
 */
export function binarize(gray, w, h, { win = 41, t = 0.18, maxInk = 200 } = {}) {
  const integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += gray[y * w + x];
      integral[(y + 1) * (w + 1) + x + 1] = integral[y * (w + 1) + x + 1] + row;
    }
  }
  const r = win >> 1;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w, x + r + 1);
      const sum = integral[y1 * (w + 1) + x1] - integral[y0 * (w + 1) + x1] - integral[y1 * (w + 1) + x0] + integral[y0 * (w + 1) + x0];
      const mean = sum / ((x1 - x0) * (y1 - y0));
      const v = gray[y * w + x];
      if (v < maxInk && v < mean * (1 - t)) out[y * w + x] = 1;
    }
  }
  return out;
}

// ---- 2. morphology and specks ---------------------------------------------------------------------------

function dilate(bin, w, h) {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!bin[y * w + x]) continue;
      for (let j = -1; j <= 1; j++) {
        const yy = y + j;
        if (yy < 0 || yy >= h) continue;
        for (let i = -1; i <= 1; i++) {
          const xx = x + i;
          if (xx >= 0 && xx < w) out[yy * w + xx] = 1;
        }
      }
    }
  }
  return out;
}

function erode(bin, w, h) {
  const out = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (
        bin[i] &&
        bin[i - 1] &&
        bin[i + 1] &&
        bin[i - w] &&
        bin[i + w] &&
        bin[i - w - 1] &&
        bin[i - w + 1] &&
        bin[i + w - 1] &&
        bin[i + w + 1]
      )
        out[i] = 1;
    }
  }
  return out;
}

/** Closing with a 3 × 3 square: one-pixel holes and gaps in lines are filled. */
export const close3 = (bin, w, h) => erode(dilate(bin, w, h), w, h);

/**
 * Remove connected ink components (8-neighbourhood) whose bounding box is smaller than minSize pixels
 * in both directions (specks, dust, blots). Returns the number of removed components.
 */
export function removeSpecks(bin, w, h, minSize) {
  const label = new Int32Array(w * h);
  const stack = new Int32Array(w * h);
  let removed = 0;
  let next = 0;
  const pixels = [];
  for (let s = 0; s < w * h; s++) {
    if (!bin[s] || label[s]) continue;
    next++;
    let sp = 0;
    stack[sp++] = s;
    label[s] = next;
    let x0 = w;
    let y0 = h;
    let x1 = 0;
    let y1 = 0;
    pixels.length = 0;
    while (sp) {
      const p = stack[--sp];
      pixels.push(p);
      const x = p % w;
      const y = (p - x) / w;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      for (let j = -1; j <= 1; j++) {
        const yy = y + j;
        if (yy < 0 || yy >= h) continue;
        for (let i = -1; i <= 1; i++) {
          const xx = x + i;
          if (xx < 0 || xx >= w) continue;
          const q = yy * w + xx;
          if (bin[q] && !label[q]) {
            label[q] = next;
            stack[sp++] = q;
          }
        }
      }
    }
    if (x1 - x0 + 1 < minSize && y1 - y0 + 1 < minSize) {
      for (const p of pixels) bin[p] = 0;
      removed++;
    }
  }
  return removed;
}

// ---- 3. skew ---------------------------------------------------------------------------------------

/**
 * Skew in degrees (counter-clockwise as seen on the page is positive), from the sharpness of the row and
 * column profiles of the ink after turning back by the candidate angle.
 */
export function estimateSkew(bin, w, h, { maxDeg = 5, sample = 250000 } = {}) {
  const xs = [];
  const ys = [];
  let count = 0;
  for (let i = 0; i < bin.length; i++) if (bin[i]) count++;
  const step = Math.max(1, Math.floor(count / sample));
  let k = 0;
  for (let i = 0; i < bin.length; i++) {
    if (!bin[i]) continue;
    if (k++ % step) continue;
    const x = i % w;
    xs.push(x - w / 2);
    ys.push(h / 2 - (i - x) / w); // y up
  }
  if (xs.length < 50) return 0;
  const size = Math.ceil(Math.hypot(w, h)) + 4;
  const rows = new Float64Array(size);
  const cols = new Float64Array(size);
  const score = (deg) => {
    const a = (deg * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    rows.fill(0);
    cols.fill(0);
    const off = size / 2;
    for (let i = 0; i < xs.length; i++) {
      // turn back by a
      const xr = xs[i] * c + ys[i] * s;
      const yr = -xs[i] * s + ys[i] * c;
      rows[Math.floor(yr + off)]++;
      cols[Math.floor(xr + off)]++;
    }
    let sum = 0;
    for (let i = 0; i < size; i++) sum += rows[i] * rows[i] + cols[i] * cols[i];
    return sum;
  };
  let best = 0;
  let bestScore = -1;
  for (let d = -maxDeg; d <= maxDeg + 1e-9; d += 0.25) {
    const sc = score(d);
    if (sc > bestScore) {
      bestScore = sc;
      best = d;
    }
  }
  const coarse = best;
  for (let d = coarse - 0.25; d <= coarse + 0.25 + 1e-9; d += 0.02) {
    const sc = score(d);
    if (sc > bestScore) {
      bestScore = sc;
      best = d;
    }
  }
  return Math.round(best * 100) / 100;
}

// ---- 4a. thinning and tracing ------------------------------------------------------------------------

/** Zhang–Suen thinning in place. Works on the list of ink pixels only. */
export function thin(bin, w, h) {
  let list = [];
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) if (bin[y * w + x]) list.push(y * w + x);
  // the outer frame is never ink (neighbour access stays inside)
  for (let x = 0; x < w; x++) bin[x] = bin[(h - 1) * w + x] = 0;
  for (let y = 0; y < h; y++) bin[y * w] = bin[y * w + w - 1] = 0;
  const del = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (let pass = 0; pass < 2; pass++) {
      del.length = 0;
      for (const p of list) {
        if (!bin[p]) continue;
        const p2 = bin[p - w];
        const p3 = bin[p - w + 1];
        const p4 = bin[p + 1];
        const p5 = bin[p + w + 1];
        const p6 = bin[p + w];
        const p7 = bin[p + w - 1];
        const p8 = bin[p - 1];
        const p9 = bin[p - w - 1];
        const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
        if (b < 2 || b > 6) continue;
        const a = (!p2 && p3) + (!p3 && p4) + (!p4 && p5) + (!p5 && p6) + (!p6 && p7) + (!p7 && p8) + (!p8 && p9) + (!p9 && p2);
        if (a !== 1) continue;
        if (pass === 0 ? p2 * p4 * p6 || p4 * p6 * p8 : p2 * p4 * p8 || p2 * p6 * p8) continue;
        del.push(p);
      }
      if (del.length) {
        changed = true;
        for (const p of del) bin[p] = 0;
      }
    }
    list = list.filter((p) => bin[p]);
  }
  // staircase pixels: inner corner of an L step whose two arms touch diagonally anyway
  for (const p of list) {
    if (!bin[p]) continue;
    const n = bin[p - w];
    const e = bin[p + 1];
    const s = bin[p + w];
    const wv = bin[p - 1];
    if ((n && e && !bin[p + w - 1] && !s && !wv) || (e && s && !bin[p - w - 1] && !n && !wv) || (s && wv && !bin[p - w + 1] && !n && !e) || (wv && n && !bin[p + w + 1] && !s && !e)) bin[p] = 0;
  }
  return bin;
}

const N8 = (w) => [-w - 1, -w, -w + 1, -1, 1, w - 1, w, w + 1];

/** Skeleton → paths of pixel indices (between end points and junctions; loops closed). */
export function traceSkeleton(skel, w, h) {
  const nb = N8(w);
  const deg = new Uint8Array(w * h);
  const pix = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      if (!skel[p]) continue;
      let d = 0;
      for (const o of nb) d += skel[p + o];
      deg[p] = d;
      pix.push(p);
    }
  }
  const visited = new Uint8Array(w * h); // path pixels (degree 2) already used
  const paths = [];
  const isNode = (p) => deg[p] !== 2;
  for (const n of pix) {
    if (!isNode(n)) continue;
    for (const o of nb) {
      const q = n + o;
      if (!skel[q] || (!isNode(q) && visited[q])) continue;
      if (isNode(q)) {
        if (q > n) paths.push([n, q]); // two touching nodes: one short piece, once
        continue;
      }
      const path = [n, q];
      visited[q] = 1;
      let prev = n;
      let cur = q;
      for (;;) {
        let next = -1;
        for (const o2 of nb) {
          const r = cur + o2;
          if (r === prev || !skel[r]) continue;
          if (isNode(r)) {
            next = r;
            break;
          }
          if (!visited[r]) next = r;
        }
        if (next < 0) break;
        path.push(next);
        if (isNode(next)) break;
        visited[next] = 1;
        prev = cur;
        cur = next;
      }
      paths.push(path);
    }
  }
  // loops without nodes
  for (const p of pix) {
    if (isNode(p) || visited[p]) continue;
    const path = [p];
    visited[p] = 1;
    let cur = p;
    for (;;) {
      let next = -1;
      for (const o of nb) {
        const r = cur + o;
        if (skel[r] && !visited[r] && !isNode(r)) {
          next = r;
          break;
        }
      }
      if (next < 0) break;
      path.push(next);
      visited[next] = 1;
      cur = next;
    }
    path.push(p);
    paths.push(path);
  }
  return paths;
}

/** Chamfer (3–4) distance to the nearest background pixel, in pixels. */
export function distanceTransform(bin, w, h) {
  const big = 1e9;
  const d = new Float64Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = bin[i] ? big : 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!d[i]) continue;
      let v = d[i];
      if (x > 0) v = Math.min(v, d[i - 1] + 3);
      if (y > 0) {
        v = Math.min(v, d[i - w] + 3);
        if (x > 0) v = Math.min(v, d[i - w - 1] + 4);
        if (x < w - 1) v = Math.min(v, d[i - w + 1] + 4);
      } else v = Math.min(v, 3);
      if (x === 0 || x === w - 1) v = Math.min(v, 3);
      d[i] = v;
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (!d[i]) continue;
      let v = d[i];
      if (x < w - 1) v = Math.min(v, d[i + 1] + 3);
      if (y < h - 1) {
        v = Math.min(v, d[i + w] + 3);
        if (x < w - 1) v = Math.min(v, d[i + w + 1] + 4);
        if (x > 0) v = Math.min(v, d[i + w - 1] + 4);
      } else v = Math.min(v, 3);
      d[i] = v;
    }
  for (let i = 0; i < d.length; i++) d[i] /= 3;
  return d;
}

// ---- 4b. outlines --------------------------------------------------------------------------------

/**
 * Marching squares: closed outlines of the ink at the half-way level between pixel centres.
 * Returns rings as flat arrays in pixel coordinates (pixel centres at integer + 0.5).
 */
export function contours(bin, w, h) {
  const at = (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? bin[y * w + x] : 0);
  // edges as pairs of edge-midpoint ids; an id encodes (x2, y2) doubled coordinates
  const W2 = 2 * (w + 2);
  const id = (x2, y2) => (y2 + 2) * W2 + (x2 + 2);
  const nextOf = new Map();
  const add = (a, b) => nextOf.set(a, b);
  for (let y = -1; y < h; y++) {
    for (let x = -1; x < w; x++) {
      // cell corners: tl (x, y), tr (x+1, y), br (x+1, y+1), bl (x, y+1) (pixel centres)
      const tl = at(x, y);
      const tr = at(x + 1, y);
      const br = at(x + 1, y + 1);
      const bl = at(x, y + 1);
      const c = (tl << 3) | (tr << 2) | (br << 1) | bl;
      if (c === 0 || c === 15) continue;
      const T = id(2 * x + 1, 2 * y);
      const R = id(2 * x + 2, 2 * y + 1);
      const B = id(2 * x + 1, 2 * y + 2);
      const L = id(2 * x, 2 * y + 1);
      // edges run with the ink on the left (image coordinates): consistent orientation for linking
      switch (c) {
        case 1: add(L, B); break;
        case 2: add(B, R); break;
        case 3: add(L, R); break;
        case 4: add(R, T); break;
        case 5: add(L, T); add(R, B); break;
        case 6: add(B, T); break;
        case 7: add(L, T); break;
        case 8: add(T, L); break;
        case 9: add(T, B); break;
        case 10: add(T, R); add(B, L); break;
        case 11: add(T, R); break;
        case 12: add(R, L); break;
        case 13: add(R, B); break;
        case 14: add(B, L); break;
      }
    }
  }
  const rings = [];
  const seen = new Set();
  for (const start of nextOf.keys()) {
    if (seen.has(start)) continue;
    const ring = [];
    let cur = start;
    while (cur != null && !seen.has(cur)) {
      seen.add(cur);
      const x2 = (cur % W2) - 2;
      const y2 = Math.floor(cur / W2) - 2;
      ring.push(x2 / 2 + 0.5, y2 / 2 + 0.5);
      cur = nextOf.get(cur);
    }
    if (ring.length >= 6) rings.push(ring);
  }
  return rings;
}

// ---- 5. line clean-up ----------------------------------------------------------------------------

/** Turn segments within tolDeg of horizontal or vertical exactly so (about their midpoint). */
function snapAxis(seg, tolDeg) {
  const [x0, y0, x1, y1] = seg;
  const a = Math.abs((Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI);
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  if (Math.min(a, 180 - a) <= tolDeg) return [x0, my, x1, my];
  if (Math.abs(a - 90) <= tolDeg) return [mx, y0, mx, y1];
  return seg;
}

/**
 * Merge collinear segments that overlap or nearly touch (gap ≤ gapTol, offset ≤ offTol).
 * Segments: [x0, y0, x1, y1, width]. Returns the merged list.
 */
function mergeCollinear(segs, offTol, gapTol) {
  const items = segs.map((s) => {
    let [x0, y0, x1, y1] = s;
    if (x1 < x0 || (x1 === x0 && y1 < y0)) [x0, y0, x1, y1] = [x1, y1, x0, y0];
    let t = Math.atan2(y1 - y0, x1 - x0);
    if (t > Math.PI / 2 - 1e-3) t -= Math.PI;
    const ux = Math.cos(t);
    const uy = Math.sin(t);
    const r = -x0 * uy + y0 * ux;
    return { t, r, ux, uy, s0: x0 * ux + y0 * uy, s1: x1 * ux + y1 * uy, wd: s[4], len: Math.hypot(x1 - x0, y1 - y0), done: false };
  });
  items.sort((p, q) => p.r - q.r);
  const out = [];
  for (let i = 0; i < items.length; i++) {
    const a = items[i];
    if (a.done) continue;
    const group = [a];
    a.done = true;
    for (let j = i + 1; j < items.length && items[j].r - a.r <= offTol; j++) {
      const b = items[j];
      if (b.done) continue;
      const lmax = Math.max(a.len, b.len, 1);
      if (Math.abs(a.t - b.t) > Math.max(offTol / lmax, 0.5 * (Math.PI / 180))) continue;
      group.push(b);
      b.done = true;
    }
    // intervals along the longest member's direction
    const ref = group.reduce((p, q) => (q.len > p.len ? q : p));
    const ivs = group.map((g) => ({ s0: Math.min(g.s0, g.s1), s1: Math.max(g.s0, g.s1), wd: g.wd, r: g.r, len: g.len })).sort((p, q) => p.s0 - q.s0);
    let cur = null;
    const flush = () => {
      if (!cur) return;
      const r = cur.rw / cur.lw;
      out.push([ref.ux * cur.s0 - ref.uy * r, ref.uy * cur.s0 + ref.ux * r, ref.ux * cur.s1 - ref.uy * r, ref.uy * cur.s1 + ref.ux * r, cur.ww / cur.lw]);
    };
    for (const v of ivs) {
      if (cur && v.s0 <= cur.s1 + gapTol) {
        cur.s1 = Math.max(cur.s1, v.s1);
        cur.rw += v.r * v.len;
        cur.ww += v.wd * v.len;
        cur.lw += v.len;
      } else {
        flush();
        cur = { s0: v.s0, s1: v.s1, rw: v.r * v.len, ww: v.wd * v.len, lw: v.len || 1e-9 };
      }
    }
    flush();
  }
  return out;
}

/** Close corners (two ends near each other) and T joints (an end near another segment). */
function closeJoints(segs, tol) {
  const ends = [];
  segs.forEach((s, i) => {
    ends.push({ i, k: 0 });
    ends.push({ i, k: 1 });
  });
  const P = (e) => [segs[e.i][2 * e.k], segs[e.i][2 * e.k + 1]];
  const set = (e, x, y) => {
    segs[e.i][2 * e.k] = x;
    segs[e.i][2 * e.k + 1] = y;
  };
  const cross = (a, b) => {
    const [ax0, ay0, ax1, ay1] = a;
    const [bx0, by0, bx1, by1] = b;
    const rx = ax1 - ax0;
    const ry = ay1 - ay0;
    const sx = bx1 - bx0;
    const sy = by1 - by0;
    const den = rx * sy - ry * sx;
    if (Math.abs(den) < 1e-9) return null;
    const t = ((bx0 - ax0) * sy - (by0 - ay0) * sx) / den;
    return [ax0 + rx * t, ay0 + ry * t];
  };
  const angle = (a, b) => {
    const t1 = Math.atan2(a[3] - a[1], a[2] - a[0]);
    const t2 = Math.atan2(b[3] - b[1], b[2] - b[0]);
    let d = Math.abs(t1 - t2) % Math.PI;
    if (d > Math.PI / 2) d = Math.PI - d;
    return d;
  };
  const MIN_ANGLE = (20 * Math.PI) / 180;
  // corners: ends near each other (grid of cells of size tol)
  const grid = new Map();
  const key = (ix, iy) => ix * 1000003 + iy;
  for (const e of ends) {
    const [x, y] = P(e);
    const k = key(Math.floor(x / tol), Math.floor(y / tol));
    let b = grid.get(k);
    if (!b) grid.set(k, (b = []));
    b.push(e);
  }
  for (const a of ends) {
    const [ax, ay] = P(a);
    const ix = Math.floor(ax / tol);
    const iy = Math.floor(ay / tol);
    for (let j = -1; j <= 1; j++)
      for (let i = -1; i <= 1; i++) {
        for (const b of grid.get(key(ix + i, iy + j)) ?? []) {
          if (b.i <= a.i) continue;
          const [bx, by] = P(b);
          if (Math.abs(ax - bx) > tol || Math.abs(ay - by) > tol) continue;
          if (angle(segs[a.i], segs[b.i]) < MIN_ANGLE) continue;
          const x = cross(segs[a.i], segs[b.i]);
          if (!x || Math.hypot(x[0] - ax, x[1] - ay) > 2 * tol || Math.hypot(x[0] - bx, x[1] - by) > 2 * tol) continue;
          set(a, x[0], x[1]);
          set(b, x[0], x[1]);
        }
      }
  }
  // T joints: an end close to the body of another segment moves onto it (segments in a coarse grid)
  const cell = Math.max(tol * 8, 1);
  const sgrid = new Map();
  segs.forEach((s, j) => {
    const x0 = Math.floor((Math.min(s[0], s[2]) - tol) / cell);
    const x1 = Math.floor((Math.max(s[0], s[2]) + tol) / cell);
    const y0 = Math.floor((Math.min(s[1], s[3]) - tol) / cell);
    const y1 = Math.floor((Math.max(s[1], s[3]) + tol) / cell);
    for (let iy = y0; iy <= y1; iy++)
      for (let ix = x0; ix <= x1; ix++) {
        const k = key(ix, iy);
        let b = sgrid.get(k);
        if (!b) sgrid.set(k, (b = []));
        b.push(j);
      }
  });
  for (const e of ends) {
    const [ex, ey] = P(e);
    for (const j of sgrid.get(key(Math.floor(ex / cell), Math.floor(ey / cell))) ?? []) {
      if (j === e.i) continue;
      const s = segs[j];
      const dx = s[2] - s[0];
      const dy = s[3] - s[1];
      const l2 = dx * dx + dy * dy;
      if (l2 < 1e-9) continue;
      const t = ((ex - s[0]) * dx + (ey - s[1]) * dy) / l2;
      if (t <= 0.02 || t >= 0.98) continue;
      const d = Math.abs((ex - s[0]) * dy - (ey - s[1]) * dx) / Math.sqrt(l2);
      if (d > tol || angle(segs[e.i], s) < MIN_ANGLE) continue;
      const x = cross(segs[e.i], s);
      if (x && Math.hypot(x[0] - ex, x[1] - ey) <= 2 * tol) set(e, x[0], x[1]);
    }
  }
  return segs;
}

// ---- pipeline -----------------------------------------------------------------------------------------

/**
 * Vectorise a grey raster of a page.
 * raster: { width, height, dpi, data } (0 black … 255 white); page: { width, height } in pt.
 * options: { mode: 'centerline' | 'outline', snapDeg: 2, deskew: true, maxSkew: 5, minSpeckMm: 1.2 }
 * Returns { lines: [{ pts (pt, y up), closed, widthPt }], skewDeg, stats }.
 */
export function vectorizeScan(raster, page, options = {}, progress = () => {}) {
  const { mode = 'centerline', snapDeg = 2, deskew = true, maxSkew = 5, minSpeckMm = 1.2 } = options;
  const { width: w, height: h, data } = raster;
  const pxPerMm = raster.dpi / 25.4;
  const t0 = Date.now();
  progress(0.05, 'threshold');
  let bin = binarize(data, w, h, { win: Math.max(15, Math.round(4 * pxPerMm) | 1) });
  progress(0.2, 'morphology');
  bin = close3(bin, w, h);
  const specks = removeSpecks(bin, w, h, Math.max(3, Math.round(minSpeckMm * pxPerMm)));
  progress(0.3, 'skew');
  const skewDeg = deskew ? estimateSkew(bin, w, h, { maxDeg: maxSkew }) : 0;
  // pixel (image) → pt (page, y up), then turn back by the skew about the page centre
  const sx = page.width / w;
  const sy = page.height / h;
  const cx = page.width / 2;
  const cy = page.height / 2;
  const a = (-skewDeg * Math.PI) / 180;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const toPt = (px, py) => {
    const x = px * sx - cx;
    const y = page.height - py * sy - cy;
    return [cx + x * ca - y * sa, cy + x * sa + y * ca];
  };
  const pxPt = (sx + sy) / 2; // pt per pixel
  const lines = [];
  if (mode === 'outline') {
    progress(0.5, 'outline');
    for (const ring of contours(bin, w, h)) {
      const simple = simplify([...ring, ring[0], ring[1]], 0.7);
      simple.length -= 2;
      if (simple.length < 6) continue;
      const pts = [];
      for (let i = 0; i < simple.length; i += 2) pts.push(...toPt(simple[i], simple[i + 1]));
      lines.push({ pts, closed: true, widthPt: 0 });
    }
  } else {
    progress(0.4, 'distance');
    const dist = distanceTransform(bin, w, h);
    progress(0.5, 'thin');
    const skel = thin(bin, w, h);
    progress(0.7, 'trace');
    const paths = traceSkeleton(skel, w, h);
    const nb = N8(w);
    const degree = (p) => {
      let d = 0;
      for (const o of nb) d += skel[p + o];
      return d;
    };
    // skew-corrected pixel coordinates (y up), so the 0° / 90° snap works on the straightened plan
    const segs = [];
    for (const path of paths) {
      if (path.length < 2) continue;
      // spurs: short branches from a rough edge (free end on one side, junction on the other) and short loose bits
      const d0 = degree(path[0]);
      const d1 = degree(path.at(-1));
      const free = (d0 === 1) + (d1 === 1);
      const localWidth = (2 * (dist[path[0]] + dist[path.at(-1)])) / 2;
      if (free === 1 && path.length < Math.max(2 * localWidth, pxPerMm)) continue;
      if (free === 2 && path.length < 0.5 * pxPerMm) continue;
      const flat = [];
      let wsum = 0;
      for (const p of path) {
        const x = p % w;
        const y = (p - x) / w;
        const [X, Y] = toPt(x + 0.5, y + 0.5);
        flat.push(X / pxPt, Y / pxPt); // in pixel units for the tolerances
        wsum += dist[p];
      }
      const width = (2 * wsum) / path.length - 1; // stroke width in pixels
      const simple = simplify(flat, Math.max(1, 0.1 * pxPerMm)); // 0.1 mm, at least one pixel
      for (let i = 2; i < simple.length; i += 2) segs.push([simple[i - 2], simple[i - 1], simple[i], simple[i + 1], width]);
    }
    progress(0.85, 'merge');
    const tolPx = 0.35 * pxPerMm; // offset for collinear pieces
    const snapped = segs.map((s) => [...snapAxis(s, snapDeg), s[4]]).filter((s) => Math.hypot(s[2] - s[0], s[3] - s[1]) > 0.5);
    let merged = mergeCollinear(snapped, tolPx, 0.6 * pxPerMm);
    merged = merged.filter((s) => Math.hypot(s[2] - s[0], s[3] - s[1]) >= 0.5 * pxPerMm);
    closeJoints(merged, 0.8 * pxPerMm);
    for (const s of merged) {
      if (Math.hypot(s[2] - s[0], s[3] - s[1]) < 0.3 * pxPerMm) continue;
      lines.push({ pts: [s[0] * pxPt, s[1] * pxPt, s[2] * pxPt, s[3] * pxPt], closed: false, widthPt: Math.max(0, s[4]) * pxPt });
    }
  }
  progress(1, 'done');
  return { lines, skewDeg, stats: { specks, ms: Date.now() - t0, pixels: w * h, dpi: raster.dpi } };
}

/** Width in pt rounded for layers: scans give noisy widths, so they snap to 0.05 mm steps. */
export const roundWidthPt = (pt) => Math.max(0, Math.round((pt / MM_PT) * 20) / 20) * MM_PT;
