// SPDX-License-Identifier: AGPL-3.0-or-later
// Page controller of the h,x diagram: the diagram on the left, the building blocks (points and processes)
// on the right. Points can be set and dragged in the diagram.

import { computeProject, snapshotProjectOf, totals, pressureOf, CALC_VERSION } from './calc.js';
import {
  TOOL_ID,
  INPUT_VERSION,
  GIVEN_KEYS,
  BLOCKS,
  TWO_INPUTS,
  LABEL_MAX,
  normalizeInputs,
  emptyInputs,
  exampleInputs,
  newBlock,
  newCalculation,
  nextCalculationId,
  pointIds,
  calculationName,
} from './defaults.js';
import { TOOL_NAME, BLOCK_LABELS, MENU_ORDER, KEY_INFO, MODE_LABELS, FIRST_INPUT, SECOND_INPUT, issueText, ISSUE_SUMMARIES } from './labels.js';
import { buildChart, cleanRange, DEFAULT_RANGE, RANGE_LIMITS } from './chart.js';
import { chartSvg, overlayOf, overlaySvg, defsSvg } from './svg.js';
import { stateTX, tFromHX, userValue } from './psychro.js';
import { buildCsv } from './csv.js';
import { DocumentStore } from '../../lib/core/store.js';
import { fmt, parseNum, toInputValue, todayIso } from '../../lib/core/format.js';
import { createEnvelope, checkCompatibility, normalizeProject, EnvelopeError } from '../../lib/core/envelope.js';
import { readEnvelopeFromFile, pickFile, download, safeFileName, takeHandoff, stashHandoff, enableFileDrop } from '../../lib/core/files.js';
import { mountProjectInfo, newProject } from '../../lib/core/project-info.js';
import { findTool, toolUrl } from '../../lib/core/registry.js';
import { html, raw, icon, toast, bindThemeToggle, mountSourceLink } from '../../lib/core/ui.js';
import { createIssuePanel } from '../../lib/core/issues.js';
import { mountCalculationTabs } from '../../lib/core/calculation-tabs.js';

const DRAFT_KEY = `hlks-tools:${TOOL_ID}:draft`;
const $ = (sel, root = document) => root.querySelector(sel);

const ui = {
  activeCalculationId: null,
  selected: null, // block id
  pointTool: false,
  locked: true, // view fixed: no wheel zoom, no panning
  rangeTimer: null, // history step after wheel zooming
  chart: null,
  projectResult: null,
  result: null,
  fileNotes: [],
  keyStep: false,
};

let store;
let projectView;
let issuePanel;
let calculationTabs;

const doc = () => store.doc;
const inputs = () => store.doc.inputs;
const activeCalculation = () => {
  const list = inputs().calculations;
  const c = list.find((x) => x.id === ui.activeCalculationId) ?? list[0];
  ui.activeCalculationId = c.id;
  return c;
};
const blocks = () => activeCalculation().blocks;
const blockById = (id) => blocks().find((b) => b.id === id);
const pressure = () => pressureOf(inputs().site);

// ============================================================================
// Document lifecycle
// ============================================================================

function loadInitialDoc() {
  const draft = DocumentStore.readDraft(DRAFT_KEY);
  if (draft?.inputs) {
    try {
      return { project: normalizeProject(draft.project), inputs: normalizeInputs(draft.inputs) };
    } catch {
      /* fall through to an empty diagram */
    }
  }
  return { project: newProject(), inputs: emptyInputs() };
}

function currentEnvelope() {
  return createEnvelope({
    tool: TOOL_ID,
    version: INPUT_VERSION,
    calcVersion: CALC_VERSION,
    project: doc().project,
    inputs: inputs(),
    snapshot: snapshotProjectOf(computeProject(inputs())),
  });
}

async function openEnvelope(env, sourceName = '') {
  if (env.tool !== TOOL_ID) {
    const tool = findTool(env.tool);
    if (tool?.status === 'ready' && stashHandoff(env)) location.href = toolUrl(env.tool);
    else toast('Unbekanntes Werkzeug', { kind: 'error' });
    return;
  }
  let notes;
  try {
    notes = checkCompatibility(env, { tool: TOOL_ID, version: INPUT_VERSION, calcVersion: CALC_VERSION });
  } catch (e) {
    toast(e.message, { kind: 'error', timeout: 8000 });
    return;
  }
  const next = { project: normalizeProject(env.project), inputs: normalizeInputs(env.inputs) };
  store.replace(next);
  ui.selected = null;
  const now = snapshotProjectOf(computeProject(next.inputs));
  for (const saved of env.snapshot?.calculations ?? []) {
    const index = next.inputs.calculations.findIndex((c) => c.id === saved.id);
    const fresh = now.calculations.find((c) => c.id === saved.id);
    if (index >= 0 && fresh && JSON.stringify(fresh) !== JSON.stringify(saved)) {
      notes.push(`${calculationName(next.inputs.calculations[index], index)}: gespeichertes Ergebnis geändert`);
    }
  }
  ui.fileNotes = notes;
  renderAll();
  toast(sourceName || 'Geöffnet', { kind: 'success' });
}

async function openFile(file) {
  if (!file) return;
  try {
    await openEnvelope(await readEnvelopeFromFile(file), file.name);
  } catch (e) {
    toast(e instanceof EnvelopeError ? e.message : `Datei nicht lesbar: ${e.message}`, { kind: 'error', timeout: 8000 });
  }
}

const fileBaseName = () => ['hx-Diagramm', doc().project.name, doc().project.date || todayIso()];

async function exportPdf() {
  try {
    store.commit();
    const { buildReport } = await import('./report.js'); // pdf-lib + fonts load only when needed
    const bytes = await buildReport(doc(), computeProject(inputs()), currentEnvelope());
    download(bytes, safeFileName(fileBaseName(), 'pdf'), 'application/pdf');
    toast('PDF gespeichert', { kind: 'success' });
  } catch (e) {
    console.error(e);
    toast(`PDF-Fehler: ${e.message}`, { kind: 'error', timeout: 8000 });
  }
}

async function exportBlank() {
  try {
    const { buildBlankSheet } = await import('./report.js');
    const bytes = await buildBlankSheet(inputs().site, activeCalculation().range);
    download(bytes, safeFileName(['hx-Diagramm', `${fmt(inputs().site.altitude, 0)} m`], 'pdf'), 'application/pdf');
  } catch (e) {
    console.error(e);
    toast(`PDF-Fehler: ${e.message}`, { kind: 'error', timeout: 8000 });
  }
}

function exportJson() {
  store.commit();
  download(JSON.stringify(currentEnvelope(), null, 2), safeFileName(fileBaseName(), 'json'), 'application/json');
}

function exportCsv() {
  store.commit();
  download(buildCsv(doc()), safeFileName(fileBaseName(), 'csv'), 'text/csv;charset=utf-8');
}

const UNDO_ACTION = { icon: 'undo', label: 'Rückgängig', run: () => undo() };

function newDocument() {
  store.replace({ project: newProject(), inputs: emptyInputs() });
  ui.fileNotes = [];
  ui.selected = null;
  renderAll();
  toast('Neue Berechnung', { action: UNDO_ACTION });
}

function loadExample() {
  store.replace({ project: { ...newProject(), name: 'Beispiel' }, inputs: exampleInputs() });
  ui.fileNotes = [];
  ui.selected = null;
  renderAll();
  toast('Beispiel geladen', { action: UNDO_ACTION });
}

function undo() {
  if (store.undo()) renderAll();
}
function redo() {
  if (store.redo()) renderAll();
}

function commitAndRender() {
  store.commit();
  renderAll();
}

// ============================================================================
// Rendering
// ============================================================================

function renderAll() {
  const focus = captureFocus();
  activeCalculation();
  if (ui.selected && !blockById(ui.selected)) ui.selected = null;
  projectView.refresh();
  compute();
  renderSite();
  renderBlocks();
  refresh();
  restoreFocus(focus);
}

function compute() {
  ui.projectResult = computeProject(inputs());
  ui.result = ui.projectResult.calculations.get(activeCalculation().id);
}

/** Recalculate and refresh everything that is not an input field being typed in. */
function recalc() {
  compute();
  refresh();
}

function refresh() {
  renderTabs();
  renderDiagram();
  syncBlocks();
  renderNotes();
  updateHistoryButtons();
}

function renderTabs() {
  calculationTabs.render(inputs().calculations.map((c) => {
    const r = ui.projectResult.calculations.get(c.id);
    const sum = totals(r);
    const severity = ['error', 'warning'].find((level) => r.issues.some((i) => i.severity === level));
    const main = sum ? (sum.heat >= sum.cool ? sum.heat : -sum.cool) : null;
    return { id: c.id, name: c.name, value: main ? `${fmt(main, 1)} kW` : '', severity };
  }), activeCalculation().id);
}

function updateHistoryButtons() {
  $('[data-action="undo"]').disabled = !store.canUndo;
  $('[data-action="redo"]').disabled = !store.canRedo;
}

function renderSite() {
  renderRange();
  setField($('[data-site="altitude"]'), inputs().site.altitude);
  setField($('[data-calc="flow"]'), activeCalculation().flow);
  $('#pressure').textContent = fmt(pressure() / 100, 0);
}

/** Write a value into an input unless the user is typing in it. */
function setField(el, value, text = null) {
  if (!el || el === document.activeElement) return;
  el.value = text ?? toInputValue(value);
}

// ---- blocks ------------------------------------------------------------------------

const unitSpan = (u) => (u ? html` <small>${u}</small>` : '');

function numField(field, label, unit, value) {
  return html`<label class="hx-val"><span>${raw(label)}${unitSpan(unit)}</span><input class="input num" data-field="${field}" inputmode="decimal" value="${toInputValue(value)}" /></label>`;
}

function pointOptions(beforeIndex, selected) {
  const ids = pointIds(blocks().slice(0, beforeIndex));
  const label = (id) => ui.result?.points.get(id)?.label ?? id;
  const opts = ids.map((id) => html`<option value="${id}" ${id === selected ? 'selected' : ''}>${label(id)}</option>`);
  if (!ids.includes(selected)) opts.unshift(html`<option value="" selected>–</option>`);
  return opts;
}

function paramFields(b) {
  const f = [];
  switch (b.type) {
    case 'heater':
      f.push(b.mode === 'q' ? numField('q', 'Q', 'kW', b.q) : numField('t', KEY_INFO.t.html, '°C', b.t));
      break;
    case 'cooler':
      f.push(numField('ts', '<i>t</i><sub>O</sub>', '°C', b.ts));
      f.push(b.mode === 'q' ? numField('q', 'Q<sub>K</sub>', 'kW', b.q) : numField('t', KEY_INFO.t.html, '°C', b.t));
      break;
    case 'steam':
      if (b.mode === 'x') f.push(numField('x', KEY_INFO.x.html, 'g/kg', b.x));
      else if (b.mode === 'phi') f.push(numField('phi', 'φ', '%', b.phi));
      else f.push(numField('m', 'ṁ<sub>D</sub>', 'kg/h', b.m));
      f.push(numField('ts', '<i>t</i><sub>D</sub>', '°C', b.ts));
      break;
    case 'adiabatic':
      if (b.mode === 'eta') f.push(numField('eta', 'η', '%', b.eta));
      else if (b.mode === 'x') f.push(numField('x', KEY_INFO.x.html, 'g/kg', b.x));
      else f.push(numField('phi', 'φ', '%', b.phi));
      break;
    case 'hrv':
      f.push(numField('eta', 'Φ<sub>t</sub>', '%', b.eta));
      if (b.mode === 'enthalpy') f.push(numField('etaX', 'Φ<sub>x</sub>', '%', b.etaX));
      f.push(numField('tFrost', '<i>t</i><sub>FO,min</sub>', '°C', b.tFrost));
      break;
    case 'mix':
      if (b.mode === 'share') f.push(numField('share', 'Anteil', '%', b.share));
      break;
    case 'fan':
      f.push(numField('dt', 'Δ<i>t</i>', 'K', b.dt));
      break;
  }
  return f;
}

function blockCard(b, index) {
  const spec = BLOCKS[b.type];
  const head = html`
    <div class="hx-block-head">
      <span class="hx-type">${BLOCK_LABELS[b.type]}</span>
      ${b.type === 'line' ? '' : html`<input class="input hx-label" data-field="label" maxlength="${LABEL_MAX}" value="${b.label}" aria-label="Bezeichnung" />`}
      ${b.type === 'hrv' ? html`<input class="input hx-label" data-field="label2" maxlength="${LABEL_MAX}" value="${b.label2}" aria-label="Bezeichnung Fortluft" />` : ''}
      <button class="icon-btn hx-del" data-action="delete-block" title="Löschen" aria-label="Löschen">${icon('trash')}</button>
    </div>`;
  let body;
  if (b.type === 'point') {
    const givenKeys = b.given.map((g) => g.key);
    body = html`
      <div class="hx-vals">
        ${GIVEN_KEYS.map((key) => html`<label class="hx-val"><span>${raw(KEY_INFO[key].html)}${unitSpan(KEY_INFO[key].unit)}</span><input class="input num${givenKeys.includes(key) ? ' is-given' : ''}" data-key="${key}" inputmode="decimal" /></label>`)}
        ${numField('flow', 'V̇', 'm³/h', b.flow)}
      </div>`;
  } else {
    const two = TWO_INPUTS.has(b.type);
    const modes = spec.modes
      ? html`<div class="hx-modes" role="group">${spec.modes.map((m) => html`<button type="button" data-mode="${m}" aria-pressed="${m === b.mode}">${raw(MODE_LABELS[b.type][m])}</button>`)}</div>`
      : '';
    body = html`
      <div class="hx-io">
        <label class="hx-val"><span>${FIRST_INPUT[b.type] ?? 'von'}</span><select class="select" data-field="from">${pointOptions(index, b.from)}</select></label>
        ${two ? html`<label class="hx-val"><span>${SECOND_INPUT[b.type]}</span><select class="select" data-field="to">${pointOptions(index, b.to)}</select></label>` : ''}
      </div>
      ${modes}
      <div class="hx-vals">${paramFields(b)}</div>`;
  }
  return html`<li class="hx-block" data-id="${b.id}" data-type="${b.type}">${head}${body}<div class="hx-res" data-res></div></li>`;
}

function renderBlocks() {
  const list = blocks();
  $('#blocks').innerHTML = String(html`${list.map((b, i) => blockCard(b, i))}`);
}

const valueText = (s, key) => fmt(userValue(s, key), KEY_INFO[key].digits);
const stateLine = (s) =>
  html`<span class="hx-state">${['t', 'phi', 'x', 'h'].map((k) => html`<span><b>${raw(KEY_INFO[k].html)}</b> ${valueText(s, k)}<small> ${KEY_INFO[k].unit}</small></span>`)}</span>`;

function resultHtml(b) {
  const r = ui.result.blocks.get(b.id);
  const errors = r.issues.filter((i) => i.severity === 'error');
  const parts = [];
  const pt = ui.result.points.get(b.id);
  if (b.type === 'point') {
    if (pt?.state) {
      parts.push(html`<span><b>ρ</b> ${fmt(pt.state.rho, 3)}<small> kg/m³</small></span>`);
      if (pt.m) parts.push(html`<span><b>ṁ</b> ${fmt(pt.m, 0)}<small> kg/h</small></span>`);
    }
  } else if (b.type === 'line') {
    const v = r.values;
    if (v.dh != null) {
      parts.push(html`<span><b>Δ<i>h</i></b> ${fmt(v.dh, 1)}<small> kJ/kg</small></span>`);
      parts.push(html`<span><b>Δ<i>x</i></b> ${fmt(v.dx, 2)}<small> g/kg</small></span>`);
      if (v.ratio != null) parts.push(html`<span><b>Δ<i>h</i>/Δ<i>x</i></b> ${fmt(v.ratio, 0)}<small> kJ/kg</small></span>`);
      if (v.q != null) parts.push(html`<span><b>Q</b> ${fmt(v.q, 1)}<small> kW</small></span>`);
    }
  } else {
    const v = r.values;
    if (v.q != null && b.type !== 'mix') parts.push(html`<span><b>Q</b> ${fmt(v.q, 1)}<small> kW</small></span>`);
    if (b.type === 'cooler' && v.q != null) {
      parts.push(html`<span><b>Q<sub>s</sub></b> ${fmt(v.sensible, 1)}<small> kW</small></span>`);
      if (v.water) parts.push(html`<span><b>Kondensat</b> ${fmt(-v.water, 1)}<small> kg/h</small></span>`);
    }
    if ((b.type === 'steam' || b.type === 'adiabatic') && v.water != null) parts.push(html`<span><b>Wasser</b> ${fmt(v.water, 1)}<small> kg/h</small></span>`);
    if (b.type === 'adiabatic' && v.eta != null && b.mode !== 'eta') parts.push(html`<span><b>η</b> ${fmt(v.eta, 0)}<small> %</small></span>`);
    if (b.type === 'hrv' && v.limited) {
      parts.push(html`<span><b>Φ<sub>t</sub></b> ${fmt(v.eta, 0)}<small> %</small></span>`);
      if (b.mode === 'enthalpy') parts.push(html`<span><b>Φ<sub>x</sub></b> ${fmt(v.etaX, 0)}<small> %</small></span>`);
    }
    if (b.type === 'hrv' && v.condensate) parts.push(html`<span><b>Kondensat</b> ${fmt(v.condensate, 1)}<small> kg/h</small></span>`);
    if (b.type === 'mix' && b.mode === 'flows' && v.share != null) parts.push(html`<span><b>Anteil</b> ${fmt(v.share, 0)}<small> %</small></span>`);
    if (pt?.m && b.type === 'mix') parts.push(html`<span><b>ṁ</b> ${fmt(pt.m, 0)}<small> kg/h</small></span>`);
  }
  const outs = b.type === 'point' || b.type === 'line' ? [] : r.out.map((id) => ui.result.points.get(id)).filter((p) => p?.state);
  return html`
    ${outs.map((p) => html`<div class="hx-out-row"><span class="hx-pt-label">${p.label}</span>${stateLine(p.state)}</div>`)}
    ${parts.length ? html`<div class="hx-values">${parts}</div>` : ''}
    ${errors.length ? html`<div class="hx-error">${icon('error', { size: 14 })}<span>${issueText(errors[0])}</span></div>` : ''}`;
}

/** Results and derived point values after a recalculation, without touching the field being typed in. */
function syncBlocks() {
  for (const li of document.querySelectorAll('#blocks .hx-block')) {
    const b = blockById(li.dataset.id);
    if (!b) continue;
    const r = ui.result.blocks.get(b.id);
    const worst = ['error', 'warning'].find((s) => r.issues.some((i) => i.severity === s));
    if (worst) li.dataset.severity = worst;
    else delete li.dataset.severity;
    li.classList.toggle('is-selected', b.id === ui.selected);
    if (b.type === 'point') {
      const state = ui.result.points.get(b.id)?.state;
      const givenKeys = b.given.map((g) => g.key);
      for (const input of li.querySelectorAll('[data-key]')) {
        const key = input.dataset.key;
        const g = b.given.find((x) => x.key === key);
        input.classList.toggle('is-given', givenKeys.includes(key));
        if (g) setField(input, g.value);
        else setField(input, null, state ? valueText(state, key) : '');
      }
      setField(li.querySelector('[data-field="flow"]'), b.flow);
      li.querySelector('[data-field="flow"]').placeholder = activeCalculation().flow ? fmt(activeCalculation().flow, 0) : '';
    }
    for (const field of ['label', 'label2']) {
      const input = li.querySelector(`[data-field="${field}"]`);
      if (!input) continue;
      const id = field === 'label2' ? `${b.id}.b` : b.id;
      const auto = ui.result.points.get(id)?.label ?? '';
      input.placeholder = b[field] ? '' : auto;
    }
    li.querySelector('[data-res]').innerHTML = String(resultHtml(b));
  }
}

// ---- notices -----------------------------------------------------------------------

function renderNotes() {
  const list = inputs().calculations.flatMap((c, index) => {
    const r = ui.projectResult.calculations.get(c.id);
    const label = calculationName(c, index);
    return r.issues.map((issue) => {
      const b = c.blocks.find((x) => x.id === issue.blockId);
      const pointLabel = r.points.get(issue.pointId ?? issue.blockId)?.label;
      const name = `${BLOCK_LABELS[b.type]}${pointLabel && b.type !== 'line' ? ` ${pointLabel}` : ''}`;
      return {
        id: `${c.id}:${issue.blockId}:${issue.pointId ?? ''}:${issue.code}`,
        severity: issue.severity,
        text: `${label}: ${name}: ${issueText(issue)}`,
        summary: ISSUE_SUMMARIES[issue.code] ? `${label}: ${ISSUE_SUMMARIES[issue.code]}` : undefined,
        run: () => gotoBlock(c.id, issue.blockId),
      };
    });
  });
  issuePanel.update([
    ...ui.fileNotes.map((text) => ({
      id: `file:${text}`,
      severity: 'warning',
      text,
      summary: text.startsWith('Berechnungsversion') ? 'Berechnungsversion geändert' : 'Gespeichertes Ergebnis geändert',
      dismiss: () => {
        ui.fileNotes = ui.fileNotes.filter((note) => note !== text);
        renderNotes();
      },
    })),
    ...list,
  ]);
}

function gotoBlock(calculationId, blockId) {
  if (calculationId !== activeCalculation().id) {
    ui.activeCalculationId = calculationId;
    renderAll();
  }
  select(blockId, { scroll: true });
  const li = $(`#blocks [data-id="${CSS.escape(blockId)}"]`);
  li?.querySelector('input, select')?.focus({ preventScroll: true });
}

function select(blockId, { scroll = false } = {}) {
  if (ui.selected === blockId) return;
  ui.selected = blockId;
  for (const li of document.querySelectorAll('#blocks .hx-block')) li.classList.toggle('is-selected', li.dataset.id === blockId);
  renderOverlay();
  if (scroll) $(`#blocks [data-id="${CSS.escape(blockId)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// ============================================================================
// Diagram
// ============================================================================

const FONT = 11; // label size in px (--fs-2xs)
const range = () => cleanRange(activeCalculation().range);
const isDefaultRange = (r) => ['tMin', 'tMax', 'xMin', 'xMax'].every((k) => r[k] === DEFAULT_RANGE[k]);

/** Build the diagram for the box of the canvas, the pressure and the range; the overlay on top. */
function renderDiagram() {
  const host = $('#diagram');
  const width = host.clientWidth;
  const height = host.clientHeight;
  if (!width || !height) return;
  const chart = buildChart(pressure(), range(), { width, height, font: FONT });
  if (chart !== ui.chart || !host.firstChild) {
    ui.chart = chart;
    host.innerHTML = `<svg class="hx-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${chart.width} ${chart.height}" role="img" aria-label="h,x-Diagramm">${defsSvg(chart.map)}<rect class="hx-paper" width="${chart.width}" height="${chart.height}"/><g class="hx-chart">${chartSvg(chart)}</g><g class="hx-over" clip-path="url(#hx-clip)"></g></svg>`;
  }
  host.classList.toggle('is-zoomed', !isDefaultRange(range()));
  renderOverlay();
}

let frame = 0;
/** Redraw the diagram once per frame (zoom, pan, resize). */
function scheduleDiagram() {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    renderDiagram();
  });
}

const r1 = (v) => Math.round(v * 10) / 10;

/** Set the visible range (rounded, within the limits) and redraw; one history step after a pause. */
function setRange(next, { commitLater = true } = {}) {
  let { tMin, tMax, xMin, xMax } = next;
  if (xMin < 0) [xMin, xMax] = [0, xMax - xMin];
  if (tMin < RANGE_LIMITS.tMin) [tMin, tMax] = [RANGE_LIMITS.tMin, tMax + RANGE_LIMITS.tMin - tMin];
  if (tMax > RANGE_LIMITS.tMax) [tMin, tMax] = [tMin - (tMax - RANGE_LIMITS.tMax), RANGE_LIMITS.tMax];
  activeCalculation().range = cleanRange({ tMin: r1(tMin), tMax: r1(tMax), xMin: r1(xMin), xMax: r1(Math.min(RANGE_LIMITS.xMax, xMax)) });
  renderRange();
  store.touch();
  scheduleDiagram();
  clearTimeout(ui.rangeTimer);
  if (commitLater) {
    ui.rangeTimer = setTimeout(() => {
      store.commit();
      compute();
      refresh();
    }, 500);
  }
}

/** Range around the points of the calculation, with a margin. */
function pointsRange() {
  const states = [...ui.result.points.values()].map((pt) => pt.state).filter(Boolean);
  if (!states.length) return { ...DEFAULT_RANGE };
  const ts = states.map((s) => s.t);
  const xs = states.map((s) => s.x);
  const pad = (a, b, min) => {
    const m = Math.max(min, (b - a) * 0.15);
    return [a - m, b + m];
  };
  const [tMin, tMax] = pad(Math.min(...ts), Math.max(...ts), 3);
  const [xMin, xMax] = pad(Math.min(...xs), Math.max(...xs), 1);
  return { tMin: Math.floor(tMin), tMax: Math.ceil(tMax), xMin: Math.max(0, Math.floor(xMin)), xMax: Math.ceil(xMax) };
}

function renderRange() {
  const r = activeCalculation().range;
  for (const key of ['tMin', 'tMax', 'xMin', 'xMax']) setField($(`[data-range="${key}"]`), r[key]);
}

function renderOverlay() {
  const g = $('#diagram .hx-over');
  if (!g || !ui.result) return;
  g.innerHTML = overlaySvg(overlayOf(ui.result, blocks()), ui.chart.map, ui.selected);
}

/** Pointer position in sheet coordinates (px of the diagram box). */
function sheetPoint(event) {
  const svg = $('#diagram svg');
  const m = svg.getScreenCTM().inverse();
  const pt = new DOMPoint(event.clientX, event.clientY).matrixTransform(m);
  return [pt.x, pt.y];
}

/** Air state under a sheet position, or null outside the plot. */
function stateAt(sheet) {
  const { x, h } = ui.chart.map.fromSheet(sheet);
  const r = ui.chart.map.range;
  if (x < r.xMin || x > r.xMax) return null;
  const t = tFromHX(h, x, pressure());
  if (t == null || t > r.tMax + 0.05 || t < r.tMin - 0.05) return null;
  return stateTX(t, x, pressure());
}

function showReadout(state) {
  const el = $('#readout');
  if (!state) {
    el.textContent = '';
    return;
  }
  if (state.fog > 0) {
    el.innerHTML = String(html`Nebel | <i>x</i> ${fmt(state.x, 2)} g/kg | <i>h</i> ${fmt(state.h, 1)} kJ/kg`);
    return;
  }
  el.innerHTML = String(html`<i>t</i> ${fmt(state.t, 1)} °C | φ ${fmt(state.phi * 100, 0)} % | <i>x</i> ${fmt(state.x, 2)} g/kg | <i>h</i> ${fmt(state.h, 1)} kJ/kg | ρ ${fmt(state.rho, 3)} kg/m³`);
}

const roundTo = (v, step) => Math.round(v / step) * step;

/** Move a given point to (t, x), keeping the kind of its two given values. */
function moveGiven(b, t, x) {
  const s = stateTX(t, Math.max(0, x), pressure());
  for (const g of b.given) {
    const v = userValue(s, g.key);
    g.value = v == null ? g.value : Number(roundTo(v, KEY_INFO[g.key].step).toFixed(2));
  }
}

function addPointAt(state) {
  const list = blocks();
  const b = newBlock('point', list, { t: Number(state.t.toFixed(1)), x: Number(state.x.toFixed(1)) });
  list.push(b);
  ui.selected = b.id;
  commitAndRender();
}

function bindDiagram() {
  const host = $('#diagram');
  let drag = null; // { kind: 'pan' | 'point', … }
  const capture = (e) => {
    try {
      host.setPointerCapture(e.pointerId);
    } catch {
      /* pointer already gone */
    }
  };

  host.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const ptEl = e.target.closest('.hx-pt');
    const segEl = e.target.closest('.hx-seg');
    if (ptEl && !ui.pointTool) {
      select(ptEl.dataset.block);
      const b = blockById(ptEl.dataset.block);
      if (b?.type === 'point') {
        drag = { kind: 'point', block: b, moved: false };
        capture(e);
        host.dataset.drag = 'point';
      }
      e.preventDefault();
      return;
    }
    if (segEl && !ui.pointTool) {
      select(segEl.dataset.block, { scroll: true });
      return;
    }
    drag = { kind: 'pan', start: [e.clientX, e.clientY], range: { ...range() }, moved: false };
    capture(e);
  });

  host.addEventListener('pointermove', (e) => {
    if (!$('#diagram svg')) return;
    const sheet = sheetPoint(e);
    if (drag?.kind === 'point') {
      const { x, h } = ui.chart.map.fromSheet(sheet);
      const t = tFromHX(h, Math.max(0, x), pressure());
      if (t == null) return;
      moveGiven(drag.block, t, x);
      drag.moved = true;
      store.touch();
      recalc();
      showReadout(ui.result.points.get(drag.block.id)?.state);
      return;
    }
    if (drag?.kind === 'pan' && !ui.locked && (e.pointerType === 'mouse' || host.classList.contains('is-zoomed'))) {
      const dx = e.clientX - drag.start[0];
      const dy = e.clientY - drag.start[1];
      if (!drag.moved && Math.hypot(dx, dy) < 4) return;
      drag.moved = true;
      host.dataset.drag = 'pan';
      const px = $('#diagram svg').getBoundingClientRect().width / ui.chart.width;
      const { kx, ky } = ui.chart.map;
      const ddx = -dx / px / kx;
      const ddt = dy / px / ky / 1.006;
      const r = drag.range;
      setRange({ tMin: r.tMin + ddt, tMax: r.tMax + ddt, xMin: r.xMin + ddx, xMax: r.xMax + ddx }, { commitLater: false });
      return;
    }
    showReadout(stateAt(sheet));
  });

  const end = (e) => {
    if (!drag) return;
    const was = drag;
    drag = null;
    delete host.dataset.drag;
    if (was.kind === 'point' && was.moved) commitAndRender();
    if (was.kind === 'pan' && was.moved) commitAndRender();
    if (was.kind === 'pan' && !was.moved && ui.pointTool && e.type === 'pointerup') {
      const s = stateAt(sheetPoint(e));
      if (s && s.fog === 0) addPointAt(s);
    }
  };
  host.addEventListener('pointerup', end);
  host.addEventListener('pointercancel', end);
  host.addEventListener('pointerleave', () => !drag && showReadout(null));

  host.addEventListener('wheel', (e) => {
    if (ui.locked || !$('#diagram svg')) return;
    e.preventDefault();
    const { x, h } = ui.chart.map.fromSheet(sheetPoint(e));
    const t = (h - 2.501 * x) / (1.006 + 0.00186 * x); // unsaturated formula, also in the fog region
    const r = range();
    const k = Math.exp(Math.max(-1, Math.min(1, e.deltaY * 0.0015)));
    const tSpan = Math.max(RANGE_LIMITS.tSpan, (r.tMax - r.tMin) * k);
    const xSpan = Math.max(RANGE_LIMITS.xSpan, (r.xMax - r.xMin) * k);
    const ft = (t - r.tMin) / (r.tMax - r.tMin);
    const fx = (x - r.xMin) / (r.xMax - r.xMin);
    setRange({ tMin: t - ft * tSpan, tMax: t + (1 - ft) * tSpan, xMin: x - fx * xSpan, xMax: x + (1 - fx) * xSpan });
  }, { passive: false });

  // arrow keys move a focused given point: ←/→ x, ↑/↓ t (Shift: tenfold)
  host.addEventListener('keydown', (e) => {
    const ptEl = e.target.closest?.('.hx-pt.is-given');
    if (!ptEl || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    const b = blockById(ptEl.dataset.block);
    const s = ui.result.points.get(b.id)?.state;
    if (!s) return;
    const step = e.shiftKey ? 1 : 0.1;
    const dx = e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0;
    const dt = e.key === 'ArrowUp' ? step : e.key === 'ArrowDown' ? -step : 0;
    moveGiven(b, s.t + dt, s.x + dx);
    ui.keyStep = true;
    store.touch();
    recalc();
    $(`#diagram .hx-pt[data-point="${CSS.escape(b.id)}"]`)?.focus();
  });
  host.addEventListener('keyup', () => {
    if (!ui.keyStep) return;
    ui.keyStep = false;
    store.commit();
    updateHistoryButtons();
  });
  host.addEventListener('focusin', (e) => {
    const ptEl = e.target.closest?.('.hx-pt');
    if (ptEl) select(ptEl.dataset.block, { scroll: true });
  });
}

function setLocked(on) {
  ui.locked = on;
  const button = $('[data-action="lock"]');
  button.setAttribute('aria-pressed', String(on));
  button.title = on ? 'Ansicht fixiert' : 'Ansicht frei';
  button.innerHTML = String(icon(on ? 'lock' : 'unlock'));
  $('#diagram').classList.toggle('is-locked', on);
}

function setPointTool(on) {
  ui.pointTool = on;
  $('[data-action="point-tool"]').setAttribute('aria-pressed', String(on));
  $('#diagram').classList.toggle('is-placing', on);
}

// ============================================================================
// Inputs
// ============================================================================

function onBlockInput(e) {
  const li = e.target.closest('.hx-block');
  const b = li && blockById(li.dataset.id);
  if (!b) return;
  const el = e.target;
  if (el.dataset.key) {
    const key = el.dataset.key;
    const value = parseNum(el.value);
    const g = b.given.find((x) => x.key === key);
    if (g) g.value = value;
    else b.given = [...b.given.slice(-1), { key, value }];
  } else if (el.dataset.field === 'label' || el.dataset.field === 'label2') {
    b[el.dataset.field] = el.value.trim().slice(0, LABEL_MAX);
  } else if (el.dataset.field === 'from' || el.dataset.field === 'to') {
    b[el.dataset.field] = el.value;
  } else if (el.dataset.field) {
    b[el.dataset.field] = parseNum(el.value);
  } else return;
  store.touch();
  recalc();
}

function bindInputs() {
  const list = $('#blocks');
  list.addEventListener('input', onBlockInput);
  list.addEventListener('change', (e) => {
    if (e.target.matches('select')) onBlockInput(e);
    commitAndRender();
  });
  list.addEventListener('focusin', (e) => {
    const li = e.target.closest('.hx-block');
    if (li) select(li.dataset.id);
  });
  list.addEventListener('click', (e) => {
    const li = e.target.closest('.hx-block');
    if (!li) return;
    const b = blockById(li.dataset.id);
    select(li.dataset.id);
    const mode = e.target.closest('[data-mode]');
    if (mode && b) {
      b.mode = mode.dataset.mode;
      commitAndRender();
      return;
    }
    if (e.target.closest('[data-action="delete-block"]') && b) {
      const list = blocks();
      const index = list.indexOf(b);
      list.splice(index, 1);
      ui.selected = list[Math.min(index, list.length - 1)]?.id ?? null;
      commitAndRender();
      toast(`${BLOCK_LABELS[b.type]} gelöscht`, { action: UNDO_ACTION });
    }
  });

  const site = $('[data-site="altitude"]');
  site.addEventListener('input', () => {
    inputs().site.altitude = parseNum(site.value) ?? 0;
    $('#pressure').textContent = fmt(pressure() / 100, 0);
    store.touch();
    recalc();
  });
  site.addEventListener('change', () => {
    store.doc.inputs = normalizeInputs(inputs());
    commitAndRender();
  });
  const flow = $('[data-calc="flow"]');
  flow.addEventListener('input', () => {
    activeCalculation().flow = parseNum(flow.value);
    store.touch();
    recalc();
  });
  flow.addEventListener('change', () => commitAndRender());
  for (const el of document.querySelectorAll('[data-range]')) {
    el.addEventListener('input', () => {
      const value = parseNum(el.value);
      if (value == null) return;
      const next = { ...activeCalculation().range, [el.dataset.range]: value };
      if (cleanRange(next)[el.dataset.range] !== value) return; // incomplete while typing: keep the diagram
      activeCalculation().range = cleanRange(next);
      store.touch();
      scheduleDiagram();
      compute();
      renderNotes();
    });
    el.addEventListener('change', () => commitAndRender());
  }
  new ResizeObserver(() => scheduleDiagram()).observe($('#diagram'));
}

function addBlock(type) {
  const list = blocks();
  const b = newBlock(type, list);
  list.push(b);
  ui.selected = b.id;
  commitAndRender();
  const li = $(`#blocks [data-id="${CSS.escape(b.id)}"]`);
  li?.scrollIntoView({ block: 'nearest' });
  li?.querySelector(b.type === 'point' ? '[data-key="t"]' : '.hx-vals input, select')?.focus({ preventScroll: true });
}

// ---- calculations (tabs) -----------------------------------------------------------

function selectCalculation(id) {
  if (!inputs().calculations.some((c) => c.id === id)) return;
  store.commit();
  ui.activeCalculationId = id;
  ui.selected = null;
  renderAll();
}

function addCalculation(duplicate = false) {
  const list = inputs().calculations;
  const id = nextCalculationId(list);
  const c = duplicate ? { ...structuredClone(activeCalculation()), id } : newCalculation(id);
  if (duplicate) c.name = `${calculationName(activeCalculation(), list.indexOf(activeCalculation()))} Kopie`;
  else c.flow = activeCalculation().flow;
  list.push(c);
  ui.activeCalculationId = id;
  ui.selected = null;
  commitAndRender();
  calculationTabs.rename(id);
}

function renameCalculation(id, name) {
  const c = inputs().calculations.find((x) => x.id === id);
  if (!c) return;
  c.name = name;
  commitAndRender();
}

function deleteCalculation() {
  const list = inputs().calculations;
  if (list.length <= 1) return;
  const index = list.findIndex((c) => c.id === activeCalculation().id);
  const label = calculationName(list[index], index);
  list.splice(index, 1);
  ui.activeCalculationId = list[Math.min(index, list.length - 1)].id;
  ui.selected = null;
  commitAndRender();
  toast(`${label} gelöscht`, { action: UNDO_ACTION });
}

// ---- focus keeping across re-renders ----------------------------------------------

function captureFocus() {
  const el = document.activeElement;
  const li = el?.closest?.('.hx-block');
  if (!li) return null;
  return { id: li.dataset.id, key: el.dataset.key, field: el.dataset.field, start: el.selectionStart, end: el.selectionEnd };
}

function restoreFocus(f) {
  if (!f) return;
  const li = $(`#blocks [data-id="${CSS.escape(f.id)}"]`);
  const el = li?.querySelector(f.key ? `[data-key="${f.key}"]` : `[data-field="${f.field}"]`);
  if (!el) return;
  el.focus({ preventScroll: true });
  try {
    if (f.start != null) el.setSelectionRange(f.start, f.end);
  } catch {
    /* not a text field */
  }
}

// ============================================================================
// Toolbar and start
// ============================================================================

function bindToolbar() {
  const setIcon = (sel, name, text) => {
    $(sel).innerHTML = String(text ? html`${icon(name)}<span class="btn-label">${text}</span>` : icon(name));
  };
  setIcon('[data-action="undo"]', 'undo');
  setIcon('[data-action="redo"]', 'redo');
  setIcon('[data-action="open"]', 'open');
  setIcon('[data-action="export-pdf"]', 'save', 'PDF');
  setIcon('[data-action="menu"]', 'more');
  setIcon('[data-action="add-menu"]', 'plus');
  setIcon('[data-action="point-tool"]', 'crosshair');
  setIcon('[data-action="fit"]', 'fit');
  setIcon('[data-action="fit-points"]', 'crop');
  setLocked(ui.locked);
  $('#add-list').innerHTML = String(html`${MENU_ORDER.map((type) => html`<li><button data-add="${type}" role="menuitem">${BLOCK_LABELS[type]}</button></li>`)}`);

  const menus = [$('#more-menu'), $('#add-menu')];
  const closeMenus = (except) => {
    for (const m of menus) {
      if (m === except) continue;
      m.classList.remove('open');
      m.querySelector('[aria-expanded]').setAttribute('aria-expanded', 'false');
    }
  };
  const toggleMenu = (menu, button) => {
    closeMenus(menu);
    menu.classList.toggle('open');
    button.setAttribute('aria-expanded', String(menu.classList.contains('open')));
  };
  document.addEventListener('click', async (e) => {
    const add = e.target.closest('[data-add]');
    if (add) {
      closeMenus();
      addBlock(add.dataset.add);
      return;
    }
    const a = e.target.closest('[data-action]');
    if (!a) {
      if (!e.target.closest('.menu')) closeMenus();
      return;
    }
    const action = a.dataset.action;
    if (action !== 'menu' && action !== 'add-menu') closeMenus();
    switch (action) {
      case 'menu': toggleMenu($('#more-menu'), a); break;
      case 'add-menu': toggleMenu($('#add-menu'), a); break;
      case 'undo': undo(); break;
      case 'redo': redo(); break;
      case 'open': openFile(await pickFile()); break;
      case 'export-pdf': exportPdf(); break;
      case 'export-json': exportJson(); break;
      case 'export-csv': exportCsv(); break;
      case 'export-blank': exportBlank(); break;
      case 'new': newDocument(); break;
      case 'example': loadExample(); break;
      case 'point-tool': setPointTool(!ui.pointTool); break;
      case 'lock': setLocked(!ui.locked); break;
      case 'fit': setRange({ ...DEFAULT_RANGE }, { commitLater: false }); commitAndRender(); break;
      case 'fit-points': setRange(pointsRange(), { commitLater: false }); commitAndRender(); break;
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeMenus();
      if (ui.pointTool) setPointTool(false);
    }
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
      e.preventDefault();
      redo();
    } else if (k === 's') {
      e.preventDefault();
      exportPdf();
    } else if (k === 'o') {
      e.preventDefault();
      pickFile().then(openFile);
    }
  });
}

function addThemeButton() {
  const b = document.createElement('button');
  b.id = 'theme-toggle';
  b.className = 'btn ghost icon-only';
  $('.appbar-actions').prepend(b);
  bindThemeToggle(b);
}

async function start() {
  const handoff = takeHandoff();
  store = new DocumentStore(loadInitialDoc(), { draftKey: DRAFT_KEY });
  issuePanel = createIssuePanel($('#issue-panel'));
  calculationTabs = mountCalculationTabs($('#calculation-tabs'), {
    panelId: 'calc-layout',
    onSelect: selectCalculation,
    onAdd: () => addCalculation(),
    onDuplicate: () => addCalculation(true),
    onDelete: deleteCalculation,
    onRename: renameCalculation,
  });
  addThemeButton();
  mountSourceLink();
  projectView = mountProjectInfo($('#project'), {
    getProject: () => doc().project,
    onInput: () => store.touch(),
    onCommit: () => {
      store.commit();
      updateHistoryButtons();
    },
  });
  bindToolbar();
  bindInputs();
  bindDiagram();
  enableFileDrop(openFile);
  renderAll();
  if (handoff) await openEnvelope(handoff);
}

document.title = `${TOOL_NAME} – HLKS-Tools`;
start();
