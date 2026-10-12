// Page controller for the silencer tool.

import {
  compute,
  snapshotOf,
  staleRows,
  rowCopy,
  lookupRow,
  aWeighted,
  rectChoices,
  roundChoices,
  snapRect,
  snapRound,
  seriesOf,
  SPLITTER_SERIES,
  ROUND_SERIES,
  LSV_K1,
  CALC_VERSION,
  proposeSilencer,
  PROPOSE_DEFAULTS,
  pathTo,
} from './calc.js';
import {
  TOOL_ID,
  INPUT_VERSION,
  normalizeInputs,
  normalizeElement,
  emptyInputs,
  exampleInputs,
  newStrand,
  duplicateStrand,
  insertAfter,
  insertBefore,
  branchFrom,
  removeElement,
  moveElement,
  setPredecessor,
  subtreeOf,
  branchDepths,
  autoNumbers,
  DIRECTIVITIES,
  LSV_CORRECTIONS,
} from './defaults.js';
import {
  TYPE_LABELS,
  KIND_LABELS,
  INSTALL_LABELS,
  BASIS_LABELS,
  REQUIREMENT_LABELS,
  LSV_LIMIT_LABELS,
  PERIOD_LABELS,
  ES_LABELS,
  SEVERITY_LABELS,
  OCTAVE_LABELS,
  elementLabel,
  issueText,
  fmtLimit,
  spectrumSeries,
} from './labels.js';
import { buildCsv } from './csv.js';
import { renderSpectra } from './charts.js';
import { DocumentStore } from '../../lib/core/store.js';
import { fmt, parseNum, toInputValue, todayIso } from '../../lib/core/format.js';
import { createEnvelope, checkCompatibility, normalizeProject, EnvelopeError } from '../../lib/core/envelope.js';
import { readEnvelopeFromFile, pickFile, download, safeFileName, takeHandoff, stashHandoff, enableFileDrop } from '../../lib/core/files.js';
import { findTool, toolUrl } from '../../lib/core/registry.js';
import { mountProjectInfo, newProject } from '../../lib/core/project-info.js';
import { html, raw, icon, toast, bindThemeToggle } from '../../lib/core/ui.js';

const DRAFT_KEY = `hlks-tools:${TOOL_ID}:draft`;

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ui = {
  strandId: null,
  expanded: new Set(),
  result: null,
  proposal: { key: '', result: null }, // cache of the search in mode "Vorschlag"
};

let store;
let projectView;

const doc = () => store.doc;
const inputs = () => store.doc.inputs;
const strand = () => inputs().strands.find((s) => s.id === ui.strandId) ?? inputs().strands[0];
const elementById = (id) => strand().elements.find((e) => e.id === id);
const strandResult = () => ui.result.strands.find((s) => s.id === strand().id);
/** Element label for messages; with several strands the strand name comes first ("Fortluft | 3 Empfänger"). */
const labelOf = (id) => {
  const strands = inputs().strands;
  for (const [i, s] of strands.entries()) {
    const el = s.elements.find((e) => e.id === id);
    if (el) return strands.length > 1 ? `${s.name || `Strang ${i + 1}`} | ${elementLabel(el)}` : elementLabel(el);
  }
  return '';
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
  return { project: { ...newProject(), name: 'Beispiel Kilian' }, inputs: exampleInputs() };
}

const UNDO_ACTION = { icon: 'undo', label: 'Rückgängig', run: () => undo() };

function replaceDocument(next, message) {
  store.replace(next);
  ui.expanded.clear();
  ui.strandId = next.inputs.strands[0]?.id ?? null;
  showFileBanner([]);
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
  const next = { project: normalizeProject(env.project), inputs: normalizeInputs(env.inputs) };
  store.replace(next);
  ui.expanded.clear();
  ui.strandId = next.inputs.strands[0]?.id ?? null;
  const saved = env.snapshot?.worst?.lpa;
  const now = compute(next.inputs).worst?.lpa;
  if (typeof saved === 'number' && Number.isFinite(now) && Math.abs(saved - now) > 0.05) {
    notes.push(`LpA: gespeichert ${fmt(saved, 1)} dB(A), neu ${fmt(now, 1)} dB(A)`);
  }
  const stale = staleRows(next.inputs);
  const banner = notes.map((text) => ({ text }));
  if (stale.length) banner.push({ text: `Herstellerdaten geändert: ${stale.map((x) => labelOf(x.elementId)).join(', ')}`, action: 'update-rows' });
  showFileBanner(banner);
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

/** Notes after opening a file: [{ text, action? }]. An action adds an icon button to the note. */
function showFileBanner(notes) {
  const el = $('#file-banner');
  if (!notes.length) {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }
  el.hidden = false;
  el.innerHTML = String(html`<div class="banner">${icon('warning')}<div>${notes.map(
    (n) => html`<p>${n.text}${n.action === 'update-rows'
      ? html` <button class="btn ghost small icon-only" data-action="update-rows" title="Aktuelle Herstellerdaten übernehmen" aria-label="Aktuelle Herstellerdaten übernehmen">${icon('reset', { size: 14 })}</button>`
      : ''}</p>`,
  )}</div>
    <button class="btn ghost small icon-only" data-action="dismiss-banner" title="Schliessen" aria-label="Schliessen">${icon('close', { size: 14 })}</button></div>`);
}

/** Replace the stored data rows that differ from the current data (undoable). */
function updateRows() {
  let n = 0;
  for (const x of staleRows(inputs())) {
    const s = inputs().strands.find((st) => st.id === x.strandId);
    const el = s?.elements.find((e) => e.id === x.elementId);
    if (!el || x.missing) continue;
    el.row = rowCopy(lookupRow(el.kind, el.row), el.kind);
    n++;
  }
  showFileBanner([]);
  commitAndRender();
  toast(`${n} Schalldämpfer aktualisiert`, { action: UNDO_ACTION });
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
  if (!inputs().strands.some((s) => s.id === ui.strandId)) ui.strandId = inputs().strands[0]?.id ?? null;
  const focus = captureFocus();
  projectView.refresh();
  renderStrand();
  renderMode();
  renderTable();
  renderAddButtons();
  recalc();
  restoreFocus(focus);
}

function recalc() {
  ui.result = compute(inputs());
  updateResults();
  renderSummary();
  renderIssues();
  renderChart();
  updateHistoryButtons();
}

function updateHistoryButtons() {
  $('[data-action="undo"]').disabled = !store.canUndo;
  $('[data-action="redo"]').disabled = !store.canRedo;
}

// ---- focus keeping across re-renders -------------------------------------------

const FOCUS_ATTRS = ['data-field', 'data-p', 'data-spec', 'data-i', 'data-strand', 'data-act'];

function captureFocus() {
  const el = document.activeElement;
  if (!el || el === document.body) return null;
  const host = el.closest('[data-id]');
  const parts = [];
  for (const a of FOCUS_ATTRS) if (el.hasAttribute(a)) parts.push(`[${a}="${CSS.escape(el.getAttribute(a))}"]`);
  if (!parts.length) return null;
  return {
    host: host ? `[data-id="${CSS.escape(host.dataset.id)}"]` : null,
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

// ---- small builders ------------------------------------------------------------------

function numInput(attrs, value, { placeholder = '', unit = '', label } = {}) {
  return html`<label class="field">
    <span class="field-label">${label}${unit ? html` <span class="unit">${unit}</span>` : ''}</span>
    <input class="input num" type="text" inputmode="decimal" autocomplete="off" ${raw(attrs)} value="${toInputValue(value)}" placeholder="${placeholder}" />
  </label>`;
}

/** Inline parameter field: label, control, unit. */
function pf(label, control, unit = '') {
  return html`<label class="pf"><span class="pf-label">${raw(label)}</span>${control}${unit ? html`<span class="unit">${unit}</span>` : ''}</label>`;
}

function pInput(path, value, { placeholder = '', cls = '' } = {}) {
  return html`<input class="cell-input num ${cls}" type="text" inputmode="decimal" autocomplete="off" data-p="${path}" value="${toInputValue(value)}" placeholder="${placeholder}" />`;
}

function pSelect(path, options, selected, { cls = '' } = {}) {
  return html`<select class="cell-select ${cls}" data-p="${path}">${options.map(
    ([value, text]) => html`<option value="${value}" ${String(value) === String(selected) ? 'selected' : ''}>${text}</option>`,
  )}</select>`;
}

const numberOptions = (values) => values.map((v) => [v, fmt(v, 0)]);

// ---- strand ------------------------------------------------------------------------------

function renderStrand() {
  const s = strand();
  const strands = inputs().strands;
  const tabs = $('#strand-tabs');
  tabs.hidden = strands.length < 2;
  tabs.innerHTML = String(html`${strands.map(
    (x, i) => html`<button class="tab" role="tab" data-strand-tab="${x.id}" aria-selected="${x.id === s.id}">${x.name || `Strang ${i + 1}`}</button>`,
  )}`);
  $('#strand-actions').innerHTML = String(html`
    <button class="btn small ghost icon-only" data-action="add-strand" title="Neuer Strang" aria-label="Neuer Strang">${icon('plus', { size: 14 })}</button>
    <button class="btn small ghost icon-only" data-action="duplicate-strand" title="Strang duplizieren" aria-label="Strang duplizieren">${icon('copy', { size: 14 })}</button>
    ${strands.length > 1 ? html`<button class="btn small ghost icon-only" data-action="delete-strand" title="Strang löschen" aria-label="Strang löschen">${icon('trash', { size: 14 })}</button>` : ''}`);
  $('#strand').innerHTML = String(html`
    <label class="field field-wide">
      <span class="field-label">Bezeichnung</span>
      <input class="input" type="text" data-strand="name" value="${s.name}" autocomplete="off" />
    </label>
    ${numInput('data-strand="flow"', s.flow, { label: 'V̇', unit: 'm³/h', placeholder: '–' })}
    ${numInput('data-strand="density"', inputs().density, { label: 'ρ', unit: 'kg/m³' })}`);
}

// ---- mode ----------------------------------------------------------------------------------

const MODE_LABELS = { check: 'Prüfen', propose: 'Vorschlag' };

function renderMode() {
  const mode = inputs().mode;
  $('#mode').innerHTML = String(html`${Object.entries(MODE_LABELS).map(
    ([m, label]) => html`<button class="seg-btn" role="radio" data-mode="${m}" aria-checked="${m === mode}">${label}</button>`,
  )}`);
}

/** The element searched in mode "Vorschlag" (in the strand shown), or null. */
function proposalElement() {
  if (inputs().mode !== 'propose') return null;
  return strand().elements.find((e) => e.type === 'silencer' && e.propose?.active) ?? null;
}

function proposal() {
  const el = proposalElement();
  if (!el) return null;
  const key = JSON.stringify(inputs()) + strand().id;
  if (ui.proposal.key !== key) ui.proposal = { key, result: proposeSilencer(inputs(), strand().id, el.id) };
  return ui.proposal.result;
}

// ---- elements table ------------------------------------------------------------------------

// Fixed column widths [px] (table-layout: fixed): large or wrong values are clipped instead of moving the layout.
const COLS = [
  { key: 'exp', cls: 'c-exp', w: 30 },
  { key: 'nr', label: 'Nr.', cls: 'c-nr', w: 50 },
  { key: 'el', label: 'Element', cls: 'c-el', w: 190 },
  { key: 'flow', label: 'V̇', unit: 'm³/h', cls: 'c-num', w: 78 },
  { key: 'line', label: '', unit: 'dB', cls: 'c-line', w: 74 },
  ...OCTAVE_LABELS.map((l) => ({ key: `o${l}`, label: l, unit: 'Hz', cls: 'c-oct', w: 54 })),
  { key: 'sum', label: 'Σ', unit: 'dB(A)', cls: 'c-sum', w: 66 },
  { key: 'v', label: 'v', unit: 'm/s', cls: 'c-out', w: 58 },
  { key: 'dp', label: 'Δp', unit: 'Pa', cls: 'c-out', w: 62 },
  { key: 'act', cls: 'c-act', w: 86 },
];
const LINE_SPAN = 12; // c-line … c-dp

function renderTable() {
  const table = $('#chain-table');
  const els = strand().elements;
  const head = html`<thead><tr>${COLS.map(
    (c) => html`<th class="${c.cls}" scope="col" style="width:${c.w}px">${c.label ? raw(c.label) : ''}${c.unit ? html`<span class="unit">${c.unit}</span>` : ''}</th>`,
  )}</tr></thead>`;
  const depth = branchDepths(els);
  const auto = autoNumbers(els);
  table.innerHTML = String(html`${head}${els.map((el) => elementHtml(el, Math.min(3, depth.get(el.id) ?? 0), auto.get(el.id)))}`);
}


function specInputs(path, values) {
  return OCTAVE_LABELS.map(
    (l, i) => html`<td class="c-oct"><input class="cell-input num" type="text" inputmode="decimal" autocomplete="off" data-spec="${path}" data-i="${i}" value="${toInputValue(values[i])}" aria-label="${l} Hz" /></td>`,
  );
}

const specOutputs = (key) => OCTAVE_LABELS.map((_, i) => html`<td class="c-oct out" data-out="${key}" data-i="${i}"></td>`);

/** One spectrum line: label, 8 octave cells, A-weighted sum, v, Δp. */
function line({ label, oct, sum = '', v = '', dp = '', cls = '' }) {
  return { cls, cells: html`<td class="c-line">${raw(label)}</td>${oct}<td class="c-sum">${sum}</td><td class="c-out">${v}</td><td class="c-out">${dp}</td>` };
}

const out = (key, extra = '') => raw(`<span data-out="${key}"${extra}></span>`);
const params = (content) => ({ cls: 'params-line', cells: html`<td class="c-params" colspan="${LINE_SPAN}"><div class="params">${content}</div></td>` });

/** The lines (table rows) of an element; the first one carries the element cells. */
function linesOf(el, isRoot) {
  const L = [];
  switch (el.type) {
    case 'source':
      L.push(line({ label: 'L<sub>W</sub>', oct: specInputs('lw', el.lw), sum: out('own', ' data-key="lw"') }));
      if (!isRoot) L.push(line({ label: 'nach', oct: specOutputs('lwOut'), sum: out('lwaOut'), cls: 'result' }));
      break;
    case 'component':
      L.push(line({ label: 'D', oct: specInputs('d', el.d) }));
      L.push(line({ label: 'L<sub>W</sub>', oct: specInputs('lw', el.lw), sum: out('own', ' data-key="lw"') }));
      L.push(line({ label: 'nach', oct: specOutputs('lwOut'), sum: out('lwaOut'), cls: 'result' }));
      break;
    case 'silencer': {
      L.push(params(silencerParams(el)));
      if (inputs().mode === 'propose' && el.propose?.active) {
        L.push(params(proposeParams(el)));
        L.push({ cls: 'cands-line', cells: html`<td class="c-cands" colspan="${LINE_SPAN}" data-out-html="cands"></td>` });
      }
      const manual = el.kind === 'manual';
      L.push(line({
        label: 'D<sub>e</sub>',
        oct: manual ? specInputs('manual.de', el.manual.de) : specOutputs('de'),
        v: out('v'),
        dp: manual ? pInput('manual.dp', el.manual.dp) : out('dp'),
      }));
      L.push(line({
        label: 'L<sub>W,Str</sub>',
        oct: manual ? specInputs('manual.lwFlow', el.manual.lwFlow) : specOutputs('lwFlow'),
        sum: out('lwaFlow'),
      }));
      L.push(line({ label: 'nach', oct: specOutputs('lwOut'), sum: out('lwaOut'), cls: 'result' }));
      break;
    }
    case 'receiver':
      L.push(params(receiverPlace(el)));
      L.push(params(receiverTarget(el)));
      L.push(line({ label: 'L<sub>p</sub>', oct: specOutputs('lp'), sum: out('lpa'), cls: 'result' }));
      for (const period of el.basis === 'lsv' ? ['day', 'night'] : [null]) {
        const key = period ?? 'single';
        L.push({
          cls: 'check-line',
          cells: html`<td class="c-line">${period ? PERIOD_LABELS[period] : 'Ziel'}</td>
            <td class="c-check" colspan="8" data-out="check-text" data-period="${key}"></td>
            <td class="c-sum" data-out="check-level" data-period="${key}"></td>
            <td class="c-status" colspan="2" data-out="check-status" data-period="${key}"></td>`,
        });
      }
      break;
  }
  return L;
}

function silencerParams(el) {
  const toggle =
    inputs().mode === 'propose'
      ? html`<button class="icon-btn toggle" data-act="propose" aria-pressed="${!!el.propose?.active}" title="Auslegen" aria-label="Auslegen">${icon('search', { size: 15 })}</button>`
      : '';
  const kind = html`${toggle}${pSelect('kind', Object.entries(KIND_LABELS), el.kind, { cls: 'w-kind' })}`;
  if (el.kind === 'rect') {
    const c = rectChoices(el.rect);
    return html`${kind}
      ${pSelect('rect.series', SPLITTER_SERIES.map((s) => [s.id, s.label]), el.rect.series, { cls: 'w-series' })}
      ${pf('d', pSelect('rect.d', numberOptions(c.d), el.rect.d), 'mm')}
      ${pf('s', pSelect('rect.s', numberOptions(c.s), el.rect.s), 'mm')}
      ${pf('L', pSelect('rect.L', numberOptions(c.L), el.rect.L), 'mm')}
      ${pf('n', pInput('rect.n', el.rect.n, { cls: 'w-n' }))}
      ${pf('H', pInput('rect.H', el.rect.H), 'mm')}
      ${pf('B', html`<span class="readout num" data-out="B"></span>`, 'mm')}
      ${pSelect('install', Object.entries(INSTALL_LABELS), el.install, { cls: 'w-install' })}`;
  }
  if (el.kind === 'round') {
    const c = roundChoices(el.round);
    const series = seriesOf('round', el.round.series);
    return html`${kind}
      ${pSelect('round.series', ROUND_SERIES.map((s) => [s.id, s.label]), el.round.series, { cls: 'w-series' })}
      ${pf('Ø', pSelect('round.dn', numberOptions(c.dn), el.round.dn), 'mm')}
      ${pf('L', pSelect('round.L', numberOptions(c.L), el.round.L), 'mm')}
      ${pf('Dämmung', pSelect('round.insulation', numberOptions(c.insulation), el.round.insulation), 'mm')}
      ${series?.core ? pf('Kern', pSelect('round.core', numberOptions(c.core), el.round.core), 'mm') : ''}`;
  }
  return kind;
}

/** Constraints of the search (mode "Vorschlag"). Empty fields: no limit, v and Δp: planning values. */
function proposeParams(el) {
  const p = el.propose;
  const v = html`${pf('v max', pInput('propose.vMax', p.vMax, { placeholder: toInputValue(PROPOSE_DEFAULTS.vMax) }), 'm/s')}
    ${pf('Δp max', pInput('propose.dpMax', p.dpMax, { placeholder: toInputValue(PROPOSE_DEFAULTS.dpMax) }), 'Pa')}`;
  if (el.kind === 'round') {
    return html`${pSelect('propose.series', [['', 'Alle Serien'], ...ROUND_SERIES.map((x) => [x.id, x.label])], p.series, { cls: 'w-series' })}
      ${pf('Ø von', pInput('propose.dnMin', p.dnMin, { placeholder: toInputValue(el.round.dn) }), 'mm')}
      ${pf('bis', pInput('propose.dnMax', p.dnMax, { placeholder: toInputValue(el.round.dn) }), 'mm')}
      ${pf('Aussen-Ø max', pInput('propose.dOuterMax', p.dOuterMax, { placeholder: '–' }), 'mm')}
      ${pf('L max', pInput('propose.lMax', p.lMax, { placeholder: '–' }), 'mm')}
      ${v}`;
  }
  return html`${pSelect('propose.series', [['', 'Alle Serien'], ...SPLITTER_SERIES.map((x) => [x.id, x.label])], p.series, { cls: 'w-series' })}
    ${pf('H', pInput('propose.H', p.H, { placeholder: toInputValue(el.rect.H) }), 'mm')}
    ${pf('B max', pInput('propose.bMax', p.bMax, { placeholder: '–' }), 'mm')}
    ${pf('L max', pInput('propose.lMax', p.lMax, { placeholder: '–' }), 'mm')}
    ${v}`;
}

/** Candidates of the search: the best 10, or the closest one if nothing fits. */
function candidatesHtml(el) {
  const res = proposal();
  if (!res) return '';
  const list = res.fitting.length ? res.fitting.slice(0, 10) : res.closest ? [res.closest] : [];
  const vMax = el.propose.vMax ?? PROPOSE_DEFAULTS.vMax;
  const dpMax = el.propose.dpMax ?? PROPOSE_DEFAULTS.dpMax;
  const series = (c) => seriesOf(c.kind, c.spec.series)?.label ?? c.spec.series;
  const geometry = (c) =>
    c.kind === 'rect'
      ? html`${c.spec.d}/${c.spec.s}/${c.spec.L} <span class="muted">n ${c.spec.n} | B ${fmt(c.B, 0)}</span>`
      : html`Ø ${c.spec.dn} | ${c.spec.L} | ${c.spec.insulation}${c.spec.core ? html` | T ${c.spec.core}` : ''} <span class="muted">Ø<sub>a</sub> ${fmt(c.row.dOuter, 0)}</span>`;
  const over = (bad) => (bad ? 'over' : '');
  const reserve = (c) =>
    c.margin == null
      ? '–'
      : html`<span class="${c.margin < -0.05 ? 'is-over' : 'is-ok'}">${icon(c.margin < -0.05 ? 'error' : 'check', { size: 13 })}${fmt(Math.abs(c.margin), 1)}</span>`;
  return html`<div class="cands">
    <p class="cands-count num">${res.fitting.length} / ${res.tried}</p>
    ${list.length
      ? html`<table class="cands-table">
      <thead><tr><th>Produkt</th><th>Geometrie <span class="unit">mm</span></th><th class="n">D<sub>e</sub> <span class="unit">dB</span></th>
        <th class="n">v <span class="unit">m/s</span></th><th class="n">Δp <span class="unit">Pa</span></th><th class="n">L<sub>WA,Str</sub> <span class="unit">dB(A)</span></th>
        <th class="n">Reserve <span class="unit">dB</span></th><th></th></tr></thead>
      <tbody>${list.map((c, i) => html`<tr class="${c.ok ? '' : 'is-miss'}">
        <td>${series(c)}</td><td class="num">${geometry(c)}</td><td class="n num de">${c.de.map((x) => fmt(x, 0)).join(' ')}</td>
        <td class="n num ${over(!(c.v <= vMax + 1e-9))}">${fmt(c.v, 1)}</td><td class="n num ${over(!(c.dp <= dpMax + 1e-9))}">${fmt(c.dp, 0)}</td>
        <td class="n num ${over(c.noiseMargin != null && c.noiseMargin < 10 - 1e-9)}">${c.lwaFlow != null ? fmt(c.lwaFlow, 1) : '–'}</td>
        <td class="n num reserve">${reserve(c)}</td>
        <td><button class="btn small icon-only" data-act="take" data-cand="${i}" title="Übernehmen" aria-label="Übernehmen">${icon('check', { size: 14 })}</button></td>
      </tr>`)}</tbody></table>`
      : ''}
  </div>`;
}

function receiverPlace(el) {
  const area = el.area == null && el.volume > 0 && el.reverb > 0 ? toInputValue(Math.round(((0.163 * el.volume) / el.reverb) * 10) / 10) : '';
  return html`${pf('r', pInput('r', el.r), 'm')}
    ${pf('Q', pSelect('q', DIRECTIVITIES.map((q) => [q, q]), el.q))}
    ${pf('A', pInput('area', el.area, { placeholder: area || '–' }), 'm²')}
    ${pf('V', pInput('volume', el.volume, { placeholder: '–' }), 'm³')}
    ${pf('T', pInput('reverb', el.reverb, { placeholder: '–' }), 's')}`;
}

function receiverTarget(el) {
  const basis = pSelect('basis', Object.entries(BASIS_LABELS), el.basis, { cls: 'w-basis' });
  if (el.basis === 'room') {
    const cat = inputs().catalogs;
    const sens = Object.fromEntries(cat.sensitivities.map((s) => [s.id, s.name]));
    const types = cat.roomTypes.map((t) => [t.id, `${t.id} ${t.name} (${t.sensitivity === 'none' ? 'keine' : sens[t.sensitivity] ?? t.sensitivity})`]);
    const room = cat.roomTypes.find((t) => t.id === el.room.type);
    if (!room) types.unshift([el.room.type, '–']);
    const reqs = Object.entries(REQUIREMENT_LABELS).filter(([k]) => k !== 'design' || room?.design != null);
    return html`${basis}
      ${pSelect('room.type', types, el.room.type, { cls: 'w-room' })}
      ${room?.sensitivity !== 'none' ? pSelect('room.requirement', reqs, el.room.requirement) : ''}`;
  }
  if (el.basis === 'lsv') {
    const k = LSV_CORRECTIONS.map((v) => [v, v]);
    return html`${basis}
      ${pSelect('lsv.es', Object.entries(ES_LABELS), el.lsv.es)}
      ${pSelect('lsv.limit', Object.entries(LSV_LIMIT_LABELS), el.lsv.limit, { cls: 'w-limit' })}
      <label class="pf check"><input type="checkbox" data-p="lsv.business" ${el.lsv.business ? 'checked' : ''} /><span>Betriebsraum</span></label>
      ${pf('K2', pSelect('lsv.k2', k, el.lsv.k2))}
      ${pf('K3', pSelect('lsv.k3', k, el.lsv.k3))}
      ${pf('t Tag', pInput('lsv.hoursDay', el.lsv.hoursDay, { placeholder: '12' }), 'h')}
      ${pf('t Nacht', pInput('lsv.hoursNight', el.lsv.hoursNight, { placeholder: '12' }), 'h')}`;
  }
  return html`${basis}${pf('L<sub>pA</sub> ≤', pInput('target', el.target, { placeholder: '–' }), 'dB(A)')}`;
}

function elementHtml(el, level, autoNr) {
  const isRoot = !el.after;
  const lines = linesOf(el, isRoot);
  const n = lines.length;
  const open = ui.expanded.has(el.id);
  const label = elementLabel(el) || TYPE_LABELS[el.type];
  const flow = isRoot
    ? html`<span class="inherited num" data-out="flow"></span>`
    : html`<input class="cell-input num" type="text" inputmode="decimal" autocomplete="off" data-field="flow" value="${toInputValue(el.flow)}" aria-label="Volumenstrom" />
      <span class="split num" data-out="split"></span>`;
  const lead = html`
    <td class="c-exp" rowspan="${n}"><button class="exp-btn" data-act="toggle" aria-expanded="${open}" aria-label="Details zu ${label}" title="Details">${icon('chevron', { size: 14 })}</button></td>
    <td class="c-nr ${level ? 'is-branch' : ''}" rowspan="${n}" style="--level:${level}"><input class="cell-input" type="text" data-field="nr" value="${el.nr}" placeholder="${autoNr ?? ''}" aria-label="Nummer" autocomplete="off" /></td>
    <td class="c-el" rowspan="${n}"><div class="el-name" title="${TYPE_LABELS[el.type]}">${icon(el.type, { size: 16, label: TYPE_LABELS[el.type] })}
      <input class="cell-input" type="text" data-field="name" value="${el.name}" placeholder="${TYPE_LABELS[el.type]}" aria-label="Bezeichnung" autocomplete="off" /></div></td>
    <td class="c-num c-flow" rowspan="${n}">${flow}</td>`;
  const act = html`<td class="c-act" rowspan="${n}">
    <button class="icon-btn" data-act="insert" title="Danach einfügen" aria-label="Danach einfügen" aria-haspopup="true">${icon('plus', { size: 15 })}</button><button class="icon-btn" data-act="branch" title="Abzweig" aria-label="Abzweig hinzufügen" aria-haspopup="true">${icon('branch', { size: 15 })}</button><button class="icon-btn" data-act="delete" title="Löschen" aria-label="Löschen">${icon('trash', { size: 15 })}</button></td>`;
  const rows = lines.map((l, i) => html`<tr class="line ${l.cls} ${i === 0 ? 'first' : ''}">${i === 0 ? lead : ''}${l.cells}${i === 0 ? act : ''}</tr>`);
  return html`<tbody class="el el-${el.type}" data-id="${el.id}">${rows}${open ? detailRowHtml(el) : ''}</tbody>`;
}

/** Possible predecessors: every element that is not the element itself or after it. */
function afterOptions(el) {
  const els = strand().elements;
  const blocked = subtreeOf(els, el.id);
  blocked.add(el.id);
  return els.filter((o) => !blocked.has(o.id)).map((o) => html`<option value="${o.id}" ${o.id === el.after ? 'selected' : ''}>${elementLabel(o)}</option>`);
}

function detailRowHtml(el) {
  const els = strand().elements;
  const kids = els.filter((e) => e.after === el.id);
  const canUp = !!el.after && els.find((e) => e.after === el.after) === el;
  const canDown = kids.length === 1;
  const extra =
    el.type === 'silencer' && el.kind === 'rect'
      ? html`<div class="detail-fields">${pf('B fix', pInput('rect.B', el.rect.B, { placeholder: '–' }), 'mm')}</div>`
      : '';
  const values = (el.type === 'silencer' && el.kind !== 'manual') || el.type === 'receiver' ? html`<dl class="kv" data-out-html="values"></dl>` : '';
  const structure = el.after
    ? html`<div class="detail-fields">
        ${pf('Vorgänger', html`<select class="cell-select w-after" data-field="after">${afterOptions(el)}</select>`)}
        ${pf('ΔL Abzweig', pInput('split', el.split, { placeholder: '–' }), 'dB')}
      </div>`
    : '';
  return html`<tr class="detail-row"><td colspan="${COLS.length}"><div class="detail">
    ${values}${extra}${structure}
    <div class="detail-actions">
      <button class="btn small icon-only" data-act="up" title="Nach oben" aria-label="Nach oben" ${canUp ? '' : 'disabled'}>${icon('up', { size: 14 })}</button>
      <button class="btn small icon-only" data-act="down" title="Nach unten" aria-label="Nach unten" ${canDown ? '' : 'disabled'}>${icon('down', { size: 14 })}</button>
    </div>
  </div></td></tr>`;
}

// ---- live result cells ------------------------------------------------------------------

const db = (v) => fmt(v, 1);

function cellText(key, r, el, i) {
  switch (key) {
    case 'lwOut': case 'de': case 'lwFlow': case 'lp': {
      const s = r[key];
      return s ? db(s[i]) : '–';
    }
    case 'lwaOut': return db(r.lwaOut);
    case 'lwaFlow': return r.lwaFlow != null ? db(r.lwaFlow) : '–';
    case 'lpa': return r.lpa != null ? db(r.lpa) : '–';
    case 'v': return r.v != null ? fmt(r.v, 1) : '';
    case 'dp': return r.dp != null ? fmt(r.dp, 0) : '–';
    case 'B': return r.B != null ? fmt(r.B, 0) : '–';
    case 'flow': return r.flow != null ? fmt(r.flow, 0) : '–';
    case 'split': return r.split ? `${fmt(r.split, 1)} dB` : '';
    default: return '';
  }
}

function updateResults() {
  const res = strandResult();
  if (!res) return;
  for (const body of $$('#chain-table tbody[data-id]')) {
    const r = res.elements.get(body.dataset.id);
    const el = elementById(body.dataset.id);
    if (!r || !el) continue;
    body.classList.toggle('has-error', r.issues.some((i) => i.severity === 'error'));
    body.classList.toggle('has-warning', r.issues.some((i) => i.severity === 'warning'));
    for (const cell of body.querySelectorAll('[data-out]')) {
      const key = cell.dataset.out;
      if (key === 'own') {
        const lwa = aWeighted(el[cell.dataset.key].map((v) => v ?? -Infinity));
        cell.textContent = Number.isFinite(lwa) ? db(lwa) : '–';
      } else if (key.startsWith('check-')) {
        fillCheck(cell, key, r, el);
      } else {
        cell.textContent = cellText(key, r, el, Number(cell.dataset.i));
      }
      if (key === 'v') cell.classList.toggle('over', r.issues.some((i) => i.code === 'velocity-high'));
      if (key === 'dp') cell.classList.toggle('over', r.issues.some((i) => i.code === 'dp-high'));
      if (key === 'lwaFlow') cell.classList.toggle('over', r.issues.some((i) => i.code === 'flow-noise'));
    }
    const flowInput = body.querySelector('[data-field="flow"]');
    if (flowInput) flowInput.placeholder = r.flow != null && el.flow == null ? toInputValue(r.flow) : '';
    const values = body.querySelector('[data-out-html="values"]');
    if (values) values.innerHTML = String(valuesHtml(el, r));
    const cands = body.querySelector('[data-out-html="cands"]');
    if (cands) cands.innerHTML = String(candidatesHtml(el));
  }
}

function fillCheck(cell, key, r, el) {
  const period = cell.dataset.period === 'single' ? null : cell.dataset.period;
  const c = r.checks?.find((x) => x.period === period);
  cell.classList.remove('is-ok', 'is-over');
  if (!c) {
    cell.innerHTML = key === 'check-text' ? String(html`<span class="muted">${checkBasisText(el, period)}</span>`) : '–';
    return;
  }
  if (key === 'check-text') {
    cell.innerHTML = String(html`<span class="muted">${checkBasisText(el, period)}</span>`);
  } else if (key === 'check-level') {
    cell.textContent = db(c.level);
  } else {
    const ok = c.status === 'ok';
    cell.classList.add(ok ? 'is-ok' : 'is-over');
    cell.innerHTML = String(html`${icon(ok ? 'check' : 'error', { size: 14, label: ok ? 'eingehalten' : 'überschritten' })}<span class="num">${ok ? '≤' : '>'} ${fmtLimit(c.limit)}</span>`);
  }
}

/** What the target is: "LpA | LH mittel, Mindest", "Lr = LpA + K1 5 + K2 0 + K3 0 | ES II, Planungswert". */
function checkBasisText(el, period) {
  if (el.basis === 'room') {
    const cat = inputs().catalogs;
    const t = cat.roomTypes.find((x) => x.id === el.room.type);
    const s = t && cat.sensitivities.find((x) => x.id === t.sensitivity);
    if (!t) return '–';
    if (!s) return html`L<sub>H</sub> keine Anforderung`;
    if (el.room.requirement === 'design' && t.design != null) return html`L<sub>pA</sub> | L<sub>H</sub> empfohlene Auslegung SIA 2024`;
    return html`L<sub>pA</sub> | L<sub>H</sub> ${s.name}, ${REQUIREMENT_LABELS[el.room.requirement]}`;
  }
  if (el.basis === 'lsv') {
    const hours = el.lsv[period === 'day' ? 'hoursDay' : 'hoursNight'] ?? 12;
    if (!(hours > 0)) return 'kein Betrieb';
    const t = hours < 12 ? ` | t ${fmt(hours, 1)} h` : '';
    const bonus = el.lsv.business && el.lsv.es <= 3 ? ' + 5' : '';
    return html`L<sub>r</sub> = L<sub>pA</sub> + K1 ${LSV_K1[period]} + K2 ${el.lsv.k2} + K3 ${el.lsv.k3}${t} | ${ES_LABELS[el.lsv.es]}, ${LSV_LIMIT_LABELS[el.lsv.limit]}${bonus}`;
  }
  return el.target != null ? html`L<sub>pA</sub>` : '–';
}

function valuesHtml(el, r) {
  const rows = [];
  if (el.type === 'silencer' && r.row) {
    const series = seriesOf(el.kind, r.row.series);
    rows.push(['Produkt', series?.label ?? r.row.series]);
    if (el.kind === 'rect') {
      rows.push(['Breite B', r.B != null ? `${fmt(r.B, 0)} mm` : '–']);
      rows.push(['Freier Querschnitt', r.aFree != null ? `${fmt(r.aFree, 3)} m²` : '–']);
      rows.push(['Ansichtsfläche B·H', r.face != null ? `${fmt(r.face, 3)} m²` : '–']);
      rows.push(['Spaltgeschwindigkeit v<sub>s</sub>', r.v != null ? `${fmt(r.v, 2)} m/s` : '–']);
      rows.push(['ζ', r.zeta != null ? fmt(r.zeta, 3) : '–']);
      rows.push(['Einbaufaktor', r.installFactor != null ? fmt(r.installFactor, 1) : '–']);
    } else {
      rows.push(['Querschnitt Rohr', `${fmt(r.area, 4)} m²`]);
      rows.push(['Freier Querschnitt', `${fmt(r.aFree, 4)} m²`]);
      rows.push(['v Rohr', r.vDuct != null ? `${fmt(r.vDuct, 2)} m/s` : '–']);
      rows.push(['v frei', r.v != null ? `${fmt(r.v, 2)} m/s` : '–']);
      if (r.lambda != null) rows.push(['λ', fmt(r.lambda, 4)]);
      if (r.zeta != null) rows.push(['ζ', fmt(r.zeta, 3)]);
      rows.push(['Aussen-Ø', r.row.dOuter != null ? `${fmt(r.row.dOuter, 0)} mm` : '–']);
    }
    rows.push(['L<sub>WA,Str</sub>', r.lwaFlow != null ? `${fmt(r.lwaFlow, 1)} dB(A)` : '–']);
    rows.push(['Daten', r.row.dataVersion]);
  }
  if (el.type === 'receiver') {
    rows.push(['A', r.area != null ? `${fmt(r.area, 1)} m²` : '–']);
    rows.push(['10·lg(Q/4πr² + 4/A)', r.term != null ? `${fmt(r.term, 2)} dB` : '–']);
    rows.push(['L<sub>pA</sub>', r.lpa != null ? `${fmt(r.lpa, 1)} dB(A)` : '–']);
  }
  return html`${rows.map(([k, v]) => html`<dt>${raw(k)}</dt><dd class="num">${v}</dd>`)}`;
}

// ---- summary strip ------------------------------------------------------------------------

function renderSummary() {
  const w = ui.result.worst;
  const el = w && allElement(w.elementId);
  if (!w || !el) {
    $('#summary').innerHTML = String(html`<div class="rs-main"><span class="rs-label">L<sub>pA</sub></span><span class="rs-value num muted">–</span></div>`);
    return;
  }
  const what = w.period ? html`L<sub>r</sub> ${PERIOD_LABELS[w.period]}` : html`L<sub>pA</sub>`;
  const name = labelOf(el.id);
  const value = w.level ?? w.lpa;
  let target = html`<div class="rs-target"><span class="rs-label">Ziel</span><span class="rs-value num muted">–</span></div>`;
  let status = '';
  if (w.target != null) {
    target = html`<div class="rs-target"><span class="rs-label">Ziel | ${targetLabel(el, w.period)}</span><span class="rs-value num">${fmtLimit(w.target)}<small>dB(A)</small></span></div>`;
    const ok = w.status === 'ok';
    status = html`<div class="rs-status ${ok ? 'is-good' : 'is-bad'}"><span class="rs-label">${ok ? 'Reserve' : 'Überschreitung'}</span>
      <span class="rs-value num">${icon(ok ? 'check' : 'error')}${fmt(Math.abs(w.margin), 1)}<small>dB</small></span></div>`;
  }
  $('#summary').innerHTML = String(html`
    <div class="rs-main"><span class="rs-label">${what} | ${name}</span><span class="rs-value num">${fmt(value, 1)}<small>dB(A)</small></span></div>
    ${target}${status}`);
}

function allElement(id) {
  for (const s of inputs().strands) {
    const el = s.elements.find((e) => e.id === id);
    if (el) return el;
  }
  return null;
}

function targetLabel(el, period) {
  if (el.basis === 'room') {
    const t = inputs().catalogs.roomTypes.find((x) => x.id === el.room.type);
    return `${t ? `${t.id} ${t.name}` : ''}, ${REQUIREMENT_LABELS[el.room.requirement]}`;
  }
  if (el.basis === 'lsv') return `${ES_LABELS[el.lsv.es]}, ${LSV_LIMIT_LABELS[el.lsv.limit]}, ${PERIOD_LABELS[period]}`;
  return BASIS_LABELS.manual;
}

// ---- issues ------------------------------------------------------------------------------

function renderIssues() {
  const order = { error: 0, warning: 1, info: 2 };
  const list = [...ui.result.issues].sort((a, b) => order[a.severity] - order[b.severity]);
  $('#issues-block').hidden = !list.length;
  const severityIcon = (i) => icon(i.severity === 'info' ? 'info' : i.severity === 'error' ? 'error' : 'warning', { label: SEVERITY_LABELS[i.severity] });
  $('#issues').innerHTML = String(html`${list.map((i) => {
    const text = issueText(i, i.elementId ? labelOf(i.elementId) : '');
    return html`<li class="issue issue-${i.severity}">${i.elementId
      ? html`<button class="issue-jump" data-goto="${i.elementId}" data-goto-strand="${i.strandId}">${severityIcon(i)}<span>${text}</span>${icon('jump')}</button>`
      : html`${severityIcon(i)}<span>${text}</span>`}</li>`;
  })}`);
}

function gotoElement(id, strandId) {
  if (strandId && strandId !== ui.strandId) {
    ui.strandId = strandId;
    renderAll();
  }
  const body = $(`#chain-table tbody[data-id="${CSS.escape(id)}"]`);
  if (!body) return;
  body.scrollIntoView({ block: 'center' });
  body.classList.add('flash');
  setTimeout(() => body.classList.remove('flash'), 900);
  body.querySelector('input:not([type="checkbox"]), select')?.focus({ preventScroll: true });
}

// ---- chart --------------------------------------------------------------------------------

let chartFrame = 0;
function renderChart() {
  cancelAnimationFrame(chartFrame);
  chartFrame = requestAnimationFrame(() => {
    const series = chartSeries();
    $('#spectrum-panel').hidden = !series.length;
    if (series.length) renderSpectra($('#spectrum-chart'), series);
  });
}

/** Spectra along the path to the governing receiver of the strand (same as in the PDF). */
function chartSeries() {
  const res = strandResult();
  if (!res || !res.order.length) return [];
  return spectrumSeries(strand(), res, pathTo(res, res.worstId ?? res.order[res.order.length - 1]));
}

// ============================================================================
// Editing
// ============================================================================

const NUMERIC_P = new Set([
  'rect.n', 'rect.H', 'rect.B', 'rect.d', 'rect.s', 'rect.L', 'round.dn', 'round.L', 'round.insulation', 'round.core',
  'manual.dp', 'split', 'r', 'q',
  'propose.H', 'propose.bMax', 'propose.lMax', 'propose.dnMin', 'propose.dnMax', 'propose.dOuterMax', 'propose.vMax', 'propose.dpMax', 'area', 'volume', 'reverb', 'target', 'lsv.es', 'lsv.k2', 'lsv.k3', 'lsv.hoursDay', 'lsv.hoursNight',
]);

const getPath = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj);
function setPath(obj, path, v) {
  const keys = path.split('.');
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

/** After a change of the silencer selection: move to an existing data row and store a copy of it. */
function refreshSilencer(el) {
  if (el.kind === 'rect') el.rect = snapRect(el.rect);
  if (el.kind === 'round') el.round = snapRound(el.round);
  Object.assign(el, normalizeElement(el));
}

function bindTable() {
  const table = $('#chain-table');

  table.addEventListener('input', (e) => {
    const t = e.target;
    const host = t.closest('[data-id]');
    const el = host && elementById(host.dataset.id);
    if (!el || t.tagName === 'SELECT' || t.type === 'checkbox') return;
    let changed = false;
    if (t.dataset.spec) {
      const v = readNumber(t, { allowNegative: true });
      if (v !== undefined) {
        getPath(el, t.dataset.spec)[Number(t.dataset.i)] = v;
        changed = true;
      }
    } else if (t.dataset.p && NUMERIC_P.has(t.dataset.p)) {
      const v = readNumber(t);
      if (v !== undefined) {
        setPath(el, t.dataset.p, v);
        changed = true;
      }
    } else if (t.dataset.field === 'flow') {
      const v = readNumber(t);
      if (v !== undefined) {
        el.flow = v;
        changed = true;
      }
    } else if (t.dataset.field === 'name' || t.dataset.field === 'nr') {
      el[t.dataset.field] = t.value;
      changed = true;
    }
    if (changed) {
      recalc();
      store.touch();
    }
  });

  table.addEventListener('change', (e) => {
    const t = e.target;
    const host = t.closest('[data-id]');
    const el = host && elementById(host.dataset.id);
    if (!el) return;
    if (t.dataset.field === 'after') {
      setPredecessor(strand(), el.id, t.value);
      commitAndRender();
      return;
    }
    if (t.tagName === 'SELECT' && t.dataset.p) {
      setPath(el, t.dataset.p, NUMERIC_P.has(t.dataset.p) ? Number(t.value) : t.value);
      if (el.type === 'silencer' && !t.dataset.p.startsWith('propose.')) refreshSilencer(el);
      // the design value of SIA 2024 exists for some room uses only
      if (t.dataset.p === 'room.type' && el.room.requirement === 'design' && inputs().catalogs.roomTypes.find((x) => x.id === el.room.type)?.design == null) {
        el.room.requirement = 'min';
      }
      commitAndRender();
      return;
    }
    if (t.type === 'checkbox' && t.dataset.p) {
      setPath(el, t.dataset.p, t.checked);
      commitAndRender();
      return;
    }
    // text and number fields: values were applied while typing
    store.commit();
    if (['flow', 'volume', 'reverb', 'area'].includes(t.dataset.field ?? t.dataset.p)) renderAll();
    else updateHistoryButtons();
  });

  table.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const id = btn.closest('[data-id]')?.dataset.id;
    if (!id || !elementById(id)) return;
    switch (btn.dataset.act) {
      case 'toggle':
        if (ui.expanded.has(id)) ui.expanded.delete(id);
        else ui.expanded.add(id);
        renderAll();
        break;
      case 'insert':
        openTypeMenu(btn, (type) => afterInsert(insertAfter(inputs(), strand(), id, type, overridesFor(type))));
        break;
      case 'branch':
        openTypeMenu(btn, (type) => afterInsert(branchFrom(inputs(), strand(), id, type, overridesFor(type))));
        break;
      case 'up':
      case 'down':
        if (moveElement(strand(), id, btn.dataset.act === 'up' ? -1 : 1)) commitAndRender();
        break;
      case 'delete': deleteEl(id); break;
      case 'propose': toggleProposal(id); break;
      case 'take': takeCandidate(id, Number(btn.dataset.cand)); break;
    }
  });

  // Enter / Shift+Enter: same octave (or field) in the next / previous element, like a spreadsheet
  table.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return;
    e.preventDefault();
    const all = $$('#chain-table input:not([type="checkbox"])');
    const same = all.filter((x) => (e.target.dataset.i != null ? x.dataset.i === e.target.dataset.i && x.dataset.spec : x.dataset.field && x.dataset.field === e.target.dataset.field));
    const list = same.length > 1 ? same : all;
    const next = list[list.indexOf(e.target) + (e.shiftKey ? -1 : 1)];
    if (next) {
      next.focus();
      next.select?.();
    }
  });
}

// ---- proposal ----------------------------------------------------------------------------------

/** Search this element (and no other one); a second click ends the search. */
function toggleProposal(id) {
  const el = elementById(id);
  const on = !el.propose?.active;
  for (const s of inputs().strands) for (const e of s.elements) if (e.propose) e.propose.active = false;
  if (on) {
    if (el.kind === 'manual') {
      el.kind = 'rect';
      refreshSilencer(el);
    }
    el.propose = { ...(el.propose ?? {}), active: true };
    Object.assign(el, normalizeElement(el));
  }
  commitAndRender();
}

function takeCandidate(id, index) {
  const el = elementById(id);
  const res = proposal();
  const c = res?.fitting.length ? res.fitting[index] : res?.closest;
  if (!el || !c) return;
  el.kind = c.kind;
  el[c.kind] = { ...el[c.kind], ...c.spec };
  el.propose.active = false;
  refreshSilencer(el);
  commitAndRender();
  toast(`${elementLabel(el)}: ${seriesOf(c.kind, c.spec.series)?.label ?? c.spec.series}`, { kind: 'success', action: UNDO_ACTION });
}

// ---- structure -------------------------------------------------------------------------------

/** Start values of a new element. */
function overridesFor(type) {
  if (type === 'silencer') return { kind: 'rect', rect: { series: 'trox-xk', d: 200, s: 100, L: 1000, n: 4, H: 1000, B: null } };
  return {};
}

function afterInsert(el) {
  if (el.type === 'silencer') refreshSilencer(el);
  commitAndRender();
  const body = $(`#chain-table tbody[data-id="${CSS.escape(el.id)}"]`);
  body?.scrollIntoView({ block: 'nearest' });
  body?.querySelector('[data-spec], [data-p], [data-field="name"]')?.focus();
}

/** Buttons below the table: at the end of the last path, before a receiver that ends it. */
function addElement(type) {
  const s = strand();
  const last = s.elements[s.elements.length - 1];
  const el =
    last && type !== 'receiver' && last.type === 'receiver'
      ? insertBefore(inputs(), s, last.id, type, overridesFor(type))
      : insertAfter(inputs(), s, last?.id ?? null, type, overridesFor(type));
  afterInsert(el);
}

function deleteEl(id) {
  const el = removeElement(strand(), id);
  if (!el) return;
  ui.expanded.delete(id);
  commitAndRender();
  toast(`${elementLabel(el) || TYPE_LABELS[el.type]} gelöscht`, { action: UNDO_ACTION });
}

// Type menu of the insert and branch buttons: one popup for the page.
let typeMenu = null;

function openTypeMenu(anchor, run) {
  closeTypeMenu();
  const list = document.createElement('ul');
  list.className = 'menu-list type-menu';
  list.setAttribute('role', 'menu');
  list.innerHTML = String(html`${['source', 'component', 'silencer', 'receiver'].map(
    (t) => html`<li><button role="menuitem" data-type="${t}">${icon(t)}<span>${TYPE_LABELS[t]}</span></button></li>`,
  )}`);
  document.body.append(list);
  const r = anchor.getBoundingClientRect();
  const h = list.offsetHeight;
  list.style.left = `${Math.max(8, Math.min(r.right - list.offsetWidth, innerWidth - list.offsetWidth - 8))}px`;
  list.style.top = `${r.bottom + 4 + h > innerHeight ? Math.max(8, r.top - h - 4) : r.bottom + 4}px`;
  list.addEventListener('click', (e) => {
    const b = e.target.closest('[data-type]');
    if (!b) return;
    closeTypeMenu();
    run(b.dataset.type);
  });
  list.addEventListener('keydown', (e) => {
    const items = $$('button', list);
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
    } else if (e.key === 'Escape') {
      closeTypeMenu();
      anchor.focus();
    }
  });
  typeMenu = { list, anchor };
  list.querySelector('button').focus();
}

function closeTypeMenu() {
  typeMenu?.list.remove();
  typeMenu = null;
}

function renderAddButtons() {
  $('#add-buttons').innerHTML = String(html`${['source', 'component', 'silencer', 'receiver'].map(
    (t) => html`<button class="btn" data-add="${t}">${icon('plus')}${icon(t)}<span>${TYPE_LABELS[t]}</span></button>`,
  )}`);
}

function addStrand() {
  const s = newStrand(inputs());
  inputs().strands.push(s);
  ui.strandId = s.id;
  commitAndRender();
  $('[data-strand="name"]')?.focus();
}

function duplicateCurrentStrand() {
  const src = strand();
  const s = duplicateStrand(inputs(), src);
  s.name = src.name ? `${src.name} Kopie` : '';
  inputs().strands.splice(inputs().strands.indexOf(src) + 1, 0, s);
  ui.strandId = s.id;
  commitAndRender();
}

function deleteCurrentStrand() {
  const list = inputs().strands;
  if (list.length < 2) return;
  const idx = list.indexOf(strand());
  const [s] = list.splice(idx, 1);
  ui.strandId = list[Math.max(0, idx - 1)].id;
  commitAndRender();
  toast(`${s.name || `Strang ${idx + 1}`} gelöscht`, { action: UNDO_ACTION });
}

function bindStrand() {
  const root = $('#strand');
  root.addEventListener('input', (e) => {
    const key = e.target.dataset.strand;
    if (!key) return;
    if (key === 'name') strand().name = e.target.value;
    else {
      const v = readNumber(e.target);
      if (v === undefined) return;
      if (key === 'density') inputs().density = v > 0 ? v : 1.2;
      else strand().flow = v;
    }
    recalc();
    store.touch();
  });
  root.addEventListener('change', () => {
    store.commit();
    renderAll();
  });
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
    if (typeMenu && !e.target.closest('.type-menu') && !typeMenu.anchor.contains(e.target)) closeTypeMenu();
    const modeBtn = e.target.closest('[data-mode]');
    if (modeBtn) {
      inputs().mode = modeBtn.dataset.mode;
      commitAndRender();
      return;
    }
    const tab = e.target.closest('[data-strand-tab]');
    if (tab) {
      ui.strandId = tab.dataset.strandTab;
      renderAll();
      return;
    }
    const goto = e.target.closest('[data-goto]');
    if (goto) {
      gotoElement(goto.dataset.goto, goto.dataset.gotoStrand);
      return;
    }
    const add = e.target.closest('[data-add]');
    if (add && add.tagName === 'BUTTON') {
      addElement(add.dataset.add);
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
      case 'export-json': exportJson(); break;
      case 'export-pdf': exportPdf(); break;
      case 'export-csv': exportCsv(); break;
      case 'dismiss-banner': showFileBanner([]); break;
      case 'update-rows': updateRows(); break;
      case 'add-strand': addStrand(); break;
      case 'duplicate-strand': duplicateCurrentStrand(); break;
      case 'delete-strand': deleteCurrentStrand(); break;
      case 'new': replaceDocument({ project: newProject(), inputs: emptyInputs() }, 'Neue Berechnung'); break;
      case 'example': replaceDocument({ project: { ...newProject(), name: 'Beispiel Kilian' }, inputs: exampleInputs() }, 'Beispiel geladen'); break;
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
  addEventListener('scroll', () => closeTypeMenu(), true);
}

function bindResize() {
  let frame = 0;
  const ro = new ResizeObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => ui.result && renderChart());
  });
  ro.observe($('#spectrum-chart'));
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
  ui.strandId = inputs().strands[0]?.id ?? null;

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
  bindStrand();
  bindTable();
  bindResize();
  enableFileDrop(openFile);
  renderAll();
  if (handoff) await openEnvelope(handoff);
}

start();
