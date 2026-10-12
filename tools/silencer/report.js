// SPDX-License-Identifier: AGPL-3.0-or-later
// PDF report for the silencer tool. No DOM: also used by Node tests and scripts/make-fixtures.mjs.

import { buildPdf, INK } from '../../lib/core/pdf.js';
import { fmt, fmtDate } from '../../lib/core/format.js';
import { CALC_VERSION, DATA_VERSION, OCTAVES, aWeighted, seriesOf, pathTo } from './calc.js';
import { SOURCES } from './data/index.js';
import {
  TOOL_NAME,
  TYPE_LABELS,
  PERIOD_LABELS,
  OCTAVE_LABELS,
  elementLabel,
  issueText,
  fmtLimit,
  productText,
  geometryText,
  placeText,
  targetText,
  checkLevelLabel,
  spectrumSeries,
} from './labels.js';

const seriesLabel = (kind, id) => seriesOf(kind, id)?.label ?? id;
const db = (v) => (Number.isFinite(v) ? fmt(v, 1) : '–');
const strandName = (s, i) => s.name || `Strang ${i + 1}`;

/** Build the PDF (Uint8Array). doc = { project, inputs }, result = compute(inputs). */
export async function buildReport(doc, result, envelope) {
  const { project, inputs } = doc;
  const many = inputs.strands.length > 1;
  const labelOf = (strandIndex, el) => (many ? `${strandName(inputs.strands[strandIndex], strandIndex)} | ${elementLabel(el)}` : elementLabel(el));
  const findElement = (id) => {
    for (const [i, s] of inputs.strands.entries()) {
      const el = s.elements.find((e) => e.id === id);
      if (el) return { el, i };
    }
    return null;
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

    // ---- result box: the worst receiver of the file ----------------------------------
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
    const at = worst && findElement(worst.elementId);
    if (worst && at) {
      big(`${checkLevelLabel(worst.period)} | ${labelOf(at.i, at.el)}`, `${fmt(worst.level ?? worst.lpa, 1)} dB(A)`, 0);
      big(worst.target != null ? `Ziel | ${targetText(at.el, inputs.catalogs)}` : 'Ziel', worst.target != null ? `${fmtLimit(worst.target)} dB(A)` : '–', 1);
      if (worst.target != null) {
        const ok = worst.status === 'ok';
        big(ok ? 'Reserve, eingehalten' : 'Überschreitung', `${fmt(Math.abs(worst.margin), 1)} dB`, 2, ok ? INK.strong : INK.danger);
      }
    } else {
      big('LpA', '–', 0);
    }
    const silencers = inputs.strands.flatMap((s) => s.elements.filter((e) => e.type === 'silencer'));
    big('Schalldämpfer', String(silencers.length), 3);
    w.y = boxTop + boxH + 6;

    // ---- strands ------------------------------------------------------------------------
    inputs.strands.forEach((strand, si) => {
      const res = result.strands[si];
      w.heading(many || strand.name ? `Strang ${strand.name || si + 1}` : 'Elemente', { keepWith: 80 });
      w.text(`V̇ ${strand.flow != null ? `${fmt(strand.flow, 0)} m³/h` : '–'} | ρ ${fmt(inputs.density, 2)} kg/m³`, w.left, w.y + 2, { size: 8, color: INK.text });
      w.y += 8;
      elementTable(w, strand, res, inputs);
      const end = res.worstId ?? res.order[res.order.length - 1];
      if (end) drawSpectra(w, spectrumSeries(strand, res, pathTo(res, end)));
    });

    // ---- silencers -------------------------------------------------------------------------
    const silencerRows = [];
    inputs.strands.forEach((strand, si) => {
      const res = result.strands[si];
      for (const el of strand.elements) {
        if (el.type !== 'silencer') continue;
        const r = res.elements.get(el.id);
        silencerRows.push([
          many ? strandName(strand, si) : '',
          el.nr,
          productText(el, seriesLabel),
          geometryText(el, r),
          r?.flow != null ? fmt(r.flow, 0) : '–',
          r?.v != null ? fmt(r.v, 1) : '–',
          r?.dp != null ? fmt(r.dp, 0) : '–',
          r?.zeta != null ? fmt(r.zeta, 3) : r?.lambda != null ? `λ ${fmt(r.lambda, 4)}` : '–',
          r?.lwaFlow != null ? fmt(r.lwaFlow, 1) : '–',
          el.kind === 'manual' ? '–' : el.row?.dataVersion ?? '–',
        ]);
      }
    });
    if (silencerRows.length) {
      w.heading('Schalldämpfer');
      w.table({
        columns: [
          { label: 'Strang', width: 70 },
          { label: 'Nr.', width: 30 },
          { label: 'Produkt', width: 220 },
          { label: 'Geometrie', unit: 'mm', width: 160 },
          { label: 'V̇', unit: 'm³/h', width: 50, align: 'right' },
          { label: 'v', unit: 'm/s', width: 40, align: 'right' },
          { label: 'Δp', unit: 'Pa', width: 40, align: 'right' },
          { label: 'ζ', unit: '–', width: 52, align: 'right', mono: false },
          { label: 'LWA,Str', unit: 'dB(A)', width: 50, align: 'right' },
          { label: 'Daten', width: 60 },
        ],
        rows: silencerRows,
      });
    }

    // ---- issues ----------------------------------------------------------------------------
    if (result.issues.length) {
      w.heading('Hinweise');
      const order = { error: 0, warning: 1, info: 2 };
      for (const i of [...result.issues].sort((a, b) => order[a.severity] - order[b.severity])) {
        const at = i.elementId && findElement(i.elementId);
        const prefix = i.severity === 'error' ? 'Fehler: ' : i.severity === 'warning' ? 'Warnung: ' : '';
        w.paragraph(`${prefix}${issueText(i, at ? labelOf(at.i, at.el) : '')}`, { size: 8, color: i.severity === 'error' ? INK.danger : INK.text });
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
        ['Pegel', 'Oktaven 63 … 8000 Hz; energetische Summe L = 10·lg Σ 10^(Li/10); A-Bewertung −26.2 −16.1 −8.6 −3.2 0 +1.2 +1.0 −1.1 dB'],
        ['Bauteil, Quelle', 'L − D, energetisch addiert mit LW; die erste Quelle eines Strangs gibt den Anfangswert'],
        ['Schalldämpfer', 'L − De, energetisch addiert mit LW,Str; De aus den Herstellertabellen (EN ISO 7235, über 50 dB als 50 dB), keine Interpolation in L und s'],
        ['Druckverlust', 'Δp = ζ·ρ/2·v²; ζ aus den Tabellen (ρ = 1.2 kg/m³), linear über v; Kulissen v im Spalt × Einbaufaktor 1.0 / 1.1 / 1.3; Trox CA, Lindab SLU wie gerades Rohr (k = 0.15 mm)'],
        ['Strömungsgeräusch', 'Trox-Tabelle LWA(v) + 10·lg(A / 1 m²), A = B·H bzw. Rohrquerschnitt; Oktavspektrum nach Wildeboer; Rohrschalldämpfer ohne Kern: keins'],
        ['Abzweig', 'ΔL = 10·lg(V̇ Abzweig / V̇ davor), oder eingegebener Wert'],
        ['Empfänger', 'Lp = LW + 10·lg(Q / (4π r²) + 4 / A), A = 0.163·V / T; ohne A: Freifeld'],
        ['Ziel Raumtyp', 'Raumnutzung und Lärmempfindlichkeit nach SIA 2024:2021, Tabelle 12; LH für Dauergeräusche nach SIA 181:2020 (Mindest- oder erhöhte Anforderung) oder empfohlene Auslegung nach SIA 2024'],
        ['Ziel LSV', 'Anhang 6: Lr = LpA + K1 + K2 + K3 + 10·lg(t / 12 h), K1 = 5 (Tag) / 10 (Nacht); Planungs- oder Immissionsgrenzwert je ES, Art. 42 Betriebsräume + 5 dB'],
        ['Nicht enthalten', 'Kanaldämpfung, Bögen, Mündungsreflexion, Gehäuseabstrahlung, Übersprechen; jeder Strang für sich'],
        ['Herstellerdaten', `Datenstand ${DATA_VERSION}; jede Datei speichert die verwendete Tabellenzeile`],
      ],
    });

    // ---- sources of the data used ------------------------------------------------------------
    const ids = new Set();
    for (const el of silencers) {
      if (el.kind === 'manual') continue;
      for (const id of seriesOf(el.kind, el[el.kind].series)?.sources ?? []) ids.add(id);
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

/** One table per strand: every element with its spectrum lines, in the order of the page. */
function elementTable(w, strand, res, inputs) {
  const rows = [];
  const styles = [];
  const push = (cells, style = {}) => {
    rows.push(cells);
    styles.push(style);
  };
  const spec = (values) => OCTAVES.map((_, i) => db(values?.[i]));
  const inputSpec = (values) => OCTAVES.map((_, i) => (values?.[i] != null ? fmt(values[i], 1) : ''));
  const own = (values) => db(aWeighted(values.map((v) => v ?? -Infinity)));
  const blank = ['', ''];
  for (const el of strand.elements) {
    const r = res.elements.get(el.id);
    if (!r) continue;
    const head = [el.nr, el.name || TYPE_LABELS[el.type]];
    const split = r.split ? `ΔL ${fmt(r.split, 1)} dB` : '';
    const info = (...parts) => parts.filter(Boolean).join(' | ');
    const result = () => push([...blank, 'nach', ...spec(r.lwOut), db(r.lwaOut), '', '', ''], { bold: true });
    switch (el.type) {
      case 'source':
        push([...head, 'LW', ...inputSpec(el.lw), own(el.lw), '', '', split]);
        if (r.parent) result();
        break;
      case 'component':
        push([...head, 'D', ...inputSpec(el.d), '', '', '', split]);
        push([...blank, 'LW', ...inputSpec(el.lw), own(el.lw), '', '', '']);
        result();
        break;
      case 'silencer':
        push([...head, 'De', ...spec(r.de), '', r.v != null ? fmt(r.v, 1) : '', r.dp != null ? fmt(r.dp, 0) : '', info(split, productText(el, seriesLabel))]);
        push([...blank, 'LW,Str', ...spec(r.lwFlow), r.lwaFlow != null ? db(r.lwaFlow) : '–', '', '', geometryText(el, r)]);
        result();
        break;
      case 'receiver':
        push([...head, 'Lp', ...spec(r.lp), db(r.lpa), '', '', info(split, placeText(el, r))], { bold: true });
        for (const period of el.basis === 'lsv' ? ['day', 'night'] : [null]) {
          const c = r.checks.find((x) => x.period === period);
          const label = period ? PERIOD_LABELS[period] : 'Ziel';
          if (!c) {
            push([...blank, label, ...OCTAVES.map(() => ''), '', '', '', period ? '–' : targetText(el, inputs.catalogs)]);
            continue;
          }
          const ok = c.status === 'ok';
          push(
            [
              ...blank,
              label,
              ...OCTAVES.map(() => ''),
              { text: db(c.level), color: ok ? INK.text : INK.danger, bold: !ok },
              '',
              '',
              {
                text: `${ok ? 'eingehalten' : 'überschritten'} | ${checkLevelLabel(period)} ${ok ? '≤' : '>'} ${fmtLimit(c.limit)} dB(A) | ${targetText(el, inputs.catalogs)}`,
                color: ok ? INK.text : INK.danger,
              },
          ]);
        }
        break;
    }
  }
  w.table({
    columns: [
      { label: 'Nr.', width: 30 },
      { label: 'Element', width: 104 },
      { label: '', unit: 'dB', width: 40 },
      ...OCTAVE_LABELS.map((l) => ({ label: l, unit: 'Hz', width: 36, align: 'right' })),
      { label: 'Σ', unit: 'dB(A)', width: 40, align: 'right' },
      { label: 'v', unit: 'm/s', width: 30, align: 'right' },
      { label: 'Δp', unit: 'Pa', width: 30, align: 'right' },
      { label: 'Angaben', width: 200 },
    ],
    rows,
    size: 7,
    rowHeight: 12,
    rowStyle: (i) => ({ bold: styles[i].bold }),
  });
}

const SERIES_INK = ['chart1', 'chart2', 'chart3', 'chart4', 'chart5', 'chart6', 'chart7', 'chart8'];

/** Spectra chart (same series as on the page): one line per series, the target dashed. */
function drawSpectra(w, series) {
  const finite = series.flatMap((s) => s.values.filter(Number.isFinite));
  if (!finite.length) return;
  const H = 140;
  w.heading('Spektren', { size: 9, before: 10, keepWith: H + 34 });
  const m = { left: w.left + 34, right: w.left + w.contentWidth * 0.62, top: w.y + 14, bottom: w.y + H };
  const yMin = Math.floor(Math.min(...finite) / 10) * 10;
  const yMax = Math.max(yMin + 10, Math.ceil(Math.max(...finite) / 10) * 10);
  const sx = (i) => m.left + ((i + 0.5) / OCTAVES.length) * (m.right - m.left);
  const sy = (v) => m.bottom - ((v - yMin) / (yMax - yMin)) * (m.bottom - m.top);
  for (let v = yMin; v <= yMax + 1e-9; v += 10) {
    w.line(m.left, sy(v), m.right, sy(v), { color: v === yMin ? INK.muted : INK.border, width: v === yMin ? 0.6 : 0.3 });
    w.text(fmt(v, 0), m.left - 5, sy(v) + 2.5, { size: 6.5, color: INK.muted, align: 'right' });
  }
  w.text('dB', m.left - 5, m.top - 6, { size: 6.5, color: INK.muted, align: 'right' });
  OCTAVE_LABELS.forEach((l, i) => w.text(l, sx(i), m.bottom + 10, { size: 6.5, color: INK.text, align: 'center' }));
  w.text('Hz', m.right, m.bottom + 20, { size: 6.5, color: INK.muted, align: 'right' });

  let slot = 0;
  const legendX = m.right + 24;
  let legendY = m.top + 6;
  for (const s of series) {
    const color = s.target ? INK.text : INK[SERIES_INK[slot++ % SERIES_INK.length]];
    const pts = [];
    const flush = () => {
      if (pts.length > 1) {
        if (s.target) for (let i = 1; i < pts.length; i++) w.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], { color, width: 0.9, dash: [3, 2] });
        else w.polyline(pts, { color, width: 1.3 });
      }
      pts.length = 0;
    };
    s.values.forEach((v, i) => {
      if (Number.isFinite(v)) pts.push([sx(i), sy(v)]);
      else flush();
    });
    flush();
    w.line(legendX, legendY - 2.5, legendX + 16, legendY - 2.5, { color, width: s.target ? 0.9 : 1.3, dash: s.target ? [3, 2] : undefined });
    w.text(s.label, legendX + 22, legendY, { size: 7, color: INK.text, maxWidth: w.right - legendX - 22 });
    legendY += 12;
  }
  w.y = m.bottom + 24;
}
