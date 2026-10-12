// SPDX-License-Identifier: AGPL-3.0-or-later
// Page controller of the PDF → DXF tool: settings panel, worker, preview, layer list, status line, export.
// The PDF never leaves the browser and is not stored; only the settings are kept as a draft.

import {
  TOOL_ID,
  SCALES,
  UNITS,
  ORIGINS,
  VERSIONS,
  PAGE_MODES,
  LAYER_MODES,
  TEXT_MODES,
  FILL_MODES,
  HATCH_MODES,
  CURVE_MODES,
  DASH_MODES,
  PRESET_NAMES,
  normalizeInputs,
  applyPreset,
  resetDocumentFields,
} from './defaults.js';
import { ACTIONS, SECTIONS, FIELDS, OPTIONS, ERRORS, STEPS, TITLE, warningText, saved } from './labels.js';
import { Preview } from './preview.js';
import { calibrate, scaleLabel, PT_MM } from './pipeline.js';
import { DocumentStore } from '../../lib/core/store.js';
import { fmt, parseNum, toInputValue } from '../../lib/core/format.js';
import { pickFile, download, enableFileDrop, takeFileHandoff } from '../../lib/core/files.js';
import { html, raw, icon, toast, bindThemeToggle, mountSourceLink } from '../../lib/core/ui.js';
import { enableCombos } from '../../lib/core/combo.js';

const DRAFT_KEY = `hlks-tools:${TOOL_ID}:draft`;
const $ = (sel, root = document) => root.querySelector(sel);
const isPdf = (b) => b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46; // %PDF

// ============================================================================
// Worker client
// ============================================================================

class Engine {
  constructor() {
    this.seq = 0;
    this.jobs = new Map();
    this.spawn();
  }
  spawn() {
    this.worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e) => {
      const { id, type } = e.data ?? {};
      const job = this.jobs.get(id);
      if (!job) return;
      if (type === 'progress') {
        job.onProgress?.(e.data.value, e.data.label);
        return;
      }
      this.jobs.delete(id);
      if (type === 'done') job.resolve(e.data.result);
      else job.reject(Object.assign(new Error(e.data.message), { code: e.data.code }));
    };
    this.worker.onerror = (e) => {
      e.preventDefault?.();
      for (const j of this.jobs.values()) j.reject(Object.assign(new Error(e.message || 'worker'), { code: 'worker' }));
      this.jobs.clear();
    };
  }
  call(type, args = {}, { transfer = [], onProgress } = {}) {
    const id = ++this.seq;
    const promise = new Promise((resolve, reject) => {
      this.jobs.set(id, { resolve, reject, onProgress });
      this.worker.postMessage({ id, type, ...args }, transfer);
    });
    return { id, type, promise };
  }
  cancel(id) {
    this.worker.postMessage({ type: 'cancel', target: id });
  }
  /** Hard stop: a running MuPDF call cannot be interrupted, so the worker is replaced. */
  restart() {
    this.worker.terminate();
    for (const j of this.jobs.values()) j.reject(Object.assign(new Error('cancelled'), { code: 'cancelled' }));
    this.jobs.clear();
    this.spawn();
  }
}

// ============================================================================
// State
// ============================================================================

const app = {
  engine: null,
  preview: null,
  store: null,
  file: null, // { name, bytes }
  info: null, // { pageCount, pages, layers }
  result: null, // last process result
  job: null, // running job
  busy: null, // { label, value, timer, visible }
  underlays: new Map(), // page → ImageBitmap
  underlayOn: new Map(), // page → boolean (shown)
  thumbs: new Map(), // page → canvas
  calib: null, // [p0, p1] while the length is asked
};

const S = () => app.store.doc.inputs;

const errorText = (e) => ERRORS[e?.code] ?? ERRORS.internal;

/** Settings that change the preview (all others only change the export). */
function previewKey(s) {
  const { scale, calibrated, unit, origin, trueColor, pages, layersOff, colorsOff, widthsOff, preset, ...rest } = s;
  return JSON.stringify(rest);
}

function loadInitialDoc() {
  const draft = DocumentStore.readDraft(DRAFT_KEY);
  // without a PDF the per-document fields (page, area, layers off) mean nothing
  return { inputs: resetDocumentFields(normalizeInputs(draft?.inputs)) };
}

// ============================================================================
// Settings
// ============================================================================

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => o?.[k], obj);
}

function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (const k of keys.slice(0, -1)) o = o[k] ??= {};
  o[keys.at(-1)] = value;
}

/** Change settings in place, normalise, record one undo step, then update the page. */
function change(mutate) {
  const before = previewKey(S());
  mutate(S());
  app.store.doc.inputs = normalizeInputs(S());
  app.store.commit();
  afterChange(before);
}

function afterChange(beforeKey) {
  renderSettings();
  renderToolbar();
  updateHistoryButtons();
  applyOff();
  app.preview.setArea(S().area);
  if (app.info && previewKey(S()) !== beforeKey) scheduleProcess();
}

const seg = (key, values, labels = {}) => html`
  <div class="seg" role="group">
    ${values.map((v) => html`<button type="button" data-key="${key}" data-value="${v}" aria-pressed="${String(getPath(S(), key) === v)}">${labels[v] ?? v}</button>`)}
  </div>`;

const select = (key, values, labels) => html`
  <select class="select" data-key="${key}">
    ${values.map((v) => html`<option value="${v}" ${raw(getPath(S(), key) === v ? 'selected' : '')}>${labels[v] ?? v}</option>`)}
  </select>`;

const toggle = (key, label, disabled = false) => html`
  <label class="toggle-row${disabled ? ' is-disabled' : ''}"><input type="checkbox" data-key="${key}" ${raw(getPath(S(), key) ? 'checked' : '')} ${raw(disabled ? 'disabled' : '')} />${label}</label>`;

const number = (key, label, unit, step = 'any') => html`
  <label class="field">
    <span class="field-label">${label} <span class="unit">${unit}</span></span>
    <input class="input num" data-key="${key}" inputmode="decimal" data-step="${step}" value="${toInputValue(getPath(S(), key))}" />
  </label>`;

const field = (label, control) => html`<div class="field"><span class="field-label">${label}</span>${control}</div>`;

function renderSettings() {
  const s = S();
  const host = $('#settings');
  const multi = (app.info?.pageCount ?? 0) > 1;
  const scaleShown = Math.round(s.scale * 100) / 100;
  host.innerHTML = String(html`
    ${multi
      ? html`<fieldset>
          <legend>${SECTIONS.pages}</legend>
          <div class="thumbs" id="thumbs">
            ${app.info.pages.map(
              (p, i) => html`<button type="button" class="thumb" data-page="${i}" aria-pressed="${String(i === s.page)}" title="${i + 1}"><span class="thumb-img" data-thumb="${i}"></span><span class="num">${i + 1}</span></button>`,
            )}
          </div>
          ${select('pages', PAGE_MODES, OPTIONS.pages)}
        </fieldset>`
      : ''}
    <fieldset>
      <legend>${SECTIONS.scale}</legend>
      <div class="scale-row">
        <label class="field">
          <span class="field-label">${FIELDS.scale}</span>
          <input class="input num" id="scale" data-combo="scales" role="combobox" aria-expanded="false" aria-controls="combo-list" inputmode="decimal" value="${toInputValue(scaleShown)}" />
        </label>
        <button type="button" class="btn icon-only${app.preview?.mode === 'calibrate' ? ' is-on' : ''}" data-action="calibrate" title="${ACTIONS.calibrate}" aria-label="${ACTIONS.calibrate}" aria-pressed="${String(app.preview?.mode === 'calibrate')}" ${raw(app.info ? '' : 'disabled')}>${icon('ruler')}</button>
      </div>
    </fieldset>
    <fieldset>
      <legend>${SECTIONS.output}</legend>
      ${field(FIELDS.unit, seg('unit', UNITS))}
      ${field(FIELDS.origin, seg('origin', ORIGINS, OPTIONS.origin))}
      ${field(FIELDS.version, seg('version', VERSIONS))}
      ${toggle('trueColor', FIELDS.trueColor, s.version === 'R12')}
    </fieldset>
    <fieldset>
      <legend>${SECTIONS.content}</legend>
      ${field(FIELDS.preset, select('preset', PRESET_NAMES, OPTIONS.preset))}
      ${field(FIELDS.layerMode, select('layerMode', LAYER_MODES, OPTIONS.layerMode))}
      ${toggle('hiddenLayers', FIELDS.hiddenLayers)}
      ${field(FIELDS.text, seg('text', TEXT_MODES, OPTIONS.text))}
      ${field(FIELDS.fills, seg('fills', FILL_MODES, OPTIONS.fills))}
      ${field(FIELDS.hatch, seg('hatch', HATCH_MODES, OPTIONS.hatch))}
      ${field(FIELDS.curves, seg('curves', CURVE_MODES, OPTIONS.curves))}
      ${field(FIELDS.dashes, seg('dashes', DASH_MODES, OPTIONS.dashes))}
      ${toggle('arcs', FIELDS.arcs)}
      ${toggle('clip', FIELDS.clip)}
      ${toggle('dedupe', FIELDS.dedupe)}
      ${toggle('join', FIELDS.join)}
      ${number('minLengthMm', FIELDS.minLengthMm, 'mm')}
    </fieldset>
    <details class="more" ${raw(app.tolOpen ? 'open' : '')}>
      <summary>${icon('chevron', { size: 14 })}${SECTIONS.tol}</summary>
      <div class="two">
        ${number('tol.join', FIELDS.tolJoin, 'mm')}
        ${number('tol.arc', FIELDS.tolArc, 'mm')}
        ${number('tol.flatten', FIELDS.tolFlatten, 'mm')}
      </div>
    </details>`);
  // clip is a boolean in the UI, a mode in the settings
  const clipBox = host.querySelector('[data-key="clip"]');
  if (clipBox) clipBox.checked = s.clip === 'apply';
  for (const [i, c] of app.thumbs) host.querySelector(`[data-thumb="${i}"]`)?.append(c);
}

function bindSettings() {
  const host = $('#settings');
  host.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-key][data-value]');
    if (b) {
      const { key, value } = b.dataset;
      change((s) => setPath(s, key, value));
      return;
    }
    const t = e.target.closest('.thumb');
    if (t) goToPage(Number(t.dataset.page));
  });
  host.addEventListener('change', (e) => {
    const el = e.target;
    if (el.id === 'scale') {
      const v = parseNum(el.value);
      if (v > 0) change((s) => ((s.scale = v), (s.calibrated = false)));
      else el.value = toInputValue(Math.round(S().scale * 100) / 100);
      return;
    }
    const key = el.dataset.key;
    if (!key) return;
    if (key === 'preset') {
      const before = previewKey(S());
      app.store.doc.inputs = applyPreset(S(), el.value);
      app.store.commit();
      afterChange(before);
      return;
    }
    if (key === 'clip') return change((s) => (s.clip = el.checked ? 'apply' : 'ignore'));
    if (el.type === 'checkbox') return change((s) => setPath(s, key, el.checked));
    if (el.tagName === 'SELECT') return change((s) => setPath(s, key, el.value));
    const v = parseNum(el.value);
    if (Number.isFinite(v)) change((s) => setPath(s, key, v));
    else el.value = toInputValue(getPath(S(), key));
  });
  host.addEventListener('toggle', (e) => {
    if (e.target.matches?.('details.more')) app.tolOpen = e.target.open;
  }, true);
}

// ============================================================================
// Toolbar, layer list, status
// ============================================================================

function renderToolbar() {
  const s = S();
  const n = app.info?.pageCount ?? 0;
  const bar = $('#stage-bar');
  const mode = app.preview?.mode ?? 'pan';
  const btn = (action, name, label, { pressed = null, disabled = false, hidden = false } = {}) =>
    hidden ? '' : html`<button type="button" class="btn ghost icon-only" data-action="${action}" title="${label}" aria-label="${label}" ${raw(pressed == null ? '' : `aria-pressed="${pressed}"`)} ${raw(disabled ? 'disabled' : '')}>${icon(name)}</button>`;
  const page = app.result?.page ?? s.page;
  bar.innerHTML = String(html`
    ${n > 1
      ? html`<div class="pager">
          ${btn('prev', 'back', ACTIONS.prev, { disabled: page <= 0 })}
          <span class="num">${page + 1} / ${n}</span>
          ${btn('next', 'chevron', ACTIONS.next, { disabled: page >= n - 1 })}
        </div>`
      : ''}
    <span class="scale-label num" title="${FIELDS.scale}">${scaleLabel(s.scale)}</span>
    <span class="bar-gap"></span>
    ${btn('fit', 'fit', ACTIONS.fit, { disabled: !app.info })}
    ${btn('calibrate', 'ruler', ACTIONS.calibrate, { pressed: mode === 'calibrate', disabled: !app.info })}
    ${btn('area', 'crop', ACTIONS.area, { pressed: mode === 'area', disabled: !app.info })}
    ${btn('area-clear', 'close', ACTIONS.areaClear, { hidden: !s.area })}
    ${btn('underlay', 'image', ACTIONS.underlay, { pressed: !!app.underlayOn.get(page), disabled: !app.info })}`);
  $('[data-action="export-dxf"]').disabled = !app.info;
}

function offSets() {
  const s = S();
  return { layers: s.layersOff, colors: s.colorsOff, widths: s.widthsOff };
}

function applyOff() {
  app.preview.setOff(offSets());
  renderLayers();
  renderStatus();
}

function renderLayers() {
  const host = $('#layers');
  const r = app.result;
  if (!r) {
    host.innerHTML = '';
    host.hidden = true;
    return;
  }
  host.hidden = false;
  const s = S();
  const off = new Set(s.layersOff);
  const colorsOff = new Set(s.colorsOff);
  const widthsOff = new Set(s.widthsOff);
  const sw = (rgb) => raw(`style="--sw: rgb(${rgb[0]} ${rgb[1]} ${rgb[2]})"`);
  host.innerHTML = String(html`
    <div class="lp-head"><h2>${SECTIONS.layers}</h2><span class="num muted">${r.layers.length}</span></div>
    <ul class="layer-list">
      ${r.layers.map(
        (l) => html`<li>
          <label class="layer-row${off.has(l.name) ? ' is-off' : ''}">
            <input type="checkbox" data-layer="${l.name}" ${raw(off.has(l.name) ? '' : 'checked')} />
            <span class="swatch" ${sw(l.rgb)}></span>
            <span class="lname" title="${l.name}">${l.name}${l.pdf && !l.visible ? html` <span class="muted">ausgeblendet</span>` : ''}</span>
            <span class="num lcount">${fmt(l.count)}</span>
          </label>
        </li>`,
      )}
    </ul>
    ${r.colors.length > 1
      ? html`<h3 class="lp-sub">${SECTIONS.colors}</h3>
          <div class="chips">
            ${r.colors.map((c) => html`<button type="button" class="chip" data-color="${c.hex}" aria-pressed="${String(!colorsOff.has(c.hex))}" title="${c.rgb.join(', ')}"><span class="swatch" ${sw(c.rgb)}></span><span class="num">${fmt(c.count)}</span></button>`)}
          </div>`
      : ''}
    ${r.widths.length > 1
      ? html`<h3 class="lp-sub">${SECTIONS.widths}</h3>
          <div class="chips">
            ${r.widths.map((w) => html`<button type="button" class="chip" data-width="${w.lw}" aria-pressed="${String(!widthsOff.has(w.lw))}"><span class="num">${fmt(w.lw / 100, 2)}</span></button>`)}
          </div>`
      : ''}`);
}

function bindLayers() {
  const host = $('#layers');
  host.addEventListener('change', (e) => {
    const name = e.target.dataset.layer;
    if (name == null) return;
    change((s) => {
      const set = new Set(s.layersOff);
      if (e.target.checked) set.delete(name);
      else set.add(name);
      s.layersOff = [...set];
    });
  });
  host.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    if (chip.dataset.color) {
      const hex = chip.dataset.color;
      change((s) => (s.colorsOff = s.colorsOff.includes(hex) ? s.colorsOff.filter((h) => h !== hex) : [...s.colorsOff, hex]));
    } else {
      const lw = Number(chip.dataset.width);
      change((s) => (s.widthsOff = s.widthsOff.includes(lw) ? s.widthsOff.filter((w) => w !== lw) : [...s.widthsOff, lw]));
    }
  });
}

/** Entities that will be exported: everything not switched off. */
function visibleCount() {
  const r = app.result;
  if (!r) return 0;
  const s = S();
  const lo = new Set(s.layersOff);
  const co = new Set(s.colorsOff);
  const wo = new Set(s.widthsOff);
  return r.buckets.reduce((n, b) => (lo.has(b.layer) || co.has(b.hex) || (!b.textOnly && wo.has(b.lw)) ? n : n + b.count), 0);
}

function renderStatus() {
  const host = $('#status');
  const busy = app.busy?.visible ? app.busy : null;
  const r = app.result;
  const parts = [];
  if (busy) {
    parts.push(html`<span class="progress"><i style="width:${Math.round((busy.value ?? 0) * 100)}%"></i></span>
      <span>${STEPS[busy.label] ?? ''}</span>
      <button type="button" class="icon-btn" data-action="cancel" title="${ACTIONS.cancel}" aria-label="${ACTIONS.cancel}">${icon('close', { size: 14 })}</button>`);
  } else if (r) {
    const ms = (r.stats.ms ?? 0) + (r.stats.extractMs ?? 0);
    parts.push(html`<span class="num">${fmt(r.stats.before)} → ${fmt(visibleCount())}</span>`);
    parts.push(html`<span class="num muted">${ms < 1000 ? `${fmt(ms)} ms` : `${fmt(ms / 1000, 1)} s`}</span>`);
    for (const w of r.warnings) parts.push(html`<span class="warn">${icon('warning', { size: 14 })}${warningText(w)}</span>`);
  }
  host.innerHTML = parts.map(String).join('');
}

// ============================================================================
// Busy state
// ============================================================================

function startBusy(job, label) {
  stopBusy();
  app.busy = { job, label, value: 0, visible: false };
  app.busy.timer = setTimeout(() => {
    if (app.busy?.job === job) {
      app.busy.visible = true;
      renderStatus();
    }
  }, 300);
}

function progress(job, value, label) {
  if (app.busy?.job !== job) return;
  app.busy.value = value;
  if (label) app.busy.label = label;
  if (app.busy.visible) renderStatus();
}

function stopBusy() {
  if (app.busy) clearTimeout(app.busy.timer);
  app.busy = null;
  renderStatus();
}

async function cancelWork() {
  app.job = null;
  stopBusy();
  app.engine.restart();
  if (app.file) {
    const copy = app.file.bytes.slice();
    try {
      await app.engine.call('open', { bytes: copy }, { transfer: [copy.buffer] }).promise;
    } catch (e) {
      toast(errorText(e), { kind: 'error' });
    }
  }
  toast(ERRORS.cancelled, { kind: 'info', timeout: 2500 });
}

// ============================================================================
// Document: open, process, pages, underlay, thumbnails
// ============================================================================

async function openFile(file) {
  if (!file) return;
  let bytes;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    toast(ERRORS.damaged, { kind: 'error' });
    return;
  }
  if (!isPdf(bytes)) {
    toast(ERRORS.notPdf, { kind: 'error' });
    return;
  }
  if (app.job) await cancelQuietly();
  const copy = bytes.slice();
  const job = app.engine.call('open', { bytes: copy }, { transfer: [copy.buffer], onProgress: (v, l) => progress(job, v, l) });
  startBusy(job, 'open');
  let info;
  try {
    info = await job.promise;
  } catch (e) {
    stopBusy();
    toast(errorText(e), { kind: 'error', timeout: 7000 });
    return;
  }
  stopBusy();
  app.file = { name: file.name || 'plan.pdf', bytes };
  app.info = info;
  app.result = null;
  app.underlays.clear();
  app.underlayOn.clear();
  app.thumbs.clear();
  app.calib = null;
  $('#calib-bar').hidden = true;
  app.preview.clear();
  app.preview.setMode('pan');
  document.title = `${app.file.name} – ${TITLE} – HLKS-Tools`;
  $('#empty').hidden = true;
  // per-document settings back to their defaults
  app.store.doc.inputs = resetDocumentFields(S());
  app.store.commit();
  renderSettings();
  renderToolbar();
  updateHistoryButtons();
  await runProcess();
  renderThumbs();
}

async function cancelQuietly() {
  app.job = null;
  stopBusy();
  app.engine.restart();
}

function scheduleProcess() {
  clearTimeout(app.procTimer);
  app.procTimer = setTimeout(runProcess, 120);
}

async function runProcess() {
  if (!app.info) return;
  if (app.job?.type === 'process') app.engine.cancel(app.job.id);
  const job = app.engine.call('process', { settings: S() }, { onProgress: (v, l) => progress(job, v, l) });
  app.job = job;
  startBusy(job, 'extract');
  try {
    const r = await job.promise;
    if (app.job !== job) return;
    const pageChanged = app.result?.page !== r.page;
    app.result = r;
    app.preview.setData({ width: r.width, height: r.height, buckets: r.buckets });
    if (pageChanged) {
      if (!app.underlayOn.has(r.page)) app.underlayOn.set(r.page, r.scanned);
      await showUnderlay();
    }
    applyOff();
    renderToolbar();
  } catch (e) {
    if (app.job === job && e.code !== 'cancelled') toast(errorText(e), { kind: 'error', timeout: 7000 });
  } finally {
    if (app.job === job) {
      app.job = null;
      stopBusy();
    }
  }
}

function goToPage(i) {
  if (!app.info || i < 0 || i >= app.info.pageCount || i === S().page) return;
  app.calib = null;
  $('#calib-bar').hidden = true;
  app.preview.setMode('pan');
  change((s) => {
    s.page = i;
    s.area = null; // the area belongs to one page
  });
}

/** Grey raster → canvas (for thumbnails and the underlay). */
function grayCanvas({ width, height, data }) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(width, height);
  for (let i = 0, j = 0; i < data.length; i++, j += 4) {
    img.data[j] = img.data[j + 1] = img.data[j + 2] = data[i];
    img.data[j + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

async function showUnderlay() {
  const page = app.result?.page;
  if (page == null) return;
  const on = !!app.underlayOn.get(page);
  app.preview.showUnderlay = on;
  if (on && !app.underlays.has(page)) {
    const p = app.info.pages[page];
    const dpi = Math.max(36, Math.min(150, Math.sqrt(6e6 / ((p.width * p.height) / 5184))));
    try {
      const r = await app.engine.call('render', { page, dpi }).promise;
      app.underlays.set(page, grayCanvas(r));
    } catch {
      /* no underlay */
    }
  }
  app.preview.setUnderlay(on ? (app.underlays.get(page) ?? null) : null);
}

async function renderThumbs() {
  if (!app.info || app.info.pageCount < 2) return;
  const info = app.info;
  for (let i = 0; i < info.pageCount; i++) {
    if (app.info !== info) return; // another PDF was opened
    const p = info.pages[i];
    const dpi = Math.max(4, (84 / Math.max(p.width, p.height)) * 72);
    try {
      const r = await app.engine.call('render', { page: i, dpi }).promise;
      const c = grayCanvas(r);
      app.thumbs.set(i, c);
      document.querySelector(`[data-thumb="${i}"]`)?.append(c);
    } catch {
      /* thumbnail missing */
    }
  }
}

// ============================================================================
// Calibration
// ============================================================================

function onCalibrate(p0, p1) {
  app.calib = [p0, p1];
  const bar = $('#calib-bar');
  const input = $('#calib-length');
  const realMm = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) * PT_MM * S().scale;
  input.value = toInputValue(Math.round(realMm * 10) / 10);
  bar.hidden = false;
  input.focus();
  input.select();
}

function applyCalibration() {
  const [p0, p1] = app.calib ?? [];
  const mm = parseNum($('#calib-length').value);
  const m = p0 && mm > 0 ? calibrate(p0[0], p0[1], p1[0], p1[1], mm) : null;
  if (!m) {
    $('#calib-length').setAttribute('aria-invalid', 'true');
    return;
  }
  $('#calib-length').removeAttribute('aria-invalid');
  endCalibration();
  change((s) => {
    s.scale = m;
    s.calibrated = true;
  });
}

function endCalibration() {
  app.calib = null;
  $('#calib-bar').hidden = true;
  app.preview.setCalibration(null);
  app.preview.setMode('pan');
}

// ============================================================================
// Export
// ============================================================================

async function exportDxf() {
  if (!app.info || !app.file) return;
  const job = app.engine.call('export', { settings: S(), name: app.file.name }, { onProgress: (v, l) => progress(job, v, l) });
  startBusy(job, 'page');
  try {
    const { files } = await job.promise;
    files.forEach((f, i) => setTimeout(() => download(f.bytes, f.name, 'application/dxf'), i * 400));
    toast(saved(files.map((f) => f.name).join(', ')), { kind: 'success' });
  } catch (e) {
    if (e.code !== 'cancelled') toast(errorText(e), { kind: 'error', timeout: 7000 });
  } finally {
    stopBusy();
  }
}

// ============================================================================
// History, toolbar, keyboard
// ============================================================================

function undo() {
  const before = previewKey(S());
  if (app.store.undo()) afterChange(before);
}

function redo() {
  const before = previewKey(S());
  if (app.store.redo()) afterChange(before);
}

function updateHistoryButtons() {
  $('[data-action="undo"]').disabled = !app.store.canUndo;
  $('[data-action="redo"]').disabled = !app.store.canRedo;
}

function setMode(mode) {
  const next = app.preview.mode === mode ? 'pan' : mode;
  if (next !== 'calibrate') {
    app.calib = null;
    $('#calib-bar').hidden = true;
    app.preview.setCalibration(null);
  }
  app.preview.setMode(next);
}

function bindActions() {
  const setIcon = (sel, name, text) => {
    $(sel).innerHTML = String(text ? html`${icon(name)}<span class="btn-label">${text}</span>` : icon(name));
  };
  setIcon('[data-action="undo"]', 'undo');
  setIcon('[data-action="redo"]', 'redo');
  setIcon('[data-action="open"]', 'open');
  setIcon('[data-action="export-dxf"]', 'save', 'DXF');
  $('#empty').innerHTML = String(html`<button type="button" class="btn primary big" data-action="open" title="${ACTIONS.open}">${icon('open')}<span>PDF</span></button>`);
  $('#calib-ok').innerHTML = String(icon('check'));
  $('#calib-cancel').innerHTML = String(icon('close'));

  document.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-action]');
    if (!a || a.disabled) return;
    switch (a.dataset.action) {
      case 'undo':
        undo();
        break;
      case 'redo':
        redo();
        break;
      case 'open':
        openFile(await pickFile('.pdf,application/pdf'));
        break;
      case 'export-dxf':
        exportDxf();
        break;
      case 'fit':
        app.preview.fit();
        break;
      case 'calibrate':
        setMode('calibrate');
        break;
      case 'area':
        setMode('area');
        break;
      case 'area-clear':
        change((s) => (s.area = null));
        break;
      case 'underlay': {
        const page = app.result?.page;
        if (page == null) break;
        app.underlayOn.set(page, !app.underlayOn.get(page));
        await showUnderlay();
        renderToolbar();
        break;
      }
      case 'prev':
        goToPage((app.result?.page ?? S().page) - 1);
        break;
      case 'next':
        goToPage((app.result?.page ?? S().page) + 1);
        break;
      case 'cancel':
        cancelWork();
        break;
      case 'calib-ok':
        applyCalibration();
        break;
      case 'calib-cancel':
        endCalibration();
        break;
    }
  });
  $('#calib-length').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      applyCalibration();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      endCalibration();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && app.preview.mode !== 'pan') {
      endCalibration();
      app.preview.setMode('pan');
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
      exportDxf();
    } else if (k === 'o') {
      e.preventDefault();
      pickFile('.pdf,application/pdf').then(openFile);
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
  app.store = new DocumentStore(loadInitialDoc(), { draftKey: DRAFT_KEY });
  addThemeButton();
  mountSourceLink();
  try {
    app.engine = new Engine();
  } catch {
    toast(ERRORS.worker, { kind: 'error', timeout: 10000 });
    return;
  }
  app.preview = new Preview($('#viewport'), {
    onCalibrate,
    onArea: (rect) => change((s) => (s.area = rect.map((v) => Math.round(v * 100) / 100))),
    onMode: () => {
      renderToolbar();
      renderSettings();
    },
  });
  bindActions();
  bindSettings();
  bindLayers();
  enableCombos(document.body, (name) => (name === 'scales' ? SCALES : []));
  enableFileDrop(openFile);
  renderSettings();
  renderToolbar();
  renderLayers();
  updateHistoryButtons();
  const handoff = await takeFileHandoff();
  if (handoff) await openFile(handoff);
}

start();
