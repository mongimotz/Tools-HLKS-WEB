// SPDX-License-Identifier: AGPL-3.0-or-later
// CSV export (opens in Excel: semicolon separated, UTF-8 with BOM). One line per element of every strand. No DOM, no pdf-lib.

import { seriesOf } from './calc.js';
import { TYPE_LABELS, OCTAVE_LABELS, elementLabel, productText, geometryText, placeText, targetText, checkLevelLabel } from './labels.js';

const seriesLabel = (kind, id) => seriesOf(kind, id)?.label ?? id;

export function buildCsv(doc, result) {
  const { inputs } = doc;
  const n = (v, d) => (v == null || !Number.isFinite(v) ? '' : v.toFixed(d));
  const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const oct = (prefix) => OCTAVE_LABELS.map((l) => `${prefix} ${l} [dB]`);
  const head = [
    'Strang', 'Nr.', 'Typ', 'Bezeichnung', 'Vorgänger', 'V [m3/h]', 'dL Abzweig [dB]', 'Angaben',
    ...oct('D / De'), ...oct('LW eigen / LW,Str'), ...oct('LW nach'), 'LWA nach [dB(A)]',
    'v [m/s]', 'dp [Pa]', 'LWA,Str [dB(A)]', ...oct('Lp'), 'LpA [dB(A)]', 'Beurteilung', 'Pegel [dB(A)]', 'Ziel [dB(A)]', 'Reserve [dB]', 'Ziel eingehalten',
  ];
  const lines = [head.map(q).join(';')];
  inputs.strands.forEach((strand, si) => {
    const res = result.strands[si];
    const byId = new Map(strand.elements.map((e) => [e.id, e]));
    for (const el of strand.elements) {
      const r = res.elements.get(el.id);
      if (!r) continue;
      const loss = el.type === 'component' ? el.d : el.type === 'silencer' ? r.de : null;
      const own = el.type === 'source' || el.type === 'component' ? el.lw : el.type === 'silencer' ? r.lwFlow : null;
      const info =
        el.type === 'silencer'
          ? [productText(el, seriesLabel), geometryText(el, r)].filter(Boolean).join(', ')
          : el.type === 'receiver'
            ? `${placeText(el, r)} | ${targetText(el, inputs.catalogs)}`
            : '';
      const g = r.governing;
      lines.push(
        [
          q(strand.name || `Strang ${si + 1}`),
          q(el.nr),
          q(TYPE_LABELS[el.type]),
          q(el.name),
          q(el.after ? elementLabel(byId.get(el.after)) : ''),
          n(r.flow, 0),
          r.parent ? n(r.split, 2) : '',
          q(info),
          ...OCTAVE_LABELS.map((_, i) => n(loss?.[i], 1)),
          ...OCTAVE_LABELS.map((_, i) => n(own?.[i], 1)),
          ...OCTAVE_LABELS.map((_, i) => n(r.lwOut[i], 2)),
          n(r.lwaOut, 2),
          n(r.v, 2),
          n(r.dp, 1),
          n(r.lwaFlow, 2),
          ...OCTAVE_LABELS.map((_, i) => n(r.lp?.[i], 2)),
          n(r.lpa, 2),
          g ? q(checkLevelLabel(g.period)) : '',
          n(g?.level, 2),
          n(g?.limit, 1),
          n(g?.margin, 2),
          g ? (g.status === 'ok' ? 'ja' : 'nein') : '',
        ].join(';'),
      );
    }
  });
  return '﻿' + lines.join('\r\n') + '\r\n';
}
