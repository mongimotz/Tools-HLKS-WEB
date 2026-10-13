// SPDX-License-Identifier: AGPL-3.0-or-later
// CSV export (opens in Excel: semicolon separated, UTF-8 with BOM). One line per table line of every path, like the
// page: the rows, then the sum and the receiver. No DOM, no pdf-lib.

import { OCTAVE_LABELS, TYPE_LABELS, LINE_LABELS, UNIT_LABELS, rowLabel, pathLabel, productText, geometryText, placeText, targetText, checkLevelLabel, fmtLimit } from './labels.js';

export function buildCsv(doc, result) {
  const { inputs } = doc;
  const n = (v, d) => (v == null || !Number.isFinite(v) ? '' : v.toFixed(d));
  const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const head = ['Weg', 'Element', 'Zeile', 'Einheit', 'Operation', ...OCTAVE_LABELS.map((l) => `${l} Hz`), 'Summe [dB(A)]', 'V [m3/h]', 'v [m/s]', 'dp [Pa]', 'Angaben'];
  const out = [head.map(q).join(';')];
  inputs.paths.forEach((path, pi) => {
    const res = result.paths[pi];
    const name = pathLabel(path, pi);
    const byId = new Map(path.rows.map((r) => [r.id, r]));
    let last = null;
    for (const l of res.lines) {
      const row = byId.get(l.rowId);
      const r = res.rows.get(l.rowId);
      const first = l.rowId !== last;
      last = l.rowId;
      const info = first && row.type === 'silencer' ? [productText(row), geometryText(row, r)].filter(Boolean).join(' | ') : '';
      out.push([
        q(name),
        q(rowLabel(row)),
        q(first ? TYPE_LABELS[row.type] : LINE_LABELS[l.kind]),
        q(l.unit ? UNIT_LABELS[l.unit] : ''),
        q(l.op),
        ...l.values.map((v) => n(v, 1)),
        n(l.total, 2),
        first ? n(row.type === 'branch' ? r.flowAfter : r.flow, 0) : '',
        first ? n(r.v, 2) : '',
        first ? n(r.dp, 1) : '',
        q(info),
      ].join(';'));
    }
    out.push([q(name), q('Summe'), q(''), q('dB(A)'), q(''), ...res.level.map((v) => n(v, 2)), n(res.lwa, 2), '', '', '', q('')].join(';'));
    const rc = res.receiver;
    const checks = rc.checks.map((c) => `${checkLevelLabel(c.period)} ${n(c.level, 1)} ${c.status === 'ok' ? '<=' : '>'} ${fmtLimit(c.limit)}`).join(' | ');
    const info = [placeText(path.receiver, rc), targetText(path.receiver, inputs.catalogs), checks].filter(Boolean).join(' | ');
    out.push([q(name), q(path.receiver.name || 'Empfänger'), q('Empfänger LpA'), q('dB(A)'), q('+'), ...(rc.lp ?? new Array(8).fill(null)).map((v) => n(v, 2)), n(rc.lpa, 2), '', '', '', q(info)].join(';'));
  });
  return '﻿' + out.join('\r\n') + '\r\n';
}
