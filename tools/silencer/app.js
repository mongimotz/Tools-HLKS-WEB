// SPDX-License-Identifier: AGPL-3.0-or-later
// Page controller for the silencer tool: the level list of a path (left, like the Excel sheet) and the design of
// the selected silencer (right). All maths in calc.js; this file only reads inputs and shows results.

import {
  compute,
  snapshotOf,
  staleRows,
  lookupRow,
  rowCopy,
  rectChoices,
  roundChoices,
  snapRect,
  snapRound,
  silencerVariants,
  variantHousing,
  CALC_VERSION,
  SPLITTER_SERIES,
  ROUND_SERIES,
  LSV_K1,
} from './calc.js';
import {
  TOOL_ID,
  INPUT_VERSION,
  DIRECTIVITIES,
  LSV_CORRECTIONS,
  normalizeInputs,
  normalizeRow,
  emptyInputs,
  exampleInputs,
  newRow,
  newPath,
  duplicatePath,
} from './defaults.js';
import {
  TYPE_LABELS,
  UNIT_LABELS,
  KIND_LABELS,
  INSTALL_LABELS,
  BASIS_LABELS,
  REQUIREMENT_LABELS,
  LSV_LIMIT_LABELS,
  ES_LABELS,
  OCTAVE_LABELS,
  fmtLimit,
  rowLabel,
  pathLabel,
  lineLabel,
  seriesName,
  issueText,
  productText,
  checkLevelLabel,
} from './labels.js';
import { rectFrontView, roundFrontView } from './drawing.js';
import { buildCsv } from './csv.js';
import { DocumentStore } from '../../lib/core/store.js';
import { fmt, parseNum, toInputValue, todayIso } from '../../lib/core/format.js';
import { createEnvelope, checkCompatibility, normalizeProject, EnvelopeError } from '../../lib/core/envelope.js';
import { readEnvelopeFromFile, pickFile, download, safeFileName, takeHandoff, stashHandoff, enableFileDrop } from '../../lib/core/files.js';
import { findTool, toolUrl } from '../../lib/core/registry.js';
import { mountProjectInfo, newProject } from '../../lib/core/project-info.js';
import { html, raw, icon, toast, bindThemeToggle, mountSourceLink } from '../../lib/core/ui.js';
import { bindRowDrag, moveBefore } from '../../lib/core/drag.js';
import { createIssuePanel } from '../../lib/core/issues.js';
import { mountCalculationTabs } from '../../lib/core/calculation-tabs.js';
import { enableCombos } from '../../lib/core/combo.js';

const DRAFT_KEY = `hlks-tools:${TOOL_ID}:draft`;

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ui = {
  pathId: null,
  selectedId: null, // silencer shown in the design panel
  result: null,
  variants: [], // list shown in the design panel (for "take")
  fileNotes: [],
};

let store;
let projectView;
let issuePanel;
let calculationTabs;

const doc = () => store.doc;
const inputs = () => store.doc.inputs;
const path = () => inputs().paths.find((p) => p.id === ui.pathId) ?? inputs().paths[0];
const pathResult = () => ui.result.paths.find((p) => p.id === path().id);
const rowById = (id) => path().rows.find((r) => r.id === id);
const selected = () => {
  const r = rowById(ui.selectedId);
  return r?.type === 'silencer' ? r : null;
};
const db = (v) => fmt(v, 1);

/** Keep a valid path and a selected silencer (the first one of the path if the old one is gone). */
function syncSelection() {
  if (!inputs().paths.some((p) => p.id === ui.pathId)) ui.pathId = inputs().paths[0]?.id ?? null;
  if (!selected()) ui.selectedId = path().rows.find((r) => r.type === 'silencer')?.id ?? null;
}

// ============================================================================
// Document lifecycle
// ============================================================================

function loadInitialDoc() {
  const draft = DocumentStore.readDraft(DRAFT_KEY);
  if (draft?.inputs?.paths && draft.version !== INPUT_VERSION) {
    ui.fileNotes = [{ id: 'draft-version', text: `Entwurf nicht geöffnet: Eingabeversion ${draft.version ?? 'unbekannt'}, aktuell ${INPUT_VERSION}` }];
  } else if (draft?.inputs?.paths) {
    try {
      return { version: INPUT_VERSION, project: normalizeProject(draft.project), inputs: normalizeInputs(draft.inputs) };
    } catch {
      /* fall through to the example */
    }
  }
  return exampleDoc();
}

const exampleDoc = () => ({ version: INPUT_VERSION, project: { ...newProject(), name: 'Beispiel' }, inputs: exampleInputs() });

const UNDO_ACTION = { icon: 'undo', label: 'Rückgängig', run: () => undo() };

function replaceDocument(next, message) {
  next.version = INPUT_VERSION;
  store.replace(next);
  ui.pathId = next.inputs.paths[0]?.id ?? null;
  ui.selectedId = null;
  showFileNotes([]);
  renderAll();
  toast(message, { action: UNDO_ACTION });
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
  const next = { version: INPUT_VERSION, project: normalizeProject(env.project), inputs: normalizeInputs(env.inputs) };
  store.replace(next);
  ui.pathId = next.inputs.paths[0]?.id ?? null;
  ui.selectedId = null;
  const stale = staleRows(next.inputs);
  const fileNotes = notes.map((text) => ({ text }));
  if (stale.length) fileNotes.push({ text: `Herstellerdaten geändert: ${stale.map((x) => labelOf(x.pathId, x.rowId)).join(', ')}`, action: 'update-rows' });
  showFileNotes(fileNotes);
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

/** Keep file notes in the same status panel as calculation issues. */
function showFileNotes(notes) {
  ui.fileNotes = notes.map((note, i) => ({ ...note, id: `file-${i}` }));
  if (ui.result) renderIssues();
}

/** Replace the stored data rows that differ from the current data (undoable). */
function updateRows() {
  let n = 0;
  for (const x of staleRows(inputs())) {
    const row = inputs().paths.find((p) => p.id === x.pathId)?.rows.find((r) => r.id === x.rowId);
    if (!row || x.missing) continue;
    row.row = rowCopy(lookupRow(row.kind, row.row), row.kind);
    n++;
  }
  showFileNotes([]);
  commitAndRender();
  toast(`${n} Schalldämpfer aktualisiert`, { action: UNDO_ACTION });
}

/** Label of a row for messages; with several paths the path name comes first ("Abluft | SD 2"). */
function labelOf(pathId, rowId) {
  const paths = inputs().paths;
  const i = paths.findIndex((p) => p.id === pathId);
  if (i < 0) return '';
  const p = paths[i];
  const what = rowId ? rowLabel(p.rows.find((r) => r.id === rowId)) : p.receiver.name || 'Empfänger';
  return paths.length > 1 ? `${pathLabel(p, i)} | ${what}` : what;
}

function fileBaseName() {
  const p = doc().project;
  return ['Schalldämpfer', p.name, p.date || todayIso()];
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

function exportCsv() {
  store.commit();
  download(buildCsv(doc(), compute(inputs())), safeFileName(fileBaseName(), 'csv'), 'text/csv;charset=utf-8');
}

function exportJson() {
  store.commit();
  download(JSON.stringify(currentEnvelope(), null, 2), safeFileName(fileBaseName(), 'json'), 'application/json');
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
  syncSelection();
  ui.result = compute(inputs());
  const focus = captureFocus();
  projectView.refresh();
  renderTabs();
  renderPathHead();
  renderTable();
  renderAddButtons();
  renderReceiver();
  renderDesign();
  updateOutputs();
  restoreFocus(focus);
}

/** After a value edit: calculate and fill the outputs; inputs stay as they are (focus and caret stay). */
function recalc() {
  ui.result = compute(inputs());
  updateOutputs();
}

function updateOutputs() {
  fillTable();
  fillTabs();
  fillReceiver();
  fillDesign();
  renderIssues();
  updateHistoryButtons();
}

function updateHistoryButtons() {
  $('[data-action="undo"]').disabled = !store.canUndo;
  $('[data-action="redo"]').disabled = !store.canRedo;
}

// ---- focus keeping across re-renders -------------------------------------------

const FOCUS_ATTRS = ['data-f', 'data-edit', 'data-i', 'data-pf', 'data-rf', 'data-sf'];

function captureFocus() {
  const el = document.activeElement;
  if (!el || el === document.body) return null;
  const host = el.closest('[data-id]');
  const parts = [];
  for (const a of FOCUS_ATTRS) if (el.hasAttribute(a)) parts.push(`[${a}="${CSS.escape(el.getAttribute(a))}"]`);
  if (!parts.length) return null;
  return { host: host ? `[data-id="${CSS.escape(host.dataset.id)}"]` : null, sel: parts.join(''), start: el.selectionStart, end: el.selectionEnd };
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

// ---- small builders ------------------------------------------------------------------

const numAttrs = 'type="text" inputmode="decimal" autocomplete="off"';

/** Labelled field for the panels: label, control, unit. */
function field(label, control, unit = '', cls = '') {
  return html`<label class="pf ${cls}"><span class="pf-label">${raw(label)}</span>${control}${unit ? html`<span class="unit">${unit}</span>` : ''}</label>`;
}
function numField(attr, key, value, { placeholder = '', cls = '', label = '' } = {}) {
  const aria = label ? ` aria-label="${String(html`${label}`)}"` : '';
  return raw(`<input class="cell-input num ${cls}" ${numAttrs} ${attr}="${key}" value="${toInputValue(value)}" placeholder="${placeholder}"${aria} />`);
}
/** One line of the design panel: label column, then the control (all lines share the label width). */
const designRow = (label, control) => html`<div class="type-group"><span class="tg-label">${raw(label)}</span><div class="tg-ctl">${control}</div></div>`;
const mm = html`<span class="unit">mm</span>`;
function selectField(attr, key, options, value, cls = '') {
  return html`<select class="cell-select ${cls}" ${raw(`${attr}="${key}"`)}>${options.map(([v, t]) => html`<option value="${v}" ${String(v) === String(value) ? 'selected' : ''}>${t}</option>`)}</select>`;
}
const chip = (label, on, attrs, title = '') => html`<button class="chip ${on ? 'is-on' : ''}" ${raw(attrs)} aria-pressed="${String(on)}" ${title ? raw(`title="${title}"`) : ''}>${label}</button>`;

// ---- path tabs and head ------------------------------------------------------------

function renderTabs() {
  calculationTabs.render(inputs().paths.map((p, i) => {
    const rc = ui.result.paths.find((result) => result.id === p.id)?.receiver;
    return {
      id: p.id,
      label: pathLabel(p, i),
      value: Number.isFinite(rc?.lpa) ? db(rc.lpa) : '–',
      severity: rc?.status === 'over' ? 'error' : undefined,
    };
  }), ui.pathId);
}

function fillTabs() {
  renderTabs();
}

function renderPathHead() {
  const p = path();
  $('#path-head').innerHTML = String(html`
    ${field('Weg', raw(`<input class="cell-input w-name" type="text" autocomplete="off" data-pf="name" value="${String(html`${p.name}`)}" placeholder="${String(html`${pathLabel(p, inputs().paths.indexOf(p))}`)}" />`))}
    ${field('V̇', numField('data-pf', 'flow', p.flow, { placeholder: '–' }), 'm³/h')}`);
}

// ---- level table ------------------------------------------------------------------

/** Lines of the current path, grouped by row id (in order). */
function linesByRow() {
  const map = new Map(path().rows.map((r) => [r.id, []]));
  for (const l of pathResult().lines) map.get(l.rowId)?.push(l);
  return map;
}

const COLGROUP = raw(`<colgroup><col class="w-grip"><col class="w-name"><col class="w-unit"><col class="w-op">${'<col class="w-oct">'.repeat(8)}<col class="w-total"><col class="w-act"></colgroup>`);

function renderTable() {
  const groups = linesByRow();
  const head = html`<thead><tr><th></th><th class="c-name">Element</th><th class="c-unit">Einheit</th><th></th>${OCTAVE_LABELS.map((o) => html`<th class="c-oct">${o}</th>`)}<th class="c-total">Σ dB(A)</th><th></th></tr></thead>`;
  const body = path().rows.map((row) => rowHtml(row, groups.get(row.id) ?? []));
  const foot = html`<tfoot>
    <tr class="sum-line"><td></td><td class="c-name">Summe</td><td class="c-unit">dB(A)</td><td></td>${OCTAVE_LABELS.map((_, i) => html`<td class="c-oct" data-sum="${i}"></td>`)}<td class="c-total" data-sum="total"></td><td></td></tr>
    <tr class="rc-line"><td></td><td class="c-name" data-rc-name></td><td class="c-unit">dB(A)</td><td class="c-op">+</td>${OCTAVE_LABELS.map((_, i) => html`<td class="c-oct" data-rcl="${i}"></td>`)}<td class="c-total" data-rcl="total"></td><td></td></tr>
  </tfoot>`;
  $('#levels').innerHTML = String(html`${COLGROUP}${head}${body}${foot}`);
}

function rowHtml(row, lines) {
  const isSel = row.id === ui.selectedId;
  return html`<tbody class="row row-${row.type} ${isSel ? 'is-selected' : ''}" data-id="${row.id}">${lines.map((l, j) => lineHtml(row, l, j))}</tbody>`;
}

function lineHtml(row, l, j) {
  const first = j === 0;
  const name = first
    ? html`<div class="name-cell"><input class="cell-input name-input" type="text" autocomplete="off" data-f="name" value="${row.name}" placeholder="${TYPE_LABELS[row.type]}" />${row.type === 'silencer' ? html`<span class="product"></span>` : ''}</div>`
    : html`<span class="sub-label">${lineLabel(l, row, false)}</span>`;
  const unit = l.edit && l.unit
    ? html`<button class="unit-btn ${l.unit === 'dBA' ? 'is-a' : ''}" data-act="unit" data-edit="${l.edit}" title="Einheit wechseln" aria-label="Einheit ${UNIT_LABELS[l.unit]}, wechseln">${UNIT_LABELS[l.unit]}</button>`
    : l.unit === 'dBA' ? html`<span class="unit-tag is-a">dB(A)</span>` : '';
  const cells = row.type === 'branch'
    ? html`<td class="c-branch" colspan="8">${branchFields(row)}</td>`
    : OCTAVE_LABELS.map((_, i) => (l.edit
      ? html`<td class="c-oct"><input class="cell-input num" ${raw(numAttrs)} data-edit="${l.edit}" data-i="${i}" value="${toInputValue(l.values[i])}" aria-label="${OCTAVE_LABELS[i]} Hz" /></td>`
      : html`<td class="c-oct out" data-out="${j}:${i}"></td>`));
  return html`<tr class="line line-${l.kind} ${first ? 'is-first' : ''}">
    <td class="c-grip">${first ? html`<span class="icon-btn drag-handle" title="Ziehen" aria-hidden="true">${icon('grip', { size: 15 })}</span>` : ''}</td>
    <td class="c-name">${name}</td>
    <td class="c-unit">${unit}</td>
    <td class="c-op">${l.op}</td>
    ${cells}
    <td class="c-total" data-out="${j}:total"></td>
    <td class="c-act">${first ? html`<button class="icon-btn" data-act="delete" title="Löschen" aria-label="Löschen">${icon('trash', { size: 15 })}</button>` : ''}</td>
  </tr>`;
}

function branchFields(row) {
  return html`<span class="branch-fields">
    <span class="pf-label">V̇</span><span class="readout" data-branch="before"></span><span class="pf-label">→</span>
    ${numField('data-f', 'flow', row.flow, { placeholder: '–', cls: 'w-flow' })}<span class="unit">m³/h</span>
    <span class="pf-label gap">ΔL</span>${numField('data-f', 'dl', row.dl, { cls: 'w-dl' })}<span class="unit">dB</span>
  </span>`;
}

function fillTable() {
  const res = pathResult();
  const groups = linesByRow();
  for (const row of path().rows) {
    const body = $(`#levels tbody[data-id="${CSS.escape(row.id)}"]`);
    if (!body) continue;
    const r = res.rows.get(row.id);
    (groups.get(row.id) ?? []).forEach((l, j) => {
      for (let i = 0; i < 8; i++) {
        const cell = $(`[data-out="${j}:${i}"]`, body);
        if (cell) cell.textContent = l.values[i] == null ? '' : db(l.values[i]);
      }
      const total = $(`[data-out="${j}:total"]`, body);
      if (total) total.textContent = l.total != null && Number.isFinite(l.total) ? db(l.total) : '';
    });
    if (row.type === 'branch') {
      $('[data-branch="before"]', body).textContent = r.flow > 0 ? fmt(r.flow, 0) : '–';
      const dl = $('[data-f="dl"]', body);
      if (dl && document.activeElement !== dl) dl.placeholder = row.dl == null && r.dl != null ? db(r.dl) : '–';
    }
    const errors = r.issues.some((x) => x.severity === 'error');
    body.classList.toggle('has-error', errors);
    body.classList.toggle('has-warning', !errors && r.issues.some((x) => x.severity === 'warning'));
    const product = $('.product', body);
    if (product) product.textContent = product.title = productText(row);
  }
  for (let i = 0; i < 8; i++) {
    $(`[data-sum="${i}"]`).textContent = db(res.level[i]);
    $(`[data-rcl="${i}"]`).textContent = res.receiver.lp ? db(res.receiver.lp[i]) : '';
  }
  $('[data-sum="total"]').textContent = db(res.lwa);
  const rc = res.receiver;
  const rcTotal = $('[data-rcl="total"]');
  rcTotal.textContent = Number.isFinite(rc.lpa) ? db(rc.lpa) : '–';
  rcTotal.className = `c-total ${rc.status === 'over' ? 'is-over' : rc.status === 'ok' ? 'is-ok' : ''}`;
  $('[data-rc-name]').textContent = `${path().receiver.name || 'Empfänger'} (LpA)`;
}

function renderAddButtons() {
  $('#add-buttons').innerHTML = String(html`${['source', 'loss', 'silencer', 'branch'].map(
    (t) => html`<button class="btn small" data-add="${t}">${icon(t === 'loss' ? 'component' : t === 'branch' ? 'branch' : t)}<span>${TYPE_LABELS[t]}</span></button>`,
  )}`);
}

// ---- receiver -------------------------------------------------------------------

function renderReceiver() {
  const rc = path().receiver;
  const area = rc.area == null && rc.volume > 0 && rc.reverb > 0 ? toInputValue(Math.round(((0.163 * rc.volume) / rc.reverb) * 10) / 10) : '';
  $('#receiver').innerHTML = String(html`
    <div class="rc-head">${icon('receiver', { size: 15 })}<h3>Empfänger</h3>${raw(`<input class="cell-input w-name" type="text" autocomplete="off" data-rf="name" value="${String(html`${rc.name}`)}" placeholder="Name" aria-label="Name" />`)}</div>
    <div class="rc-fields">
      ${field('r', numField('data-rf', 'r', rc.r, { placeholder: '–' }), 'm')}
      ${field('Q', selectField('data-rf', 'q', DIRECTIVITIES.map((q) => [q, q]), rc.q))}
      ${field('A', numField('data-rf', 'area', rc.area, { placeholder: area || '–' }), 'm²')}
      ${field('V', numField('data-rf', 'volume', rc.volume, { placeholder: '–' }), 'm³')}
      ${field('T', numField('data-rf', 'reverb', rc.reverb, { placeholder: '–' }), 's')}
    </div>
    <div class="rc-fields">${targetFields(rc)}</div>
    <div class="rc-result" id="rc-result"></div>`);
}

function targetFields(rc) {
  const basis = html`<span class="seg" role="radiogroup" aria-label="Ziel">${Object.entries(BASIS_LABELS).map(
    ([k, t]) => html`<button class="seg-btn" role="radio" aria-checked="${rc.basis === k}" data-act="basis" data-value="${k}">${t}</button>`,
  )}</span>`;
  if (rc.basis === 'room') {
    const cat = inputs().catalogs;
    const sens = Object.fromEntries(cat.sensitivities.map((s) => [s.id, s.name]));
    const types = cat.roomTypes.map((t) => [t.id, `${t.id} ${t.name} (${t.sensitivity === 'none' ? 'keine' : sens[t.sensitivity] ?? t.sensitivity})`]);
    const room = cat.roomTypes.find((t) => t.id === rc.room.type);
    if (!room) types.unshift([rc.room.type, '–']);
    const reqs = Object.entries(REQUIREMENT_LABELS).filter(([k]) => k !== 'design' || room?.design != null);
    return html`${basis}
      ${selectField('data-rf', 'room.type', types, rc.room.type, 'w-room')}
      ${room?.sensitivity !== 'none' ? selectField('data-rf', 'room.requirement', reqs, rc.room.requirement) : ''}`;
  }
  if (rc.basis === 'lsv') {
    const k = LSV_CORRECTIONS.map((v) => [v, v]);
    return html`${basis}
      ${selectField('data-rf', 'lsv.es', Object.entries(ES_LABELS), rc.lsv.es)}
      ${selectField('data-rf', 'lsv.limit', Object.entries(LSV_LIMIT_LABELS), rc.lsv.limit, 'w-limit')}
      <label class="pf check"><input type="checkbox" data-rf="lsv.business" ${rc.lsv.business ? 'checked' : ''} /><span>Betriebsraum</span></label>
      ${field('K2', selectField('data-rf', 'lsv.k2', k, rc.lsv.k2))}
      ${field('K3', selectField('data-rf', 'lsv.k3', k, rc.lsv.k3))}
      ${field('t Tag', numField('data-rf', 'lsv.hoursDay', rc.lsv.hoursDay, { placeholder: '12' }), 'h')}
      ${field('t Nacht', numField('data-rf', 'lsv.hoursNight', rc.lsv.hoursNight, { placeholder: '12' }), 'h')}`;
  }
  return html`${basis}${field('L<sub>pA</sub> ≤', numField('data-rf', 'target', rc.target, { placeholder: '–' }), 'dB(A)')}`;
}

/** What the target is: "LH mittel, Mindest", "Lr = LpA + K1 5 + K2 0 + K3 0 | ES II, Planungswert". */
function checkBasisText(rc, period) {
  if (rc.basis === 'room') {
    const cat = inputs().catalogs;
    const t = cat.roomTypes.find((x) => x.id === rc.room.type);
    const s = t && cat.sensitivities.find((x) => x.id === t.sensitivity);
    if (!t) return '–';
    if (!s) return 'LH keine Anforderung';
    if (rc.room.requirement === 'design' && t.design != null) return 'LH Auslegung SIA 2024';
    return `LH ${s.name}, ${REQUIREMENT_LABELS[rc.room.requirement]}`;
  }
  if (rc.basis === 'lsv') {
    const hours = rc.lsv[period === 'day' ? 'hoursDay' : 'hoursNight'] ?? 12;
    const t = hours < 12 ? ` | t ${fmt(hours, 1)} h` : '';
    const bonus = rc.lsv.business && rc.lsv.es <= 3 ? ' + 5' : '';
    return `Lr = LpA + K1 ${LSV_K1[period]} + K2 ${rc.lsv.k2} + K3 ${rc.lsv.k3}${t} | ${ES_LABELS[rc.lsv.es]}, ${LSV_LIMIT_LABELS[rc.lsv.limit]}${bonus}`;
  }
  return '';
}

function fillReceiver() {
  const rc = path().receiver;
  const r = pathResult().receiver;
  const el = $('#rc-result');
  const main = html`<div class="rc-main"><span class="rc-label">L<sub>pA</sub></span><span class="rc-value">${Number.isFinite(r.lpa) ? db(r.lpa) : '–'}</span><span class="unit">dB(A)</span></div>`;
  const checks = r.checks.map((c) => {
    const ok = c.status === 'ok';
    return html`<div class="rc-check ${ok ? 'is-ok' : 'is-over'}" title="${checkBasisText(rc, c.period)}">
      ${icon(ok ? 'check' : 'error', { size: 15, label: ok ? 'eingehalten' : 'überschritten' })}
      <span class="num">${checkLevelLabel(c.period)} ${db(c.level)} ${ok ? '≤' : '>'} ${fmtLimit(c.limit)} dB(A)</span>
      <span class="num strong">${c.margin >= 0 ? '−' : '+'}${db(Math.abs(c.margin))} dB</span>
    </div>`;
  });
  const basis = rc.basis === 'lsv'
    ? `${ES_LABELS[rc.lsv.es]} | ${LSV_LIMIT_LABELS[rc.lsv.limit]}`
    : checkBasisText(rc);
  el.innerHTML = String(html`${main}<div class="rc-checks">${checks}${checks.length && basis ? html`<span class="muted small">${basis}</span>` : ''}</div>`);
}

// ---- design panel ----------------------------------------------------------------

function renderDesign() {
  const el = $('#design');
  const sd = selected();
  if (!sd) {
    el.innerHTML = String(html`<div class="design-head"><h3>Auslegung</h3></div>
      <button class="btn small" data-add="silencer">${icon('silencer')}<span>${TYPE_LABELS.silencer}</span></button>`);
    return;
  }
  const makers = new Map();
  for (const [kind, list] of [['rect', SPLITTER_SERIES], ['round', ROUND_SERIES]]) {
    for (const s of list) {
      if (!makers.has(s.maker)) makers.set(s.maker, []);
      makers.get(s.maker).push({ kind, ...s });
    }
  }
  const makerOrder = ['Trox', 'Schako', 'Lindab', 'Prod. RIO', 'Prod. Schmidlin'];
  const products = [...makers].sort(([a], [b]) => makerOrder.indexOf(a) - makerOrder.indexOf(b)).map(([maker, list]) => designRow(maker,
    html`<div class="chips">${list.map((s) =>
      chip(s.estimated ? 'Kulisse (geschätzt)' : seriesName(s.kind, s.id).replace(`${maker} `, ''), sd.kind === s.kind && sd[s.kind].series === s.id,
        `data-act="series" data-kind="${s.kind}" data-value="${s.id}"`, s.label))}</div>`));
  const form = sd.kind === 'rect' ? rectForm(sd) : sd.kind === 'round' ? roundForm(sd) : manualForm(sd);
  el.innerHTML = String(html`
    <div class="design-head">${icon('silencer', { size: 15 })}<h3>${rowLabel(sd)}</h3><span class="muted" data-design="flow"></span></div>
    <div class="design-body">
      <div class="design-input">
        <div class="design-form">
          ${products}
          ${designRow('', html`<div class="chips">${chip(KIND_LABELS.manual, sd.kind === 'manual', 'data-act="manual"')}</div>`)}
        </div>
        <div class="design-form">${form}</div>
      </div>
      <div class="design-output">
        <div class="design-result">
          <dl class="kv" data-design="values"></dl>
          ${sd.kind !== 'manual' ? html`<div class="front" data-design="view"></div>` : ''}
        </div>
        ${sd.kind !== 'manual' ? html`<div class="variants" data-design="variants" aria-live="polite"></div>` : ''}
      </div>
    </div>`);
}

/** Choice chips of a data key (d, L, insulation, core) as one design line. */
function pick(sd, key, label, values) {
  if (!values.length) return '';
  const spec = sd[sd.kind];
  return designRow(label, html`<div class="chips">${values.map((v) => chip(fmt(v, 0), spec[key] === v, `data-act="spec" data-key="${key}" data-value="${v}"`))}</div>`);
}

/** B or H of the housing. Fixed: the size of the silencer, the variants keep it. Free: the maximum for the variants. */
function sideRow(sd, side) {
  const fixed = sd.design[`fix${side}`];
  const key = fixed ? `rect.${side}` : `design.max${side}`;
  return designRow(fixed ? side : `${side} max.`, html`
    ${numField('data-sf', key, getPath(sd, key), { placeholder: '–', cls: 'w-mm', label: `${side} innen${fixed ? '' : ' max.'}` })}${mm}
    ${chip('Fix', fixed, `data-act="fix" data-value="${side}"`)}`);
}

function rectForm(sd) {
  const c = rectChoices(sd.rect);
  return html`
    ${sideRow(sd, 'B')}
    ${sideRow(sd, 'H')}
    ${designRow('Einbau', selectField('data-sf', 'install', Object.entries(INSTALL_LABELS), sd.install, 'w-install'))}
    ${pick(sd, 'd', 'Kulisse d', c.d)}
    ${designRow('Spalt s', html`${raw(`<input class="cell-input num w-mm" ${numAttrs} data-sf="rect.s" data-combo="gap" value="${toInputValue(sd.rect.s)}" aria-label="Spalt s" />`)}${mm}`)}
    ${pick(sd, 'L', 'Länge L', c.L)}`;
}

function roundForm(sd) {
  const c = roundChoices(sd.round);
  return html`
    ${designRow('Ø', html`${selectField('data-sf', 'round.dn', c.dn.map((v) => [v, fmt(v, 0)]), sd.round.dn, 'w-dn')}${mm}`)}
    ${pick(sd, 'insulation', 'Dämmung', c.insulation)}${pick(sd, 'core', 'Kern', c.core)}${pick(sd, 'L', 'Länge L', c.L)}`;
}

function manualForm(sd) {
  return designRow('Δp', html`${numField('data-sf', 'manual.dp', sd.manual.dp, { placeholder: '–', cls: 'w-mm', label: 'Δp' })}<span class="unit">Pa</span>`);
}

function fillDesign() {
  const sd = selected();
  if (!sd) return;
  const res = pathResult();
  const r = res.rows.get(sd.id);
  const flow = $('[data-design="flow"]');
  if (flow) flow.textContent = r.flow > 0 ? `V̇ ${fmt(r.flow, 0)} m³/h` : 'V̇ –';
  // the front view gives the size of the silencer itself (with a free side the input shows the maximum)
  const view = $('[data-design="view"]');
  if (view) view.innerHTML = sd.kind === 'rect' ? rectFrontView({ ...sd.rect }, r) : roundFrontView(r.row);
  const kv = (k, v) => html`<dt>${raw(k)}</dt><dd>${v}</dd>`;
  const values = [];
  if (sd.kind === 'rect') values.push(kv('n', r.n ? fmt(r.n, 0) : '–'), kv('s′', r.gap != null ? `${fmtLimit(r.gap)} mm` : '–'), kv('A<sub>frei</sub>', r.aFree ? `${fmt(r.aFree, 3)} m²` : '–'));
  if (sd.kind === 'round') values.push(kv('A<sub>frei</sub>', r.aFree ? `${fmt(r.aFree, 3)} m²` : '–'));
  if (sd.kind === 'round' && r.row?.overallLength) values.push(kv('L gesamt', `${fmt(r.row.overallLength, 0)} mm`));
  if (sd.kind === 'round' && r.row?.dOuterMax) values.push(kv('Ø aussen max.', `${fmt(r.row.dOuterMax, 0)} mm`));
  if (sd.kind !== 'manual') values.push(kv('v', r.v != null ? `${db(r.v)} m/s` : '–'), kv('Δp', r.dp != null ? `${fmt(r.dp, 0)} Pa` : '–'));
  values.push(kv(`L<sub>WA</sub> Strömung${r.flowNoiseEstimated ? ' (geschätzt)' : ''}`, r.lwaFlow != null ? `${db(r.lwaFlow)} dB(A)` : '–'));
  if (r.noiseMargin != null) values.push(kv('Abstand zum Pegel', `${db(r.noiseMargin)} dB`));
  $('[data-design="values"]').innerHTML = String(html`${values}`);
  const box = $('[data-design="variants"]');
  if (box) box.innerHTML = String(variantsHtml(sd, r));
}

/** Variants of the selected silencer (calc.js silencerVariants); `r` is its current result. */
function variantsHtml(sd, r) {
  const v = silencerVariants(inputs(), path().id, sd.id);
  ui.variants = v?.list ?? [];
  if (!v) return '';
  const rect = sd.kind === 'rect';
  const h = rect ? variantHousing(sd) : null;
  const kept = rect
    ? [h.fixB ? `B ${fmt(h.B, 0)}` : '', h.fixH ? `H ${fmt(h.H, 0)}` : '', `L ${fmt(sd.rect.L, 0)}`]
    : [`Ø ${fmt(sd.round.dn, 0)}`];
  const title = html`<h4 class="sub">Varianten <span class="muted">${kept.filter(Boolean).join(' | ')}</span></h4>`;
  if (v.missing) return html`${title}<p class="muted small">${v.missing === 'geometry' ? (rect ? 'B × H fehlt' : 'Ø fehlt') : 'V̇ fehlt'}</p>`;
  if (!v.list.length) return html`${title}<p class="muted small">–</p>`;
  const sized = rect && !(h.fixB && h.fixH);
  const same = (c) => (rect
    ? c.spec.d === sd.rect.d && c.n === r.n && c.spec.L === sd.rect.L && c.spec.B === sd.rect.B && c.spec.H === sd.rect.H
    : c.spec.insulation === sd.round.insulation && (c.spec.core ?? null) === (sd.round.core ?? null) && c.spec.L === sd.round.L);
  const head = rect
    ? html`<th class="n">d</th><th class="n">n</th><th class="n">s′</th>${sized ? html`<th class="n">B × H</th>` : ''}`
    : html`<th>Dämmung</th><th class="n">Kern</th><th class="n">L</th>`;
  const rows = v.list.map((c, i) => html`<tr class="${c.ok ? '' : 'is-miss'} ${same(c) ? 'is-current' : ''}" data-act="take" data-i="${i}" tabindex="0">
    ${rect
      ? html`<td class="n">${fmt(c.spec.d, 0)}</td><td class="n">${c.n}</td><td class="n">${fmtLimit(c.gap)}</td>${sized ? html`<td class="n">${fmt(c.spec.B, 0)} × ${fmt(c.spec.H, 0)}</td>` : ''}`
      : html`<td>${c.spec.insulation}</td><td class="n">${c.spec.core ?? '–'}</td><td class="n">${fmt(c.spec.L, 0)}</td>`}
    <td class="n">${c.v != null ? db(c.v) : '–'}</td><td class="n">${c.dp != null ? fmt(c.dp, 0) : '–'}</td>
    <td class="n ${c.margin == null ? '' : c.margin >= 0 ? 'is-ok' : 'is-over'}">${icon(c.ok ? 'check' : 'warning', { size: 12, label: c.ok ? 'Bedingungen eingehalten' : 'Bedingungen nicht eingehalten' })}${Number.isFinite(c.lpa) ? db(c.lpa) : '–'}</td>
  </tr>`);
  return html`${title}
    <table class="var-table"><thead><tr>${head}<th class="n">v</th><th class="n">Δp</th><th class="n">L<sub>pA</sub></th></tr></thead><tbody>${rows}</tbody></table>`;
}

// ---- issues -----------------------------------------------------------------------

function renderIssues() {
  if (!issuePanel) return;
  const calculationNotes = ui.result.issues.map((issue) => {
    const at = labelOf(issue.pathId, issue.rowId);
    return {
      id: `${issue.pathId}:${issue.rowId ?? 'receiver'}:${issue.code}:${issue.period ?? ''}`,
      severity: issue.severity,
      text: issueText(issue, at),
      summary: issueSummary(issue, at),
      run: () => gotoRow(issue.pathId, issue.rowId),
    };
  });
  const fileNotes = ui.fileNotes.map((note) => ({
    ...note,
    severity: 'warning',
    summary: note.action === 'update-rows' ? 'Herstellerdaten geändert' : note.text,
    action: note.action === 'update-rows'
      ? { icon: 'reset', label: 'Aktuelle Herstellerdaten übernehmen', run: updateRows }
      : undefined,
    run: note.action === 'update-rows' ? () => {
      const first = staleRows(inputs())[0];
      if (first) gotoRow(first.pathId, first.rowId);
    } : undefined,
    dismiss: () => {
      ui.fileNotes = ui.fileNotes.filter((item) => item.id !== note.id);
      renderIssues();
    },
  }));
  issuePanel.update([...fileNotes, ...calculationNotes]);
}

/** Overview stays short; exact values remain in the list and at the receiver. */
function issueSummary(issue, at) {
  const p = at ? `${at}: ` : '';
  switch (issue.code) {
    case 'branch-flow': return `${p}V̇ nach Abzweig zu hoch`;
    case 'gap-deviation': return `${p}Spalt weicht von Herstellerdaten ab`;
    case 'height-dp': return `${p}Δp für andere Bauhöhe`;
    case 'velocity-high': return `${p}Geschwindigkeit zu hoch`;
    case 'dp-high': return `${p}Druckverlust zu hoch`;
    case 'flow-noise': return `${p}Strömungsgeräusch zu hoch`;
    case 'target-exceeded': return `${p}Zielwert${issue.period ? ` ${issue.period === 'day' ? 'Tag' : 'Nacht'}` : ''} überschritten`;
    default: return issueText(issue, at);
  }
}

function gotoRow(pathId, rowId) {
  if (pathId !== ui.pathId) {
    ui.pathId = pathId;
    ui.selectedId = null;
    renderAll();
  }
  const target = rowId ? $(`#levels tbody[data-id="${CSS.escape(rowId)}"]`) : $('#receiver');
  if (!target) return;
  if (rowId && rowById(rowId)?.type === 'silencer') select(rowId);
  target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  target.classList.remove('flash');
  void target.offsetWidth;
  target.classList.add('flash');
  $('input', target)?.focus({ preventScroll: true });
}

// ============================================================================
// Editing
// ============================================================================

const getPath = (obj, key) => key.split('.').reduce((o, k) => o?.[k], obj);
function setPath(obj, key, v) {
  const keys = key.split('.');
  const last = keys.pop();
  keys.reduce((o, k) => o[k], obj)[last] = v;
}

/** Parse a number input; marks it invalid and returns undefined if it is not a number (or negative where not allowed). */
function readNumber(target, { allowNegative = false } = {}) {
  const v = parseNum(target.value);
  const bad = Number.isNaN(v) || (v != null && v < 0 && !allowNegative);
  target.setAttribute('aria-invalid', bad ? 'true' : 'false');
  return bad ? undefined : v;
}

/** Select a silencer for the design panel without rebuilding the table (focus stays). */
function select(id) {
  if (ui.selectedId === id) return;
  ui.selectedId = id;
  for (const b of $$('#levels tbody.row')) b.classList.toggle('is-selected', b.dataset.id === id);
  renderDesign();
  fillDesign();
}

/** After a change of the silencer selection: move to an existing data row and store a copy of it. */
function refreshSilencer(sd) {
  if (sd.kind === 'rect') sd.rect = snapRect(sd.rect);
  if (sd.kind === 'round') sd.round = snapRound(sd.round);
  Object.assign(sd, normalizeRow(sd));
}

const RECEIVER_NUMS = new Set(['r', 'area', 'volume', 'reverb', 'target', 'lsv.hoursDay', 'lsv.hoursNight']);
const RECEIVER_SELECT_NUMS = new Set(['q', 'lsv.es', 'lsv.k2', 'lsv.k3']);

function bindWork() {
  const work = $('#work');

  work.addEventListener('input', (e) => {
    const t = e.target;
    if (t.tagName === 'SELECT' || t.type === 'checkbox') return;
    let changed = false;
    const host = t.closest('tbody[data-id]');
    const row = host && rowById(host.dataset.id);
    if (row && t.dataset.edit) {
      const v = readNumber(t, { allowNegative: true });
      if (v !== undefined) {
        getPath(row, t.dataset.edit)[Number(t.dataset.i)] = v;
        changed = true;
      }
    } else if (row && t.dataset.f === 'name') {
      row.name = t.value;
      changed = true;
      if (row.id === ui.selectedId) $('#design h3').textContent = rowLabel(row);
    } else if (row && t.dataset.f) {
      const v = readNumber(t, { allowNegative: t.dataset.f === 'dl' });
      if (v !== undefined) {
        row[t.dataset.f] = v;
        changed = true;
      }
    } else if (t.dataset.pf) {
      const p = path();
      if (t.dataset.pf === 'name') {
        p.name = t.value;
        changed = true;
      } else {
        const v = readNumber(t);
        if (v !== undefined) {
          p.flow = v;
          changed = true;
        }
      }
    } else if (t.dataset.rf) {
      const rc = path().receiver;
      if (t.dataset.rf === 'name') {
        rc.name = t.value;
        changed = true;
      } else if (RECEIVER_NUMS.has(t.dataset.rf)) {
        const v = readNumber(t);
        if (v !== undefined) {
          setPath(rc, t.dataset.rf, t.dataset.rf.startsWith('lsv.hours') && v != null ? Math.min(12, v) : v);
          changed = true;
        }
      }
    } else if (t.dataset.sf) {
      const sd = selected();
      const v = readNumber(t);
      if (sd && v !== undefined) {
        setPath(sd, t.dataset.sf, v);
        if (t.dataset.sf === 'rect.s' || t.dataset.sf === 'rect.B' || t.dataset.sf === 'rect.H') {
          Object.assign(sd, normalizeRow(sd));
        }
        changed = true;
      }
    }
    if (changed) {
      recalc();
      store.touch();
    }
  });

  work.addEventListener('change', (e) => {
    const t = e.target;
    if (t.tagName === 'SELECT' && t.dataset.rf) {
      const rc = path().receiver;
      setPath(rc, t.dataset.rf, RECEIVER_SELECT_NUMS.has(t.dataset.rf) ? Number(t.value) : t.value);
      // the design value of SIA 2024 exists for some room uses only
      if (t.dataset.rf === 'room.type' && rc.room.requirement === 'design' && inputs().catalogs.roomTypes.find((x) => x.id === rc.room.type)?.design == null) {
        rc.room.requirement = 'min';
      }
      commitAndRender();
      return;
    }
    if (t.tagName === 'SELECT' && t.dataset.sf) {
      const sd = selected();
      if (!sd) return;
      setPath(sd, t.dataset.sf, t.dataset.sf === 'install' ? t.value : Number(t.value));
      refreshSilencer(sd);
      commitAndRender();
      return;
    }
    if (t.type === 'checkbox' && t.dataset.rf) {
      setPath(path().receiver, t.dataset.rf, t.checked);
      commitAndRender();
      return;
    }
    // text and number fields: values were applied while typing
    store.commit();
    if (t.dataset.rf === 'volume' || t.dataset.rf === 'reverb' || t.dataset.rf === 'area') {
      renderReceiver();
      fillReceiver();
    }
    updateHistoryButtons();
  });

  work.addEventListener('focusin', (e) => {
    const host = e.target.closest('tbody[data-id]');
    if (host && rowById(host.dataset.id)?.type === 'silencer') select(host.dataset.id);
  });

  work.addEventListener('click', (e) => {
    const add = e.target.closest('[data-add]');
    if (add) {
      addRow(add.dataset.add);
      return;
    }
    const btn = e.target.closest('[data-act]');
    const host = e.target.closest('tbody[data-id]');
    if (host && rowById(host.dataset.id)?.type === 'silencer') select(host.dataset.id);
    if (!btn) return;
    const row = host && rowById(host.dataset.id);
    const sd = selected();
    switch (btn.dataset.act) {
      case 'delete':
        if (row) deleteRow(row.id);
        break;
      case 'unit':
        if (row) {
          const key = btn.dataset.edit === 'lw' ? 'unit' : 'manual.unit';
          setPath(row, key, getPath(row, key) === 'dB' ? 'dBA' : 'dB');
          commitAndRender();
        }
        break;
      case 'basis':
        path().receiver.basis = btn.dataset.value;
        commitAndRender();
        break;
      case 'series':
        if (sd) {
          sd.kind = btn.dataset.kind;
          sd[sd.kind].series = btn.dataset.value;
          refreshSilencer(sd);
          commitAndRender();
        }
        break;
      case 'manual':
        if (sd) {
          sd.kind = 'manual';
          commitAndRender();
        }
        break;
      case 'fix':
        if (sd) {
          // a side that is set free starts with its current size as the maximum
          const side = btn.dataset.value;
          sd.design[`fix${side}`] = !sd.design[`fix${side}`];
          if (!sd.design[`fix${side}`]) sd.design[`max${side}`] = sd.rect[side];
          commitAndRender();
        }
        break;
      case 'spec':
        if (sd) {
          sd[sd.kind][btn.dataset.key] = Number(btn.dataset.value);
          refreshSilencer(sd);
          commitAndRender();
        }
        break;
      case 'take':
        takeVariant(Number(btn.dataset.i));
        break;
    }
  });

  work.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('tr[data-act="take"]')) {
      e.preventDefault();
      takeVariant(Number(e.target.dataset.i));
      return;
    }
    // Enter / Shift+Enter in the table: same octave in the next / previous editable line, like a spreadsheet
    if (e.key !== 'Enter' || e.target.tagName !== 'INPUT' || !e.target.closest('#levels')) return;
    e.preventDefault();
    const all = $$('#levels input');
    const same = all.filter((x) => (e.target.dataset.i != null ? x.dataset.i === e.target.dataset.i : x.dataset.f === e.target.dataset.f));
    const list = same.length > 1 ? same : all;
    const next = list[list.indexOf(e.target) + (e.shiftKey ? -1 : 1)];
    if (next) {
      next.focus();
      next.select?.();
    }
  });

  // Paste a row of values (from Excel: tab separated) into an octave cell: fills this and the next octaves.
  work.addEventListener('paste', (e) => {
    const t = e.target;
    if (!t.dataset?.edit) return;
    const text = e.clipboardData?.getData('text') ?? '';
    const parts = text.trim().split(/[\t;\n\r]+|\s{2,}/).filter(Boolean);
    if (parts.length < 2) return;
    e.preventDefault();
    const row = rowById(t.closest('tbody[data-id]').dataset.id);
    const arr = getPath(row, t.dataset.edit);
    let i = Number(t.dataset.i);
    for (const p of parts) {
      if (i > 7) break;
      const v = parseNum(p);
      if (!Number.isNaN(v)) arr[i] = v;
      i++;
    }
    commitAndRender();
  });

  bindRowDrag($('#levels'), {
    rows: 'tbody.row',
    handle: '.drag-handle',
    onDrop: (id, beforeId) => {
      if (moveBefore(path().rows, id, beforeId)) commitAndRender();
    },
  });
}

function takeVariant(i) {
  const c = ui.variants[i];
  const sd = selected();
  if (!c || !sd) return;
  sd[sd.kind] = { ...sd[sd.kind], ...c.spec };
  refreshSilencer(sd);
  commitAndRender();
}

function addRow(type) {
  const p = path();
  const row = newRow(inputs(), type);
  p.rows.push(row);
  if (type === 'silencer') ui.selectedId = row.id;
  commitAndRender();
  const body = $(`#levels tbody[data-id="${CSS.escape(row.id)}"]`);
  body?.scrollIntoView({ block: 'nearest' });
  $('input', body)?.focus({ preventScroll: true });
}

function deleteRow(id) {
  const rows = path().rows;
  const idx = rows.findIndex((r) => r.id === id);
  if (idx < 0) return;
  const [row] = rows.splice(idx, 1);
  commitAndRender();
  toast(`${rowLabel(row)} gelöscht`, { action: UNDO_ACTION });
}

function addPath() {
  const p = newPath(inputs());
  inputs().paths.push(p);
  ui.pathId = p.id;
  ui.selectedId = null;
  commitAndRender();
  $('[data-pf="name"]')?.focus();
}

function duplicateCurrentPath() {
  const copy = duplicatePath(inputs(), path());
  copy.name = `${pathLabel(path(), inputs().paths.indexOf(path()))} Kopie`;
  inputs().paths.splice(inputs().paths.indexOf(path()) + 1, 0, copy);
  ui.pathId = copy.id;
  ui.selectedId = null;
  commitAndRender();
}

function deleteCurrentPath() {
  const paths = inputs().paths;
  if (paths.length < 2) return;
  const i = paths.indexOf(path());
  const [p] = paths.splice(i, 1);
  ui.pathId = paths[Math.max(0, i - 1)].id;
  ui.selectedId = null;
  commitAndRender();
  toast(`${pathLabel(p, i)} gelöscht`, { action: UNDO_ACTION });
}

// ============================================================================
// Toolbar, keyboard
// ============================================================================

function bindToolbar() {
  const setIcon = (sel, name) => {
    $(sel).innerHTML = String(icon(name));
  };
  setIcon('[data-action="undo"]', 'undo');
  setIcon('[data-action="redo"]', 'redo');
  setIcon('[data-action="open"]', 'open');
  $('[data-action="export-pdf"]').innerHTML = String(html`${icon('save')}<span class="btn-label">PDF</span>`);
  setIcon('[data-action="menu"]', 'more');

  const menu = $('#more-menu');
  const closeMenu = () => {
    menu.classList.remove('open');
    $('[data-action="menu"]').setAttribute('aria-expanded', 'false');
  };
  document.addEventListener('click', async (e) => {
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
      case 'export-json': exportJson(); break;
      case 'export-pdf': exportPdf(); break;
      case 'export-csv': exportCsv(); break;
      case 'new': replaceDocument({ project: newProject(), inputs: emptyInputs() }, 'Neue Berechnung'); break;
      case 'example': replaceDocument(exampleDoc(), 'Beispiel geladen'); break;
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

// ============================================================================
// Start
// ============================================================================

async function start() {
  const handoff = takeHandoff();
  store = new DocumentStore(loadInitialDoc(), { draftKey: DRAFT_KEY });
  ui.pathId = inputs().paths[0]?.id ?? null;

  addThemeButton();
  mountSourceLink();
  issuePanel = createIssuePanel($('#issue-status'));
  calculationTabs = mountCalculationTabs($('#calculation-tabs'), {
    label: 'Wege',
    panelId: 'path-panel',
    onSelect: (id) => {
      if (id === ui.pathId) return;
      store.commit();
      ui.pathId = id;
      ui.selectedId = null;
      renderAll();
    },
    onAdd: addPath,
    onDuplicate: duplicateCurrentPath,
    onDelete: deleteCurrentPath,
  });
  projectView = mountProjectInfo($('#project'), {
    getProject: () => doc().project,
    onInput: () => store.touch(),
    onCommit: () => {
      store.commit();
      updateHistoryButtons();
    },
  });
  bindToolbar();
  bindWork();
  enableCombos($('#design'), (name) => name === 'gap' && selected()?.kind === 'rect' ? rectChoices(selected().rect).s : []);
  enableFileDrop(openFile);
  renderAll();
  if (handoff) await openEnvelope(handoff);
}

start();
