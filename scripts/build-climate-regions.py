# SPDX-License-Identifier: AGPL-3.0-or-later
# Builds tools/climate-station/data/regions.json from a raster of the SIA 2028 climate region map (Figur 1).
#
#   python scripts/build-climate-regions.py map.png
#
# The map image is not part of the repository (it is a figure of the norm). Only the traced outlines are.
# Needs numpy and Pillow.
#
# Steps:
#   1. Georeference: the 40 station dots are the control points. Their LV95 position comes from
#      tools/climate-station/data/stations.json. Affine fit by least squares; points with a residual
#      above MAX_RESIDUAL_KM are drawing errors in the source map (Bern-Liebefeld, Magadino) and are left out.
#   2. Segment: dark lines (country and region borders) are barriers, every closed area gets the region of the
#      station dots in it (or of a manual seed). Line pixels and small areas go to the nearest region.
#   3. Vectorize: the borders between labels are traced on the pixel grid as shared arcs, simplified
#      (Douglas-Peucker) and joined into rings, so neighbouring regions share their border exactly.
#      Lakes (flat grey fills) are traced the same way.

import json
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'tools' / 'climate-station' / 'data'

DARK = 110             # grey value below which a pixel belongs to a border line
DILATE = 3             # px; closes small gaps in the anti-aliased lines
MIN_AREA = 300         # px; smaller closed areas (letters, slivers) take the nearest region
MAX_RESIDUAL_KM = 3.0  # control points with a larger residual are drawing errors
SIMPLIFY_PX = 1.2      # Douglas-Peucker tolerance; above 1 px it removes the pixel stairs
LAKE = (150, 225)      # grey range of lake fills
LAKE_MIN_AREA = 25     # px

# Start guesses (px) for four stations; the fit then finds every dot.
GUESS = {'GVE': (78, 600), 'SHA': (718, 54), 'ROB': (1098, 553), 'BAS': (456, 112)}
# Gaps in the source lines (px polylines added to the barrier).
PATCHES = [[(540, 507), (600, 506)]]
# Areas without a station dot: (x, y) px → region.
SEEDS = [((988, 553), 12), ((1098, 575), 12), ((883, 506), 12), ((590, 625), 12), ((360, 386), 5)]


def lv_to_px(M, e, n):
    return np.array([e / 1000, n / 1000, 1]) @ M


def fit(pairs):
    A = np.array([[e / 1000, n / 1000, 1] for (e, n), _ in pairs])
    B = np.array([p for _, p in pairs])
    M, *_ = np.linalg.lstsq(A, B, rcond=None)
    return M


def shifts(mask, op):
    out = mask.copy()
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dy == 0 and dx == 0:
                continue
            s = np.zeros_like(mask)
            ys = slice(max(dy, 0), mask.shape[0] + min(dy, 0))
            yd = slice(max(-dy, 0), mask.shape[0] + min(-dy, 0))
            xs = slice(max(dx, 0), mask.shape[1] + min(dx, 0))
            xd = slice(max(-dx, 0), mask.shape[1] + min(-dx, 0))
            s[yd, xd] = mask[ys, xs]
            out = op(out, s)
    return out


def dilate(mask):
    return shifts(mask, np.logical_or)


def erode(mask):
    return shifts(mask, np.logical_and)


def components(mask, conn8=False):
    H, W = mask.shape
    lab = np.zeros(mask.shape, np.int32)
    nb = [(1, 0), (-1, 0), (0, 1), (0, -1)] + ([(1, 1), (1, -1), (-1, 1), (-1, -1)] if conn8 else [])
    n = 0
    for y0, x0 in zip(*np.nonzero(mask)):
        if lab[y0, x0]:
            continue
        n += 1
        lab[y0, x0] = n
        q = deque([(y0, x0)])
        while q:
            y, x = q.popleft()
            for dy, dx in nb:
                yy, xx = y + dy, x + dx
                if 0 <= yy < H and 0 <= xx < W and mask[yy, xx] and not lab[yy, xx]:
                    lab[yy, xx] = n
                    q.append((yy, xx))
    return lab, n


def georeference(gray, stations):
    core = erode(erode(gray < DARK))
    lab, n = components(core, conn8=True)
    dots = np.array([[np.nonzero(lab == i)[1].mean(), np.nonzero(lab == i)[0].mean()] for i in range(1, n + 1)])
    pts = {s['id']: (s['e'], s['n']) for s in stations}
    M = fit([(pts[k], v) for k, v in GUESS.items()])
    px_per_km = None
    for _ in range(5):
        match = {}
        for k, (e, nn) in pts.items():
            d = np.hypot(*(dots - lv_to_px(M, e, nn)).T)
            if d.min() < 25:
                match[k] = dots[d.argmin()]
        px_per_km = np.sqrt(abs(np.linalg.det(M[:2, :2])))
        used = {k: v for k, v in match.items() if np.hypot(*(lv_to_px(M, *pts[k]) - v)) / px_per_km <= MAX_RESIDUAL_KM}
        M = fit([(pts[k], v) for k, v in used.items()])
    res = {k: float(np.hypot(*(lv_to_px(M, *pts[k]) - v)) / px_per_km) for k, v in match.items()}
    inl = [r for k, r in res.items() if k in used]
    print(f'control points: {len(used)} of {len(pts)}, rms {np.sqrt(np.mean(np.square(inl))):.2f} km, '
          f'left out: {", ".join(f"{k} {r:.1f} km" for k, r in res.items() if k not in used) or "none"}')
    missing = set(pts) - set(match)
    if missing:
        sys.exit(f'station dots not found: {sorted(missing)}')
    return M, match


def segment(gray, stations, dots):
    H, W = gray.shape
    bar_img = Image.fromarray((gray < DARK).astype(np.uint8) * 255)
    draw = ImageDraw.Draw(bar_img)
    for line in PATCHES:
        draw.line(line, fill=255, width=2)
    bar = np.array(bar_img) > 0
    for _ in range(DILATE):
        bar = dilate(bar)
    lab, n = components(~bar)
    sizes = np.bincount(lab.ravel(), minlength=n + 1)
    outside = lab[0, 0]
    votes = {}
    ring = [(int(round(12 * np.cos(a))), int(round(12 * np.sin(a)))) for a in np.linspace(0, 2 * np.pi, 48, endpoint=False)]
    for s in stations:
        x, y = dots[s['id']]
        for dx, dy in ring:
            yy, xx = int(round(y)) + dy, int(round(x)) + dx
            c = lab[yy, xx]
            if c and c != outside and sizes[c] >= MIN_AREA:
                votes.setdefault(c, {}).setdefault(s['region'], 0)
                votes[c][s['region']] += 1
    for (x, y), region in SEEDS:
        c = lab[y, x]
        if not c or c == outside or sizes[c] < MIN_AREA:
            sys.exit(f'seed {(x, y)} is not inside a closed area')
        votes.setdefault(c, {}).setdefault(region, 0)
        votes[c][region] += 1000
    region_of = {}
    for c, v in votes.items():
        best = max(v, key=v.get)
        if len(v) > 1 and sorted(v.values())[-2] * 4 > v[best]:
            sys.exit(f'area {c} has dots of regions {v}: a border line has a gap, add a patch')
        region_of[c] = best
    out = np.full((H, W), -1, np.int16)
    out[lab == outside] = 0
    for c in range(1, n + 1):
        if c == outside or sizes[c] < MIN_AREA:
            continue
        if c not in region_of:
            ys, xs = np.nonzero(lab == c)
            sys.exit(f'closed area without region at ({int(xs.mean())}, {int(ys.mean())}), {sizes[c]} px: add a seed')
        out[lab == c] = region_of[c]
    # Line pixels and small areas: grow the labels into them.
    while (out < 0).any():
        grown = out.copy()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            src = np.roll(out, (dy, dx), axis=(0, 1))
            take = (grown < 0) & (src >= 0)
            grown[take] = src[take]
        out = grown
    return out


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


def to_lv95(Minv, ring):
    out = []
    for x, y in ring:
        # Padded corner (x, y) → image coordinates with pixel centres on integers (as the fitted dots).
        e, n = np.array([x - 1.5, y - 1.5, 1]) @ Minv
        out.append([int(round(e * 100)) * 10, int(round(n * 100)) * 10])
    # drop repeated points after rounding
    return [p for i, p in enumerate(out) if i == 0 or p != out[i - 1]]


def pole(mask):
    """Pixel deepest inside a mask (label anchor)."""
    depth = np.zeros(mask.shape, np.int32)
    m = mask.copy()
    while m.any():
        depth += m
        m = erode(m)
    y, x = np.unravel_index(np.argmax(depth), depth.shape)
    return x, y


def main():
    if len(sys.argv) != 2:
        sys.exit('usage: python scripts/build-climate-regions.py map.png')
    gray = np.array(Image.open(sys.argv[1]).convert('L')).astype(np.int16)
    meta = json.loads((DATA / 'stations.json').read_text(encoding='utf8'))
    stations = meta['stations']
    M, dots = georeference(gray, stations)
    # px = [e_km, n_km, 1] @ M  →  [e_km, n_km] = (px - M[2]) @ inv(M[:2])
    A = np.linalg.inv(M[:2])
    Minv = np.vstack([A, -M[2] @ A])  # [x, y, 1] @ Minv = [e_km, n_km]

    labels = segment(gray, stations, dots)
    arcs = [(simplify(p, SIMPLIFY_PX), l, r) for p, l, r in trace(labels)]
    regions = []
    for reg in meta['regions']:
        rid = reg['id']
        rings = [to_lv95(Minv, r) for r in rings_of(arcs, rid)]
        lx, ly = pole(labels == rid)
        le, ln = np.array([lx, ly, 1]) @ Minv
        regions.append({'id': rid, 'label': [int(round(le * 100)) * 10, int(round(ln * 100)) * 10], 'rings': [r for r in rings if len(r) >= 3]})
    country = labels > 0
    country_arcs = [(simplify(p, SIMPLIFY_PX), l, r) for p, l, r in trace(country.astype(np.int16))]
    outline = [to_lv95(Minv, r) for r in rings_of(country_arcs, 1)]

    lake = (gray >= LAKE[0]) & (gray <= LAKE[1])
    lake = dilate(erode(lake))
    lab, n = components(lake)
    sizes = np.bincount(lab.ravel(), minlength=n + 1)
    keep = np.isin(lab, [i for i in range(1, n + 1) if sizes[i] >= LAKE_MIN_AREA])
    lake_arcs = [(simplify(p, SIMPLIFY_PX), l, r) for p, l, r in trace(keep.astype(np.int16))]
    lakes = [r for r in (to_lv95(Minv, r) for r in rings_of(lake_arcs, 1)) if len(r) >= 3]

    out = {
        'source': 'Klimaregionen nach SIA 2028:2010, Figur 1, nachgezeichnet (schematisch). LV95 in m.',
        'regions': regions,
        'country': [r for r in outline if len(r) >= 3],
        'lakes': lakes,
    }
    text = '{\n' + ',\n'.join(f'  {json.dumps(k)}: {json.dumps(v, ensure_ascii=False, separators=(",", ":"))}' for k, v in out.items()) + '\n}\n'
    (DATA / 'regions.json').write_text(text, encoding='utf8', newline='\n')
    n_pts = sum(len(r) for reg in regions for r in reg['rings'])
    print(f'regions: {n_pts} points, country {sum(map(len, out["country"]))}, lakes {len(lakes)}, {len(text) / 1024:.0f} KB')


if __name__ == '__main__':
    main()
