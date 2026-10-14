// SPDX-License-Identifier: AGPL-3.0-or-later
// PDF report for the duct sizing tool. No DOM: also used by Node tests.

import { buildPdf, INK } from '../../lib/core/pdf.js';
import { fmt, fmtSig, fmtDate } from '../../lib/core/format.js';
import { computeProject, snapshotProjectOf, CALC_VERSION, HOUR_COLUMNS, RECOMMENDED_MAX_RATIO } from './calc.js';
import { TOOL_NAME, SHAPE_LABELS, modeLabel, ratioText, sizeText, issueText } from './labels.js';
import { crossSectionLayout } from './drawing.js';
import { printedPositions, calculationInputs, calculationName } from './defaults.js';

const dimsOf = (r) => (r.shape === 'round' ? { diameter: r.diameter } : { width: r.width, height: r.height });

/** Build all calculations, recomputing their results from the authoritative inputs. */
export async function buildReport(doc, _result, envelope) {
  const { project } = doc;
  const results = computeProject(doc.inputs);
  const title = project.name ? `${TOOL_NAME} – ${project.name}` : TOOL_NAME;
  const pageLabels = [];

  const renderCalculation = (w, calculation, index) => {
    const inputs = calculationInputs(doc.inputs, calculation.id);
    const { system, catalogs, settings } = inputs;
    const result = results.calculations.get(calculation.id);
    const sia = !result.simple;
    const positions = printedPositions(inputs);
    const nr = new Map(positions.map((p, i) => [p.id, String(i + 1)]));
    const resultOf = (p) => (p.id === 'current' ? result.current : result.positions.get(p.id));
    // ---- title & project ------------------------------------------------------
    w.y += 8;
    w.text('Kanaldimensionierung Lüftung', w.left, w.y + 14, { size: 17, bold: true, color: INK.strong });
    w.y += 30;
    w.heading(calculationName(calculation, index));
    w.keyValues(
      [
        ['Projekt', project.name],
        ['Projekt-Nr.', project.number],
        ['Bearbeiter', project.author],
        ['Datum', fmtDate(project.date)],
        ['Methode', sia ? 'SIA 382/1:2025, Tab. 49 und 50' : `Einfach: Tab. 49, Spalte ${fmt(HOUR_COLUMNS[0], 0)} h/a`],
        ['Elektro-Volllaststunden', sia ? `${fmt(result.hours, 0)} h/a${result.stages.used ? ' aus Betriebsstufen' : ''}` : '–'],
        ['Runden Kanalseiten', system.rectStep ? `${system.rectStep} mm` : 'nicht runden'],
        ['Druckverlust', `Colebrook-White, k = ${fmtSig(settings.roughness, 2)} mm | ${fmt(settings.temperature, 0)} °C`],
      ],
      { columns: 4 },
    );

    // ---- positions --------------------------------------------------------------
    w.heading('Positionen');
    const rows = positions.map((p) => {
      const r = resultOf(p);
      const ok = r?.status === 'ok';
      const over = ok && r.utilization > 1 + 1e-9;
      const req = r?.required ? (p.shape === 'round' ? `Ø ${fmt(r.required.diameter, 0)}` : `${fmt(r.required.width, 0)} × ${fmt(r.required.height, 0)}`) : '';
      return [
        nr.get(p.id),
        fmt(p.flow, 0),
        SHAPE_LABELS[p.shape],
        modeLabel(p.shape, p.mode),
        ok ? { text: sizeText(p.shape, dimsOf(r)), bold: true } : '–',
        req,
        ok && p.shape !== 'round' ? ratioText(r.ratio) : '',
        ok ? fmt(r.area, 4) : '',
        ok ? fmt(r.dh * 1000, 0) : '',
        ok ? { text: over ? `${fmt(r.velocity, 2)} ↑` : fmt(r.velocity, 2), color: over ? INK.danger : undefined, bold: over } : '',
        r?.vmaxRound != null ? fmt(r.vmaxRound, 2) : '',
        ok && r.factor != null ? fmt(r.factor, 3) : '',
        ok ? fmt(r.vmax, 2) : '',
        ok ? fmt(r.utilization * 100, 0) : '',
        ok ? fmt(r.gradient, 2) : '',
        p.note,
      ];
    });
    w.table({
      columns: [
        { label: 'Nr.', width: 34 },
        { label: 'V̇', unit: 'm³/h', width: 44, align: 'right' },
        { label: 'Form', width: 44 },
        { label: 'Vorgabe', width: 50 },
        { label: 'Abmessung', unit: 'mm', width: 62, align: 'right' },
        { label: 'erforderlich', unit: 'mm', width: 62, align: 'right' },
        { label: 'Seitenverh.', unit: '1/n', width: 44, align: 'right' },
        { label: 'A', unit: 'm²', width: 40, align: 'right' },
        { label: 'dh', unit: 'mm', width: 32, align: 'right' },
        { label: 'v', unit: 'm/s', width: 36, align: 'right' },
        { label: 'v max rund', unit: 'm/s', width: 44, align: 'right' },
        { label: 'f', unit: '–', width: 32, align: 'right' },
        { label: 'v max', unit: 'm/s', width: 36, align: 'right' },
        { label: 'Ausnutzung', unit: '%', width: 44, align: 'right' },
        { label: 'R', unit: 'Pa/m', width: 34, align: 'right' },
        { label: 'Bezeichnung', width: 110 },
      ],
      rows,
    });

    // ---- cross-sections -------------------------------------------------------------
    drawCrossSections(w, positions, resultOf, nr);

    // ---- operating stages -------------------------------------------------------------
    if (sia && result.stages.used) {
      w.heading('Betriebsstufen');
      w.table({
        columns: [
          { label: 'Stufe', width: 50 },
          { label: 'V̇', unit: '%', width: 80, align: 'right' },
          { label: 't', unit: 'h/a', width: 80, align: 'right' },
          { label: 't el', unit: 'h/a', width: 110, align: 'right' },
          { label: '', width: 440 },
        ],
        rows: [
          ...result.stages.parts.map((s, i) => [String(i + 1), fmt(s.share * 100, 0), fmt(s.hours, 0), fmt(s.equivalent, 0), '']),
          [{ text: 'Summe', bold: true }, '', { text: fmt(result.stages.total, 0), bold: true }, { text: `${fmt(result.hours, 0)} (gerundet)`, bold: true }, ''],
        ],
      });
    }

    // ---- issues ----------------------------------------------------------------------------
    const issues = [...result.issues, ...positions.flatMap((p) => resultOf(p)?.issues ?? [])].filter((i) => i.code !== 'flow-missing');
    if (issues.length) {
      w.heading('Hinweise');
      for (const i of issues) {
        const prefix = i.severity === 'error' ? 'Fehler: ' : i.severity === 'warning' ? 'Warnung: ' : '';
        w.paragraph(`${prefix}${issueText(i, i.positionId ? nr.get(i.positionId) : '')}`, { size: 8, color: i.severity === 'error' ? INK.danger : INK.text });
      }
    }

    // ---- basis ------------------------------------------------------------------------------
    w.heading('Grundlagen');
    w.table({
      columns: [
        { label: 'Grösse', width: 140 },
        { label: 'Ansatz', width: 620 },
      ],
      rows: [
        ['v max rund', sia
          ? `SIA 382/1:2025, 5.11.5.7, Tab. 49; zwischen ${HOUR_COLUMNS.map((h) => fmt(h, 0)).join(' / ')} h/a linear interpoliert`
          : `SIA 382/1:2025, Tab. 49, Spalte bis ${fmt(HOUR_COLUMNS[0], 0)} h/a`],
        ['Nichtrunde Kanäle', sia
          ? `v max = v max rund · f, f nach Tab. 50 (5.11.5.8), linear interpoliert; schlanker als ${ratioText(RECOMMENDED_MAX_RATIO)} nicht empfohlen`
          : 'v max = v max rund (ohne Reduktionsfaktor)'],
        ...(sia && result.stages.used
          ? [['Elektro-Volllaststunden', `t el = Σ (V̇ / V̇ max)^n · t mit n = ${fmt(system.exponent, 1)} (SIA 382/1, G.3.1.5), auf 10 h gerundet`]]
          : []),
        ['Abmessungen', `Rund: nächster Ø der Normreihe; eckig und oval: Seiten auf ${system.rectStep || 1} mm gerundet, Breite bis v ≤ v max`],
        ['Normreihe rund', `Ø ${catalogs.diameters.map((d) => fmt(d, 0)).join(', ')} mm`],
        ['Flachoval', `H ${catalogs.ovalHeights.map((d) => fmt(d, 0)).join(', ')} mm; A = π·H²/4 + H·(B − H)`],
        ['Druckgefälle R', `Darcy-Weisbach mit dh, λ nach Colebrook-White, k = ${fmtSig(settings.roughness, 3)} mm, trockene Luft ${fmt(settings.temperature, 0)} °C, ${fmt(result.air.pressure / 100, 0)} hPa`],
      ],
    });
    drawTables(w, catalogs);
  };

  const render = (w) => {
    doc.inputs.calculations.forEach((calculation, index) => {
      if (index) w.newPage();
      const firstPage = w.pages.length - 1;
      renderCalculation(w, calculation, index);
      for (let page = firstPage; page < w.pages.length; page++) pageLabels[page] = calculationName(calculation, index);
    });
  };

  const decorate = (w, i, total) => {
    const top = 30;
    w.text('HLKS-Tools', w.left, top, { size: 8, bold: true, color: INK.primary });
    w.text(`${TOOL_NAME} | ${pageLabels[i]}`, w.left + w.measure('HLKS-Tools', 8, true) + 8, top, { size: 8, color: INK.text, maxWidth: w.contentWidth / 2 - 60 });
    const right = [project.name, project.number].filter(Boolean).join(' | ');
    w.text(right, w.right, top, { size: 8, color: INK.text, align: 'right', maxWidth: w.contentWidth / 2 });
    w.line(w.left, top + 7, w.right, top + 7, { color: INK.border, width: 0.6 });
    const fy = w.pageH - 24;
    w.line(w.left, fy - 10, w.right, fy - 10, { color: INK.border, width: 0.4 });
    w.text(`Berechnungsversion ${CALC_VERSION} | Eingaben eingebettet (data.json)`, w.left, fy, { size: 6.5, color: INK.muted, maxWidth: w.contentWidth - 80 });
    w.text(`Seite ${i + 1} / ${total}`, w.right, fy, { size: 7, color: INK.muted, align: 'right' });
  };

  return buildPdf({
    envelope: { ...envelope, project, inputs: doc.inputs, snapshot: snapshotProjectOf(results) },
    title,
    subject: `HLKS-Tools: ${TOOL_NAME}`,
    author: project.author,
    render,
    decorate,
  });
}

/** One small drawing per position, five per row, each fitted to its cell. */
function drawCrossSections(w, positions, resultOf, nr) {
  const done = positions.map((p) => ({ p, r: resultOf(p) })).filter(({ r }) => r?.status === 'ok');
  if (!done.length) return;
  const perRow = 5;
  const cellW = w.contentWidth / perRow;
  const drawH = 92;
  const cellH = drawH + 22;
  w.heading('Querschnitte', { keepWith: cellH });
  for (let i = 0; i < done.length; i += perRow) {
    w.ensure(cellH);
    const top = w.y;
    done.slice(i, i + perRow).forEach(({ p, r }, j) => {
      const ox = w.left + j * cellW;
      w.text(`Pos. ${nr.get(p.id)}`, ox, top + 9, { size: 8, bold: true, color: INK.strong });
      w.text(SHAPE_LABELS[p.shape], ox + cellW - 10, top + 9, { size: 7, color: INK.muted, align: 'right' });
      const oy = top + 14;
      const cw = cellW - 10;
      const roomLeft = 40; // height label and dimension
      const roomTop = 24; // width label and dimension
      const L = crossSectionLayout(r.shape, dimsOf(r), r.shape === 'round'
        ? { width: cw, height: drawH, cx: cw / 2, cy: drawH / 2 - 2, maxW: cw, maxH: drawH - 12, fit: true, label: 4, arrow: 5, minInside: 0 }
        : {
            width: cw, height: drawH, cx: roomLeft + (cw - roomLeft - 6) / 2, cy: roomTop + (drawH - roomTop - 4) / 2,
            maxW: cw - roomLeft - 10, maxH: drawH - roomTop - 8, fit: true, gap: 3, over: 4, off: 12, label: 4, arrow: 5, rotate: false,
          });
      w.path(L.outline, ox, oy, { fill: INK.primarySubtle, stroke: INK.strong, width: 0.8 });
      for (const l of L.lines) w.line(ox + l.x1, oy + l.y1, ox + l.x2, oy + l.y2, { color: INK.muted, width: l.kind === 'dim' ? 0.5 : 0.3 });
      for (const d of L.arrows) w.path(d, ox, oy, { fill: INK.muted });
      for (const t of L.texts) w.text(t.text, ox + t.x, oy + t.y, { size: 7, mono: true, color: INK.strong, align: { middle: 'center', end: 'right' }[t.anchor] ?? 'left' });
    });
    w.y = top + cellH;
  }
}

/** Tables 49 and 50 as used (they are editable catalogues and part of the file). */
function drawTables(w, catalogs) {
  w.heading('Tabelle 49: v max in runden Leitungen', { keepWith: 22 + 13 * catalogs.velocityLimits.length });
  w.table({
    columns: [
      { label: 'V̇ unter', unit: 'm³/h', width: 90, align: 'right' },
      ...HOUR_COLUMNS.map((h) => ({ label: `${fmt(h, 0)} h/a`, unit: 'm/s', width: 80, align: 'right' })),
      { label: '', width: 430 },
    ],
    rows: [...catalogs.velocityLimits]
      .sort((a, b) => (a.below ?? Infinity) - (b.below ?? Infinity))
      .map((r) => [r.below != null ? fmt(r.below, 0) : '∞', fmt(r.v2000, 1), fmt(r.v4000, 1), fmt(r.v8000, 1), '']),
  });
  w.heading('Tabelle 50: Reduktionsfaktor f nichtrunde Leitungen', { keepWith: 60 });
  const rows = [...catalogs.reductionFactors].sort((a, b) => (a.ratio ?? 0) - (b.ratio ?? 0));
  w.table({
    columns: [{ label: 'Seitenverh.', width: 90 }, ...rows.map((r) => ({ label: ratioText(r.ratio), width: 52, align: 'right' })), { label: '', width: 100 }],
    rows: [
      ['eckig', ...rows.map((r) => fmt(r.rect, 3)), ''],
      ['oval', ...rows.map((r) => fmt(r.oval, 3)), ''],
    ],
  });
}
