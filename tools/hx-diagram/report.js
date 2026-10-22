// SPDX-License-Identifier: AGPL-3.0-or-later
// PDF of the h,x diagram: one A4 sheet per calculation with its processes, then the tables of states and
// processes; and the blank sheet. No DOM: also used by Node tests. The diagram is the same item list as on
// screen (chart.js), drawn with pdf-lib.

import { buildPdf, loadInk, INK, ReportWriter, A4_PORTRAIT, hexColor } from '../../lib/core/pdf.js';
import { PDFDocument, degrees } from '../../lib/vendor/pdf-lib/pdf-lib.esm.min.js';
import { fmt, fmtDate } from '../../lib/core/format.js';
import { buildChart, DEFAULT_RANGE } from './chart.js';
import { overlayOf, placeLabels } from './svg.js';
import { computeProject, snapshotProjectOf, pressureOf, CALC_VERSION } from './calc.js';
import { calculationName } from './defaults.js';
import { TOOL_NAME, BLOCK_LABELS, issueText } from './labels.js';

const MM = 72 / 25.4;
const MARGIN = 8 * MM;
const HEAD = 16 * MM; // title and fields above the diagram
const FONT = 7.5; // label size in pt

// line weights in pt
const WIDTH = { fine: 0.25, norm: 0.4, bold: 0.9, dash: 0.4 };

/** Draw the sheet head and the diagram, filling the page below the head, with an optional overlay. */
function drawSheet(w, { title, fields, pressure, altitude, range, overlay }) {
  const page = w.page;
  const top = MARGIN;
  // ---- head ----
  w.text(title, MARGIN, top + 13, { size: 16, bold: true, color: INK.strong });
  w.text(`p = ${fmt(pressure / 100, 0)} mbar, H = ${fmt(altitude, 0)} m ü. M.`, w.pageW - MARGIN, top + 13, { size: 8.5, color: INK.strong, align: 'right' });
  const fy = top + 32;
  const cols = [0.42, 0.36, 0.22];
  let fx = MARGIN;
  const span = w.pageW - 2 * MARGIN;
  fields.forEach(([label, value], i) => {
    const cw = span * cols[i] - (i < 2 ? 6 * MM : 0);
    const lw = w.measure(label, 7) + 1.5 * MM;
    w.text(label, fx, fy, { size: 7, color: INK.muted });
    if (value) w.text(value, fx + lw, fy - 1, { size: 9, color: INK.strong, maxWidth: cw - lw });
    w.line(fx + lw, fy + 1.4, fx + cw, fy + 1.4, { color: INK.strong, width: 0.32 });
    fx += span * cols[i];
  });

  // ---- diagram in pt, filling the rest of the page ----
  const chart = buildChart(pressure, range, { width: w.pageW - 2 * MARGIN, height: w.pageH - 2 * MARGIN - HEAD, font: FONT });
  const ox = MARGIN;
  const oy = MARGIN + HEAD;
  const P = ([x, y]) => [ox + x, oy + y];

  const paths = { fine: [], norm: [], bold: [], dash: [] };
  const texts = [];
  for (const it of chart.items) {
    if (it.k === 'line') paths[it.s].push(`M${it.a[0]} ${it.a[1]}L${it.b[0]} ${it.b[1]}`);
    else if (it.k === 'poly') paths[it.s].push(`M${it.pts.map((q) => `${q[0]} ${q[1]}`).join('L')}`);
    else texts.push(it);
  }
  const ink = hexColor(INK.strong);
  for (const [style, list] of Object.entries(paths)) {
    if (!list.length) continue;
    page.drawSvgPath(list.join(''), {
      x: ox,
      y: w.pageH - oy,
      borderColor: ink,
      borderWidth: WIDTH[style],
      borderDashArray: style === 'dash' ? [6, 3.6] : undefined,
    });
  }
  for (const t of texts) drawText(w, t, P);
  if (overlay) drawOverlay(w, chart.map, overlay, P);
}

/** Text item with anchor, rotation and white knock-out. */
function drawText(w, it, P, { color = INK.strong, bold = false } = {}) {
  const size = it.size;
  const width = w.measure(it.text, size, bold);
  const fa = it.anchor === 'end' ? 1 : it.anchor === 'middle' ? 0.5 : 0;
  const base = it.base === 'top' ? 0.72 : it.base === 'bottom' ? -0.22 : 0.34; // baseline below the anchor, in em
  const a = ((it.angle || 0) * Math.PI) / 180;
  const rot = ([dx, dy]) => [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a)];
  const [ax, ay] = P(it.at);
  const o = rot([-width * fa, base * size]);
  const x = ax + o[0];
  const y = ay + o[1];
  if (it.knock) {
    const pad = 0.12 * size;
    const corners = [[-pad, -0.74 * size], [width + pad, -0.74 * size], [width + pad, 0.24 * size], [-pad, 0.24 * size]].map((c) => {
      const r = rot(c);
      return [x + r[0], y + r[1]];
    });
    w.page.drawSvgPath(`M${corners.map((c) => `${c[0]} ${c[1]}`).join('L')}Z`, { x: 0, y: w.pageH, color: hexColor(INK.surface), borderWidth: 0 });
  }
  let cx = 0;
  for (const r of w._runs(it.text, bold, false)) {
    const font = w.fonts[r.key];
    const d = rot([cx, 0]);
    w.page.drawText(r.text, { x: x + d[0], y: w.pageH - (y + d[1]), size, font, color: hexColor(color), rotate: degrees(-(it.angle || 0)) });
    cx += font.widthOfTextAtSize(r.text, size);
  }
}

/** Part of the segment a–b inside the convex polygon (Cyrus–Beck), or null. */
function clip(a, b, poly) {
  let t0 = 0;
  let t1 = 1;
  const d = [b[0] - a[0], b[1] - a[1]];
  const area = poly.reduce((s, p, i) => s + p[0] * poly[(i + 1) % poly.length][1] - poly[(i + 1) % poly.length][0] * p[1], 0);
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const n = area > 0 ? [-(q[1] - p[1]), q[0] - p[0]] : [q[1] - p[1], -(q[0] - p[0])]; // inward normal
    const num = n[0] * (a[0] - p[0]) + n[1] * (a[1] - p[1]);
    const den = n[0] * d[0] + n[1] * d[1];
    if (Math.abs(den) < 1e-12) {
      if (num < 0) return null;
      continue;
    }
    const t = -num / den;
    if (den > 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }
  return [[a[0] + t0 * d[0], a[1] + t0 * d[1]], [a[0] + t1 * d[0], a[1] + t1 * d[1]], t1 === 1];
}

/** Process colours (light tokens), the same mapping as the page (style.css). */
const toneColor = (tone) => ({ heat: INK.danger, cool: INK.chart1, humid: INK.chart8 })[tone] ?? INK.muted;

function drawOverlay(w, map, overlay, P) {
  const frame = map.frame();
  const inside = (q) => clip(q, q, frame) !== null;
  for (const s of overlay.segments) {
    const color = toneColor(s.tone);
    const dashed = s.kind !== 'arrow';
    const pts = s.path.map((q) => map.ph(q.x, q.h));
    for (let i = 1; i < pts.length; i++) {
      const c = clip(pts[i - 1], pts[i], frame);
      if (!c) continue;
      const a = P(c[0]);
      const b = P(c[1]);
      w.line(a[0], a[1], b[0], b[1], { color, width: 1.1, dash: dashed ? [3, 2] : undefined });
      if (s.kind !== 'arrow' || i < pts.length - 1 || !c[2]) continue;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 1e-3) continue;
      const u = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
      const n = [-u[1], u[0]];
      const back = [b[0] - u[0] * 5, b[1] - u[1] * 5];
      const c1 = [back[0] + n[0] * 1.9, back[1] + n[1] * 1.9];
      const c2 = [back[0] - n[0] * 1.9, back[1] - n[1] * 1.9];
      w.page.drawSvgPath(`M${b[0]} ${b[1]}L${c1[0]} ${c1[1]}L${c2[0]} ${c2[1]}Z`, { x: 0, y: w.pageH, color: hexColor(color), borderWidth: 0 });
    }
  }
  const labels = placeLabels(overlay.points, map);
  overlay.points.forEach((q, i) => {
    const at = map.ph(q.x, q.h);
    if (!inside(at)) return;
    const [x, y] = P(at);
    const color = q.given ? INK.strong : toneColor(q.tone);
    w.page.drawCircle({ x, y: w.pageH - y, size: 1.7, color: hexColor(q.given ? INK.surface : color), borderColor: hexColor(color), borderWidth: 0.9 });
    const l = labels[i];
    drawText(w, { at: [l.x, l.y], text: q.label, size: map.font * 1.06, anchor: l.anchor, base: l.base, angle: 0, knock: true }, P, { color: INK.strong, bold: true });
  });
}

// ---- tables ----------------------------------------------------------------------------------

const n = (v, d) => (v == null || !Number.isFinite(v) ? '–' : fmt(v, d));

function drawTables(w, c, index, r, project) {
  w.text(`${TOOL_NAME}: ${calculationName(c, index)}`, w.left, w.y + 14, { size: 14, bold: true, color: INK.strong });
  w.y += 26;
  w.keyValues([
    ['Projekt', project.name],
    ['Projekt-Nr.', project.number],
    ['Bearbeiter', project.author],
    ['Datum', fmtDate(project.date)],
    ['Luftdruck', `${fmt(r.pressure / 100, 0)} mbar`],
    ['V̇ Berechnung', c.flow ? `${fmt(c.flow, 0)} m³/h` : '–'],
  ], { columns: 4 });

  w.heading('Zustände');
  const points = [...r.points.values()];
  w.table({
    columns: [
      { label: 'Punkt', width: 50 },
      { label: 't', unit: '°C', width: 44, align: 'right', mono: true },
      { label: 'φ', unit: '%', width: 40, align: 'right', mono: true },
      { label: 'x', unit: 'g/kg', width: 46, align: 'right', mono: true },
      { label: 'h', unit: 'kJ/kg', width: 48, align: 'right', mono: true },
      { label: 'ρ', unit: 'kg/m³', width: 48, align: 'right', mono: true },
      { label: 'Taupunkt', unit: '°C', width: 56, align: 'right', mono: true },
      { label: 'Feuchtkugel', unit: '°C', width: 54, align: 'right', mono: true },
      { label: 'V̇', unit: 'm³/h', width: 52, align: 'right', mono: true },
      { label: 'ṁ', unit: 'kg/h', width: 52, align: 'right', mono: true },
    ],
    rows: points.map((pt) => {
      const s = pt.state;
      return [{ text: pt.label, bold: true }, n(s?.t, 1), n(s ? s.phi * 100 : null, 1), n(s?.x, 2), n(s?.h, 1), n(s?.rho, 3), n(s?.td, 1), n(s?.tw, 1), n(pt.flow, 0), n(pt.m, 0)];
    }),
  });

  const processes = c.blocks.filter((b) => b.type !== 'point');
  if (processes.length) {
    w.heading('Prozesse');
    const label = (id) => r.points.get(id)?.label ?? '–';
    w.table({
      columns: [
        { label: 'Baustein', width: 92 },
        { label: 'Eintritt', width: 70 },
        { label: 'Austritt', width: 60 },
        { label: 'Q', unit: 'kW', width: 50, align: 'right', mono: true },
        { label: 'Wasser', unit: 'kg/h', width: 60, align: 'right', mono: true },
        { label: 'Kennwert', width: 157, mono: false },
      ],
      rows: processes.map((b) => {
        const res = r.blocks.get(b.id);
        const v = res.values;
        const water = v.water ?? (v.condensate ? -v.condensate : null);
        const err = res.issues.find((i) => i.severity === 'error');
        return [
          BLOCK_LABELS[b.type],
          res.inputs.map(label).join(' + '),
          res.out.map(label).join(' + '),
          b.type === 'mix' ? '–' : n(v.q, 1),
          n(water, 1),
          err ? issueText(err) : keyText(b, v),
        ];
      }),
    });
  }
  const notes = r.issues.filter((i) => i.severity !== 'error');
  if (notes.length) {
    w.heading('Hinweise');
    for (const i of notes) w.paragraph(`${r.points.get(i.pointId ?? i.blockId)?.label ?? ''}: ${issueText(i)}`, { size: 8 });
  }
}

/** Short parameter text of a process. */
function keyText(b, v) {
  switch (b.type) {
    case 'heater': return b.mode === 'q' ? `Q = ${n(b.q, 1)} kW` : `t = ${n(b.t, 1)} °C`;
    case 'cooler': return `tO = ${n(b.ts, 1)} °C${v.sensible != null ? ` | Qs = ${n(v.sensible, 1)} kW` : ''}${v.wet ? '' : ' | trocken'}`;
    case 'steam': return `tD = ${n(b.ts, 0)} °C`;
    case 'adiabatic': return `η = ${n(v.eta, 0)} %`;
    case 'hrv': return `Φt = ${n(b.eta, 0)} %${b.mode === 'enthalpy' ? ` | Φx = ${n(b.etaX, 0)} %` : ''}${b.tFrost == null ? '' : ` | tFO,min = ${n(b.tFrost, 1)} °C`}${v.limited ? ` | wirksam Φt = ${n(v.eta, 0)} %` : ''}`;
    case 'mix': return `Anteil ${n(v.share, 0)} %`;
    case 'fan': return `Δt = ${n(b.dt, 1)} K`;
    case 'line': return v.ratio != null ? `Δh/Δx = ${n(v.ratio, 0)} kJ/kg | Δh = ${n(v.dh, 1)} kJ/kg` : '';
    default: return '';
  }
}

// ---- documents --------------------------------------------------------------------------------

export async function buildReport(doc, _result, envelope) {
  const { project, inputs } = doc;
  const results = computeProject(inputs);
  const title = project.name ? `${TOOL_NAME} – ${project.name}` : TOOL_NAME;
  const sheets = new Set();

  const render = (w) => {
    inputs.calculations.forEach((c, index) => {
      const r = results.calculations.get(c.id);
      if (index > 0) w.newPage();
      sheets.add(w.pages.length - 1);
      drawSheet(w, {
        title: TOOL_NAME,
        range: c.range,
        fields: [['Objekt', project.name], ['Anlage', calculationName(c, index)], ['Datum', fmtDate(project.date)]],
        pressure: r.pressure,
        altitude: inputs.site.altitude,
        overlay: overlayOf(r, c.blocks),
      });
      w.newPage();
      drawTables(w, c, index, r, project);
    });
  };
  const decorate = (w, i, total) => {
    if (sheets.has(i)) return;
    const top = 30;
    w.text('HLKS-Tools', w.left, top, { size: 8, bold: true, color: INK.primary });
    w.text(TOOL_NAME, w.left + w.measure('HLKS-Tools', 8, true) + 8, top, { size: 8, color: INK.text });
    w.text([project.name, project.number].filter(Boolean).join(' | '), w.right, top, { size: 8, color: INK.text, align: 'right', maxWidth: w.contentWidth / 2 });
    w.line(w.left, top + 7, w.right, top + 7, { color: INK.border, width: 0.6 });
    const fy = w.pageH - 24;
    w.line(w.left, fy - 10, w.right, fy - 10, { color: INK.border, width: 0.4 });
    w.text(`HLKS-Tools | Berechnungsversion ${CALC_VERSION} | Eingaben eingebettet (data.json)`, w.left, fy, { size: 6.5, color: INK.muted, maxWidth: w.contentWidth - 80 });
    w.text(`Seite ${i + 1} / ${total}`, w.right, fy, { size: 7, color: INK.muted, align: 'right' });
  };

  return buildPdf({
    envelope: { ...envelope, project, inputs, snapshot: snapshotProjectOf(results) },
    title,
    subject: `HLKS-Tools: ${TOOL_NAME}`,
    author: project.author,
    pageSize: A4_PORTRAIT,
    render,
    decorate,
  });
}

/** The blank sheet for the site's pressure, with empty fields (no data attached). */
export async function buildBlankSheet(site, range = DEFAULT_RANGE) {
  await loadInk();
  const doc = await PDFDocument.create();
  const w = await ReportWriter.create(doc, { pageSize: A4_PORTRAIT });
  const p = pressureOf(site);
  drawSheet(w, { title: TOOL_NAME, fields: [['Objekt', ''], ['Anlage', ''], ['Datum', '']], pressure: p, altitude: site.altitude, range });
  doc.setTitle(`${TOOL_NAME}, ${fmt(site.altitude, 0)} m ü. M.`);
  doc.setCreator('HLKS-Tools');
  doc.setProducer('HLKS-Tools (pdf-lib)');
  return doc.save();
}
