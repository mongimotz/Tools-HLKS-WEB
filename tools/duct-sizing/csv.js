// SPDX-License-Identifier: AGPL-3.0-or-later
// CSV export (opens in Excel: semicolon separated, UTF-8 with BOM). No DOM, no pdf-lib.

import { SHAPE_LABELS, modeLabel } from './labels.js';
import { printedPositions } from './defaults.js';

export function buildCsv(doc, result) {
  const { inputs } = doc;
  const n = (v, d) => (v == null || !Number.isFinite(v) ? '' : v.toFixed(d));
  const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const head = ['Nr.', 'Bezeichnung', 'V [m3/h]', 'Form', 'Vorgabe', 'D [mm]', 'B [mm]', 'H [mm]', 'erforderlich D [mm]', 'erforderlich B [mm]', 'erforderlich H [mm]', 'Seitenverhältnis 1/n', 'A [m2]', 'dh [mm]', 'v [m/s]', 'v max rund [m/s]', 'f', 'v max [m/s]', 'Ausnutzung [%]', 'R [Pa/m]'];
  const lines = [head.map(q).join(';')];
  printedPositions(inputs).forEach((p, i) => {
    const r = p.id === 'current' ? result.current : result.positions.get(p.id);
    const ok = r?.status === 'ok';
    const round = p.shape === 'round';
    lines.push(
      [
        String(i + 1),
        q(p.note),
        n(p.flow, 0),
        q(SHAPE_LABELS[p.shape]),
        q(modeLabel(p.shape, p.mode)),
        ok && round ? n(r.diameter, 0) : '',
        ok && !round ? n(r.width, 0) : '',
        ok && !round ? n(r.height, 0) : '',
        round ? n(r?.required?.diameter, 1) : '',
        !round ? n(r?.required?.width, 1) : '',
        !round ? n(r?.required?.height, 1) : '',
        ok ? n(r.ratio, 2) : '',
        ok ? n(r.area, 5) : '',
        ok ? n(r.dh * 1000, 1) : '',
        ok ? n(r.velocity, 3) : '',
        n(r?.vmaxRound, 3),
        ok ? n(r.factor, 3) : '',
        ok ? n(r.vmax, 3) : '',
        ok ? n(r.utilization * 100, 1) : '',
        ok ? n(r.gradient, 4) : '',
      ].join(';'),
    );
  });
  return '﻿' + lines.join('\r\n') + '\r\n';
}
