// SPDX-License-Identifier: AGPL-3.0-or-later
// CSV export (opens in Excel: semicolon separated, UTF-8 with BOM). One row per point, then one per process.
// No DOM, no pdf-lib.

import { computeProject } from './calc.js';
import { calculationName } from './defaults.js';
import { BLOCK_LABELS } from './labels.js';

export function buildCsv(doc) {
  const { inputs } = doc;
  const results = computeProject(inputs);
  const n = (v, d) => (v == null || !Number.isFinite(v) ? '' : v.toFixed(d));
  const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const head = ['Berechnung', 'Art', 'Punkt', 'Baustein', 'Eintritt', 't [°C]', 'phi [%]', 'x [g/kg]', 'h [kJ/kg]', 'rho [kg/m3]', 'Taupunkt [°C]', 'Feuchtkugel [°C]', 'V [m3/h]', 'm [kg/h]', 'Q [kW]', 'Wasser [kg/h]'];
  const lines = [head.map(q).join(';')];
  inputs.calculations.forEach((c, index) => {
    const r = results.calculations.get(c.id);
    const name = calculationName(c, index);
    for (const pt of r.points.values()) {
      const s = pt.state;
      const b = c.blocks.find((x) => x.id === pt.blockId);
      lines.push([
        q(name), q('Zustand'), q(pt.label), q(BLOCK_LABELS[b.type]), '',
        n(s?.t, 2), n(s ? s.phi * 100 : null, 1), n(s?.x, 3), n(s?.h, 2), n(s?.rho, 4), n(s?.td, 2), n(s?.tw, 2),
        n(pt.flow, 0), n(pt.m, 1), '', '',
      ].join(';'));
    }
    for (const b of c.blocks) {
      if (b.type === 'point') continue;
      const res = r.blocks.get(b.id);
      const v = res.values;
      const label = (id) => r.points.get(id)?.label ?? '';
      const water = v.water ?? (v.condensate ? -v.condensate : null);
      lines.push([
        q(name), q('Prozess'), q(b.type === 'line' ? '' : label(b.id)), q(BLOCK_LABELS[b.type]), q(res.inputs.map(label).join(' + ')),
        '', '', '', '', '', '', '', '', '', n(v.q, 2), n(water, 2),
      ].join(';'));
    }
  });
  return '﻿' + lines.join('\r\n') + '\r\n';
}
