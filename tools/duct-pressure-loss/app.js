// Page controller for the duct pressure loss tool.

import {
  compute,
  snapshotOf,
  descendantsOf,
  airState,
  suggestDimensions,
  evaluateCrossSection,
  CALC_VERSION,
  FRICTION_METHODS,
  LAMINAR_LIMIT,
} from './calc.js';
import {
  TOOL_ID,
  INPUT_VERSION,
  STANDARD_DIAMETERS,
  RECT_STEP,
  normalizeInputs,
  emptyInputs,
  exampleInputs,
  newSection,
  defaultCatalogs,
  normalizeSection,
} from './defaults.js';
import { METHOD_LABELS, DIRECTION_LABELS, GROUP_LABELS, SEVERITY_LABELS, issueText } from './labels.js';
import { renderProfile, renderNetwork } from './charts.js';
import { buildCsv } from './csv.js';
import { DocumentStore } from '../../lib/core/store.js';
import { fmt, fmtSig, fmtExpParts, parseNum, toInputValue, todayIso } from '../../lib/core/format.js';
import { createEnvelope, checkCompatibility, normalizeProject, EnvelopeError } from '../../lib/core/envelope.js';
import { readEnvelopeFromFile, pickFile, download, safeFileName, takeHandoff, stashHandoff, enableFileDrop } from '../../lib/core/files.js';
import { mountProjectInfo, newProject } from '../../lib/core/project-info.js';
import { findTool, toolUrl } from '../../lib/core/registry.js';
import { html, raw, icon, toast, bindThemeToggle } from '../../lib/core/ui.js';

const DRAFT_KEY = `hlks-tools:${TOOL_ID}:draft`;
const UI_KEY = `hlks-tools:${TOOL_ID}:ui`;

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ui = {
  expanded: new Set(),
  details: false,
  result: null,
};

let store;
let projectView;

const doc = () => store.doc;
const inputs = () => store.doc.inputs;
const sectionById = (id) => inputs().sections.find((s) => s.id === id);
const nrOf = (id) => {
  const i = inputs().sections.findIndex((s) => s.id === id);
  if (i < 0) return '';
  return inputs().sections[i].nr || `Zeile ${i + 1}`;
};

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
  ui.expanded.clear();
  const result = compute(next.inputs);
  const saved = env.snapshot?.critical;
  if (typeof saved === 'number' && Math.abs(saved - result.totals.critical) > 0.05) {
    notes.push(`Kritischer Strang: gespeichert ${fmt(saved, 1)} Pa, neu ${fmt(result.totals.critical, 1)} Pa`);
  }
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
  return ['Druckverlust', p.name, inputs().system.name, p.date || todayIso()];
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
  ui.expanded.clear();
  showFileBanner([]);
  renderAll();
  toast('Neue Berechnung', { action: UNDO_ACTION });
  $('[data-field="flow"]')?.focus();
}

function loadExample() {
  store.replace({ project: { ...newProject(), name: 'Beispiel' }, inputs: exampleInputs() });
  ui.expanded.clear();
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
  renderSystem();
  renderTable();
  renderCatalogs();
  recalc();
  restoreFocus(focus);
}

function recalc() {
  ui.result = compute(inputs());
  updateResults();
  renderSummary();
  renderIssues();
  renderCharts();
  updateAirReadout();
  updateHistoryButtons();
}

function updateHistoryButtons() {
  $('[data-action="undo"]').disabled = !store.canUndo;
  $('[data-action="redo"]').disabled = !store.canRedo;
}

// ---- focus keeping across re-renders -------------------------------------------

const FOCUS_ATTRS = ['data-field', 'data-fit', 'data-comp', 'data-sys', 'data-cat-key', 'data-act', 'data-add'];

function captureFocus() {
  const el = document.activeElement;
  if (!el || el === document.body) return null;
  const host = el.closest('[data-id]');
  const parts = [];
  for (const a of [...FOCUS_ATTRS, 'data-index', 'data-cat']) if (el.hasAttribute(a)) parts.push(`[${a}="${CSS.escape(el.getAttribute(a))}"]`);
  if (!parts.length) return null;
  return {
    host: host ? `[data-id="${CSS.escape(host.dataset.id)}"]${host.classList.contains('detail-row') ? '.detail-row' : ':not(.detail-row)'}` : null,
    sel: parts.join(''),
    start: el.selectionStart,
    end: el.selectionEnd,
  };
}

function restoreFocus(f) {
  if (!f) return;
  const root = f.host ? $(f.host) : document;
  const el = root && $(f.sel, root);
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

// ---- system (Anlage) ---------------------------------------------------------------

function numInput(attrs, value, { placeholder = '', unit = '', label, wide = false } = {}) {
  return html`<label class="field ${wide ? 'field-wide' : ''}">
    <span class="field-label">${label}${unit ? html` <span class="unit">${unit}</span>` : ''}</span>
    <input class="input num" type="text" inputmode="decimal" autocomplete="off" ${raw(attrs)} value="${toInputValue(value)}" placeholder="${placeholder}" />
  </label>`;
}

function renderSystem() {
  const s = inputs().system;
  $('#system').innerHTML = String(html`
    <label class="field field-wide">
      <span class="field-label">Anlage / Strang</span>
      <input class="input" type="text" data-sys="name" value="${s.name}" autocomplete="off" />
    </label>
    <label class="field field-wide">
      <span class="field-label">Strömungsrichtung</span>
      <select class="select" data-sys="direction">
        ${Object.entries(DIRECTION_LABELS).map(([k, v]) => html`<option value="${k}" ${k === s.direction ? 'selected' : ''}>${v}</option>`)}
      </select>
    </label>
    ${numInput('data-sys="altitude"', s.altitude, { label: 'Höhe', unit: 'm ü. M.' })}
    ${numInput('data-sys="temperature"', s.temperature, { label: 'Lufttemperatur', unit: '°C' })}
    ${numInput('data-sys="humidity"', s.humidity, { label: 'Rel. Feuchte', unit: '%' })}
    ${numInput('data-sys="availablePressure"', s.availablePressure, { label: 'Verfügbare Pressung', unit: 'Pa', placeholder: '–' })}
    ${numInput('data-sys="safetyMargin"', s.safetyMargin, { label: 'Zuschlag', unit: '%' })}
    <label class="field field-wide">
      <span class="field-label">Reibungsbeiwert λ</span>
      <select class="select" data-sys="frictionMethod">
        ${FRICTION_METHODS.map((k) => html`<option value="${k}" ${k === s.frictionMethod ? 'selected' : ''}>${METHOD_LABELS[k]}</option>`)}
      </select>
    </label>
    <p class="air-readout" id="air-readout"></p>`);
}

function updateAirReadout() {
  const s = inputs().system;
  const a = airState(s);
  $('#air-readout').innerHTML = String(html`ρ <span class="num">${fmt(a.density, 3)}</span> kg/m³ ·
    p <span class="num">${fmt(a.pressure / 100, 0)}</span> hPa ·
    ν <span class="num">${expHtml(a.kinematicViscosity)}</span> m²/s`);
}

// ---- sections table ------------------------------------------------------------------

const COLS = [
  { key: 'exp', cls: 'c-exp' },
  { key: 'nr', label: 'Nr.', cls: 'c-nr' },
  { key: 'parent', label: 'Vorgänger', cls: 'c-parent' },
  { key: 'shape', label: 'Form', cls: 'c-shape' },
  { key: 'material', label: 'Material', cls: 'c-mat' },
  { key: 'flow', label: 'V̇', unit: 'm³/h', cls: 'c-num' },
  { key: 'dim1', label: 'B / Ø', unit: 'mm', cls: 'c-num c-dim' },
  { key: 'dim2', label: 'H', unit: 'mm', cls: 'c-num c-dim' },
  { key: 'length', label: 'L', unit: 'm', cls: 'c-num c-len' },
  { key: 'zeta', label: 'Formstücke', unit: 'Σζ', cls: 'c-sum' },
  { key: 'comp', label: 'Einbauteile', unit: 'Pa', cls: 'c-sum' },
  { key: 'dh', label: 'd<sub>h</sub>', unit: 'mm', cls: 'c-out first-out', out: true },
  { key: 'velocity', label: 'v', unit: 'm/s', cls: 'c-out', out: true },
  { key: 'dynamicPressure', label: 'p<sub>d</sub>', unit: 'Pa', cls: 'c-out det', out: true },
  { key: 'reynolds', label: 'Re', unit: '–', cls: 'c-out det', out: true },
  { key: 'lambda', label: 'λ', unit: '–', cls: 'c-out det', out: true },
  { key: 'gradient', label: 'R', unit: 'Pa/m', cls: 'c-out', out: true },
  { key: 'dpFriction', label: 'Δp R·L', unit: 'Pa', cls: 'c-out', out: true },
  { key: 'dpFittings', label: 'Δp Z', unit: 'Pa', cls: 'c-out', out: true },
  { key: 'dp', label: 'Δp TS', unit: 'Pa', cls: 'c-out', out: true },
  { key: 'cum', label: 'Δp kum.', unit: 'Pa', cls: 'c-out c-cum', out: true },
  { key: 'throttle', label: 'Drossel', unit: 'Pa', cls: 'c-out', out: true },
  { key: 'act', cls: 'c-act' },
];

function renderTable() {
  const table = $('#sections-table');
  table.classList.toggle('show-details', ui.details);
  const secs = inputs().sections;
  const head = html`<thead><tr>${COLS.map(
    (c) => html`<th class="${c.cls}" scope="col">${c.label ? raw(c.label) : ''}${c.unit ? html`<span class="unit">${c.unit}</span>` : ''}</th>`,
  )}</tr></thead>`;
  const body = secs.map((s, i) => rowHtml(s, i));
  table.innerHTML = String(html`${head}<tbody>${body}</tbody>`);
  $('[data-action="add-section"]').innerHTML = String(html`${icon('plus')}<span>Teilstrecke</span>`);
}

function parentOptions(s) {
  const blocked = descendantsOf(inputs().sections, s.id);
  blocked.add(s.id);
  const opts = [html`<option value="" ${!s.parent ? 'selected' : ''}>Ventilator</option>`];
  inputs().sections.forEach((o, i) => {
    if (blocked.has(o.id)) return;
    opts.push(html`<option value="${o.id}" ${o.id === s.parent ? 'selected' : ''}>${o.nr || `Zeile ${i + 1}`}</option>`);
  });
  return opts;
}

function materialOptions(selected) {
  const mats = inputs().catalogs.materials;
  const opts = mats.map((m) => html`<option value="${m.id}" ${m.id === selected ? 'selected' : ''}>${m.name}</option>`);
  if (!mats.some((m) => m.id === selected)) opts.unshift(html`<option value="" selected>– wählen –</option>`);
  return opts;
}

function inputCell(s, field, value, { cls = '', placeholder = '', list = '' } = {}) {
  return html`<input class="cell-input num ${cls}" type="text" inputmode="decimal" autocomplete="off" data-field="${field}" value="${toInputValue(value)}" placeholder="${placeholder}" ${list ? raw(`list="${list}"`) : ''} aria-label="${field}" />`;
}

function rowHtml(s, index) {
  const open = ui.expanded.has(s.id);
  const depth = ui.result?.sections.get(s.id)?.depth ?? 0;
  const zetaCount = s.fittings.length + (s.zetaExtra ? 1 : 0);
  const compSum = s.components.reduce((a, c) => a + (c.dp || 0), 0);
  const main = html`<tr class="sec-row" data-id="${s.id}">
    <td class="c-exp"><button class="exp-btn" data-act="toggle" aria-expanded="${open}" aria-label="Details zu Teilstrecke ${s.nr || index + 1}" title="Details">${icon('chevron', { size: 14 })}</button></td>
    <td class="c-nr" style="--depth:${Math.min(depth, 6)}"><input class="cell-input" type="text" data-field="nr" value="${s.nr}" placeholder="${index + 1}" aria-label="Nummer" autocomplete="off" /></td>
    <td class="c-parent"><select class="cell-select" data-field="parent" aria-label="Vorgänger">${parentOptions(s)}</select></td>
    <td class="c-shape"><select class="cell-select" data-field="shape" aria-label="Form">
      <option value="rect" ${s.shape === 'rect' ? 'selected' : ''}>eckig</option>
      <option value="round" ${s.shape === 'round' ? 'selected' : ''}>rund</option>
    </select></td>
    <td class="c-mat"><select class="cell-select" data-field="material" aria-label="Material">${materialOptions(s.material)}</select></td>
    <td class="c-num">${inputCell(s, 'flow', s.flow)}</td>
    ${s.shape === 'round'
      ? html`<td class="c-num c-dim">${inputCell(s, 'diameter', s.diameter, { placeholder: 'Ø', list: 'std-diameters' })}</td><td class="c-num c-dim na">–</td>`
      : html`<td class="c-num c-dim">${inputCell(s, 'width', s.width, { placeholder: 'B' })}</td><td class="c-num c-dim">${inputCell(s, 'height', s.height, { placeholder: 'H' })}</td>`}
    <td class="c-num c-len">${inputCell(s, 'length', s.length)}</td>
    <td class="c-sum"><button class="sum-btn" data-act="toggle" data-out="zetaSum" aria-label="Formstücke">–</button>${zetaCount ? html`<span class="count">${zetaCount}</span>` : ''}</td>
    <td class="c-sum"><button class="sum-btn" data-act="toggle" aria-label="Einbauteile">${s.components.length ? fmt(compSum, 0) : '–'}</button>${s.components.length ? html`<span class="count">${s.components.length}</span>` : ''}</td>
    ${COLS.filter((c) => c.out).map((c) => html`<td class="${c.cls}" data-out="${c.key}"></td>`)}
    <td class="c-act">
      <button class="icon-btn" data-act="branch" title="Abzweig" aria-label="Abzweig hinzufügen">${icon('branch', { size: 15 })}</button>
      <button class="icon-btn" data-act="delete" title="Löschen" aria-label="Löschen">${icon('trash', { size: 15 })}</button>
    </td>
  </tr>`;
  return open ? html`${main}${detailRowHtml(s)}` : main;
}

function fittingOptions(selected, shape) {
  const fits = inputs().catalogs.fittings;
  const order = shape === 'round' ? ['round', 'any', 'rect'] : ['rect', 'any', 'round'];
  return order.map((g) => {
    const items = fits.filter((f) => (f.group || 'any') === g);
    if (!items.length) return '';
    return html`<optgroup label="${GROUP_LABELS[g]}">${items.map(
      (f) => html`<option value="${f.id}" ${f.id === selected ? 'selected' : ''}>${f.name}</option>`,
    )}</optgroup>`;
  });
}

function detailRowHtml(s) {
  const fits = new Map(inputs().catalogs.fittings.map((f) => [f.id, f]));
  const sys = inputs().system;
  return html`<tr class="detail-row" data-id="${s.id}"><td colspan="${COLS.length}"><div class="detail">
    <section class="detail-block">
      <h4>Formstücke</h4>
      <table class="mini">
        <thead><tr><th>Bezeichnung</th><th class="n">Anz.</th><th class="n">ζ</th><th class="n">Δp Pa</th><th></th></tr></thead>
        <tbody>
        ${s.fittings.map((f, i) => {
          const cat = fits.get(f.ref);
          const computed = cat?.kind === 'transition';
          return html`<tr>
            <td><select class="cell-select" data-fit="ref" data-index="${i}" aria-label="Formstück">${cat ? '' : html`<option selected>(nicht im Katalog)</option>`}${fittingOptions(f.ref, s.shape)}</select></td>
            <td class="n"><input class="cell-input num narrow" type="text" inputmode="decimal" data-fit="count" data-index="${i}" value="${toInputValue(f.count)}" aria-label="Anzahl" /></td>
            <td class="n">${computed
              ? html`<span class="computed" data-out="fit-zeta" data-index="${i}">–</span>`
              : html`<input class="cell-input num narrow" type="text" inputmode="decimal" data-fit="zeta" data-index="${i}" value="${toInputValue(f.zeta)}" placeholder="${toInputValue(cat?.zeta)}" aria-label="Zeta" />`}</td>
            <td class="n num" data-out="fit-dp" data-index="${i}"></td>
            <td><button class="icon-btn" data-act="fit-del" data-index="${i}" aria-label="Formstück entfernen">${icon('close', { size: 14 })}</button></td>
          </tr>`;
        })}
        <tr class="add-row"><td colspan="5"><select class="cell-select add-select" data-add="fitting" aria-label="Formstück hinzufügen">
          <option value="" selected>+ Formstück</option>${fittingOptions(null, s.shape)}</select></td></tr>
        <tr><td>ζ zusätzlich</td><td></td>
          <td class="n"><input class="cell-input num narrow" type="text" inputmode="decimal" data-field="zetaExtra" value="${toInputValue(s.zetaExtra)}" placeholder="0" aria-label="Zeta zusätzlich" /></td><td></td><td></td></tr>
        </tbody>
        <tfoot><tr><td>Summe</td><td></td><td class="n num" data-out="zetaSum"></td><td class="n num" data-out="dpFittings"></td><td></td></tr></tfoot>
      </table>
    </section>

    <section class="detail-block">
      <h4>Einbauteile</h4>
      <table class="mini">
        <thead><tr><th>Bezeichnung</th><th class="n">Δp Pa</th><th></th></tr></thead>
        <tbody>
        ${s.components.map((c, i) => html`<tr>
          <td><input class="cell-input" type="text" data-comp="name" data-index="${i}" value="${c.name}" placeholder="Bezeichnung" aria-label="Bezeichnung" /></td>
          <td class="n"><input class="cell-input num narrow" type="text" inputmode="decimal" data-comp="dp" data-index="${i}" value="${toInputValue(c.dp)}" aria-label="Druckverlust" /></td>
          <td><button class="icon-btn" data-act="comp-del" data-index="${i}" aria-label="Einbauteil entfernen">${icon('close', { size: 14 })}</button></td>
        </tr>`)}
        <tr class="add-row"><td colspan="3"><select class="cell-select add-select" data-add="component" aria-label="Einbauteil hinzufügen">
          <option value="" selected>+ Einbauteil</option>
          ${inputs().catalogs.components.map((c) => html`<option value="${c.id}">${c.name} (${fmt(c.dp, 0)} Pa)</option>`)}
          <option value="__custom">Eigenes</option>
        </select></td></tr>
        </tbody>
        <tfoot><tr><td>Summe</td><td class="n num" data-out="dpComponents"></td><td></td></tr></tfoot>
      </table>
    </section>

    <section class="detail-block">
      <div class="detail-fields">
        <label class="field"><span class="field-label">Lufttemperatur <span class="unit">°C</span></span>
          <input class="input num" type="text" inputmode="decimal" data-field="temperature" value="${toInputValue(s.temperature)}" placeholder="${toInputValue(sys.temperature)}" /></label>
        <label class="field field-wide"><span class="field-label">Bemerkung</span>
          <input class="input" type="text" data-field="note" value="${s.note}" autocomplete="off" /></label>
      </div>
      <h4 class="sub">Dimensionierung</h4>
      <div class="suggest" data-out-html="suggest"></div>
      <div class="detail-actions">
        <button class="btn small icon-only" data-act="duplicate" title="Duplizieren" aria-label="Duplizieren">${icon('copy', { size: 14 })}</button>
        <button class="btn small icon-only" data-act="branch" title="Abzweig" aria-label="Abzweig hinzufügen">${icon('branch', { size: 14 })}</button>
        <button class="btn small icon-only" data-act="up" title="Nach oben" aria-label="Nach oben">${icon('up', { size: 14 })}</button>
        <button class="btn small icon-only" data-act="down" title="Nach unten" aria-label="Nach unten">${icon('down', { size: 14 })}</button>
      </div>
    </section>

    <section class="detail-block values">
      <h4>Zwischenwerte</h4>
      <dl class="kv" data-out-html="values"></dl>
    </section>
  </div></td></tr>`;
}

// ---- live result cells ------------------------------------------------------------------

function cellText(key, r) {
  if (r.status !== 'ok' && !['cum', 'throttle', 'dp'].includes(key)) return '';
  switch (key) {
    case 'dh': return fmt(r.dh * 1000, 0);
    case 'velocity': return fmt(r.velocity, 2);
    case 'dynamicPressure': return fmt(r.dynamicPressure, 1);
    case 'reynolds': return fmt(r.reynolds, 0);
    case 'lambda': return fmt(r.lambda, 4);
    case 'gradient': return fmt(r.gradient, 2);
    case 'dpFriction': return fmt(r.dpFriction, 1);
    case 'dpFittings': return fmt(r.dpFittings, 1);
    case 'dpComponents': return fmt(r.dpComponents, 1);
    case 'zetaSum': return fmt(r.zetaSum, 2);
    case 'dp': return fmt(r.dp, 1);
    case 'cum': return fmt(r.cum, 1);
    case 'throttle': return r.terminal ? fmt(r.throttle, 1) : '';
    default: return '';
  }
}

function updateResults() {
  const res = ui.result;
  for (const row of $$('#sections-table tr[data-id]')) {
    const r = res.sections.get(row.dataset.id);
    if (!r) continue;
    const isMain = row.classList.contains('sec-row');
    if (isMain) {
      row.classList.toggle('is-critical', r.critical);
      row.classList.toggle('is-incomplete', r.status !== 'ok');
      row.classList.toggle('has-error', r.issues.some((i) => i.severity === 'error'));
      const nrCell = row.querySelector('.c-nr');
      nrCell.style.setProperty('--depth', Math.min(r.depth, 6));
    }
    for (const cell of row.querySelectorAll('[data-out]')) {
      const key = cell.dataset.out;
      if (key === 'fit-dp' || key === 'fit-zeta') {
        const d = r.fittingDetails?.[Number(cell.dataset.index)];
        cell.textContent = d ? (key === 'fit-dp' ? fmt(d.dp, 1) : fmt(d.zeta, 3)) : '–';
        continue;
      }
      let text = cellText(key, r);
      if (key === 'zetaSum' && cell.classList.contains('sum-btn')) {
        const s = sectionById(r.id);
        text = s.fittings.length || s.zetaExtra ? text || '?' : '–';
      }
      cell.textContent = text;
      if (key === 'velocity') {
        const over = r.status === 'ok' && r.vmax != null && r.velocity > r.vmax + 1e-9;
        cell.classList.toggle('over', over);
        cell.title = r.vmax != null ? `Grenzwert ${fmt(r.vmax, 1)} m/s` : '';
      }
    }
    if (!isMain) {
      const values = row.querySelector('[data-out-html="values"]');
      if (values) values.innerHTML = String(valuesHtml(r));
      const suggest = row.querySelector('[data-out-html="suggest"]');
      if (suggest) suggest.innerHTML = String(suggestHtml(sectionById(r.id), r));
    }
  }
}

function valuesHtml(r) {
  if (r.status !== 'ok') return html`<p class="muted">–</p>`;
  const regime = r.reynolds < LAMINAR_LIMIT ? 'laminar' : r.reynolds < 4000 ? 'Übergang' : 'turbulent';
  const rows = [
    ['Querschnitt A', `${fmt(r.area, 4)} m²`],
    ['Hydraulischer Ø d<sub>h</sub>', `${fmt(r.dh * 1000, 1)} mm`],
    ['Seitenverhältnis', r.aspect > 1 ? `${fmt(r.aspect, 2)} : 1` : '–'],
    ['Lufttemperatur', `${fmt(r.temperature, 1)} °C`],
    ['Dichte ρ', `${fmt(r.density, 3)} kg/m³`],
    ['Kin. Viskosität ν', html`${expHtml(r.kinematicViscosity)} m²/s`],
    ['Geschwindigkeit v', `${fmt(r.velocity, 2)} m/s (max. ${fmt(r.vmax, 1)})`],
    ['Dynamischer Druck p<sub>d</sub>', `${fmt(r.dynamicPressure, 2)} Pa`],
    ['Reynolds-Zahl Re', `${fmt(r.reynolds, 0)} (${regime})`],
    ['Rauigkeit k', `${fmtSig(r.roughness, 3)} mm`],
    ['Relative Rauigkeit k/d<sub>h</sub>', expHtml(r.relRoughness)],
    ['Reibungsbeiwert λ', fmt(r.lambda, 5)],
    ['Druckgefälle R', `${fmt(r.gradient, 3)} Pa/m`],
  ];
  return html`${rows.map(([k, v]) => html`<dt>${raw(k)}</dt><dd class="num">${v}</dd>`)}`;
}

/** 1.62·10<sup>−5</sup> (the fonts have no superscript minus). */
function expHtml(value, sig = 3) {
  const p = fmtExpParts(value, sig);
  return p ? html`${p.mantissa}·10<sup>${p.exponent}</sup>` : '–';
}

function suggestHtml(s, r) {
  const vmax = r.vmax ?? null;
  if (!(s.flow > 0) || !vmax) return html`<p class="muted">–</p>`;
  const sug = suggestDimensions({ flow: s.flow, vmax, height: s.shape === 'rect' ? s.height : null, diameters: STANDARD_DIAMETERS, rectStep: RECT_STEP });
  if (!sug) return '';
  const options = [];
  const add = (labelText, patch) => {
    const probe = normalizeSection({ ...s, ...patch });
    const e = evaluateCrossSection(inputs(), probe);
    if (!e) return;
    const same = probe.shape === s.shape && probe.width === s.width && probe.height === s.height && probe.diameter === s.diameter;
    options.push(html`<button class="suggest-btn ${same ? 'is-current' : ''}" data-act="apply-dim" data-patch="${JSON.stringify(patch)}" ${same ? 'disabled' : ''}>
      <strong>${labelText}</strong><span class="num">${fmt(e.velocity, 2)} m/s · ${fmt(e.gradient, 2)} Pa/m</span></button>`);
  };
  if (sug.round) add(`Ø ${sug.round.diameter}`, { shape: 'round', diameter: sug.round.diameter });
  if (sug.rectKeepHeight && !(sug.rect && sug.rect.width === sug.rectKeepHeight.width && sug.rect.height === sug.rectKeepHeight.height)) {
    add(`${sug.rectKeepHeight.width} × ${sug.rectKeepHeight.height}`, { shape: 'rect', width: sug.rectKeepHeight.width, height: sug.rectKeepHeight.height });
  }
  if (sug.rect) add(`${sug.rect.width} × ${sug.rect.height}`, { shape: 'rect', width: sug.rect.width, height: sug.rect.height });
  return html`<p class="muted">v ≤ ${fmt(vmax, 1)} m/s</p><div class="suggest-list">${options}</div>`;
}

// ---- summary strip ------------------------------------------------------------------------

function renderSummary() {
  const t = ui.result.totals;
  const path = ui.result.path.map(nrOf);
  const marginDp = t.required - t.critical;
  const scaleMax = Math.max(t.required, t.available ?? 0) * 1.06 || 1;
  const pct = (v) => `${Math.max(0, (v / scaleMax) * 100).toFixed(3)}%`;
  const parts = [
    { key: 'friction', label: 'Reibung', value: t.friction, cls: 's1' },
    { key: 'fittings', label: 'Formstücke', value: t.fittings, cls: 's2' },
    { key: 'components', label: 'Einbauteile', value: t.components, cls: 's3' },
  ];
  const share = (v) => (t.critical > 0 ? ` (${fmt((v / t.critical) * 100, 0)} %)` : '');

  let reserve;
  if (t.available == null) {
    reserve = html`<div class="rs-reserve is-none"><span class="rs-label">Reserve</span><span class="rs-value num muted">–</span></div>`;
  } else if (t.reserve >= 0) {
    reserve = html`<div class="rs-reserve is-good"><span class="rs-label">Reserve</span><span class="rs-value num">${icon('check')}${fmt(t.reserve, 0)}<small>Pa</small></span><span class="rs-sub">von ${fmt(t.available, 0)} Pa verfügbar</span></div>`;
  } else {
    reserve = html`<div class="rs-reserve is-bad"><span class="rs-label">Fehlbetrag</span><span class="rs-value num">${icon('error')}${fmt(-t.reserve, 0)}<small>Pa</small></span><span class="rs-sub">nur ${fmt(t.available, 0)} Pa verfügbar</span></div>`;
  }

  $('#summary').innerHTML = String(html`
    <div class="rs-main">
      <span class="rs-label">${t.margin > 0 ? `Erforderlich inkl. ${fmt(t.margin, 0)} % Zuschlag` : 'Druckverlust kritischer Strang'}</span>
      <span class="rs-value num">${fmt(t.required, 0)}<small>Pa</small></span>
      <span class="rs-sub">${path.length ? html`Strang ${path.join(' → ')}${t.margin > 0 ? html` · ohne Zuschlag ${fmt(t.critical, 1)} Pa` : ''}` : 'Noch kein Strang'}</span>
    </div>
    <div class="rs-bar" role="img" aria-label="Zusammensetzung: Reibung ${fmt(t.friction, 0)} Pa, Formstücke ${fmt(t.fittings, 0)} Pa, Einbauteile ${fmt(t.components, 0)} Pa">
      <div class="bar-track">
        ${parts.map((p) => (p.value > 0 ? html`<span class="bar-seg ${p.cls}" style="width:${pct(p.value)}" title="${p.label}: ${fmt(p.value, 1)} Pa${share(p.value)}"></span>` : ''))}
        ${marginDp > 0 ? html`<span class="bar-seg margin" style="width:${pct(marginDp)}" title="Zuschlag: ${fmt(marginDp, 1)} Pa"></span>` : ''}
        ${t.available != null ? html`<span class="bar-mark ${t.reserve < 0 ? 'is-bad' : ''}" style="left:${pct(t.available)}" title="Verfügbar: ${fmt(t.available, 0)} Pa"><span>verfügbar ${fmt(t.available, 0)}</span></span>` : ''}
      </div>
      <ul class="bar-legend">
        ${parts.map((p) => html`<li><i class="sw ${p.cls}"></i>${p.label} <span class="num">${fmt(p.value, 1)} Pa</span><span class="muted">${share(p.value)}</span></li>`)}
        ${marginDp > 0 ? html`<li><i class="sw margin"></i>Zuschlag <span class="num">${fmt(marginDp, 1)} Pa</span></li>` : ''}
      </ul>
    </div>
    ${reserve}`);

  const mini = $('#appbar-result');
  if (mini) mini.innerHTML = String(html`Δp <span class="num">${fmt(t.required, 0)} Pa</span>`);
}

// ---- issues ------------------------------------------------------------------------------

function renderIssues() {
  const order = { error: 0, warning: 1, info: 2 };
  const list = ui.result.issues
    .filter((i) => i.code !== 'flow-missing')
    .sort((a, b) => order[a.severity] - order[b.severity]);
  $('#issues-block').hidden = !list.length;
  const severityIcon = (i) => icon(i.severity === 'info' ? 'info' : i.severity === 'error' ? 'error' : 'warning', { label: SEVERITY_LABELS[i.severity] });
  $('#issues').innerHTML = String(html`${list.map((i) => {
    const text = issueText(i, i.sectionId ? nrOf(i.sectionId) : '');
    return html`<li class="issue issue-${i.severity}">${i.sectionId
      ? html`<button class="issue-jump" data-goto="${i.sectionId}">${severityIcon(i)}<span>${text}</span>${icon('jump')}</button>`
      : html`${severityIcon(i)}<span>${text}</span>`}</li>`;
  })}`);
}

// ---- charts --------------------------------------------------------------------------------

let chartFrame = 0;
function renderCharts() {
  cancelAnimationFrame(chartFrame);
  chartFrame = requestAnimationFrame(() => {
    const hasData = ui.result.totals.critical > 0;
    $('#profile-panel').hidden = !hasData;
    $('#network-panel').hidden = !ui.result.order.length;
    if (hasData) renderProfile($('#profile-chart'), ui.result, inputs(), nrOf);
    if (ui.result.order.length) renderNetwork($('#network-chart'), ui.result, inputs(), nrOf, gotoSection);
  });
}

function gotoSection(id) {
  setTab('calc');
  if (!ui.expanded.has(id)) {
    ui.expanded.add(id);
    renderTable();
    updateResults();
  }
  const row = $(`#sections-table tr.sec-row[data-id="${CSS.escape(id)}"]`);
  if (!row) return;
  row.scrollIntoView({ block: 'center' });
  row.classList.add('flash');
  setTimeout(() => row.classList.remove('flash'), 900);
  row.querySelector('[data-field="flow"]')?.focus({ preventScroll: true });
}

// ============================================================================
// Section editing
// ============================================================================

const NUM_FIELDS = new Set(['flow', 'width', 'height', 'diameter', 'length', 'zetaExtra', 'temperature']);
const STRUCTURAL_FIELDS = new Set(['parent', 'shape', 'material', 'nr']);

function setFromInput(target, obj, key, isNum) {
  if (!isNum) {
    obj[key] = target.value;
    return true;
  }
  const v = parseNum(target.value);
  const bad = Number.isNaN(v) || (v != null && v < 0 && key !== 'temperature');
  target.setAttribute('aria-invalid', bad ? 'true' : 'false');
  if (bad) return false;
  obj[key] = v;
  return true;
}

function nextIntegerNr() {
  let max = 0;
  for (const s of inputs().sections) if (/^\d+$/.test(s.nr)) max = Math.max(max, Number(s.nr));
  return String(max + 1);
}

function addSection({ parent, after, nr } = {}) {
  const secs = inputs().sections;
  const last = secs[secs.length - 1];
  const base = parent ? sectionById(parent) : last;
  const s = newSection(secs, {
    nr: nr ?? nextIntegerNr(),
    parent: parent !== undefined ? parent : last?.id ?? null,
    shape: base?.shape ?? 'rect',
    material: base?.material ?? 'galvanized',
  });
  const idx = after ? secs.findIndex((x) => x.id === after) + 1 : secs.length;
  secs.splice(idx, 0, s);
  commitAndRender();
  const row = $(`#sections-table tr.sec-row[data-id="${CSS.escape(s.id)}"]`);
  row?.querySelector('[data-field="flow"]')?.focus();
  row?.scrollIntoView({ block: 'nearest' });
}

function addBranch(id) {
  const p = sectionById(id);
  const used = new Set(inputs().sections.map((s) => s.nr));
  let k = 1;
  while (used.has(`${p.nr}.${k}`)) k++;
  addSection({ parent: id, after: id, nr: p.nr ? `${p.nr}.${k}` : '' });
}

function deleteSection(id) {
  const secs = inputs().sections;
  const idx = secs.findIndex((s) => s.id === id);
  if (idx < 0) return;
  const s = secs[idx];
  for (const c of secs) if (c.parent === id) c.parent = s.parent;
  secs.splice(idx, 1);
  ui.expanded.delete(id);
  commitAndRender();
  toast(`Teilstrecke ${s.nr || idx + 1} gelöscht`, { action: UNDO_ACTION });
}

function duplicateSection(id) {
  const secs = inputs().sections;
  const idx = secs.findIndex((s) => s.id === id);
  const copy = normalizeSection({ ...structuredClone(secs[idx]), id: newSection(secs).id, nr: nextIntegerNr() });
  secs.splice(idx + 1, 0, copy);
  commitAndRender();
}

function moveSection(id, delta) {
  const secs = inputs().sections;
  const idx = secs.findIndex((s) => s.id === id);
  const to = idx + delta;
  if (idx < 0 || to < 0 || to >= secs.length) return;
  [secs[idx], secs[to]] = [secs[to], secs[idx]];
  commitAndRender();
}

function bindTable() {
  const table = $('#sections-table');

  table.addEventListener('input', (e) => {
    const t = e.target;
    const host = t.closest('[data-id]');
    if (!host) return;
    const s = sectionById(host.dataset.id);
    if (!s) return;
    let changed = false;
    if (t.dataset.field && !STRUCTURAL_FIELDS.has(t.dataset.field)) {
      changed = setFromInput(t, s, t.dataset.field, NUM_FIELDS.has(t.dataset.field));
    } else if (t.dataset.field === 'nr') {
      s.nr = t.value;
      changed = true;
    } else if (t.dataset.fit && t.dataset.fit !== 'ref') {
      const f = s.fittings[Number(t.dataset.index)];
      changed = f && setFromInput(t, f, t.dataset.fit, true);
      if (changed && t.dataset.fit === 'count' && f.count == null) f.count = 1;
    } else if (t.dataset.comp) {
      const c = s.components[Number(t.dataset.index)];
      changed = c && setFromInput(t, c, t.dataset.comp, t.dataset.comp === 'dp');
    }
    if (changed) {
      recalc();
      store.touch();
    }
  });

  table.addEventListener('change', (e) => {
    const t = e.target;
    const host = t.closest('[data-id]');
    if (!host) return;
    const s = sectionById(host.dataset.id);
    if (!s) return;
    if (t.dataset.field === 'parent') {
      s.parent = t.value || null;
    } else if (t.dataset.field === 'shape') {
      s.shape = t.value;
    } else if (t.dataset.field === 'material') {
      s.material = t.value;
    } else if (t.dataset.fit === 'ref') {
      const f = s.fittings[Number(t.dataset.index)];
      if (f) {
        f.ref = t.value;
        f.zeta = null;
      }
    } else if (t.dataset.add === 'fitting') {
      if (!t.value) return;
      s.fittings.push({ ref: t.value, count: 1, zeta: null });
    } else if (t.dataset.add === 'component') {
      if (!t.value) return;
      const preset = inputs().catalogs.components.find((c) => c.id === t.value);
      s.components.push(preset ? { name: preset.name, dp: preset.dp } : { name: '', dp: null });
    } else if (t.dataset.field === 'nr' || t.dataset.comp === 'name') {
      // labels appear in other rows (parent lists) – re-render
    } else {
      // number edits: values already applied on input
      store.commit();
      updateHistoryButtons();
      if (t.dataset.comp === 'dp' || t.dataset.field === 'zetaExtra' || t.dataset.fit) renderTableKeepFocus();
      return;
    }
    commitAndRender();
  });

  table.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const host = btn.closest('[data-id]');
    const id = host?.dataset.id;
    const s = id && sectionById(id);
    if (!s) return;
    switch (btn.dataset.act) {
      case 'toggle':
        if (ui.expanded.has(id)) ui.expanded.delete(id);
        else ui.expanded.add(id);
        renderTableKeepFocus();
        break;
      case 'branch': addBranch(id); break;
      case 'delete': deleteSection(id); break;
      case 'duplicate': duplicateSection(id); break;
      case 'up': moveSection(id, -1); break;
      case 'down': moveSection(id, 1); break;
      case 'fit-del':
        s.fittings.splice(Number(btn.dataset.index), 1);
        commitAndRender();
        break;
      case 'comp-del':
        s.components.splice(Number(btn.dataset.index), 1);
        commitAndRender();
        break;
      case 'apply-dim':
        Object.assign(s, JSON.parse(btn.dataset.patch));
        commitAndRender();
        break;
    }
  });

  // Enter / Shift+Enter: same column, next / previous row (like a spreadsheet)
  table.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return;
    const field = e.target.dataset.field;
    const row = e.target.closest('tr.sec-row');
    if (!field || !row) return;
    e.preventDefault();
    const rows = $$('#sections-table tr.sec-row');
    const i = rows.indexOf(row) + (e.shiftKey ? -1 : 1);
    const target = rows[i]?.querySelector(`[data-field="${field}"]`) ?? rows[i]?.querySelector('[data-field="flow"]');
    if (target) {
      target.focus();
      target.select?.();
    } else {
      e.target.blur();
      e.target.focus();
    }
  });
}

function renderTableKeepFocus() {
  const f = captureFocus();
  renderTable();
  updateResults();
  restoreFocus(f);
}

// ============================================================================
// Catalogues tab
// ============================================================================

const CATALOGS = {
  materials: {
    title: 'Materialien',
    cols: [
      { key: 'name', label: 'Bezeichnung', type: 'text' },
      { key: 'roughness', label: 'k', unit: 'mm', type: 'num' },
    ],
    blank: () => ({ name: 'Neues Material', roughness: 0.15 }),
    usedBy: (item) => inputs().sections.filter((s) => s.material === item.id),
  },
  fittings: {
    title: 'Formstücke',
    cols: [
      { key: 'name', label: 'Bezeichnung', type: 'text' },
      { key: 'group', label: 'Gruppe', type: 'group' },
      { key: 'zeta', label: 'ζ / Faktor', type: 'num' },
    ],
    blank: () => ({ name: 'Neues Formstück', group: 'any', kind: 'zeta', zeta: 0.5 }),
    usedBy: (item) => inputs().sections.filter((s) => s.fittings.some((f) => f.ref === item.id)),
  },
  components: {
    title: 'Einbauteile',
    cols: [
      { key: 'name', label: 'Bezeichnung', type: 'text' },
      { key: 'dp', label: 'Δp', unit: 'Pa', type: 'num' },
    ],
    blank: () => ({ name: 'Neues Bauteil', dp: 50 }),
    usedBy: () => [],
  },
  velocityLimits: {
    title: 'Grenzgeschwindigkeit',
    cols: [
      { key: 'below', label: 'V̇ <', unit: 'm³/h', type: 'num', placeholder: '∞' },
      { key: 'vmax', label: 'v_max', unit: 'm/s', type: 'num' },
    ],
    blank: () => ({ below: null, vmax: 5 }),
    usedBy: () => [],
  },
};

function catalogItemId(list) {
  let i = 1;
  while (list.some((x) => x.id === `custom-${i}`)) i++;
  return `custom-${i}`;
}

function renderCatalogs() {
  const cats = inputs().catalogs;
  const blocks = Object.entries(CATALOGS).map(([key, def]) => {
    const list = cats[key];
    return html`<section class="panel catalog" data-cat-block="${key}">
      <header><h3>${def.title}</h3><button class="btn small ghost icon-only" data-cat-reset="${key}" title="Standardwerte" aria-label="Standardwerte">${icon('reset', { size: 14 })}</button></header>
      <table class="mini">
        <thead><tr>${def.cols.map((c) => html`<th class="${c.type === 'num' ? 'n' : ''}">${c.label}${c.unit ? html` <span class="unit">${c.unit}</span>` : ''}</th>`)}<th></th></tr></thead>
        <tbody>${list.map((item, i) => html`<tr>${def.cols.map((c) => {
          const attrs = raw(`data-cat="${key}" data-index="${i}" data-cat-key="${c.key}"`);
          if (c.type === 'group') {
            return html`<td><select class="cell-select" ${attrs}>${Object.entries(GROUP_LABELS).map(([g, l]) => html`<option value="${g}" ${item.group === g ? 'selected' : ''}>${l}</option>`)}</select></td>`;
          }
          if (c.type === 'num') {
            const k = key === 'fittings' && item.kind === 'transition' ? 'factor' : c.key;
            const a = raw(`data-cat="${key}" data-index="${i}" data-cat-key="${k}"`);
            return html`<td class="n"><input class="cell-input num narrow" type="text" inputmode="decimal" ${a} value="${toInputValue(item[k])}" placeholder="${c.placeholder ?? ''}" ${k === 'factor' ? raw('aria-label="Faktor"') : ''} /></td>`;
          }
          return html`<td><input class="cell-input" type="text" ${attrs} value="${item[c.key]}" /></td>`;
        })}<td><button class="icon-btn" data-cat-del="${key}" data-index="${i}" aria-label="Eintrag löschen">${icon('close', { size: 14 })}</button></td></tr>`)}</tbody>
      </table>
      <button class="btn small icon-only" data-cat-add="${key}" title="Hinzufügen" aria-label="Hinzufügen">${icon('plus', { size: 14 })}</button>
    </section>`;
  });
  const st = inputs().settings;
  blocks.push(html`<section class="panel catalog">
    <header><h3>Seitenverhältnis</h3></header>
    <div class="detail-fields">
      ${numInput('data-setting="maxAspectRatio"', st.maxAspectRatio, { label: 'max.', unit: ': 1', placeholder: '–' })}
    </div>
  </section>`);
  $('#catalogs').innerHTML = String(html`${blocks}`);
}

function bindCatalogs() {
  const root = $('#catalogs');
  root.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.setting) {
      if (setFromInput(t, inputs().settings, t.dataset.setting, true)) {
        recalc();
        store.touch();
      }
      return;
    }
    if (!t.dataset.cat) return;
    const item = inputs().catalogs[t.dataset.cat][Number(t.dataset.index)];
    const key = t.dataset.catKey;
    const isNum = !['name', 'group'].includes(key);
    if (setFromInput(t, item, key, isNum)) {
      recalc();
      store.touch();
    }
  });
  root.addEventListener('change', (e) => {
    if (!e.target.dataset.cat && !e.target.dataset.setting) return;
    // names appear in the section table selects
    store.commit();
    renderTableKeepFocus();
    recalc();
  });
  root.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    const cats = inputs().catalogs;
    if (t.dataset.catAdd) {
      const key = t.dataset.catAdd;
      const item = CATALOGS[key].blank();
      if (key !== 'velocityLimits') item.id = catalogItemId(cats[key]);
      cats[key].push(key === 'velocityLimits' ? item : { id: item.id, ...item });
      commitAndRender();
      setTab('catalogs');
    } else if (t.dataset.catDel) {
      const key = t.dataset.catDel;
      const item = cats[key][Number(t.dataset.index)];
      const used = CATALOGS[key].usedBy(item);
      if (used.length) {
        toast(`„${item.name}“ in Gebrauch: Teilstrecke ${used.map((s) => s.nr || '?').join(', ')}`, { kind: 'error', timeout: 7000 });
        return;
      }
      cats[key].splice(Number(t.dataset.index), 1);
      commitAndRender();
    } else if (t.dataset.catReset) {
      const key = t.dataset.catReset;
      const defaults = defaultCatalogs()[key];
      // Keep custom entries that are still in use, so sections stay valid.
      const keep = cats[key].filter((item) => item.id && !defaults.some((d) => d.id === item.id) && CATALOGS[key].usedBy(item).length);
      cats[key] = [...defaults, ...keep];
      commitAndRender();
      toast(`${CATALOGS[key].title}: Standardwerte`, { action: UNDO_ACTION });
    }
  });
}

// ============================================================================
// Tabs, toolbar, keyboard
// ============================================================================

function setTab(name) {
  for (const tab of $$('.tab')) tab.setAttribute('aria-selected', String(tab.dataset.tab === name));
  for (const p of $$('.tab-panel')) p.hidden = p.dataset.panel !== name;
  if (name === 'calc') renderCharts();
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
    const goto = e.target.closest('[data-goto]');
    if (goto) {
      gotoSection(goto.dataset.goto);
      return;
    }
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
      case 'add-section': addSection(); break;
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

function bindSystem() {
  const root = $('#system');
  root.addEventListener('input', (e) => {
    const key = e.target.dataset.sys;
    if (!key) return;
    const isNum = !['name', 'direction', 'frictionMethod'].includes(key);
    if (setFromInput(e.target, inputs().system, key, isNum)) {
      if (isNum && inputs().system[key] == null && ['altitude', 'temperature', 'humidity', 'safetyMargin'].includes(key)) {
        inputs().system[key] = key === 'temperature' ? 20 : 0;
      }
      recalc();
      store.touch();
    }
  });
  root.addEventListener('change', () => {
    store.commit();
    recalc();
  });
}

function bindDetailsToggle() {
  const box = $('#toggle-details');
  try {
    ui.details = JSON.parse(localStorage.getItem(UI_KEY) || '{}').details === true;
  } catch {
    ui.details = false;
  }
  box.checked = ui.details;
  box.addEventListener('change', () => {
    ui.details = box.checked;
    $('#sections-table').classList.toggle('show-details', ui.details);
    try {
      localStorage.setItem(UI_KEY, JSON.stringify({ details: ui.details }));
    } catch {
      /* ignore */
    }
  });
}

function bindResize() {
  let frame = 0;
  const ro = new ResizeObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => ui.result && renderProfile($('#profile-chart'), ui.result, inputs(), nrOf));
  });
  ro.observe($('#profile-chart'));
}

function bindStickyResult() {
  const mini = document.createElement('span');
  mini.id = 'appbar-result';
  mini.className = 'appbar-result';
  mini.hidden = true;
  $('.appbar-title').after(mini);
  const io = new IntersectionObserver(([entry]) => {
    mini.hidden = entry.isIntersecting;
  }, { rootMargin: `-${52}px 0px 0px 0px` });
  io.observe($('#summary'));
}

function addThemeButton() {
  const b = document.createElement('button');
  b.id = 'theme-toggle';
  b.className = 'btn ghost icon-only';
  $('.appbar-actions').prepend(b);
  bindThemeToggle(b);
}

function addDiameterList() {
  const dl = document.createElement('datalist');
  dl.id = 'std-diameters';
  dl.innerHTML = STANDARD_DIAMETERS.map((d) => `<option value="${d}"></option>`).join('');
  document.body.append(dl);
}

// ============================================================================
// Start
// ============================================================================

async function start() {
  const handoff = takeHandoff();
  store = new DocumentStore(loadInitialDoc(), { draftKey: DRAFT_KEY });

  addThemeButton();
  addDiameterList();
  projectView = mountProjectInfo($('#project'), {
    getProject: () => doc().project,
    onInput: () => store.touch(),
    onCommit: () => {
      store.commit();
      updateHistoryButtons();
    },
  });
  bindToolbar();
  bindSystem();
  bindTable();
  bindCatalogs();
  bindDetailsToggle();
  bindStickyResult();
  bindResize();
  enableFileDrop(openFile);

  renderAll();

  if (handoff) await openEnvelope(handoff);
}

start();
