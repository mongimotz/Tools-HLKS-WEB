// Page controller for the duct sizing tool (Kanalrechner): one duct in the input panel, results and drawing
// next to it, pinned results on the right.

import { compute, snapshotOf, CALC_VERSION, MIN_SIDE } from './calc.js';
import {
  TOOL_ID,
  INPUT_VERSION,
  RECT_STEPS,
  RATIOS,
  HOUR_PRESETS,
  MODES,
  normalizeInputs,
  emptyInputs,
  exampleInputs,
  nextPositionId,
  samePosition,
  defaultCatalogs,
  defaultSettings,
  modeFor,
} from './defaults.js';
import { SHAPE_LABELS, SHAPE_BUTTONS, SEVERITY_LABELS, modeLabel, ratioText, sizeText, issueText } from './labels.js';
import { crossSectionLayout, crossSectionSvg, sizeForDrawn, HANDLE_HIT } from './drawing.js';
import { buildCsv } from './csv.js';
import { DocumentStore } from '../../lib/core/store.js';
import { fmt, parseNum, toInputValue, todayIso } from '../../lib/core/format.js';
import { createEnvelope, checkCompatibility, normalizeProject, EnvelopeError } from '../../lib/core/envelope.js';
import { readEnvelopeFromFile, pickFile, download, safeFileName, takeHandoff, stashHandoff, enableFileDrop } from '../../lib/core/files.js';
import { mountProjectInfo, newProject } from '../../lib/core/project-info.js';
import { findTool, toolUrl } from '../../lib/core/registry.js';
import { html, raw, icon, toast, bindThemeToggle } from '../../lib/core/ui.js';
import { enableCombos } from '../../lib/core/combo.js';

const DRAFT_KEY = `hlks-tools:${TOOL_ID}:draft`;

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ui = {
  result: null,
  flhOpen: false, // the operating stages are expanded
  keyStep: false, // ↑ / ↓ changed a value; one history step on key release
};

let store;
let projectView;

const doc = () => store.doc;
const inputs = () => store.doc.inputs;
const current = () => store.doc.inputs.current;

// ============================================================================
// Document lifecycle
// ============================================================================

function loadInitialDoc() {
  const draft = DocumentStore.readDraft(DRAFT_KEY);
  if (draft?.inputs) {
    try {
      return { project: normalizeProject(draft.project), inputs: normalizeInputs(draft.inputs) };
    } catch {
      /* fall through to the example */
    }
  }
  return { project: { ...newProject(), name: 'Beispiel' }, inputs: exampleInputs() };
}

function currentEnvelope() {
  return createEnvelope({
    tool: TOOL_ID,
    version: INPUT_VERSION,
    calcVersion: CALC_VERSION,
    project: doc().project,
    inputs: inputs(),
    snapshot: snapshotOf(ui.result ?? compute(inputs())),
  });
}

const dimsOf = (r) => (r.shape === 'round' ? { diameter: r.diameter } : { width: r.width, height: r.height });
const sizeOf = (r) => (r?.status === 'ok' ? (r.shape === 'round' ? [r.diameter] : [r.width, r.height]) : null);
const sizeLabel = (shape, size) =>
  size ? sizeText(shape, size.length === 1 ? { diameter: size[0] } : { width: size[0], height: size[1] }) : '–';

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
  const result = compute(next.inputs);
  const saved = env.snapshot ?? {};
  const compare = (label, before, r) => {
    if (!before || !r) return;
    const now = sizeOf(r);
    if (JSON.stringify(now) !== JSON.stringify(before.size)) notes.push(`${label}: gespeichert ${sizeLabel(r.shape, before.size)}, neu ${sizeLabel(r.shape, now)}`);
  };
  compare('Eingabe', saved.current, result.current);
  (saved.positions ?? []).forEach((s) => {
    const i = next.inputs.positions.findIndex((p) => p.id === s.id);
    compare(`Pin ${i + 1}`, s, result.positions.get(s.id));
  });
  showFileBanner(notes);
  renderAll();
  toast(sourceName || 'Geöffnet', { kind: 'success' });
}

async function openFile(file) {
  if (!file) return;
  try {
    const env = await readEnvelopeFromFile(file);
    await openEnvelope(env, file.name);
  } catch (e) {
    toast(e instanceof EnvelopeError ? e.message : `Datei nicht lesbar: ${e.message}`, { kind: 'error', timeout: 8000 });
  }
}

function showFileBanner(notes) {
  const el = $('#file-banner');
  if (!notes.length) {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }
  el.hidden = false;
  el.innerHTML = String(html`<div class="banner">${icon('warning')}<div>${notes.map((n) => html`<p>${n}</p>`)}</div>
    <button class="btn ghost small icon-only" data-action="dismiss-banner" title="Schliessen" aria-label="Schliessen">${icon('close', { size: 14 })}</button></div>`);
}

function fileBaseName() {
  const p = doc().project;
  return ['Kanalrechner', p.name, p.date || todayIso()];
}

async function exportPdf() {
  try {
    store.commit();
    const { buildReport } = await import('./report.js'); // pdf-lib + fonts load only when needed
    const bytes = await buildReport(doc(), compute(inputs()), currentEnvelope());
    download(bytes, safeFileName(fileBaseName(), 'pdf'), 'application/pdf');
    toast('PDF gespeichert', { kind: 'success' });
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
  download(buildCsv(doc(), compute(inputs())), safeFileName(fileBaseName(), 'csv'), 'text/csv;charset=utf-8');
}

const UNDO_ACTION = { icon: 'undo', label: 'Rückgängig', run: () => undo() };

function newDocument() {
  store.replace({ project: newProject(), inputs: emptyInputs() });
  showFileBanner([]);
  renderAll();
  toast('Neue Berechnung', { action: UNDO_ACTION });
  $('[data-cur="flow"]')?.focus();
}

function loadExample() {
  store.replace({ project: { ...newProject(), name: 'Beispiel' }, inputs: exampleInputs() });
  showFileBanner([]);
  renderAll();
  toast('Beispiel geladen', { action: UNDO_ACTION });
}

function undo() {
  if (store.undo()) renderAll();
}
function redo() {
  if (store.redo()) renderAll();
}

/** Record a history step and refresh everything (after structural edits). */
function commitAndRender() {
  store.commit();
  renderAll();
}

// ============================================================================
// Rendering
// ============================================================================

function renderAll() {
  const focus = captureFocus();
  projectView.refresh();
  renderInputs();
  renderCatalogs();
  recalc();
  restoreFocus(focus);
}

function recalc() {
  ui.result = compute(inputs());
  $('#drawing').innerHTML = crossSectionSvg(ui.result.current);
  renderResults();
  renderNotes();
  renderPins();
  updateEstimate();
  updateHistoryButtons();
}

function updateHistoryButtons() {
  $('[data-action="undo"]').disabled = !store.canUndo;
  $('[data-action="redo"]').disabled = !store.canRedo;
}

// ---- focus keeping across re-renders -------------------------------------------

const FOCUS_ATTRS = ['data-cur', 'data-sys', 'data-stage', 'data-shape', 'data-mode', 'data-act', 'data-flow-range', 'data-cat-key', 'data-cat-list', 'data-setting'];

function captureFocus() {
  const el = document.activeElement;
  if (!el || el === document.body) return null;
  const parts = [];
  for (const a of [...FOCUS_ATTRS, 'data-index', 'data-cat']) if (el.hasAttribute(a)) parts.push(`[${a}="${CSS.escape(el.getAttribute(a))}"]`);
  if (!parts.length) return null;
  return { sel: parts.join(''), start: el.selectionStart, end: el.selectionEnd };
}

function restoreFocus(f) {
  const el = f && $(f.sel);
  if (!el) return;
  el.focus({ preventScroll: true });
  if (f.start != null && typeof el.setSelectionRange === 'function') {
    try {
      el.setSelectionRange(f.start, f.end);
    } catch {
      /* not a text input */
    }
  }
}

// ---- steps for flow and sizes ------------------------------------------------------

/** The flow slider is logarithmic; values are rounded to two significant digits (5'832 → 5'800). */
const FLOW_RANGE = { min: 10, max: 100000, steps: 1000 };
const LOG_SPAN = Math.log10(FLOW_RANGE.max / FLOW_RANGE.min);
const clean = (v) => Number(v.toPrecision(12));

function niceFlow(v) {
  const e = 10 ** (Math.floor(Math.log10(v)) - 1);
  return clean(Math.round(v / e) * e);
}

function flowToPos(q) {
  if (!(q > 0)) return 0;
  const t = Math.log10(q / FLOW_RANGE.min) / LOG_SPAN;
  return Math.round(Math.min(1, Math.max(0, t)) * FLOW_RANGE.steps);
}

function posToFlow(pos) {
  return niceFlow(FLOW_RANGE.min * 10 ** ((pos / FLOW_RANGE.steps) * LOG_SPAN));
}

/** ↑ / ↓ in the flow field: next value with two significant digits (Shift: one). */
function stepFlow(v, dir, big) {
  if (!(v > 0)) return 1000;
  const e = 10 ** (Math.floor(Math.log10(dir > 0 ? v : v * 0.9999)) - (big ? 0 : 1));
  return Math.max(1, clean((Math.round(v / e) + dir) * e));
}

/** Sides of rectangular and oval ducts follow the grid (Raster), whole millimetres without one. */
const sideStep = () => inputs().system.rectStep || 1;
const gridSide = (mm) => Math.max(MIN_SIDE, Math.round(mm / sideStep()) * sideStep());

function stepSide(v, dir) {
  const st = sideStep();
  if (!(v > 0)) return MIN_SIDE;
  return Math.max(MIN_SIDE, (dir > 0 ? Math.floor(v / st + 1e-9) + 1 : Math.ceil(v / st - 1e-9) - 1) * st);
}

const nearest = (list, v) => list.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));

function stepList(list, v, dir) {
  if (dir > 0) return list.find((x) => x > v + 1e-9) ?? list[list.length - 1];
  return [...list].reverse().find((x) => x < v - 1e-9) ?? list[0];
}

/**
 * The dragged edge follows the pointer: the drawn size at the start plus the pointer movement, back to mm
 * through the drawing scale. Diameters and oval heights then snap to their series (catalogue), sides to the grid.
 */
function sizeFromDrag(drag, pt) {
  const { kind, shape, dims0, drawn0, p0, center } = drag;
  const cat = inputs().catalogs;
  const oval = shape === 'oval';
  if (kind === 'diameter') {
    const grow = Math.hypot(pt.x - center.x, pt.y - center.y) - Math.hypot(p0.x - center.x, p0.y - center.y);
    const raw = sizeForDrawn(shape, kind, { width: drawn0.width + 2 * grow }, dims0).diameter;
    return { diameter: cat.diameters.length ? nearest(cat.diameters, raw) : gridSide(raw) };
  }
  const drawn = { width: drawn0.width + 2 * (pt.x - p0.x), height: drawn0.height + 2 * (pt.y - p0.y) };
  const raw = sizeForDrawn(shape, kind, drawn, dims0);
  let { width, height } = dims0;
  if (kind !== 'height') width = gridSide(raw.width);
  if (kind !== 'width') height = oval && cat.ovalHeights.length ? nearest(cat.ovalHeights, raw.height) : gridSide(raw.height);
  return { width: oval ? Math.max(width, height) : width, height };
}

function sizeFromKey(kind, dir) {
  const r = ui.result.current;
  const cat = inputs().catalogs;
  const oval = current().shape === 'oval';
  if (kind === 'diameter') return { diameter: cat.diameters.length ? stepList(cat.diameters, r.diameter, dir) : stepSide(r.diameter, dir) };
  let { width, height } = r;
  if (kind !== 'height') width = stepSide(width, dir);
  if (kind !== 'width') height = oval && cat.ovalHeights.length ? stepList(cat.ovalHeights, height, dir) : stepSide(height, dir);
  return { width: oval ? Math.max(width, height) : width, height };
}

/** A size set in the drawing is a given size: mode "Prüfen". */
function applySize(dims) {
  const p = current();
  const modeChanged = p.mode !== 'check';
  p.mode = 'check';
  Object.assign(p, dims);
  if (modeChanged) renderInputs();
  else for (const [k, v] of Object.entries(dims)) {
    const field = $(`#inputs [data-cur="${k}"]`);
    if (field) field.value = toInputValue(v);
  }
}

// ---- input panel ------------------------------------------------------------------

function options(entries, selected) {
  return entries.map(([value, label]) => html`<option value="${value}" ${String(value) === String(selected) ? 'selected' : ''}>${label}</option>`);
}

function numField(label, unit, attrs, value, { combo = '' } = {}) {
  return html`<label class="field">
    <span class="field-label">${label}${unit ? html` <span class="unit">${unit}</span>` : ''}</span>
    <input class="input num" type="text" inputmode="decimal" autocomplete="off" ${raw(attrs)} value="${toInputValue(value)}"
      ${combo ? raw(`data-combo="${combo}" role="combobox" aria-expanded="false" aria-controls="combo-list"`) : ''} />
  </label>`;
}

function ratioOptions(p) {
  const list = [...RATIOS[p.shape]];
  if (p.ratio > 0 && !list.includes(p.ratio)) list.push(p.ratio);
  return list.sort((a, b) => a - b).map((n) => [n, ratioText(n)]);
}

function modeFields(p) {
  if (p.shape === 'round') {
    return p.mode === 'check' ? numField('Ø', 'mm', 'data-cur="diameter"', p.diameter, { combo: 'diameters' }) : '';
  }
  if (p.mode === 'size') {
    return html`<label class="field"><span class="field-label">Seitenverhältnis</span>
      <select class="select" data-cur="ratio">${options(ratioOptions(p), p.ratio)}</select></label>`;
  }
  const height = numField('H', 'mm', 'data-cur="height"', p.height, { combo: p.shape === 'oval' ? 'oval-heights' : '' });
  if (p.mode === 'height') return height;
  return html`<div class="two">${numField('B', 'mm', 'data-cur="width"', p.width)}${height}</div>`;
}

function stageRows(stages) {
  return stages.map((s, i) => html`
    <input class="input num" type="text" inputmode="decimal" data-stage="flow" data-index="${i}" value="${toInputValue(s.flow)}" aria-label="Volumenstrom Stufe ${i + 1} in Prozent" />
    <input class="input num" type="text" inputmode="decimal" data-stage="hours" data-index="${i}" value="${toInputValue(s.hours)}" aria-label="Dauer Stufe ${i + 1} in h/a" />
    <button class="icon-btn" data-act="stage-del" data-index="${i}" title="Stufe löschen" aria-label="Stufe löschen">${icon('close', { size: 14 })}</button>`);
}

function renderInputs() {
  const p = current();
  const s = inputs().system;
  $('#inputs').innerHTML = String(html`
    <fieldset>
      <legend>Luftmenge</legend>
      <label class="field"><span class="field-label">Bezeichnung</span>
        <input class="input" type="text" data-cur="note" value="${p.note}" autocomplete="off" /></label>
      ${numField('Volumenstrom', 'm³/h', 'data-cur="flow"', p.flow)}
      <input class="range" type="range" min="0" max="${FLOW_RANGE.steps}" step="1" value="${flowToPos(p.flow)}" data-flow-range aria-label="Volumenstrom" />
    </fieldset>

    <fieldset>
      <legend>Betrieb</legend>
      <label class="toggle-row"><input type="checkbox" data-sys="simple" ${s.simple ? 'checked' : ''} /> Einfacher Modus</label>
      ${s.simple
        ? ''
        : html`${numField('Volllaststunden', 'h/a', 'data-sys="hours"', s.hours, { combo: 'hours' })}
          <details class="flh" ${ui.flhOpen ? 'open' : ''}>
            <summary>${icon('chevron', { size: 12 })}Betriebsstufen</summary>
            <div class="flh-body">
              <div class="flh-grid">
                <span class="field-label">V̇ <span class="unit">%</span></span>
                <span class="field-label">t <span class="unit">h/a</span></span>
                <span></span>
                ${stageRows(s.stages)}
              </div>
              <div class="flh-tools">
                <button class="btn small icon-only" data-act="stage-add" title="Stufe hinzufügen" aria-label="Stufe hinzufügen">${icon('plus', { size: 14 })}</button>
                <select class="select" data-sys="exponent" title="Exponent n" aria-label="Exponent n">${options([[2.5, 'n = 2.5'], [1.5, 'n = 1.5']], s.exponent)}</select>
                <button class="btn small" data-act="flh-apply" title="Übernehmen" aria-label="Übernehmen"></button>
              </div>
            </div>
          </details>`}
    </fieldset>

    <fieldset>
      <legend>Querschnitt</legend>
      <div class="seg" role="group" aria-label="Form">
        ${Object.entries(SHAPE_BUTTONS).map(([k, v]) => html`<button type="button" data-shape="${k}" aria-pressed="${k === p.shape}">${v}</button>`)}
      </div>
      <div class="seg small" role="group" aria-label="Vorgabe">
        ${MODES[p.shape].map((m) => html`<button type="button" data-mode="${m}" aria-pressed="${m === p.mode}">${modeLabel(p.shape, m)}</button>`)}
      </div>
      ${modeFields(p)}
      ${p.shape === 'round'
        ? ''
        : html`<label class="field"><span class="field-label">Raster <span class="unit">mm</span></span>
            <select class="select" data-sys="rectStep">${options(RECT_STEPS.map((v) => [v, v || 1]), s.rectStep)}</select></label>`}
    </fieldset>`);
}

function updateEstimate() {
  const btn = $('[data-act="flh-apply"]');
  if (btn) btn.innerHTML = String(html`${icon('up', { size: 13 })}${fmt(ui.result.stages.hours, 0)}`);
}

// ---- results ------------------------------------------------------------------------------

function tile(k, v, cls = '') {
  return html`<div class="panel tile ${cls}"><div class="k">${raw(k)}</div><div class="v">${v}</div></div>`;
}

function renderResults() {
  const r = ui.result.current;
  const box = $('#results');
  if (r.status !== 'ok') {
    box.innerHTML = String(tile('Abmessung', '–', 'big'));
    return;
  }
  const size = sizeText(r.shape, r.shape === 'round' ? { diameter: r.diameter } : { width: r.width, height: r.height });
  const util = r.utilization * 100;
  const state = util > 100 + 1e-7 ? 'over' : util > 92 ? 'hi' : 'good';
  const utilIcon = state === 'over' ? 'error' : state === 'hi' ? 'warning' : 'check';
  const over = state === 'over';
  const req = r.required
    ? (r.shape === 'round' ? `Ø ${fmt(r.required.diameter, 0)}` : `${fmt(r.required.width, 0)} × ${fmt(r.required.height, 0)}`)
    : '';
  box.innerHTML = String(html`
    <div class="panel tile big">
      <div><div class="k">Abmessung</div><div class="v">${size}<small>mm</small></div></div>
      <button type="button" class="btn icon-only pin-btn" data-action="pin" title="Pinnen" aria-label="Pinnen">${icon('pin')}</button>
    </div>
    ${tile('v', html`<span class="${over ? 'over' : ''}">${fmt(r.velocity, 2)}</span><small>m/s</small>
      <div class="bar ${state === 'good' ? '' : state}" style="flex-basis:100%"><i style="width:${Math.min(util, 100).toFixed(2)}%"></i></div>
      <div class="util is-${state}" style="flex-basis:100%">${icon(utilIcon, { size: 13, label: over ? 'über Grenzwert' : 'eingehalten' })}${fmt(util, 0)} %</div>`)}
    ${tile('v<sub>max</sub>', html`${fmt(r.vmax, 2)}<small>m/s</small>`)}
    ${r.factor != null ? tile('f<sub>va,du</sub>', html`${fmt(r.factor, 3)}<small>${ratioText(r.ratio)}</small>`) : ''}
    ${tile('R', html`${fmt(r.gradient, 2)}<small>Pa/m</small>`)}
    ${req ? tile('erforderlich', html`${req}<small>mm</small>`) : ''}`);
}

function renderNotes() {
  const list = [...ui.result.issues, ...ui.result.current.issues].filter((i) => i.code !== 'flow-missing');
  const order = { error: 0, warning: 1, info: 2 };
  list.sort((a, b) => order[a.severity] - order[b.severity]);
  $('#notes').innerHTML = String(html`${list.map((i) => {
    const name = i.severity === 'info' ? 'info' : i.severity === 'error' ? 'error' : 'warning';
    return html`<li class="issue issue-${i.severity}">${icon(name, { label: SEVERITY_LABELS[i.severity] })}<span>${issueText(i, '')}</span></li>`;
  })}`);
}

// ---- pins ---------------------------------------------------------------------------------

function renderPins() {
  const pins = inputs().positions;
  const has = pins.length > 0;
  $('#calc-layout').classList.toggle('has-pins', has);
  $('#pins').hidden = !has;
  const cur = current();
  $('#pin-list').innerHTML = String(html`${pins.map((p, i) => {
    const r = ui.result.positions.get(p.id);
    const ok = r?.status === 'ok';
    const over = ok && r.utilization > 1 + 1e-9;
    const size = ok ? sizeText(r.shape, r.shape === 'round' ? { diameter: r.diameter } : { width: r.width, height: r.height }) : '–';
    return html`<li data-pin="${p.id}" class="${samePosition(p, cur) ? 'is-current' : ''}">
      <span class="pin-nr">${i + 1}</span><b>${size} mm</b><br />
      <span class="${over ? 'over' : ''}">${ok ? fmt(r.velocity, 2) : '–'} m/s${over ? ' ↑' : ''}</span> | ${fmt(p.flow, 0)} m³/h
      <span class="pin-note">${p.note || SHAPE_LABELS[p.shape]}</span>
      <button class="icon-btn rm" data-act="pin-del" title="Entfernen" aria-label="Pin entfernen">${icon('close', { size: 13 })}</button>
    </li>`;
  })}`);
}

function pinCurrent() {
  const list = inputs().positions;
  if (list.some((p) => samePosition(p, current()))) {
    toast('Bereits gepinnt');
    return;
  }
  list.push({ ...structuredClone(current()), id: nextPositionId(list) });
  store.commit();
  recalc();
}

function bindPins() {
  $('#pins').addEventListener('click', (e) => {
    const li = e.target.closest('[data-pin]');
    const list = inputs().positions;
    if (e.target.closest('[data-action="pins-clear"]')) {
      inputs().positions = [];
      store.commit();
      recalc();
      toast('Alle Pins gelöscht', { action: UNDO_ACTION });
      return;
    }
    if (!li) return;
    const idx = list.findIndex((p) => p.id === li.dataset.pin);
    if (idx < 0) return;
    if (e.target.closest('[data-act="pin-del"]')) {
      list.splice(idx, 1);
      store.commit();
      recalc();
      toast(`Pin ${idx + 1} entfernt`, { action: UNDO_ACTION });
      return;
    }
    inputs().current = { ...structuredClone(list[idx]), id: 'current' };
    commitAndRender();
  });
  $('[data-action="pins-clear"]').innerHTML = String(icon('trash', { size: 14 }));
}

// ============================================================================
// Input editing
// ============================================================================

function setFromInput(target, obj, key, isNum) {
  if (!isNum) {
    obj[key] = target.value;
    return true;
  }
  const v = parseNum(target.value);
  const bad = Number.isNaN(v) || (v != null && v < 0);
  target.setAttribute('aria-invalid', bad ? 'true' : 'false');
  if (bad) return false;
  obj[key] = v;
  return true;
}

/**
 * New shape or mode: keep what fits, and start an empty given size from the current result.
 * A new shape without its given sizes is sized instead (no empty result after switching).
 */
function applyShapeMode(shape, mode) {
  const p = current();
  const r = ui.result.current;
  const was = r.status === 'ok' && r.shape === shape ? r : null;
  const shapeChanged = p.shape !== shape;
  p.shape = shape;
  p.mode = modeFor(shape, mode);
  if (shape !== 'round' && !RATIOS[shape].includes(p.ratio)) p.ratio = RATIOS[shape].find((n) => n >= (p.ratio ?? 0)) ?? 3;
  if (was) {
    if (p.mode === 'check' && shape === 'round' && p.diameter == null) p.diameter = was.diameter;
    if (p.mode === 'check' && shape !== 'round' && p.width == null) p.width = was.width;
    if (p.mode !== 'size' && shape !== 'round' && p.height == null) p.height = was.height;
  }
  const given =
    p.mode === 'size' || (shape === 'round' ? p.diameter > 0 : p.height > 0 && (p.mode === 'height' || p.width > 0));
  if (shapeChanged && !given) p.mode = 'size';
}

const CUR_NUM = new Set(['flow', 'width', 'height', 'diameter']);

function bindInputs() {
  const root = $('#inputs');

  const syncFlow = (fromRange) => {
    const q = current().flow;
    if (fromRange) $('#inputs [data-cur="flow"]').value = toInputValue(q);
    else $('#inputs [data-flow-range]').value = flowToPos(q);
  };

  root.addEventListener('input', (e) => {
    const t = e.target;
    const s = inputs().system;
    if (t.hasAttribute('data-flow-range')) {
      current().flow = posToFlow(Number(t.value));
      syncFlow(true);
    } else if (t.dataset.cur && t.dataset.cur !== 'ratio') {
      if (!setFromInput(t, current(), t.dataset.cur, CUR_NUM.has(t.dataset.cur))) return;
      if (t.dataset.cur === 'flow') syncFlow(false);
    } else if (t.dataset.sys === 'hours') {
      if (!setFromInput(t, s, 'hours', true)) return;
    } else if (t.dataset.stage) {
      const st = s.stages[Number(t.dataset.index)];
      if (!st || !setFromInput(t, st, t.dataset.stage, true)) return;
    } else {
      return;
    }
    recalc();
    store.touch();
  });

  root.addEventListener('change', (e) => {
    const t = e.target;
    const s = inputs().system;
    if (t.dataset.cur === 'ratio') {
      current().ratio = Number(t.value);
    } else if (t.dataset.sys === 'simple') {
      s.simple = t.checked;
    } else if (t.dataset.sys === 'rectStep' || t.dataset.sys === 'exponent') {
      s[t.dataset.sys] = Number(t.value);
    } else {
      store.commit(); // typed values are already applied
      updateHistoryButtons();
      return;
    }
    commitAndRender();
  });

  root.addEventListener('click', (e) => {
    const shape = e.target.closest('[data-shape]');
    const mode = e.target.closest('[data-mode]');
    const act = e.target.closest('[data-act]')?.dataset.act;
    const stages = inputs().system.stages;
    if (shape || mode) {
      const next = { shape: shape?.dataset.shape ?? current().shape, mode: mode?.dataset.mode ?? current().mode };
      if (next.shape !== current().shape || next.mode !== current().mode) {
        applyShapeMode(next.shape, next.mode);
        commitAndRender();
      }
    } else if (act === 'flh-apply') {
      inputs().system.hours = ui.result.stages.hours;
      commitAndRender();
      $('[data-sys="hours"]')?.focus();
    } else if (act === 'stage-add') {
      stages.push({ flow: null, hours: null });
      commitAndRender();
      $(`[data-stage="flow"][data-index="${stages.length - 1}"]`)?.focus();
    } else if (act === 'stage-del') {
      stages.splice(Number(e.target.closest('[data-act]').dataset.index), 1);
      commitAndRender();
    }
  });

  // ↑ / ↓: flow in round steps, sides in grid steps (Ø and oval H step through their series in the combobox)
  root.addEventListener('keydown', (e) => {
    const dir = { ArrowUp: 1, ArrowDown: -1 }[e.key];
    const key = e.target.dataset.cur;
    if (!dir || !key) return;
    let v;
    if (key === 'flow') v = stepFlow(current().flow, dir, e.shiftKey);
    else if ((key === 'width' || key === 'height') && !e.target.dataset.combo) v = stepSide(current()[key], dir);
    else return;
    e.preventDefault();
    current()[key] = v;
    e.target.value = toInputValue(v);
    if (key === 'flow') syncFlow(false);
    ui.keyStep = true;
    recalc();
    store.touch();
  });
  root.addEventListener('keyup', (e) => {
    if (!ui.keyStep || !['ArrowUp', 'ArrowDown'].includes(e.key)) return;
    ui.keyStep = false;
    store.commit();
    updateHistoryButtons();
  });

  // <details> toggle does not bubble
  root.addEventListener('toggle', (e) => {
    if (e.target.classList?.contains('flh')) ui.flhOpen = e.target.open;
  }, true);
}

// ============================================================================
// Drawing: drag the handles to resize
// ============================================================================

function bindDrawing() {
  const box = $('#drawing');
  let drag = null;
  const toSvg = (e) => new DOMPoint(e.clientX, e.clientY).matrixTransform(box.querySelector('svg').getScreenCTM().inverse());
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  box.addEventListener('pointerdown', (e) => {
    const r = ui.result.current;
    if (!e.target.closest('[data-handle]') || e.button !== 0 || r.status !== 'ok') return;
    e.preventDefault();
    const L = crossSectionLayout(r.shape, dimsOf(r));
    const p0 = toSvg(e);
    // hit areas overlap on small or flat ducts: the nearest handle wins
    const dist = (h) => Math.hypot(h.x - p0.x, h.y - p0.y);
    const handle = L.handles.filter((h) => dist(h) <= HANDLE_HIT + 1).sort((a, b) => dist(a) - dist(b))[0];
    if (!handle) return;
    drag = {
      kind: handle.kind,
      shape: r.shape,
      pointer: e.pointerId,
      center: { x: L.cx, y: L.cy },
      p0,
      dims0: dimsOf(r),
      drawn0: { width: (r.width ?? r.diameter) * L.scale, height: (r.height ?? r.diameter) * L.scale },
    };
    box.setPointerCapture(e.pointerId);
    box.dataset.drag = drag.kind;
  });

  box.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pointer) return;
    const next = sizeFromDrag(drag, toSvg(e));
    const r = ui.result.current;
    if (r.status === 'ok' && same(next, dimsOf(r))) return;
    applySize(next);
    recalc();
  });

  const end = (e) => {
    if (!drag || e.pointerId !== drag.pointer) return;
    drag = null;
    delete box.dataset.drag;
    store.commit();
    updateHistoryButtons();
  };
  box.addEventListener('pointerup', end);
  box.addEventListener('pointercancel', end);

  box.addEventListener('keydown', (e) => {
    const handle = e.target.closest('[data-handle]');
    const dir = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key];
    if (!handle || !dir || ui.result.current.status !== 'ok') return;
    e.preventDefault();
    applySize(sizeFromKey(handle.dataset.handle, dir));
    store.commit();
    recalc();
    box.querySelector(`[data-handle="${handle.dataset.handle}"]`)?.focus();
  });
}

// ============================================================================
// Catalogues tab
// ============================================================================

const CATALOGS = {
  velocityLimits: {
    title: 'Grenzgeschwindigkeit rund (Tab. 49)',
    cols: [
      { key: 'below', label: 'V̇ <', unit: 'm³/h', placeholder: '∞' },
      { key: 'v2000', label: `${fmt(2000, 0)} h/a`, unit: 'm/s' },
      { key: 'v4000', label: `${fmt(4000, 0)} h/a`, unit: 'm/s' },
      { key: 'v8000', label: `${fmt(8000, 0)} h/a`, unit: 'm/s' },
    ],
    blank: () => ({ below: null, v2000: 7, v4000: 6, v8000: 5 }),
  },
  reductionFactors: {
    title: 'Reduktionsfaktor (Tab. 50)',
    cols: [
      { key: 'ratio', label: 'Seitenverh.', unit: '1/n' },
      { key: 'rect', label: 'eckig', unit: '–' },
      { key: 'oval', label: 'oval', unit: '–', placeholder: '–' },
    ],
    blank: () => ({ ratio: null, rect: null, oval: null }),
  },
};

const LISTS = {
  diameters: { title: 'Normreihe rund', label: 'Ø' },
  ovalHeights: { title: 'Flachoval', label: 'H' },
};

function renderCatalogs() {
  const cats = inputs().catalogs;
  const st = inputs().settings;
  const reset = (attr) => html`<button class="btn small ghost icon-only" ${raw(attr)} title="Standardwerte" aria-label="Standardwerte">${icon('reset', { size: 14 })}</button>`;
  const tables = Object.entries(CATALOGS).map(([key, def]) => html`<section class="panel catalog">
    <header><h3>${def.title}</h3>${reset(`data-cat-reset="${key}"`)}</header>
    <table class="mini">
      <thead><tr>${def.cols.map((c) => html`<th>${c.label}<span class="unit">${c.unit}</span></th>`)}<th></th></tr></thead>
      <tbody>${cats[key].map((item, i) => html`<tr>${def.cols.map((c) => html`<td><input class="cell-input" type="text" inputmode="decimal"
        data-cat="${key}" data-index="${i}" data-cat-key="${c.key}" value="${toInputValue(item[c.key])}" placeholder="${c.placeholder ?? ''}" aria-label="${c.label}" /></td>`)}
        <td><button class="icon-btn" data-cat-del="${key}" data-index="${i}" title="Löschen" aria-label="Zeile löschen">${icon('close', { size: 13 })}</button></td></tr>`)}</tbody>
    </table>
    <button class="btn small icon-only" data-cat-add="${key}" title="Hinzufügen" aria-label="Hinzufügen">${icon('plus', { size: 14 })}</button>
  </section>`);
  const lists = Object.entries(LISTS).map(([key, def]) => html`<section class="panel catalog">
    <header><h3>${def.title}</h3>${reset(`data-cat-reset="${key}"`)}</header>
    <label class="field"><span class="field-label">${def.label} <span class="unit">mm</span></span>
      <textarea class="input num-list" rows="3" data-cat-list="${key}" spellcheck="false">${cats[key].join(' ')}</textarea></label>
  </section>`);
  const settings = html`<section class="panel catalog">
    <header><h3>Druckgefälle R</h3>${reset('data-settings-reset')}</header>
    <div class="two">
      ${numField('Rauigkeit k', 'mm', 'data-setting="roughness"', st.roughness)}
      ${numField('Lufttemperatur', '°C', 'data-setting="temperature"', st.temperature)}
    </div>
  </section>`;
  $('#catalogs').innerHTML = String(html`${tables}${lists}${settings}`);
}

function parseList(text) {
  return [...new Set(String(text).split(/[\s;,]+/).map(parseNum).filter((v) => v > 0))].sort((a, b) => a - b);
}

function bindCatalogs() {
  const root = $('#catalogs');
  root.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.setting) {
      const st = inputs().settings;
      if (!setFromInput(t, st, t.dataset.setting, true)) return;
      if (st[t.dataset.setting] == null) st[t.dataset.setting] = defaultSettings()[t.dataset.setting];
    } else if (t.dataset.cat) {
      const item = inputs().catalogs[t.dataset.cat][Number(t.dataset.index)];
      if (!item || !setFromInput(t, item, t.dataset.catKey, true)) return;
    } else {
      return;
    }
    recalc();
    store.touch();
  });
  root.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.catList) {
      inputs().catalogs[t.dataset.catList] = parseList(t.value);
      commitAndRender();
      return;
    }
    store.commit();
    updateHistoryButtons();
  });
  root.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    const cats = inputs().catalogs;
    if (t.dataset.catAdd) {
      cats[t.dataset.catAdd].push(CATALOGS[t.dataset.catAdd].blank());
    } else if (t.dataset.catDel) {
      cats[t.dataset.catDel].splice(Number(t.dataset.index), 1);
    } else if (t.dataset.catReset) {
      cats[t.dataset.catReset] = defaultCatalogs()[t.dataset.catReset];
      toast('Standardwerte', { action: UNDO_ACTION });
    } else if (t.hasAttribute('data-settings-reset')) {
      inputs().settings = defaultSettings();
      toast('Standardwerte', { action: UNDO_ACTION });
    } else {
      return;
    }
    commitAndRender();
  });
}

// ============================================================================
// Toolbar, keyboard
// ============================================================================

function setTab(name) {
  for (const tab of $$('.tab')) tab.setAttribute('aria-selected', String(tab.dataset.tab === name));
  for (const panel of $$('.tab-panel')) panel.hidden = panel.dataset.panel !== name;
}

function bindToolbar() {
  const setIcon = (sel, name, text) => {
    $(sel).innerHTML = String(text ? html`${icon(name)}<span class="btn-label">${text}</span>` : icon(name));
  };
  setIcon('[data-action="undo"]', 'undo');
  setIcon('[data-action="redo"]', 'redo');
  setIcon('[data-action="open"]', 'open');
  setIcon('[data-action="export-pdf"]', 'save', 'PDF');
  setIcon('[data-action="menu"]', 'more');

  const menu = $('#more-menu');
  const closeMenu = () => {
    menu.classList.remove('open');
    $('[data-action="menu"]').setAttribute('aria-expanded', 'false');
  };
  document.addEventListener('click', async (e) => {
    const tab = e.target.closest('.tab');
    if (tab) {
      setTab(tab.dataset.tab);
      return;
    }
    const a = e.target.closest('[data-action]');
    if (!a) {
      if (!e.target.closest('#more-menu')) closeMenu();
      return;
    }
    const action = a.dataset.action;
    if (action !== 'menu') closeMenu();
    switch (action) {
      case 'menu':
        menu.classList.toggle('open');
        a.setAttribute('aria-expanded', String(menu.classList.contains('open')));
        break;
      case 'undo': undo(); break;
      case 'redo': redo(); break;
      case 'open': openFile(await pickFile()); break;
      case 'export-pdf': exportPdf(); break;
      case 'export-json': exportJson(); break;
      case 'export-csv': exportCsv(); break;
      case 'new': newDocument(); break;
      case 'example': loadExample(); break;
      case 'pin': pinCurrent(); break;
      case 'dismiss-banner': showFileBanner([]); break;
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenu();
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

const COMBO_LISTS = {
  diameters: () => inputs().catalogs.diameters,
  'oval-heights': () => inputs().catalogs.ovalHeights,
  hours: () => HOUR_PRESETS,
};

// ============================================================================
// Start
// ============================================================================

async function start() {
  const handoff = takeHandoff();
  store = new DocumentStore(loadInitialDoc(), { draftKey: DRAFT_KEY });

  addThemeButton();
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
  bindDrawing();
  bindPins();
  bindCatalogs();
  enableCombos($('main.page'), (name) => COMBO_LISTS[name]?.() ?? []);
  enableFileDrop(openFile);

  renderAll();

  if (handoff) await openEnvelope(handoff);
}

start();
