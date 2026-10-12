// SPDX-License-Identifier: AGPL-3.0-or-later
// Plane geometry for the PDF → DXF pipeline: matrices, Bézier curves, circle fit, intersections,
// polygon tests, a spatial hash. No DOM. Points are passed as numbers or flat arrays [x0, y0, x1, y1, …].

export const EPS = 1e-9;

// ---- affine matrices [a, b, c, d, e, f]: x' = a x + c y + e, y' = b x + d y + f (PDF / MuPDF order) ----

export const IDENTITY = Object.freeze([1, 0, 0, 1, 0, 0]);

/** First m1, then m2. */
export function concat(m1, m2) {
  return [
    m1[0] * m2[0] + m1[1] * m2[2],
    m1[0] * m2[1] + m1[1] * m2[3],
    m1[2] * m2[0] + m1[3] * m2[2],
    m1[2] * m2[1] + m1[3] * m2[3],
    m1[4] * m2[0] + m1[5] * m2[2] + m2[4],
    m1[4] * m2[1] + m1[5] * m2[3] + m2[5],
  ];
}

export function invert(m) {
  const det = m[0] * m[3] - m[1] * m[2];
  if (Math.abs(det) < EPS) return null;
  const a = m[3] / det;
  const b = -m[1] / det;
  const c = -m[2] / det;
  const d = m[0] / det;
  return [a, b, c, d, -(m[4] * a + m[5] * c), -(m[4] * b + m[5] * d)];
}

export const applyX = (m, x, y) => m[0] * x + m[2] * y + m[4];
export const applyY = (m, x, y) => m[1] * x + m[3] * y + m[5];

/** Geometric mean scale of a matrix (for line widths and dash lengths). */
export const matrixScale = (m) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));

/** Apply a matrix to a flat point array in place. */
export function transformPoints(pts, m) {
  for (let i = 0; i < pts.length; i += 2) {
    const x = pts[i];
    const y = pts[i + 1];
    pts[i] = m[0] * x + m[2] * y + m[4];
    pts[i + 1] = m[1] * x + m[3] * y + m[5];
  }
  return pts;
}

// ---- cubic Bézier: flat array [x0, y0, x1, y1, x2, y2, x3, y3] -------------------------------------

export function bezierPoint(b, t) {
  const u = 1 - t;
  const w0 = u * u * u;
  const w1 = 3 * u * u * t;
  const w2 = 3 * u * t * t;
  const w3 = t * t * t;
  return [w0 * b[0] + w1 * b[2] + w2 * b[4] + w3 * b[6], w0 * b[1] + w1 * b[3] + w2 * b[5] + w3 * b[7]];
}

/** Largest distance of the control points from the chord: an upper bound of the flattening error. */
function bezierFlatness(b) {
  const dx = b[6] - b[0];
  const dy = b[7] - b[1];
  const len = Math.hypot(dx, dy);
  if (len < EPS) return Math.max(Math.hypot(b[2] - b[0], b[3] - b[1]), Math.hypot(b[4] - b[0], b[5] - b[1]));
  const d1 = Math.abs((b[2] - b[0]) * dy - (b[3] - b[1]) * dx) / len;
  const d2 = Math.abs((b[4] - b[0]) * dy - (b[5] - b[1]) * dx) / len;
  return Math.max(d1, d2);
}

/**
 * Flatten a cubic into points (without the start point) appended to `out`, with a maximum chord
 * deviation `tol`. Uniform subdivision with the segment count from the second-difference bound.
 */
export function flattenBezier(b, tol, out = []) {
  const ddx = Math.max(Math.abs(b[0] - 2 * b[2] + b[4]), Math.abs(b[2] - 2 * b[4] + b[6]));
  const ddy = Math.max(Math.abs(b[1] - 2 * b[3] + b[5]), Math.abs(b[3] - 2 * b[5] + b[7]));
  const dd = Math.hypot(ddx, ddy);
  // error of uniform subdivision ≤ 3/4 · dd / n² (Wang's formula, cubic)
  let n = Math.ceil(Math.sqrt((0.75 * dd) / Math.max(tol, EPS)));
  if (bezierFlatness(b) <= tol) n = 1;
  n = Math.min(Math.max(n, 1), 512);
  for (let i = 1; i <= n; i++) {
    const [x, y] = bezierPoint(b, i / n);
    out.push(x, y);
  }
  return out;
}

/** Approximate arc length of a cubic. */
export function bezierLength(b) {
  const pts = flattenBezier(b, 0.01, [b[0], b[1]]);
  let len = 0;
  for (let i = 2; i < pts.length; i += 2) len += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
  return len;
}

// ---- circles and arcs -----------------------------------------------------------------------------

/**
 * Least-squares circle through points (Kåsa fit on centred data).
 * Returns { cx, cy, r, maxDev } or null when the points are (nearly) collinear.
 */
export function fitCircle(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) {
    mx += xs[i];
    my += ys[i];
  }
  mx /= n;
  my /= n;
  let suu = 0;
  let svv = 0;
  let suv = 0;
  let suuu = 0;
  let svvv = 0;
  let suvv = 0;
  let svuu = 0;
  for (let i = 0; i < n; i++) {
    const u = xs[i] - mx;
    const v = ys[i] - my;
    suu += u * u;
    svv += v * v;
    suv += u * v;
    suuu += u * u * u;
    svvv += v * v * v;
    suvv += u * v * v;
    svuu += v * u * u;
  }
  const det = suu * svv - suv * suv;
  const scale = (suu + svv) ** 2;
  if (!(Math.abs(det) > 1e-12 * scale)) return null;
  const bu = 0.5 * (suuu + suvv);
  const bv = 0.5 * (svvv + svuu);
  const uc = (bu * svv - bv * suv) / det;
  const vc = (suu * bv - suv * bu) / det;
  const cx = uc + mx;
  const cy = vc + my;
  let r = 0;
  for (let i = 0; i < n; i++) r += Math.hypot(xs[i] - cx, ys[i] - cy);
  r /= n;
  let maxDev = 0;
  for (let i = 0; i < n; i++) maxDev = Math.max(maxDev, Math.abs(Math.hypot(xs[i] - cx, ys[i] - cy) - r));
  return { cx, cy, r, maxDev };
}

/** Angle of (x, y) around (cx, cy) in degrees, 0 … 360. */
export function angleDeg(cx, cy, x, y) {
  const a = (Math.atan2(y - cy, x - cx) * 180) / Math.PI;
  return a < 0 ? a + 360 : a;
}

/** Counter-clockwise sweep from a0 to a1 in degrees, 0 … 360. */
export function sweepCcw(a0, a1) {
  const s = (((a1 - a0) % 360) + 360) % 360;
  return s;
}

export const normAngle = (a) => ((a % 360) + 360) % 360;

/** Points of an arc (counter-clockwise from start to end, degrees) with chord deviation ≤ tol. */
export function flattenArc(cx, cy, r, start, end, tol, out = []) {
  let sweep = sweepCcw(start, end);
  if (sweep < EPS) sweep = 360;
  const step = r > tol ? 2 * Math.acos(Math.max(-1, 1 - tol / r)) : Math.PI / 2;
  const n = Math.max(1, Math.min(1024, Math.ceil(((sweep * Math.PI) / 180) / Math.max(step, 1e-3))));
  for (let i = 0; i <= n; i++) {
    const t = ((start + (sweep * i) / n) * Math.PI) / 180;
    out.push(cx + r * Math.cos(t), cy + r * Math.sin(t));
  }
  return out;
}

// ---- segments and polygons ----------------------------------------------------------------------

export const dist = (x0, y0, x1, y1) => Math.hypot(x1 - x0, y1 - y0);

/** Length of a flat polyline; closed adds the closing segment. */
export function polylineLength(pts, closed = false) {
  let len = 0;
  for (let i = 2; i < pts.length; i += 2) len += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
  if (closed && pts.length >= 4) len += Math.hypot(pts[0] - pts[pts.length - 2], pts[1] - pts[pts.length - 1]);
  return len;
}

/** Distance of point p from the segment a–b. */
export function pointSegmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Liang–Barsky: clip segment p0–p1 to the rectangle [x0, y0, x1, y1].
 * Returns [t0, t1] (parameters along the segment) or null when nothing is inside.
 */
export function clipSegmentRect(ax, ay, bx, by, r) {
  const dx = bx - ax;
  const dy = by - ay;
  let t0 = 0;
  let t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [ax - r[0], r[2] - ax, ay - r[1], r[3] - ay];
  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < EPS) {
      if (q[i] < -EPS) return null;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > t1) return null;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return null;
        if (t < t1) t1 = t;
      }
    }
  }
  return t1 - t0 > EPS ? [t0, t1] : null;
}

/** Parameter t along a–b where it crosses c–d, or null (parallel or outside c–d). */
export function segmentCrossT(ax, ay, bx, by, cx, cy, dx, dy) {
  const rx = bx - ax;
  const ry = by - ay;
  const sx = dx - cx;
  const sy = dy - cy;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < EPS) return null;
  const t = ((cx - ax) * sy - (cy - ay) * sx) / den;
  const u = ((cx - ax) * ry - (cy - ay) * rx) / den;
  if (u < -EPS || u > 1 + EPS) return null;
  return t;
}

/** Point in polygon rings (flat arrays, implicitly closed). evenOdd or non-zero winding. */
export function pointInRings(x, y, rings, evenOdd = false) {
  let winding = 0;
  let crossings = 0;
  for (const ring of rings) {
    const n = ring.length;
    for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
      const xi = ring[i];
      const yi = ring[i + 1];
      const xj = ring[j];
      const yj = ring[j + 1];
      if (yj <= y) {
        if (yi > y && (xi - xj) * (y - yj) - (x - xj) * (yi - yj) > 0) {
          winding++;
          crossings++;
        }
      } else if (yi <= y && (xi - xj) * (y - yj) - (x - xj) * (yi - yj) < 0) {
        winding--;
        crossings++;
      }
    }
  }
  return evenOdd ? crossings % 2 === 1 : winding !== 0;
}

/** Signed area of a flat ring (counter-clockwise positive). */
export function ringArea(ring) {
  let a = 0;
  const n = ring.length;
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) a += ring[j] * ring[i + 1] - ring[i] * ring[j + 1];
  return a / 2;
}

/** Axis-aligned rectangle [x0, y0, x1, y1] if the ring is one, else null. */
export function ringAsRect(ring, tol = 1e-6) {
  let pts = ring;
  const n = pts.length / 2;
  if (n === 5 && Math.abs(pts[0] - pts[8]) < tol && Math.abs(pts[1] - pts[9]) < tol) pts = pts.slice(0, 8);
  if (pts.length !== 8) return null;
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const dx = Math.abs(pts[2 * j] - pts[2 * i]);
    const dy = Math.abs(pts[2 * j + 1] - pts[2 * i + 1]);
    if (dx > tol && dy > tol) return null;
  }
  const xs = [pts[0], pts[2], pts[4], pts[6]];
  const ys = [pts[1], pts[3], pts[5], pts[7]];
  const r = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  return r[2] - r[0] > tol && r[3] - r[1] > tol ? r : null;
}

// ---- Douglas–Peucker -----------------------------------------------------------------------------

/** Simplify a flat polyline; keeps the end points. */
export function simplify(pts, tol) {
  const n = pts.length / 2;
  if (n <= 2) return pts.slice();
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack = [0, n - 1];
  while (stack.length) {
    const b = stack.pop();
    const a = stack.pop();
    let max = -1;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = pointSegmentDistance(pts[2 * i], pts[2 * i + 1], pts[2 * a], pts[2 * a + 1], pts[2 * b], pts[2 * b + 1]);
      if (d > max) {
        max = d;
        idx = i;
      }
    }
    if (max > tol) {
      keep[idx] = 1;
      stack.push(a, idx, idx, b);
    }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[2 * i], pts[2 * i + 1]);
  return out;
}

// ---- spatial hash ------------------------------------------------------------------------------

/** Grid of buckets for nearby-point queries. Keys are integers (no strings in the hot path). */
export class SpatialHash {
  constructor(cell) {
    this.cell = cell;
    this.map = new Map();
  }
  key(ix, iy) {
    return ix * 73856093 + iy * 19349663; // two primes, collisions only cost a few extra checks
  }
  insert(x, y, value) {
    const k = this.key(Math.floor(x / this.cell), Math.floor(y / this.cell));
    let b = this.map.get(k);
    if (!b) this.map.set(k, (b = []));
    b.push(value);
  }
  /** Calls fn(value) for every value stored near (x, y) (same and neighbouring cells). */
  near(x, y, fn) {
    const ix = Math.floor(x / this.cell);
    const iy = Math.floor(y / this.cell);
    for (let j = -1; j <= 1; j++)
      for (let i = -1; i <= 1; i++) {
        const b = this.map.get(this.key(ix + i, iy + j));
        if (b) for (const v of b) fn(v);
      }
  }
}

/** Bounding box [x0, y0, x1, y1] of a flat point array. */
export function boundsOf(pts, box = [Infinity, Infinity, -Infinity, -Infinity]) {
  for (let i = 0; i < pts.length; i += 2) {
    if (pts[i] < box[0]) box[0] = pts[i];
    if (pts[i + 1] < box[1]) box[1] = pts[i + 1];
    if (pts[i] > box[2]) box[2] = pts[i];
    if (pts[i + 1] > box[3]) box[3] = pts[i + 1];
  }
  return box;
}
