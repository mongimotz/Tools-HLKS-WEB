// SPDX-License-Identifier: AGPL-3.0-or-later
// User-facing (German) texts shared by the page and the PDF report.
// Short labels only; explanations belong in docs/ (see docs/DESIGN.md, "Principles").

import { fmt } from '../../lib/core/format.js';

export const TOOL_NAME = 'Schalldämpfer';

export const TYPE_LABELS = { source: 'Quelle', component: 'Bauteil', silencer: 'Schalldämpfer', receiver: 'Empfänger' };
export const KIND_LABELS = { rect: 'Kulisse', round: 'Rohr', manual: 'Eingabe' };
export const INSTALL_LABELS = { duct: 'Kanal', freeInlet: 'Ansaugung frei', freeOutlet: 'Ausblasen frei' };
export const BASIS_LABELS = { room: 'Raumtyp', lsv: 'LSV', manual: 'Wert' };
export const REQUIREMENT_LABELS = { min: 'Mindest', raised: 'erhöht', design: 'Auslegung' };
export const LSV_LIMIT_LABELS = { planning: 'Planungswert', immission: 'Immissionsgrenzwert' };
export const PERIOD_LABELS = { day: 'Tag', night: 'Nacht' };
export const ES_LABELS = { 1: 'ES I', 2: 'ES II', 3: 'ES III', 4: 'ES IV' };
export const SEVERITY_LABELS = { error: 'Fehler', warning: 'Warnung', info: 'Hinweis' };

/** Octave band labels for column heads: 63 … 8k. */
export const OCTAVE_LABELS = ['63', '125', '250', '500', '1k', '2k', '4k', '8k'];

/** A limit or target: whole numbers without decimals, others with one. */
export const fmtLimit = (v) => fmt(v, Number.isInteger(v) ? 0 : 1);

/** Name of an element for messages: "4 Schalldämpfer 2", or the type if it has no name. */
export function elementLabel(el) {
  if (!el) return '';
  return [el.nr, el.name || TYPE_LABELS[el.type]].filter(Boolean).join(' ');
}

/** Short German message for a calculation issue. `at` is the element label shown to the user. */
export function issueText(issue, at) {
  const p = at ? `${at}: ` : '';
  switch (issue.code) {
    case 'after-missing': return `${p}Vorgänger fehlt, an den Anfang gestellt`;
    case 'cycle': return `${p}Vorgänger bilden einen Kreis`;
    case 'root-not-source': return `${p}Strang beginnt nicht mit einer Quelle`;
    case 'lw-missing': return `${p}LW fehlt`;
    case 'flow-missing': return `${p}V̇ fehlt`;
    case 'flow-continuity': return `${p}Σ V̇ danach ${fmt(issue.value, 0)} m³/h > ${fmt(issue.limit, 0)} m³/h`;
    case 'split-missing': return `${p}Abzweig ohne eigenen V̇`;
    case 'row-missing': return `${p}Kein Produkt in den Daten`;
    case 'row-note': return `${p}${issue.note}`;
    case 'room-note': return `${p}${issue.note} (SIA 2024)`;
    case 'geometry-missing': return `${p}Anzahl Kulissen oder Höhe fehlt`;
    case 'edge-gap': return `${p}B ${fmt(issue.value, 0)} mm ≠ n·(d + s) = ${fmt(issue.limit, 0)} mm`;
    case 'trox-gap': return `${p}Spalt s ${fmt(issue.value, 0)} mm ausserhalb ${fmt(issue.min, 0)} … ${fmt(issue.max, 0)} mm`;
    case 'height-dp': return `${p}Δp gilt für H = ${fmt(issue.limit, 0)} mm`;
    case 'velocity-high': return `${p}v = ${fmt(issue.value, 1)} m/s > ${fmt(issue.limit, 0)} m/s`;
    case 'dp-high': return `${p}Δp = ${fmt(issue.value, 0)} Pa > ${fmt(issue.limit, 0)} Pa`;
    case 'flow-noise':
      return issue.value >= 0
        ? `${p}Strömungsgeräusch nur ${fmt(issue.value, 1)} dB unter dem Pegel (min. ${fmt(issue.limit, 0)} dB)`
        : `${p}Strömungsgeräusch ${fmt(-issue.value, 1)} dB über dem Pegel`;
    case 'de-cap': return `${p}De > ${fmt(issue.limit, 0)} dB`;
    case 'receiver-incomplete': return `${p}Abstand r fehlt`;
    case 'target-exceeded': {
      const what = issue.period ? `Lr ${PERIOD_LABELS[issue.period]}` : 'LpA';
      return `${p}${what} ${fmt(issue.value, 1)} dB(A) > ${fmtLimit(issue.limit)} dB(A)`;
    }
    default: return `${p}${issue.code}`;
  }
}

// ---- texts for the PDF report and the CSV ---------------------------------------------------------

/** Product of a silencer: "Trox XK (Gehäuse XS) 200/100/1500", "Trox CA Ø 315, L 1000, Dämmung 50", "Eingabe". */
export function productText(el, seriesLabel) {
  if (el.type !== 'silencer') return '';
  if (el.kind === 'manual') return KIND_LABELS.manual;
  if (el.kind === 'rect') return `${seriesLabel(el.kind, el.rect.series)} ${el.rect.d}/${el.rect.s}/${el.rect.L}`;
  const r = el.round;
  return `${seriesLabel(el.kind, r.series)} Ø ${r.dn}, L ${r.L}, Dämmung ${r.insulation}${r.core ? `, Kern ${r.core}` : ''}`;
}

/** Geometry and installation of a silencer: "n 4, H 1000, B 1'200, Kanal" or "Aussen-Ø 504". */
export function geometryText(el, r) {
  if (el.type !== 'silencer' || el.kind === 'manual') return '';
  if (el.kind === 'rect') return `n ${el.rect.n ?? '–'}, H ${el.rect.H ?? '–'}, B ${r?.B != null ? fmt(r.B, 0) : '–'}, ${INSTALL_LABELS[el.install]}`;
  return r?.row?.dOuter != null ? `Aussen-Ø ${fmt(r.row.dOuter, 0)}` : '';
}

/** Place of a receiver: "r 2 m | Q 2 | Freifeld" or "r 2 m | Q 2 | A 20 m²". */
export function placeText(el, r) {
  return `r ${el.r != null ? fmt(el.r, 1) : '–'} m | Q ${el.q} | ${r?.area != null ? `A ${fmt(r.area, 1)} m²` : 'Freifeld'}`;
}

/** Target of a receiver, short: "Büro (LH mittel, Mindest)", "ES II, Planungswert", "Wert". */
export function targetText(el, catalogs) {
  if (el.basis === 'room') {
    const t = catalogs.roomTypes.find((x) => x.id === el.room.type);
    const s = t && catalogs.sensitivities.find((x) => x.id === t.sensitivity);
    if (!t) return '–';
    return s ? `${t.id} ${t.name} (LH ${s.name}, ${REQUIREMENT_LABELS[el.room.requirement]})` : `${t.id} ${t.name} (keine Anforderung)`;
  }
  if (el.basis === 'lsv') {
    const parts = [`${ES_LABELS[el.lsv.es]}, ${LSV_LIMIT_LABELS[el.lsv.limit]}`, `K2 ${el.lsv.k2}`, `K3 ${el.lsv.k3}`];
    if (el.lsv.business && el.lsv.es <= 3) parts.push('Betriebsraum + 5');
    if (el.lsv.hoursDay != null && el.lsv.hoursDay < 12) parts.push(`t Tag ${fmt(el.lsv.hoursDay, 1)} h`);
    if (el.lsv.hoursNight != null && el.lsv.hoursNight < 12) parts.push(`t Nacht ${fmt(el.lsv.hoursNight, 1)} h`);
    return parts.join(' | ');
  }
  return BASIS_LABELS.manual;
}

/** What a check judges: "LpA", "Lr Tag", "Lr Nacht". */
export const checkLevelLabel = (period) => (period ? `Lr ${PERIOD_LABELS[period]}` : 'LpA');

/**
 * Spectra along the path to the governing receiver of a strand (page chart and PDF): the source, the level after
 * each silencer, the receiver and the target (the receiver spectrum moved by its margin).
 */
export function spectrumSeries(strand, res, path) {
  const series = [];
  for (const id of path) {
    const r = res.elements.get(id);
    const el = strand.elements.find((e) => e.id === id);
    if (!r || !el) continue;
    if (!r.parent && el.type === 'source') series.push({ label: elementLabel(el), values: r.lwOut });
    else if (el.type === 'silencer') series.push({ label: `nach ${elementLabel(el)}`, values: r.lwOut });
    else if (el.type === 'receiver' && r.lp) {
      series.push({ label: elementLabel(el), values: r.lp });
      if (r.governing) series.push({ label: 'Ziel', values: r.lp.map((l) => l + r.governing.margin), target: true });
    }
  }
  return series.filter((s) => s.values.some(Number.isFinite));
}
