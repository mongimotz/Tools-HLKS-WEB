// SPDX-License-Identifier: AGPL-3.0-or-later
// Scan quality: how many truth lines the vectorisation found. A truth line is found when at least 90 % of
// its length (sampled every 0.5 mm) lies within `tolPt` of an output segment of similar direction.

import { pointSegmentDistance } from '../../tools/pdf-to-dxf/geometry.js';

const MM = 72 / 25.4;

export function scanScore(lines, truthLines, tolPt = MM) {
  const segs = [];
  for (const l of lines) {
    const p = l.pts;
    const n = p.length / 2;
    const m = l.closed ? n : n - 1;
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % n;
      segs.push([p[2 * i], p[2 * i + 1], p[2 * j], p[2 * j + 1]]);
    }
  }
  const found = [];
  const missed = [];
  for (const [[x0, y0], [x1, y1]] of truthLines) {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const ta = Math.atan2(y1 - y0, x1 - x0);
    const n = Math.max(2, Math.ceil(len / (0.5 * MM)));
    const near = segs.filter((s) => {
      let d = Math.abs(Math.atan2(s[3] - s[1], s[2] - s[0]) - ta) % Math.PI;
      if (d > Math.PI / 2) d = Math.PI - d;
      return d < (10 * Math.PI) / 180;
    });
    let ok = 0;
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      if (near.some((s) => pointSegmentDistance(x, y, s[0], s[1], s[2], s[3]) <= tolPt)) ok++;
    }
    (ok / (n + 1) >= 0.9 ? found : missed).push([[x0, y0], [x1, y1]]);
  }
  return { ratio: found.length / truthLines.length, found: found.length, total: truthLines.length, missed, segments: segs.length };
}
