// PDF report and CSV export for the duct tool. No DOM: also used by Node tests.

import { buildPdf, INK } from '../../lib/core/pdf.js';
import { fmt, fmtSig, fmtDate } from '../../lib/core/format.js';
import { CALC_VERSION, airState } from './calc.js';
import { TOOL_NAME, DIRECTION_LABELS, issueText } from './labels.js';

function nrMap(sections) {
  const m = new Map();
  sections.forEach((s, i) => m.set(s.id, s.nr || `Zeile ${i + 1}`));
  return m;
}

function dimText(s) {
  if (s.shape === 'round') return s.diameter ? `Ø ${fmt(s.diameter, 0)}` : '–';
  return s.width && s.height ? `${fmt(s.width, 0)} × ${fmt(s.height, 0)}` : '–';
}

/** Build the PDF (Uint8Array). doc = { project, inputs }, result = compute(inputs). */
export async function buildReport(doc, result, envelope) {
  const { project, inputs } = doc;
  const { system, sections, catalogs } = inputs;
  const nr = nrMap(sections);
  const materials = new Map(catalogs.materials.map((m) => [m.id, m]));
  const fittings = new Map(catalogs.fittings.map((f) => [f.id, f]));
  const t = result.totals;
  const title = system.name ? `${TOOL_NAME} – ${system.name}` : TOOL_NAME;

  const render = (w) => {
    // ---- title & project ------------------------------------------------------
    w.y += 8;
    w.text('Druckverlustberechnung Lüftung', w.left, w.y + 14, { size: 17, bold: true, color: INK.strong });
    w.y += 24;
    if (system.name) w.text(system.name, w.left, w.y + 12, { size: 11, color: INK.text });
    w.y += 20;
    const air = airState(system);
    w.keyValues(
      [
        ['Projekt', project.name],
        ['Projekt-Nr.', project.number],
        ['Bearbeitung', project.author],
        ['Datum', fmtDate(project.date)],
        ['Strömungsrichtung', DIRECTION_LABELS[system.direction]],
        ['Höhe / Luft', `${fmt(system.altitude, 0)} m ü. M., ${fmt(system.temperature, 1)} °C, ${fmt(system.humidity, 0)} % r. F.`],
        ['Luftdichte (Anlage)', `${fmt(air.density, 3)} kg/m³ bei ${fmt(air.pressure / 100, 0)} hPa`],
      ],
      { columns: 4 },
    );

    // ---- result box ---------------------------------------------------------------
    w.y += 6;
    const boxTop = w.y;
    const boxH = 58;
    w.rect(w.left, boxTop, w.contentWidth, boxH, { fill: INK.sunken });
    const col = w.contentWidth / 4;
    const big = (label, value, i, color = INK.strong) => {
      const x = w.left + 12 + i * col;
      w.text(label, x, boxTop + 16, { size: 7.5, color: INK.muted });
      w.text(value, x, boxTop + 38, { size: 16, bold: true, mono: true, color });
    };
    big('Druckverlust kritischer Strang', `${fmt(t.critical, 1)} Pa`, 0);
    big(t.margin > 0 ? `Erforderlich inkl. ${fmt(t.margin, 0)} % Zuschlag` : 'Erforderlich', `${fmt(t.required, 0)} Pa`, 1);
    big('Verfügbarer Druck', t.available != null ? `${fmt(t.available, 0)} Pa` : '–', 2);
    if (t.reserve != null) big(t.reserve >= 0 ? 'Reserve' : 'Fehlbetrag', `${fmt(Math.abs(t.reserve), 0)} Pa`, 3, t.reserve >= 0 ? INK.strong : INK.danger);
    else big('Reserve', '–', 3);
    w.y = boxTop + boxH + 8;
    const share = (v) => (t.critical > 0 ? ` (${fmt((v / t.critical) * 100, 0)} %)` : '');
    w.text(
      `Kritischer Strang: ${result.path.map((id) => nr.get(id)).join(' → ') || '–'}   ·   Reibung ${fmt(t.friction, 1)} Pa${share(t.friction)}   ·   Formstücke ${fmt(t.fittings, 1)} Pa${share(t.fittings)}   ·   Einbauteile ${fmt(t.components, 1)} Pa${share(t.components)}`,
      w.left,
      w.y + 8,
      { size: 8, color: INK.text, maxWidth: w.contentWidth },
    );
    w.y += 14;

    // ---- section table ----------------------------------------------------------
    w.heading('Teilstrecken');
    const rows = sections.map((s) => {
      const r = result.sections.get(s.id);
      const ok = r?.status === 'ok';
      const over = ok && r.vmax != null && r.velocity > r.vmax + 1e-9;
      return [
        nr.get(s.id),
        s.parent ? nr.get(s.parent) : 'Vent.',
        s.shape === 'round' ? 'rund' : 'eckig',
        materials.get(s.material)?.name ?? '–',
        fmt(s.flow, 0),
        dimText(s),
        fmt(s.length, 1),
        ok ? fmt(r.dh * 1000, 0) : '',
        ok ? { text: over ? `${fmt(r.velocity, 2)} ↑` : fmt(r.velocity, 2), color: over ? INK.danger : undefined, bold: over } : '',
        ok ? fmt(r.vmax, 1) : '',
        ok ? fmt(r.gradient, 2) : '',
        ok ? fmt(r.zetaSum, 2) : '',
        ok ? fmt(r.dpFriction, 1) : '',
        ok ? fmt(r.dpFittings, 1) : '',
        fmt(r?.dpComponents ?? 0, 1),
        fmt(r?.dp ?? 0, 1),
        { text: fmt(r?.cum ?? 0, 1), bold: true },
        r?.terminal ? fmt(r.throttle, 1) : '',
        s.note,
      ];
    });
    w.table({
      columns: [
        { label: 'Nr.', width: 32 },
        { label: 'Vorg.', width: 32 },
        { label: 'Form', width: 30 },
        { label: 'Material', width: 88 },
        { label: 'V̇', unit: 'm³/h', width: 40, align: 'right' },
        { label: 'Abmessung', unit: 'mm', width: 56, align: 'right' },
        { label: 'L', unit: 'm', width: 28, align: 'right' },
        { label: 'dh', unit: 'mm', width: 30, align: 'right' },
        { label: 'v', unit: 'm/s', width: 30, align: 'right' },
        { label: 'v max', unit: 'm/s', width: 30, align: 'right' },
        { label: 'R', unit: 'Pa/m', width: 32, align: 'right' },
        { label: 'Σζ', unit: '–', width: 30, align: 'right' },
        { label: 'Δp R·L', unit: 'Pa', width: 34, align: 'right' },
        { label: 'Δp Z', unit: 'Pa', width: 32, align: 'right' },
        { label: 'Δp Einb.', unit: 'Pa', width: 36, align: 'right' },
        { label: 'Δp TS', unit: 'Pa', width: 34, align: 'right' },
        { label: 'Δp kum.', unit: 'Pa', width: 38, align: 'right' },
        { label: 'Drossel', unit: 'Pa', width: 34, align: 'right' },
        { label: 'Bemerkung', width: 84 },
      ],
      rows,
      rowStyle: (i) => (result.sections.get(sections[i].id)?.critical ? { fill: INK.primarySubtle } : {}),
    });
    w.space(4);
    w.rect(w.left, w.y + 2.5, 14, 7, { fill: INK.primarySubtle });
    w.text('kritischer Strang', w.left + 18, w.y + 8.5, { size: 7, color: INK.muted });
    w.y += 12;

    // ---- pressure profile ------------------------------------------------------------
    drawProfile(w, result, nr);

    // ---- fittings & components per section -----------------------------------------
    const detailRows = [];
    for (const s of sections) {
      const r = result.sections.get(s.id);
      (s.fittings ?? []).forEach((f, i) => {
        const cat = fittings.get(f.ref);
        const d = r?.fittingDetails?.[i];
        detailRows.push([
          nr.get(s.id),
          'Formstück',
          `${cat?.name ?? '(nicht im Katalog)'}${d?.computed ? ' (berechnet)' : ''}`,
          fmt(f.count, 0),
          d ? fmt(d.zeta, 3) : '',
          d ? fmt(d.dp, 1) : '',
        ]);
      });
      if (s.zetaExtra) {
        detailRows.push([nr.get(s.id), 'Formstück', 'ζ zusätzlich', '', fmt(s.zetaExtra, 3), r?.status === 'ok' ? fmt(s.zetaExtra * r.dynamicPressure, 1) : '']);
      }
      for (const c of s.components ?? []) detailRows.push([nr.get(s.id), 'Einbauteil', c.name || '–', '', '', fmt(c.dp, 1)]);
    }
    if (detailRows.length) {
      w.heading('Formstücke und Einbauteile');
      w.table({
        columns: [
          { label: 'Nr.', width: 40 },
          { label: 'Art', width: 70 },
          { label: 'Bezeichnung', width: 300 },
          { label: 'Anzahl', width: 50, align: 'right' },
          { label: 'ζ (je Stück)', unit: '–', width: 60, align: 'right' },
          { label: 'Δp', unit: 'Pa', width: 60, align: 'right' },
        ],
        rows: detailRows,
      });
    }

    // ---- terminals ---------------------------------------------------------------------
    if (result.terminals.length > 1) {
      w.heading('Strangenden und Drosselbedarf');
      const termRows = result.terminals
        .map((id) => result.sections.get(id))
        .sort((a, b) => b.cum - a.cum)
        .map((r) => {
          const p = [];
          for (let c = r; c; c = c.parent ? result.sections.get(c.parent) : null) p.unshift(nr.get(c.id));
          return [nr.get(r.id), p.join(' → '), fmt(r.cum, 1), fmt(r.throttle, 1)];
        });
      w.table({
        columns: [
          { label: 'Ende', width: 50 },
          { label: 'Strang', width: 380 },
          { label: 'Δp kum.', unit: 'Pa', width: 70, align: 'right' },
          { label: 'Drosselbedarf', unit: 'Pa', width: 90, align: 'right' },
        ],
        rows: termRows,
      });
    }

    // ---- issues ----------------------------------------------------------------------------
    const issues = result.issues.filter((i) => i.code !== 'flow-missing');
    if (issues.length) {
      w.heading('Hinweise');
      for (const i of issues) {
        const prefix = i.severity === 'error' ? 'Fehler: ' : i.severity === 'warning' ? 'Warnung: ' : '';
        w.paragraph(`${prefix}${issueText(i, i.sectionId ? nr.get(i.sectionId) : '')}`, { size: 8, color: i.severity === 'error' ? INK.danger : INK.text });
      }
    }

    // ---- basis ------------------------------------------------------------------------------
    w.heading('Grundlagen');
    const usedMaterials = [...new Set(sections.map((s) => s.material))].map((id) => materials.get(id)).filter(Boolean);
    w.table({
      columns: [
        { label: 'Grösse', width: 120 },
        { label: 'Ansatz', width: 640 },
      ],
      rows: [
        ['Luftdichte', 'feuchte Luft, Luftdruck nach Normatmosphäre, Viskosität nach Sutherland'],
        ['Reibung', 'Darcy-Weisbach mit dh, λ nach Colebrook-White, laminar 64/Re (Re < 2320)'],
        ['Formstücke', 'Δp = Σζ · ρ/2 · v² mit v der Teilstrecke; Querschnittsänderung nach Borda-Carnot / Einschnürung'],
        ['Rauigkeit', usedMaterials.map((m) => `${m.name} k = ${fmtSig(m.roughness, 3)} mm`).join('; ') || '–'],
        ['ζ, Δp Einbauteile', 'Richtwerte, Herstellerangaben massgebend'],
      ],
    });
  };

  const decorate = (w, i, total) => {
    const top = 30;
    w.text('HLKS-Tools', w.left, top, { size: 8, bold: true, color: INK.primary });
    w.text(TOOL_NAME, w.left + w.measure('HLKS-Tools', 8, true) + 8, top, { size: 8, color: INK.text });
    const right = [project.name, project.number].filter(Boolean).join(' · ');
    w.text(right, w.right, top, { size: 8, color: INK.text, align: 'right', maxWidth: w.contentWidth / 2 });
    w.line(w.left, top + 7, w.right, top + 7, { color: INK.border, width: 0.6 });
    const fy = w.pageH - 24;
    w.line(w.left, fy - 10, w.right, fy - 10, { color: INK.border, width: 0.4 });
    w.text(
      `Berechnungsversion ${CALC_VERSION} · Eingaben eingebettet (data.json)`,
      w.left,
      fy,
      { size: 6.5, color: INK.muted, maxWidth: w.contentWidth - 80 },
    );
    w.text(`Seite ${i + 1} / ${total}`, w.right, fy, { size: 7, color: INK.muted, align: 'right' });
  };

  return buildPdf({
    envelope,
    title,
    subject: `HLKS-Tools: ${TOOL_NAME}`,
    author: project.author,
    render,
    decorate,
  });
}

function niceMax(v) {
  if (!(v > 0)) return 10;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * exp >= v) return m * exp;
  return 10 * exp;
}

function drawProfile(w, result, nr) {
  const path = result.path.map((id) => result.sections.get(id));
  const t = result.totals;
  if (!path.length || t.critical <= 0) return;
  const H = 150;
  w.heading('Druckverlauf kritischer Strang', { keepWith: H + 30 });
  const m = { left: w.left + 40, right: w.right - 10, top: w.y + 6, bottom: w.y + H };
  const useLength = t.length > 0;
  let x = 0;
  const segs = path.map((r) => {
    const len = useLength ? (r.status === 'ok' ? r.length : 0) : 1;
    const seg = { r, x0: x, x1: x + len };
    x += len;
    return seg;
  });
  const xMax = x || 1;
  const showAvailable = t.available != null && t.available <= t.required * 3;
  const yMax = niceMax(Math.max(t.required, showAvailable ? t.available : 0) * 1.05);
  const sx = (v) => m.left + (v / xMax) * (m.right - m.left);
  const sy = (v) => m.bottom - (v / yMax) * (m.bottom - m.top);

  const step = niceMax(yMax / 5);
  for (let v = 0; v <= yMax + 1e-9; v += step) {
    w.line(m.left, sy(v), m.right, sy(v), { color: v === 0 ? INK.muted : INK.border, width: v === 0 ? 0.6 : 0.3 });
    w.text(fmt(v, 0), m.left - 5, sy(v) + 2.5, { size: 6.5, color: INK.muted, align: 'right' });
  }
  w.text('Pa', m.left - 5, m.top - 6, { size: 6.5, color: INK.muted, align: 'right' });
  let lastLabel = -Infinity;
  for (const s of segs) {
    w.line(sx(s.x1), m.top, sx(s.x1), m.bottom, { color: INK.border, width: 0.3, dash: [2, 2] });
    const xm = sx((s.x0 + s.x1) / 2);
    if (xm - lastLabel > 20) {
      w.text(nr.get(s.r.id), xm, m.bottom + 10, { size: 6.5, color: INK.text, align: 'center' });
      lastLabel = xm;
    }
  }
  if (showAvailable) {
    w.line(m.left, sy(t.available), m.right, sy(t.available), { color: INK.text, width: 0.6, dash: [4, 3] });
    w.text(`verfügbar ${fmt(t.available, 0)} Pa`, m.right, sy(t.available) - 3, { size: 6.5, color: INK.text, align: 'right' });
  }
  const pts = [[sx(0), sy(0)]];
  let base = 0;
  for (const s of segs) {
    pts.push([sx(s.x1), sy(base + s.r.dpFriction)]);
    pts.push([sx(s.x1), sy(base + s.r.dp)]);
    base += s.r.dp;
  }
  w.polyline(pts, { color: INK.chart1, width: 1.4 });
  w.text(`${fmt(t.critical, 1)} Pa`, sx(xMax) - 4, sy(t.critical) - 4, { size: 7, bold: true, align: 'right' });
  w.text(useLength ? `m ab Ventilator (${fmt(xMax, 1)} m)` : 'Teilstrecken', m.right, m.bottom + 20, { size: 6.5, color: INK.muted, align: 'right' });
  w.y = m.bottom + 26;
}
