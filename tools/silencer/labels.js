// SPDX-License-Identifier: AGPL-3.0-or-later
// User-facing (German) texts shared by the page, the PDF report and the CSV.
// Short labels only; explanations belong in docs/ (see docs/DESIGN.md, "Principles").

import { fmt } from '../../lib/core/format.js';
import { seriesOf } from './calc.js';

export const TOOL_NAME = 'Schalldämpfer';

export const TYPE_LABELS = { source: 'Quelle', loss: 'Dämpfung', branch: 'Abzweig', silencer: 'Schalldämpfer' };
/** Lines below the first line of a row. */
export const LINE_LABELS = { aweight: 'A-Bewertung', flow: 'Strömungsgeräusch' };
export const UNIT_LABELS = { dB: 'dB', dBA: 'dB(A)' };
export const KIND_LABELS = { rect: 'Kulisse', round: 'Rund', manual: 'Hand' };
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

/** Name of a row for messages: its own name or the type. */
export const rowLabel = (row) => (row ? row.name || TYPE_LABELS[row.type] : '');

/** Name of a path: its own name or "Weg 2". */
export const pathLabel = (path, index) => path.name || `Weg ${index + 1}`;

/** Text of a table line: the row name on its first line, the operation on the lines below. */
export const lineLabel = (line, row, first) => (first ? rowLabel(row) : LINE_LABELS[line.kind] ?? '');

/** Series name without the housing in brackets: "Trox XK", "Schako MWK-OB / -LL". */
export const seriesName = (kind, id) => {
  const series = seriesOf(kind, id);
  const name = (series?.label ?? id).replace(/\s*\(.*\)$/, '');
  return `${name}${series?.estimated ? ' (geschätzt)' : ''}`;
};

/** Short German message for a calculation issue. `at` is the row (or receiver) label shown to the user. */
export function issueText(issue, at) {
  const p = at ? `${at}: ` : '';
  switch (issue.code) {
    case 'lw-missing': return `${p}LW fehlt`;
    case 'flow-missing': return `${p}V̇ fehlt`;
    case 'branch-flow-missing': return `${p}V̇ fehlt (vor oder nach dem Abzweig)`;
    case 'branch-flow': return `${p}V̇ nach dem Abzweig ${fmt(issue.value, 0)} m³/h > ${fmt(issue.limit, 0)} m³/h davor`;
    case 'row-missing': return `${p}Kein Produkt in den Daten`;
    case 'row-note': return `${p}${issue.note}`;
    case 'room-note': return `${p}${issue.note} (SIA 2024)`;
    case 'geometry-missing': return `${p}Gehäuse B × H fehlt`;
    case 'housing-small': return `${p}B ${fmt(issue.value, 0)} mm ≤ Kulisse d ${fmt(issue.limit, 0)} mm`;
    case 'gap-deviation': return `${p}Spalt s′ ${fmt(issue.value, 0)} mm, Daten für s = ${fmt(issue.limit, 0)} mm`;
    case 'gap-range': return `${p}Spalt s′ ${fmt(issue.value, 1)} mm ausserhalb der Daten ${fmt(issue.min, 0)} … ${fmt(issue.max, 0)} mm`;
    case 'schako-height': return `${p}H < 200 mm: anderer Kulissenrahmen, Δp nicht belegt`;
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

/** Product of a silencer: "Trox XK 200/100/1500", "Trox CA Ø 315 | L 1000 | Dämmung 50", "Hand". */
export function productText(row) {
  if (row.type !== 'silencer') return '';
  if (row.kind === 'manual') return KIND_LABELS.manual;
  if (row.kind === 'rect') return `${seriesName('rect', row.rect.series)} ${row.rect.d}/${fmtLimit(row.rect.s)}/${row.rect.L}`;
  const r = row.round;
  return `${seriesName('round', r.series)} Ø ${r.dn} | L ${r.L} | Dämmung ${r.insulation}${r.core ? ` | Kern ${r.core}` : ''}`;
}

/** Geometry of a silencer: "B 900 × H 1000 | n 3 | s′ 100 | Kanal" or "Aussen-Ø 504". */
export function geometryText(row, r) {
  if (row.type !== 'silencer' || row.kind === 'manual') return '';
  if (row.kind === 'rect') {
    const { B, H } = row.rect;
    const size = `B ${B != null ? fmt(B, 0) : '–'} × H ${H != null ? fmt(H, 0) : '–'}`;
    const n = r?.n ? ` | n ${r.n} | s′ ${fmtLimit(r.gap)}` : '';
    return `${size}${n} | ${INSTALL_LABELS[row.install]}`;
  }
  return [
    r?.row?.dOuterMax != null ? `Aussen-Ø max. ${fmt(r.row.dOuterMax, 0)}` : r?.row?.dOuter != null ? `Aussen-Ø ${fmt(r.row.dOuter, 0)}` : '',
    r?.row?.overallLength != null ? `L gesamt ${fmt(r.row.overallLength, 0)}` : '',
  ].filter(Boolean).join(' | ');
}

/** Place of a receiver: "r 2 m | Q 2 | Freifeld" or "r 2 m | Q 2 | A 20 m²". */
export function placeText(rc, r) {
  return `r ${rc.r != null ? fmt(rc.r, 1) : '–'} m | Q ${rc.q} | ${r?.area != null ? `A ${fmt(r.area, 1)} m²` : 'Freifeld'}`;
}

/** Target of a receiver, short: "3.01 Einzel-, Gruppenbüro (LH mittel, Mindest)", "ES II, Planungswert | K2 0 | K3 0", "Wert". */
export function targetText(rc, catalogs) {
  if (rc.basis === 'room') {
    const t = catalogs.roomTypes.find((x) => x.id === rc.room.type);
    const s = t && catalogs.sensitivities.find((x) => x.id === t.sensitivity);
    if (!t) return '–';
    return s ? `${t.id} ${t.name} (LH ${s.name}, ${REQUIREMENT_LABELS[rc.room.requirement]})` : `${t.id} ${t.name} (keine Anforderung)`;
  }
  if (rc.basis === 'lsv') {
    const parts = [`${ES_LABELS[rc.lsv.es]}, ${LSV_LIMIT_LABELS[rc.lsv.limit]}`, `K2 ${rc.lsv.k2}`, `K3 ${rc.lsv.k3}`];
    if (rc.lsv.business && rc.lsv.es <= 3) parts.push('Betriebsraum + 5');
    if (rc.lsv.hoursDay != null && rc.lsv.hoursDay < 12) parts.push(`t Tag ${fmt(rc.lsv.hoursDay, 1)} h`);
    if (rc.lsv.hoursNight != null && rc.lsv.hoursNight < 12) parts.push(`t Nacht ${fmt(rc.lsv.hoursNight, 1)} h`);
    return parts.join(' | ');
  }
  return BASIS_LABELS.manual;
}

/** What a check judges: "LpA", "Lr Tag", "Lr Nacht". */
export const checkLevelLabel = (period) => (period ? `Lr ${PERIOD_LABELS[period]}` : 'LpA');
