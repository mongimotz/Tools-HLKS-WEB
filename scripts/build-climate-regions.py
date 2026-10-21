# SPDX-License-Identifier: AGPL-3.0-or-later
# Builds tools/climate-station/data/regions.json from a vector redraw of the SIA 2028 climate region map (Figur 1).
#
#   python scripts/build-climate-regions.py map.svg
#
# The SVG is not part of the repository (it redraws a figure of the norm). Only the derived data is.
# Needs numpy and Pillow.
#
# Expected SVG (absolute M / C / Z paths, no transforms), groups by id:
#   umriss               country outline (one closed path)
#   klimazonen-grenzen   region borders (open paths)
#   seen, fluesse        lakes (closed) and rivers (open)
#   klimazonen-nummern   one <text> per region number, placed inside its region
#   stationen            one <circle> per station
#
# Steps:
#   1. Georeference: the 40 station circles are the control points, their LV95 position comes from
#      tools/climate-station/data/stations.json. Affine fit by least squares; points with a residual above
#      MAX_RESIDUAL_KM are drawing errors in the source map (Bern-Liebefeld, Magadino) and are left out.
#   2. Drawing data: outline, borders, lakes and rivers are flattened from the Bézier curves and simplified to
#      DRAW_KM (rivers RIVER_KM), so they stay smooth at every zoom.
#   3. Region areas for the point lookup: outline and borders are rasterised at SCALE, every closed area takes
#      the region of the station or number inside it (or of a SEEDS entry); line pixels go to the nearest region.
#      The borders between labels are traced as shared arcs, simplified (Douglas-Peucker) and joined into rings,
#      so neighbouring regions share their border exactly.

import json
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'tools' / 'climate-station' / 'data'

SCALE = 3              # raster px per SVG unit for the region areas
LINE_PX = 7            # raster line width of outline and borders
MIN_AREA = 2000        # raster px; smaller closed areas take the nearest region
MAX_RESIDUAL_KM = 3.0  # control points with a larger residual are drawing errors
SIMPLIFY_PX = 1.5      # Douglas-Peucker tolerance of the region areas, raster px
DRAW_KM = 0.03         # tolerance of outline, borders and lakes
RIVER_KM = 0.08        # tolerance of rivers
MIN_RIVER = 60         # SVG units; shorter river pieces are left out
NUMBER_DY = -12        # SVG units from the baseline of a region number to its centre

# Start guesses (SVG units) for four stations; the fit then finds every circle.
GUESS = {'GVE': (86, 1016), 'SHA': (1168.8, 99.6), 'ROB': (1808, 937), 'BAS': (725.7, 197.1)}
# Areas without a station or number: (x, y) in SVG units → region.
SEEDS = []

OUTSIDE = 200
BARRIER = 255


# ---- SVG ----------------------------------------------------------------------

def parse_path(d):
    """Absolute M / C / Z path → list of (points, closed); points = start point + 3 per cubic segment."""
    tokens = re.findall(r'[A-Za-z]|-?\d*\.?\d+(?:e-?\d+)?', d)
    subs, pts, cmd, i = [], None, None, 0
    while i < len(tokens):
        t = tokens[i]
        if t.isalpha():
            if t not in 'MCZ':
                sys.exit(f'path command {t} is not supported (only absolute M, C, Z)')
            cmd = t
            i += 1
            if t == 'Z':
                subs.append((pts, True))
                pts = None
            continue
        if cmd == 'M':
            if pts:
                subs.append((pts, False))
            pts = [(float(tokens[i]), float(tokens[i + 1]))]
            i += 2
        elif cmd == 'C':
            pts += [(float(tokens[i + k]), float(tokens[i + k + 1])) for k in (0, 2, 4)]
            i += 6
        else:
            sys.exit(f'unexpected path data near {t}')
    if pts:
        subs.append((pts, False))
    return subs


def read_svg(path):
    s = Path(path).read_text(encoding='utf8')
    if 'transform' in s:
        sys.exit('transforms are not supported')
    m = re.search(r'viewBox="0 0 ([\d.]+) ([\d.]+)"', s)

    def group(name):
        g = re.search(rf'<g id="{name}"[^>]*>(.*?)</g>', s, re.S)
        if not g:
            sys.exit(f'group {name} missing')
        return g.group(1)

    def paths(name):
        return [sub for d in re.findall(r' d="([^"]*)"', group(name)) for sub in parse_path(d)]

    return {
        'size': (float(m.group(1)), float(m.group(2))),
        'outline': paths('umriss'),
        'borders': paths('klimazonen-grenzen'),
        'lakes': paths('seen'),
        'rivers': paths('fluesse'),
        'numbers': [(float(x), float(y), int(t)) for x, y, t in re.findall(r'<text x="([\d.]+)" y="([\d.]+)"[^>]*>\s*(\d+)\s*</text>', group('klimazonen-nummern'))],
        'circles': [(float(x), float(y)) for x, y in re.findall(r'<circle cx="([\d.]+)" cy="([\d.]+)"', group('stationen'))],
    }


def flatten(pts, steps=12):
    out = [pts[0]]
    for k in range(1, len(pts), 3):
        p0, p1, p2, p3 = (np.array(p) for p in (pts[k - 1], pts[k], pts[k + 1], pts[k + 2]))
        for t in np.linspace(0, 1, steps + 1)[1:]:
            u = 1 - t
            out.append(tuple(u ** 3 * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t ** 3 * p3))
    return out


def length(pts):
    f = np.array(flatten(pts, 4))
    return float(np.hypot(*np.diff(f, axis=0).T).sum())


# ---- georeference -------------------------------------------------------------

def lv_to_px(M, e, n):
    return np.array([e / 1000, n / 1000, 1]) @ M


def fit(pairs):
    A = np.array([[e / 1000, n / 1000, 1] for (e, n), _ in pairs])
    B = np.array([p for _, p in pairs])
    M, *_ = np.linalg.lstsq(A, B, rcond=None)
    return M


def georeference(circles, stations):
    dots = np.array(circles)
    pts = {s['id']: (s['e'], s['n']) for s in stations}
    M = fit([(pts[k], v) for k, v in GUESS.items()])
    for _ in range(5):
        px_per_km = np.sqrt(abs(np.linalg.det(M[:2, :2])))
        match = {}
        for k, (e, n) in pts.items():
            d = np.hypot(*(dots - lv_to_px(M, e, n)).T)
            if d.min() < 8 * px_per_km:
                match[k] = dots[d.argmin()]
        used = {k: v for k, v in match.items() if np.hypot(*(lv_to_px(M, *pts[k]) - v)) / px_per_km <= MAX_RESIDUAL_KM}
        M = fit([(pts[k], v) for k, v in used.items()])
    px_per_km = np.sqrt(abs(np.linalg.det(M[:2, :2])))
    res = {k: float(np.hypot(*(lv_to_px(M, *pts[k]) - v)) / px_per_km) for k, v in match.items()}
    inl = [r for k, r in res.items() if k in used]
    print(f'control points: {len(used)} of {len(pts)}, rms {np.sqrt(np.mean(np.square(inl))):.2f} km, '
          f'left out: {", ".join(f"{k} {r:.1f} km" for k, r in res.items() if k not in used) or "none"}')
    if set(pts) - set(match) or len({tuple(v) for v in match.values()}) != len(match):
        sys.exit(f'station circles not matched one to one, missing: {sorted(set(pts) - set(match))}')
    return M, match


# ---- region areas -------------------------------------------------------------

def segment(svg, stations, dots):
    W, H = (int(v * SCALE) for v in svg['size'])
    img = Image.new('L', (W, H), 0)
    draw = ImageDraw.Draw(img)
    r = LINE_PX / 2
    for pts, closed in svg['outline'] + svg['borders']:
        line = [(x * SCALE, y * SCALE) for x, y in flatten(pts)]
        if closed:
            line.append(line[0])
        draw.line(line, fill=BARRIER, width=LINE_PX, joint='curve')
        for x, y in (line[0], line[-1]):
            draw.ellipse([x - r, y - r, x + r, y + r], fill=BARRIER)
    ImageDraw.floodfill(img, (0, 0), OUTSIDE, thresh=0)
    seeds = [(dots[s['id']], s['region'], s['id']) for s in stations]
    seeds += [((x, y + NUMBER_DY), region, f'number {region}') for x, y, region in svg['numbers']]
    seeds += [(xy, region, f'seed {xy}') for xy, region in SEEDS]
    for (x, y), region, name in seeds:
        px = (int(round(x * SCALE)), int(round(y * SCALE)))
        v = img.getpixel(px)
        if v in (BARRIER, OUTSIDE):
            print(f'  {name}: {"on a line" if v == BARRIER else "outside the outline"}, not used')
        elif v not in (0, region):
            sys.exit(f'{name}: its area already has region {v}, expected {region}: a border line has a gap')
        elif v == 0:
            ImageDraw.floodfill(img, px, region, thresh=0)
    a = np.array(img)
    # Areas no seed reached: slivers at line joints are fine, a large one needs a SEEDS entry.
    # Checked on blocks of 8 × 8 px, where slivers vanish.
    k = 8
    h, w = a.shape[0] // k * k, a.shape[1] // k * k
    empty = (a[:h, :w] == 0).reshape(h // k, k, w // k, k).all(axis=(1, 3))
    if empty.any():
        lab = Image.fromarray(empty.astype(np.uint8) * 255)
        for y, x in zip(*np.nonzero(empty)):
            if lab.getpixel((int(x), int(y))) != 255:
                continue
            ImageDraw.floodfill(lab, (int(x), int(y)), 1, thresh=0)
            arr = np.array(lab)
            area = int((arr == 1).sum()) * k * k
            if area >= MIN_AREA:
                sys.exit(f'closed area without region at SVG ({x * k / SCALE:.0f}, {y * k / SCALE:.0f}), {area} px: add a SEEDS entry')
            arr[arr == 1] = 2
            lab = Image.fromarray(arr)
    out = a.astype(np.int16)
    out[(a == BARRIER) | (a == 0)] = -1
    out[a == OUTSIDE] = 0
    while (out < 0).any():
        grown = out.copy()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            src = np.roll(out, (dy, dx), axis=(0, 1))
            take = (grown < 0) & (src >= 0)
            grown[take] = src[take]
        out = grown
    return out


# ---- tracing ------------------------------------------------------------------

def trace(labels):
    """Shared border arcs of a label raster on the pixel-corner grid. Returns [(points, left, right)].

    The raster is padded by one pixel. Corner (x, y) is the top-left corner of padded pixel (row y, column x).
    """
    H, W = labels.shape
    L = np.full((H + 2, W + 2), -9, np.int32)
    L[1:-1, 1:-1] = labels

    def px(r, c):
        return L[r, c] if 0 <= r < H + 2 and 0 <= c < W + 2 else -9

    def edges_at(x, y):
        out = []
        if px(y - 1, x) != px(y, x):
            out.append((x + 1, y))
        if px(y - 1, x - 1) != px(y, x - 1):
            out.append((x - 1, y))
        if px(y, x - 1) != px(y, x):
            out.append((x, y + 1))
        if px(y - 1, x - 1) != px(y - 1, x):
            out.append((x, y - 1))
        return out

    def is_node(c):
        x, y = c
        quad = {px(y - 1, x - 1), px(y - 1, x), px(y, x - 1), px(y, x)}
        return len(edges_at(x, y)) != 2 or len(quad) > 2

    def key(a, b):
        return (a, b) if a <= b else (b, a)

    visited = set()

    def walk(start, nxt):
        pts = [start, nxt]
        visited.add(key(start, nxt))
        prev, cur = start, nxt
        while not is_node(cur):
            p = next(q for q in edges_at(*cur) if q != prev)
            if key(cur, p) in visited:
                break
            visited.add(key(cur, p))
            pts.append(p)
            prev, cur = cur, p
        return pts

    corners = set()
    hy, hx = np.nonzero(L[:-1, :] != L[1:, :])   # edge below padded row hy, column hx
    for y, x in zip(hy.tolist(), hx.tolist()):
        corners.update(((x, y + 1), (x + 1, y + 1)))
    vy, vx = np.nonzero(L[:, :-1] != L[:, 1:])   # edge right of padded column vx, row vy
    for y, x in zip(vy.tolist(), vx.tolist()):
        corners.update(((x + 1, y), (x + 1, y + 1)))
    arcs = []
    for c in [c for c in corners if is_node(c)]:
        for p in edges_at(*c):
            if key(c, p) not in visited:
                arcs.append(walk(c, p))
    for c in corners:  # closed loops without a node
        for p in edges_at(*c):
            if key(c, p) not in visited:
                arcs.append(walk(c, p))
    out = []
    for pts in arcs:
        (x0, y0), (x1, y1) = pts[0], pts[1]
        # Labels left and right of the first step (y down).
        if x1 > x0:
            left, right = px(y0 - 1, x0), px(y0, x0)
        elif x1 < x0:
            left, right = px(y0, x1), px(y0 - 1, x1)
        elif y1 > y0:
            left, right = px(y0, x0), px(y0, x0 - 1)
        else:
            left, right = px(y1, x0 - 1), px(y1, x0)
        out.append((pts, int(left), int(right)))
    return out


def simplify(pts, tol):
    pts = np.array(pts, float)
    if len(pts) < 3:
        return pts.tolist()
    closed = np.allclose(pts[0], pts[-1])
    if closed:
        far = np.argmax(np.hypot(*(pts - pts[0]).T))
        return simplify(pts[:far + 1], tol)[:-1] + simplify(pts[far:], tol)
    keep = np.zeros(len(pts), bool)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        if b <= a + 1:
            continue
        p, q = pts[a], pts[b]
        d = q - p
        seg = pts[a + 1:b] - p
        n = np.hypot(*d)
        dist = np.abs(d[0] * seg[:, 1] - d[1] * seg[:, 0]) / n if n else np.hypot(*seg.T)
        i = int(np.argmax(dist))
        if dist[i] > tol:
            keep[a + 1 + i] = True
            stack += [(a, a + 1 + i), (a + 1 + i, b)]
    return pts[keep].tolist()


def rings_of(arcs, label):
    """Join the arcs around `label` into closed rings (label on the left)."""
    parts = []
    for pts, left, right in arcs:
        if left == label and right != label:
            parts.append([tuple(p) for p in pts])
        elif right == label and left != label:
            parts.append([tuple(p) for p in reversed(pts)])
    by_start = {}
    for i, p in enumerate(parts):
        by_start.setdefault(p[0], []).append(i)
    used = set()
    rings = []
    for i in range(len(parts)):
        if i in used:
            continue
        used.add(i)
        ring = list(parts[i])
        while ring[-1] != ring[0]:
            nxt = [j for j in by_start.get(ring[-1], []) if j not in used]
            if not nxt:
                sys.exit(f'open ring for label {label}')
            used.add(nxt[0])
            ring += parts[nxt[0]][1:]
        rings.append(ring[:-1])
    return rings


def to_lv95(Minv, x, y):
    e, n = np.array([x, y, 1]) @ Minv
    return [int(round(e * 100)) * 10, int(round(n * 100)) * 10]


def ring_to_lv95(Minv, ring):
    # Padded raster corner (x, y) → SVG units.
    out = [to_lv95(Minv, (x - 1) / SCALE, (y - 1) / SCALE) for x, y in ring]
    return [p for i, p in enumerate(out) if i == 0 or p != out[i - 1]]


def line_to_lv95(Minv, pts, closed, tol):
    flat = flatten(pts)
    if closed:
        flat.append(flat[0])
    out = [to_lv95(Minv, x, y) for x, y in simplify(flat, tol)]
    out = [p for i, p in enumerate(out) if i == 0 or p != out[i - 1]]
    return out[:-1] if closed and out[0] == out[-1] else out


def main():
    if len(sys.argv) != 2:
        sys.exit('usage: python scripts/build-climate-regions.py map.svg')
    svg = read_svg(sys.argv[1])
    meta = json.loads((DATA / 'stations.json').read_text(encoding='utf8'))
    stations = meta['stations']
    M, dots = georeference(svg['circles'], stations)
    A = np.linalg.inv(M[:2])
    Minv = np.vstack([A, -M[2] @ A])  # [x, y, 1] @ Minv = [e_km, n_km]

    labels = segment(svg, stations, dots)
    arcs = [(simplify(p, SIMPLIFY_PX), l, r) for p, l, r in trace(labels)]
    numbers = {region: (x, y + NUMBER_DY) for x, y, region in svg['numbers']}
    regions = []
    for reg in meta['regions']:
        rid = reg['id']
        rings = [r for r in (ring_to_lv95(Minv, r) for r in rings_of(arcs, rid)) if len(r) >= 3]
        regions.append({'id': rid, 'label': to_lv95(Minv, *numbers[rid]), 'rings': rings})

    px_per_km = np.sqrt(abs(np.linalg.det(M[:2, :2])))

    def lines(items, km):
        return [line_to_lv95(Minv, pts, closed, km * px_per_km) for pts, closed in items]

    out = {
        'source': 'Klimaregionen nach SIA 2028:2010, Figur 1, als Vektorgrafik nachgezeichnet (schematisch). LV95 in m. '
                  'regions: Flächen für die Abfrage. outline, lakes: geschlossene Linien, borders, rivers: offene Linien, zum Zeichnen.',
        'regions': regions,
        'outline': lines(svg['outline'], DRAW_KM),
        'borders': lines(svg['borders'], DRAW_KM),
        'lakes': lines(svg['lakes'], DRAW_KM),
        'rivers': lines([r for r in svg['rivers'] if length(r[0]) >= MIN_RIVER], RIVER_KM),
    }
    text = '{\n' + ',\n'.join(f'  {json.dumps(k)}: {json.dumps(v, ensure_ascii=False, separators=(",", ":"))}' for k, v in out.items()) + '\n}\n'
    (DATA / 'regions.json').write_text(text, encoding='utf8', newline='\n')
    n_pts = sum(len(r) for reg in regions for r in reg['rings'])
    count = lambda key: sum(map(len, out[key]))
    print(f'points: regions {n_pts}, outline {count("outline")}, borders {count("borders")}, lakes {count("lakes")}, '
          f'rivers {count("rivers")} ({len(out["rivers"])} lines); {len(text) / 1024:.0f} KB')


if __name__ == '__main__':
    main()
