// SPDX-License-Identifier: AGPL-3.0-or-later
// PDF report for the silencer tool. No DOM: also used by Node tests and scripts/make-fixtures.mjs.
// Same picture as the page: per path the level list (one line per operation), the sum and the receiver; then the
// silencers with their front view.

import { buildPdf, INK } from '../../lib/core/pdf.js';
import { fmt, fmtDate } from '../../lib/core/format.js';
import { CALC_VERSION, DATA_VERSION, seriesOf } from './calc.js';
import { SOURCES } from './data/index.js';
import {
  TOOL_NAME,
  LINE_LABELS,
  UNIT_LABELS,
  PERIOD_LABELS,
  OCTAVE_LABELS,
  rowLabel,
  pathLabel,
  issueText,
  fmtLimit,
  productText,
  geometryText,
  placeText,
  targetText,
  checkLevelLabel,
} from './labels.js';

const db = (v) => (Number.isFinite(v) ? fmt(v, 1) : '–');

/** Build the PDF (Uint8Array). doc = { project, inputs }, result = compute(inputs). */
export async function buildReport(doc, result, envelope) {
  const { project, inputs } = doc;
  const many = inputs.paths.length > 1;
  const labelOf = (pathId, rowId) => {
    const i = inputs.paths.findIndex((p) => p.id === pathId);
    const p = inputs.paths[i];
    if (!p) return '';
    const what = rowId ? rowLabel(p.rows.find((r) => r.id === rowId)) : p.receiver.name || 'Empfänger';
    return many ? `${pathLabel(p, i)} | ${what}` : what;
  };

  const render = (w) => {
    // ---- title & project ------------------------------------------------------
    w.y += 8;
    w.text('Schalldämpferberechnung', w.left, w.y + 14, { size: 17, bold: true, color: INK.strong });
    w.y += 30;
    w.keyValues(
      [
        ['Projekt', project.name],
        ['Projekt-Nr.', project.number],
        ['Bearbeiter', project.author],
        ['Datum', fmtDate(project.date)],
      ],
      { columns: 4 },
    );

    // ---- result box: the worst path of the file ----------------------------------
    w.y += 6;
    const boxTop = w.y;
    const boxH = 58;
    w.rect(w.left, boxTop, w.contentWidth, boxH, { fill: INK.sunken });
    const col = w.contentWidth / 4;
    const big = (label, value, i, color = INK.strong) => {
      const x = w.left + 12 + i * col;
      w.text(label, x, boxTop + 16, { size: 7.5, color: INK.muted, maxWidth: col - 16 });
      w.text(value, x, boxTop + 38, { size: 16, bold: true, mono: true, color, maxWidth: col - 16 });
    };
    const worst = result.worst;
    const wp = worst && inputs.paths.find((p) => p.id === worst.pathId);
    if (worst && wp) {
      big(`${checkLevelLabel(worst.period)} | ${labelOf(wp.id, null)}`, `${fmt(worst.level ?? worst.lpa, 1)} dB(A)`, 0);
      big(worst.target != null ? `Ziel | ${targetText(wp.receiver, inputs.catalogs)}` : 'Ziel', worst.target != null ? `${fmtLimit(worst.target)} dB(A)` : '–', 1);
      if (worst.target != null) {
        const ok = worst.status === 'ok';
        big(ok ? 'Reserve, eingehalten' : 'Überschreitung', `${fmt(Math.abs(worst.margin), 1)} dB`, 2, ok ? INK.strong : INK.danger);
      }
    } else {
      big('LpA', '–', 0);
    }
    const silencers = inputs.paths.flatMap((p) => p.rows.filter((r) => r.type === 'silencer').map((row) => ({ p, row })));
    big('Schalldämpfer', String(silencers.length), 3);
    w.y = boxTop + boxH + 6;

    // ---- paths ------------------------------------------------------------------------
    inputs.paths.forEach((path, pi) => {
      const res = result.paths[pi];
      w.heading(many || path.name ? `Weg ${path.name || pi + 1}` : 'Pegel', { keepWith: 80 });
      w.text(`V̇ ${path.flow != null ? `${fmt(path.flow, 0)} m³/h` : '–'} | ρ ${fmt(inputs.density, 2)} kg/m³ | Pegel in dB(A) je Oktave, Zeilen in dB mit A-Bewertung`, w.left, w.y + 2, { size: 8, color: INK.text });
      w.y += 8;
      levelTable(w, path, res, inputs);
    });

    // ---- silencers -------------------------------------------------------------------------
    if (silencers.length) {
      w.heading('Schalldämpfer', { keepWith: 110 });
      for (const { p, row } of silencers) {
        const pi = inputs.paths.indexOf(p);
        silencerBlock(w, row, result.paths[pi].rows.get(row.id), many ? `${pathLabel(p, pi)} | ${rowLabel(row)}` : rowLabel(row));
      }
    }

    // ---- issues ----------------------------------------------------------------------------
    if (result.issues.length) {
      w.heading('Hinweise');
      const order = { error: 0, warning: 1, info: 2 };
      for (const i of [...result.issues].sort((a, b) => order[a.severity] - order[b.severity])) {
        const prefix = i.severity === 'error' ? 'Fehler: ' : i.severity === 'warning' ? 'Warnung: ' : '';
        w.paragraph(`${prefix}${issueText(i, labelOf(i.pathId, i.rowId))}`, { size: 8, color: i.severity === 'error' ? INK.danger : INK.text });
      }
    }

    // ---- basis -------------------------------------------------------------------------------
    w.heading('Grundlagen');
    w.table({
      columns: [
        { label: 'Grösse', width: 130 },
        { label: 'Ansatz', width: 630 },
      ],
      rows: [
        ['Pegel', 'Oktaven 63 … 8000 Hz in dB(A); energetische Summe L = 10·lg Σ 10^(Li/10); Zeilen in dB: A-Bewertung −26.2 −16.1 −8.6 −3.2 0 +1.2 +1.0 −1.1 dB'],
        ['Quelle', 'Pegel davor energetisch addiert mit LW der Quelle'],
        ['Dämpfung', 'Pegel davor minus D (Differenz, gleich in dB und dB(A))'],
        ['Schalldämpfer', 'Pegel minus De plus Strömungsgeräusch (energetisch); Herstellerwerte bis 50 dB; Spalt linear im belegten Bereich; Länge nicht interpoliert'],
        ['Schätzwerte', 'RIO/Schmidlin aus offenen Trox XK und Schako MWK-OB: je Oktave kleinere De, grösserer Druckverlust; keine Herstellerprüfung'],
        ['Kulissen', 'B × H innen; n = round(B / (d + s)), Spalt s′ = B / n − d, an der Wand s′/2. De und Druckverlust für s′ innerhalb des Tabellenbereichs. Maximalmasse begrenzen die Variantensuche.'],
        ['Druckverlust', 'Δp = ζ·ρ/2·v²; ζ aus den Tabellen (ρ = 1.2 kg/m³), linear über v; Kulissen v im Spalt × Einbaufaktor 1.0 / 1.1 / 1.3; Trox CA, Lindab SLU wie gerades Rohr (k = 0.15 mm)'],
        ['Strömungsgeräusch', 'Schako: abgelesene Spektren mit gedrucktem LWA, Zwischenwerte über lg(v), lg(A). Sonst Trox/Wildeboer als Näherung. Rohr ohne Kern: kein Zusatzschall angenommen'],
        ['Abzweig', 'ΔL = 10·lg(V̇ davor / V̇ danach), oder eingegebener Wert'],
        ['Empfänger', 'Lp = LW + 10·lg(Q / (4π r²) + 4 / A), A = 0.163·V / T; ohne A: Freifeld'],
        ['Ziel Raumtyp', 'Raumnutzung und Lärmempfindlichkeit nach SIA 2024:2021, Tabelle 12; LH für Dauergeräusche nach SIA 181:2020 (Mindest- oder erhöhte Anforderung) oder empfohlene Auslegung nach SIA 2024'],
        ['Ziel LSV', 'Anhang 6: Lr = LpA + K1 + K2 + K3 + 10·lg(t / 12 h), K1 = 5 (Tag) / 10 (Nacht); Planungs- oder Immissionsgrenzwert je ES, Art. 42 Betriebsräume + 5 dB'],
        ['Nicht enthalten', 'Kanaldämpfung, Bögen, Mündungsreflexion nur als eingegebene Dämpfung; Gehäuseabstrahlung, Übersprechen; jeder Weg für sich'],
        ['Herstellerdaten', `Datenstand ${DATA_VERSION}; jede Datei speichert die verwendete Tabellenzeile`],
      ],
    });

    // ---- sources of the data used ------------------------------------------------------------
    const ids = new Set();
    for (const { row } of silencers) {
      if (row.kind === 'manual') continue;
      for (const id of seriesOf(row.kind, row[row.kind].series)?.sources ?? []) ids.add(id);
      ids.add('Q03');
      ids.add('Q08');
    }
    if (ids.size) {
      w.heading('Quellen');
      w.table({
        columns: [
          { label: 'ID', width: 34 },
          { label: 'Herausgeber', width: 110 },
          { label: 'Titel', width: 420 },
          { label: 'Stand', width: 70 },
          { label: 'Verwendet für', width: 130 },
        ],
        rows: SOURCES.filter((s) => ids.has(s.id)).map((s) => [s.id, s.publisher, s.title, s.date, s.usedFor]),
      });
    }
  };

  const decorate = (w, i, total) => {
    const top = 30;
    w.text('HLKS-Tools', w.left, top, { size: 8, bold: true, color: INK.primary });
    w.text(TOOL_NAME, w.left + w.measure('HLKS-Tools', 8, true) + 8, top, { size: 8, color: INK.text });
    const right = [project.name, project.number].filter(Boolean).join(' | ');
    w.text(right, w.right, top, { size: 8, color: INK.text, align: 'right', maxWidth: w.contentWidth / 2 });
    w.line(w.left, top + 7, w.right, top + 7, { color: INK.border, width: 0.6 });
    const fy = w.pageH - 24;
    w.line(w.left, fy - 10, w.right, fy - 10, { color: INK.border, width: 0.4 });
    w.text(`Berechnungsversion ${CALC_VERSION} | Herstellerdaten ${DATA_VERSION} | Eingaben eingebettet (data.json)`, w.left, fy, {
      size: 6.5,
      color: INK.muted,
      maxWidth: w.contentWidth - 80,
    });
    w.text(`Seite ${i + 1} / ${total}`, w.right, fy, { size: 7, color: INK.muted, align: 'right' });
  };

  return buildPdf({
    envelope,
    title: project.name ? `${TOOL_NAME} – ${project.name}` : TOOL_NAME,
    subject: `HLKS-Tools: ${TOOL_NAME}`,
    author: project.author,
    render,
    decorate,
  });
}

/** The level list of one path, like the page: one line per operation, then the sum, the receiver and its checks. */
function levelTable(w, path, res, inputs) {
  const rows = [];
  const styles = [];
  const push = (cells, style = {}) => {
    rows.push(cells);
    styles.push(style);
  };
  const byId = new Map(path.rows.map((r) => [r.id, r]));
  let last = null;
  for (const l of res.lines) {
    const row = byId.get(l.rowId);
    const r = res.rows.get(l.rowId);
    const first = l.rowId !== last;
    last = l.rowId;
    let info = '';
    if (first && row.type === 'silencer') info = productText(row);
    else if (l.kind === 'flow' && row.kind !== 'manual') info = [geometryText(row, r), r.v != null ? `v ${fmt(r.v, 1)} m/s` : '', r.dp != null ? `Δp ${fmt(r.dp, 0)} Pa` : ''].filter(Boolean).join(' | ');
    else if (row.type === 'branch') info = `V̇ ${r.flow != null ? fmt(r.flow, 0) : '–'} → ${r.flowAfter != null ? fmt(r.flowAfter, 0) : '–'} m³/h${row.dl != null ? ' | ΔL eingegeben' : ''}`;
    const values = l.values.map((v) => (v == null || !Number.isFinite(v) ? '' : fmt(v, 1)));
    push([first ? rowLabel(row) : `   ${LINE_LABELS[l.kind] ?? ''}`, l.unit ? UNIT_LABELS[l.unit] : '', l.op, ...values, l.total != null && Number.isFinite(l.total) ? db(l.total) : '', info], {
      muted: l.kind === 'aweight',
    });
  }
  push(['Summe', 'dB(A)', '', ...res.level.map(db), db(res.lwa), ''], { bold: true });
  const rc = res.receiver;
  push([`${path.receiver.name || 'Empfänger'} (LpA)`, 'dB(A)', '+', ...(rc.lp ?? new Array(8).fill(null)).map((v) => (v == null ? '' : db(v))), db(rc.lpa), placeText(path.receiver, rc)], { bold: true });
  const periods = path.receiver.basis === 'lsv' ? ['day', 'night'] : [null];
  for (const period of periods) {
    const c = rc.checks.find((x) => x.period === period);
    const label = `   ${period ? PERIOD_LABELS[period] : 'Ziel'}`;
    if (!c) {
      push([label, '', '', ...new Array(8).fill(''), '', period ? '–' : targetText(path.receiver, inputs.catalogs)]);
      continue;
    }
    const ok = c.status === 'ok';
    push([
      label, '', '', ...new Array(8).fill(''),
      { text: db(c.level), color: ok ? INK.text : INK.danger, bold: !ok },
      { text: `${ok ? 'eingehalten' : 'überschritten'} | ${checkLevelLabel(period)} ${ok ? '≤' : '>'} ${fmtLimit(c.limit)} dB(A) | ${targetText(path.receiver, inputs.catalogs)}`, color: ok ? INK.text : INK.danger },
    ]);
  }
  w.table({
    columns: [
      { label: 'Element', width: 118 },
      { label: 'Einheit', width: 36 },
      { label: '', width: 14, align: 'center' },
      ...OCTAVE_LABELS.map((l) => ({ label: l, unit: 'Hz', width: 37, align: 'right' })),
      { label: 'Σ', unit: 'dB(A)', width: 42, align: 'right' },
      { label: 'Angaben', width: 254 },
    ],
    rows,
    size: 7,
    rowHeight: 12,
    rowStyle: (i) => ({ bold: styles[i].bold, color: styles[i].muted ? INK.muted : undefined }),
  });
}

/** One silencer: front view to scale on the left, product and values on the right. */
function silencerBlock(w, row, r, title) {
  const H = 96;
  w.ensure(H + 26);
  w.text(title, w.left, w.y + 8, { size: 8.5, bold: true, color: INK.strong });
  w.y += 14;
  const top = w.y;
  const box = { x: w.left, y: top, w: 150, h: H };
  if (row.kind === 'rect') drawRect(w, box, row.rect, r);
  else if (row.kind === 'round' && r?.row) drawRound(w, box, r.row);
  const kv = [
    ['Produkt', productText(row)],
    ['Geometrie', geometryText(row, r) || '–'],
    ['V̇', r?.flow != null ? `${fmt(r.flow, 0)} m³/h` : '–'],
    ['v', r?.v != null ? `${fmt(r.v, 1)} m/s` : '–'],
    ['Δp', r?.dp != null ? `${fmt(r.dp, 0)} Pa${r.zeta != null ? ` | ζ ${fmt(r.zeta, 3)}` : r.lambda != null ? ` | λ ${fmt(r.lambda, 4)}` : ''}` : '–'],
    ['LWA Strömung', r?.lwaFlow != null ? `${fmt(r.lwaFlow, 1)} dB(A)${r.flowNoiseEstimated ? ' (geschätzt)' : ''}` : '–'],
    ['Daten', row.kind === 'manual' ? 'eingegeben' : row.row?.dataVersion ?? '–'],
  ];
  const x0 = w.left + 170;
  kv.forEach(([k, v], i) => {
    w.text(k, x0, top + 9 + i * 12.5, { size: 7.5, color: INK.muted });
    w.text(v, x0 + 80, top + 9 + i * 12.5, { size: 7.5, color: INK.strong, maxWidth: w.right - x0 - 80 });
  });
  w.y = top + H + 10;
}

function drawRect(w, box, spec, r) {
  const { B, H } = spec;
  if (!(B > 0 && H > 0)) return;
  const k = Math.min((box.w - 14) / B, (box.h - 12) / H);
  const bw = B * k;
  const bh = H * k;
  const x0 = box.x + 14 + (box.w - 14 - bw) / 2;
  const y0 = box.y + 10;
  if (r?.n > 0 && r.gap > 0) {
    for (let i = 0; i < r.n; i++) w.rect(x0 + (r.gap / 2 + i * (spec.d + r.gap)) * k, y0, spec.d * k, bh, { fill: INK.sunken, stroke: INK.muted, strokeWidth: 0.4 });
  }
  w.rect(x0, y0, bw, bh, { stroke: INK.strong, strokeWidth: 0.9 });
  w.text(fmt(B, 0), x0 + bw / 2, y0 - 3, { size: 6.5, color: INK.muted, align: 'center' });
  w.text(fmt(H, 0), x0 - 3, y0 + bh / 2 + 2, { size: 6.5, color: INK.muted, align: 'right' });
}

/** Circle as an SVG path (two arcs), drawn by the writer's path(). */
const circlePath = (rad) => `M ${-rad} 0 A ${rad} ${rad} 0 1 0 ${rad} 0 A ${rad} ${rad} 0 1 0 ${-rad} 0 Z`;

function drawRound(w, box, row) {
  const outer = row.dOuter > row.dn ? row.dOuter : row.dn;
  const k = (Math.min(box.w, box.h) - 14) / outer;
  const cx = box.x + box.w / 2;
  const cy = box.y + 8 + (box.h - 8) / 2;
  const d0 = row.dIn ?? row.dn;
  if (outer > row.dn) w.path(circlePath((outer / 2) * k), cx, cy, { fill: INK.sunken, stroke: INK.muted, width: 0.4 });
  w.path(circlePath((d0 / 2) * k), cx, cy, { fill: INK.surface, stroke: INK.strong, width: 0.9 });
  if (row.core > 0) w.rect(cx - (row.core * k) / 2, cy - (d0 / 2) * k, row.core * k, d0 * k, { fill: INK.sunken, stroke: INK.muted, strokeWidth: 0.4 });
  w.text(`Ø ${fmt(row.dn, 0)}`, cx, box.y + 4, { size: 6.5, color: INK.muted, align: 'center' });
}
