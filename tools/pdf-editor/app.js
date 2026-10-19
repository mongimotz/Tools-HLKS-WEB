// SPDX-License-Identifier: AGPL-3.0-or-later
// Page controller of the PDF-Editor: app bar, notice row, the EmbedPDF viewer (bridge.js), open and save,
// keyboard, start-page hand-over and → DXF. The PDF stays in this browser; only the edited PDF is saved.

import { TOOL_ID, normalizeSettings, formatDate } from './defaults.js';
import { ACTIONS, AUTOSAVE, DEFAULT_NAME, ENGINE_ERRORS, ERRORS, RESULTS, STATUS, SYMBOLS, TITLE, TOOLS, VIEWER_STRINGS, pageDeleted, progress, saved } from './labels.js';
import { DEBOUNCE_MS, slotKey, slotStore } from './autosave.js';
import { SWISS_DE } from './viewer-strings.js';
import { VIEWER_ICONS, currentScheme, defaultMeasure, followScheme, readAnnotColors, scalePresets, toolDefinitions, viewerFonts } from './theme.js';
import { mountViewer } from './bridge.js';
import { WorkerClient } from './client.js';
import { installSymbols, installStamps } from './library.js';
import * as ui from './tools-ui.js';
import { pickFile, download, enableFileDrop, takeFileHandoff, stashFileHandoff } from '../../lib/core/files.js';
import { html, raw, icon, toast, bindThemeToggle, mountSourceLink } from '../../lib/core/ui.js';
import { createIssuePanel } from '../../lib/core/issues.js';
import { toolUrl } from '../../lib/core/registry.js';
import { fmt } from '../../lib/core/format.js';

const SETTINGS_KEY = `hlks-tools:${TOOL_ID}:settings`;
const $ = (sel, root = document) => root.querySelector(sel);
const isPdf = (b) => b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46; // %PDF

const app = {
  bridge: null,
  worker: new WorkerClient(),
  symbols: null, // Symbole panel
  colors: [], // --annot-1 … 9
  settings: null,
  issues: null,
  notices: new Map(),
  file: null, // { name, origin: { name, size }, password? } of the open document (password once a tool needed it)
  loading: false,
  busy: false, // a document tool runs
  dirty: false, // changed since the last save by the user
  slots: null, // autosave store (autosave.js)
  saveTimer: 0,
  pending: new Set(), // slots of opened files that wait for restore or discard
};

// ============================================================================
// Settings (browser draft)
// ============================================================================

function loadSettings() {
  try {
    return normalizeSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null'));
  } catch {
    return normalizeSettings(null);
  }
}

export function saveSettings(next) {
  app.settings = normalizeSettings(next);
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(app.settings));
  } catch {
    /* storage blocked: settings stay for this visit */
  }
}

// ============================================================================
// Notices
// ============================================================================

function setNotice(id, item) {
  if (item) app.notices.set(id, { id, ...item });
  else app.notices.delete(id);
  renderNotices();
}

function renderNotices() {
  const items = [...app.notices.values()];
  if (!items.length && !app.bridge?.hasDocument()) {
    const locked = app.bridge?.active()?.status === 'locked';
    app.issues.update([], { emptyText: locked ? STATUS.locked : app.loading ? STATUS.loading : STATUS.empty, emptyIcon: 'info' });
  } else {
    app.issues.update(items, { emptyText: 'Keine Hinweise', emptyIcon: 'check' });
  }
}

// ============================================================================
// Autosave (autosave.js): unsaved changes in IndexedDB, one slot per file
// ============================================================================

/** The slot the open document writes to, or null (no document, or its old slot waits for a decision). */
function liveKey() {
  const o = app.file?.origin;
  if (!o || !app.bridge?.hasDocument()) return null;
  const key = slotKey(o.name, o.size);
  return app.pending.has(key) ? null : key;
}

function markDirty() {
  app.dirty = true;
  updateUi();
  scheduleAutosave();
}

function scheduleAutosave() {
  clearTimeout(app.saveTimer);
  app.saveTimer = app.slots && app.dirty && liveKey() ? setTimeout(writeSlot, DEBOUNCE_MS) : 0;
}

async function writeSlot() {
  app.saveTimer = 0;
  const key = liveKey();
  if (!key || !app.dirty) return;
  let bytes;
  try {
    bytes = await app.bridge.bytes();
  } catch {
    return;
  }
  const { name, size } = app.file.origin;
  const ok = await app.slots.put({ key, name, size, bytes: bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes) });
  if (ok && !app.dirty) await app.slots.remove(key); // saved meanwhile
  setNotice('autosave-failed', ok ? null : { severity: 'warning', text: AUTOSAVE.failed, dismiss: () => setNotice('autosave-failed', null) });
  showSlots();
}

/** Write a waiting autosave now (another file opens, the page is hidden). */
async function flushAutosave() {
  if (!app.saveTimer) return;
  clearTimeout(app.saveTimer);
  await writeSlot();
}

const slotTime = (ms) => {
  const d = new Date(ms);
  return `${formatDate(d, app.settings.dateFormat)}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** One notice per slot except the one the open document writes to: restore or discard. */
async function showSlots() {
  const list = (await app.slots?.list()) ?? [];
  const live = liveKey();
  const shown = new Set();
  for (const s of list) {
    if (s.key === live) continue;
    shown.add(`slot:${s.key}`);
    app.notices.set(`slot:${s.key}`, {
      id: `slot:${s.key}`,
      severity: 'warning',
      text: AUTOSAVE.unsaved(s.name, slotTime(s.savedAt)),
      actions: [
        { icon: 'undo', label: ACTIONS.restore, run: () => restoreSlot(s.key) },
        { icon: 'trash', label: ACTIONS.discard, run: () => discardSlot(s.key) },
      ],
    });
  }
  for (const id of [...app.notices.keys()]) if (id.startsWith('slot:') && !shown.has(id)) app.notices.delete(id);
  renderNotices();
}

async function restoreSlot(key) {
  const slot = await app.slots.get(key);
  if (!slot) return showSlots();
  app.pending.delete(key);
  const { name, size } = slot.meta;
  if (await openBytes(slot.bytes, name, { origin: { name, size } })) toast(AUTOSAVE.restored(name), { kind: 'success' });
}

async function discardSlot(key) {
  await app.slots.remove(key);
  app.pending.delete(key);
  await showSlots();
  scheduleAutosave(); // the open file may write to this slot now
}

// ============================================================================
// Viewer
// ============================================================================

const hasDoc = (ctx) => ctx.documentId !== null;

function pageCommands() {
  const pages = () => app.bridge.pages;
  const cmd = (id, key, iconName, run) => ({ id: `hlks:${id}`, labelKey: `hlks.pages.${key}`, icon: iconName, enabled: hasDoc, run });
  return [
    cmd('page-rotate-left', 'rotateLeft', 'rotateCounterClockwise', () => pages().rotate(-90)),
    cmd('page-rotate-right', 'rotateRight', 'rotateClockwise', () => pages().rotate(90)),
    cmd('page-blank', 'insertBlank', 'pageBlank', () => pages().insertBlank()),
    cmd('page-duplicate', 'duplicate', 'copy', () => pages().duplicate()),
    cmd('page-up', 'moveUp', 'pageUp', () => pages().move(-1)),
    cmd('page-down', 'moveDown', 'pageDown', () => pages().move(1)),
    cmd('page-delete', 'delete', 'trash', deletePage),
  ];
}

/** Page edits are not in the viewer's history: a deleted page comes back through the toast. */
async function deletePage() {
  const removed = await app.bridge.pages.delete().catch(() => null);
  if (!removed) return;
  toast(pageDeleted(removed.index + 1), {
    timeout: 8000,
    action: { icon: 'undo', label: ACTIONS.undo, run: () => app.bridge.pages.restore(removed).catch(() => {}) },
  });
}

/** Tools this page does not need are removed; own tools and the page mode are added. */
function editLayout(layout) {
  let l = layout.tabs('never').remove(['document:open', 'document:download'], { from: 'document' });
  // undo / redo live in the app bar (shared control), not in every mode bar
  for (const bar of ['annotate', 'shapes', 'insert', 'form', 'redact']) l = l.remove(['history:undo', 'history:redo'], { from: bar });
  l = l.add('tool:cloud', { to: 'shapes', group: 'polygons' });
  l = l.add('tool:whiteout', { to: 'redact', group: 'redact', before: 'tool:redact' });
  l = l.addPanel('symbols', { side: 'end', titleKey: 'hlks.symbols', icon: 'symbols' });
  l = l.add('panel:symbols', { to: 'insert', group: 'stamps', after: 'tool:stamp' });
  return l.addBar('pages', {
    place: { with: 'main' },
    mode: 'pages',
    titleKey: 'hlks.mode.pages',
    center: [
      { id: 'rotate', items: ['hlks:page-rotate-left', 'hlks:page-rotate-right'], importance: 4 },
      { id: 'insert', items: ['hlks:page-blank', 'hlks:page-duplicate'], importance: 3 },
      { id: 'move', items: ['hlks:page-up', 'hlks:page-down'], importance: 3 },
      { id: 'delete', items: ['hlks:page-delete'], importance: 4 },
    ],
  });
}

function viewerConfig() {
  const colors = (app.colors = readAnnotColors());
  globalThis.HLKS_ANNOT_SWATCHES = colors; // the vendored style panel reads it (lib/vendor/embedpdf/PATCHES.md)
  return {
    locale: 'de',
    theme: currentScheme(),
    // own words also as the English fallback, which the viewer checks too
    strings: { de: { ...SWISS_DE, ...VIEWER_STRINGS }, en: VIEWER_STRINGS },
    icons: VIEWER_ICONS,
    engine: { fonts: viewerFonts() },
    commands: [
      { id: 'document:open', run: () => openPicked() },
      { id: 'document:download', run: () => save() },
      ...pageCommands(),
    ],
    layout: editLayout,
    plugins: {
      annotation: { tools: toolDefinitions(colors, app.settings.colors) },
      measurement: { presets: scalePresets(app.settings.scales), defaultScale: defaultMeasure() },
      // own stamps (stamps/ and the settings) instead of the viewer's standard set; signatures without
      // handwriting fonts (only IBM Plex is allowed), so they are drawn or uploaded
      stamp: { standard: false },
      signature: { fonts: [] },
    },
  };
}

/** Settings that the running viewer takes without a new mount: tool colours and plan scales. */
function applySettings() {
  const tools = app.bridge?.plugin('annotation')?.tools;
  for (const def of tools ? toolDefinitions(app.colors, app.settings.colors) : []) {
    try {
      tools.register(def);
    } catch {
      /* a tool the viewer refuses keeps its previous defaults */
    }
  }
  try {
    app.bridge?.plugin('measurement')?.updateSettings({ presets: scalePresets(app.settings.scales) });
  } catch {
    /* no document open: the presets apply with the next one (viewerConfig) */
  }
}

/** Symbol libraries once, the stamp library for the current settings and date; then the Symbole panel. */
async function installLibraries({ symbols = true } = {}) {
  const stamp = app.bridge?.plugin('stamp');
  if (!stamp) return;
  if (symbols) {
    try {
      await installSymbols(stamp);
      setNotice('symbols', null);
    } catch {
      setNotice('symbols', { severity: 'warning', text: SYMBOLS.installFailed });
    }
  }
  try {
    await installStamps(stamp, app.worker, app.settings, app.colors);
    setNotice('stamps', null);
  } catch {
    setNotice('stamps', { severity: 'warning', text: SYMBOLS.stampsFailed });
  }
  app.symbols?.render();
}

function openSettings() {
  ui.openSettingsDialog(app.settings, app.colors, (next) => {
    saveSettings(next);
    applySettings();
    installLibraries({ symbols: false });
  });
}

// ============================================================================
// Open, save, hand-over
// ============================================================================

async function openPicked() {
  openFile(await pickFile('.pdf,application/pdf'));
}

async function openFile(file) {
  if (!file || !app.bridge) return;
  if (/\.svg$/i.test(file.name) || file.type === 'image/svg+xml') {
    app.symbols?.addFiles([file]); // an SVG dropped anywhere becomes an own symbol
    return;
  }
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
  await openBytes(bytes, file.name || DEFAULT_NAME);
}

const openedOk = (doc) => doc && doc.status !== 'error' && doc.status !== 'failed';

/**
 * Open bytes as the document. A file the viewer cannot read is repaired by MuPDF in the worker and opened
 * again. `keep`: the same document after a document tool (name and password stay, it counts as changed).
 * `origin`: the autosave slot the document belongs to (a restored slot); else the file as opened.
 */
async function openBytes(bytes, name, { keep = false, password, origin } = {}) {
  if (!keep) await flushAutosave(); // the last changes of the document that closes
  app.loading = true;
  setNotice('open-failed', null);
  if (!keep) setNotice('history', null);
  const copy = bytes.slice(); // the viewer may take the buffer over
  try {
    let doc = await app.bridge.open(bytes, { name, password }).catch(() => null);
    let repaired = false;
    if (!openedOk(doc)) {
      const fixed = await app.worker.call('repair', { bytes: copy }, { transfer: [copy.buffer] }).promise.catch(() => null);
      if (fixed?.bytes) {
        doc = await app.bridge.open(fixed.bytes, { name }).catch(() => null);
        repaired = openedOk(doc);
      }
    }
    if (!openedOk(doc)) throw new Error('open');
    setNotice('open-failed', null); // the viewer reported the first attempt
    app.file = keep ? { ...app.file, name, password } : { name, origin: origin ?? { name, size: copy.length } };
    app.dirty = keep || repaired || !!origin;
    document.title = `${name} – ${TITLE} – HLKS-Tools`;
    if (repaired) setNotice('repaired', { severity: 'warning', text: RESULTS.repaired, dismiss: () => setNotice('repaired', null) });
    else if (!keep) setNotice('repaired', null);
    if (!keep && !origin) {
      // unsaved changes of this file from before: they wait for restore or discard and are not overwritten
      const key = slotKey(name, copy.length);
      if ((await app.slots?.list())?.some((s) => s.key === key)) app.pending.add(key);
    }
    showSlots();
    scheduleAutosave();
    return doc;
  } catch {
    app.file = null;
    document.title = `${TITLE} – HLKS-Tools`;
    setNotice('open-failed', { severity: 'error', text: ERRORS.damaged, dismiss: () => setNotice('open-failed', null) });
    return null;
  } finally {
    app.loading = false;
    updateUi();
  }
}

/** The open document's file name, always ending in .pdf. */
export function fileName() {
  const name = app.file?.name || DEFAULT_NAME;
  return /\.pdf$/i.test(name) ? name : `${name}.pdf`;
}

async function save() {
  if (!app.bridge?.hasDocument()) return;
  try {
    const bytes = await app.bridge.bytes();
    download(bytes, fileName(), 'application/pdf');
    app.dirty = false;
    clearTimeout(app.saveTimer);
    app.saveTimer = 0;
    const key = liveKey();
    if (key) app.slots.remove(key); // saved: nothing to restore
    toast(saved(fileName()), { kind: 'success' });
  } catch {
    toast(ERRORS.save, { kind: 'error', timeout: 7000 });
  }
  updateUi();
}

async function toDxf() {
  if (!app.bridge?.hasDocument()) return;
  let bytes;
  try {
    bytes = await app.bridge.bytes();
  } catch {
    toast(ERRORS.save, { kind: 'error' });
    return;
  }
  if (!(await stashFileHandoff(new File([bytes], fileName(), { type: 'application/pdf' })))) {
    toast(ERRORS.handoff, { kind: 'error', timeout: 8000 });
    return;
  }
  location.href = toolUrl('pdf-to-dxf');
}

// ============================================================================
// Document tools (⋯ menu): MuPDF in the worker, on the viewer's current bytes
// ============================================================================

const u8 = (b) => (b instanceof Uint8Array ? b : new Uint8Array(b));
const sizeText = (n) => (n >= 1e6 ? fmt(n / 1e6, 1, { unit: 'MB' }) : fmt(Math.max(1, n / 1e3), 0, { unit: 'kB' }));
const MIME = { pdf: 'application/pdf', zip: 'application/zip', png: 'image/png', jpg: 'image/jpeg' };
const cancelled = () => Object.assign(new Error('cancelled'), { code: 'cancelled' });

/** What the dialogs need to know about the open document. */
const toolContext = () => ({
  pageCount: app.bridge?.pageCount() ?? 0,
  current: app.bridge?.currentPage() ?? 0,
  colors: app.colors,
  hasDocument: !!app.bridge?.hasDocument(),
});

/** One worker operation, with progress and cancel in the notice row. */
async function track(label, type, args, transfer = []) {
  let finished = false;
  const show = (value) => setNotice('task', { severity: 'info', text: progress(label, value), action: { icon: 'close', label: ACTIONS.cancel, run: cancel } });
  const job = app.worker.call(type, args, { transfer, onProgress: show });
  function cancel() {
    app.worker.cancel(job.id);
    // one long MuPDF call cannot stop in between: the worker is replaced when it does not answer
    setTimeout(() => finished || app.worker.restart(), 1500);
  }
  show(0);
  try {
    return await job.promise;
  } finally {
    finished = true;
    setNotice('task', null);
  }
}

/**
 * A document tool on the open document: its current bytes (with every change) go to the worker. A file that
 * needs its password (the viewer asked for it, the page does not know it) asks for it once.
 */
async function runOnDocument(label, type, args = {}) {
  const bytes = u8(await app.bridge.bytes());
  for (let wrong = false; ; wrong = true) {
    const copy = bytes.slice();
    try {
      return await track(label, type, { ...args, bytes: copy, password: app.file?.password }, [copy.buffer]);
    } catch (e) {
      if (e.code !== 'password') throw e;
      const password = await ui.askOpenPassword(wrong);
      if (password === null) throw cancelled();
      app.file = { ...app.file, password };
    }
  }
}

/** Run a tool once at a time; errors as a toast, a cancel quietly. */
async function withTool(fn) {
  if (app.busy) return;
  app.busy = true;
  updateUi();
  try {
    await fn();
  } catch (e) {
    if (e?.code !== 'cancelled') toast(ENGINE_ERRORS[e?.code] ?? ENGINE_ERRORS.internal, { kind: 'error', timeout: 7000 });
  } finally {
    app.busy = false;
    updateUi();
  }
}

/** Show a tool's result as the open document, on the same page. The viewer's history starts new. */
async function reload(bytes, { password = app.file?.password } = {}) {
  const page = app.bridge.currentPage();
  if (!(await openBytes(u8(bytes), fileName(), { keep: true, password }))) return;
  requestAnimationFrame(() => requestAnimationFrame(() => app.bridge.goToPage(Math.min(page, app.bridge.pageCount() - 1))));
  setNotice('history', { severity: 'info', text: STATUS.historyReset, dismiss: () => setNotice('history', null) });
}

function downloadFiles(files) {
  for (const f of files) download(f.bytes, f.name, MIME[f.name.split('.').pop().toLowerCase()] ?? 'application/octet-stream');
  if (files.length === 1) toast(saved(files[0].name), { kind: 'success' });
}

/** Viewer placement of new pages: 'start', 'end' or after the current page. */
const placement = (insert) => (insert === 'start' ? 'start' : insert === 'after' ? { after: app.bridge.currentPage() } : 'end');

async function insertPdfs(list, insert) {
  const before = app.bridge.pageCount();
  const failed = [];
  const at = placement(insert);
  // before a fixed page the last file goes first, so the files keep their order
  for (const { name, bytes } of insert === 'end' ? list : [...list].reverse()) {
    try {
      if (!isPdf(bytes)) throw new Error('not a PDF');
      await app.bridge.pages.insertBytes(bytes, at);
    } catch {
      failed.push(name);
    }
  }
  const added = app.bridge.pageCount() - before;
  if (added > 0) toast(RESULTS.inserted(added), { kind: 'success' });
  if (failed.length) toast(RESULTS.notInserted(failed.join(', ')), { kind: 'error', timeout: 8000 });
}

async function mergeTool() {
  const v = await ui.askMerge();
  if (v) await withTool(async () => insertPdfs(await Promise.all(v.files.map(async (f) => ({ name: f.name, bytes: u8(await f.arrayBuffer()) }))), v.insert));
}

async function splitTool() {
  const v = await ui.askSplit(toolContext());
  if (v) await withTool(async () => downloadFiles((await runOnDocument(TOOLS.split, 'split', { ...v, name: fileName() })).files));
}

async function watermarkTool() {
  const v = await ui.askWatermark(toolContext());
  if (v) await withTool(async () => reload(await runOnDocument(TOOLS.watermark, 'watermark', ui.watermarkOptions(v, app.colors))));
}

async function pageNumbersTool() {
  const v = await ui.askPageNumbers(toolContext());
  if (v) await withTool(async () => reload(await runOnDocument(TOOLS.pageNumbers, 'pageNumbers', v)));
}

async function headerFooterTool() {
  const v = await ui.askHeaderFooter(toolContext());
  const values = { datei: fileName(), datum: formatDate(new Date(), app.settings.dateFormat) };
  if (v) await withTool(async () => reload(await runOnDocument(TOOLS.headerFooter, 'headerFooter', { ...v, ...values })));
}

async function toImagesTool() {
  const v = await ui.askToImages(toolContext());
  if (!v) return;
  await withTool(async () => {
    const r = await runOnDocument(TOOLS.toImages, 'toImages', { ...v, name: fileName() });
    downloadFiles(r.files);
    if (r.reduced?.length) toast(RESULTS.reduced(r.reduced.join(', ')), { kind: 'warning', timeout: 8000 });
  });
}

async function fromImagesTool() {
  const v = await ui.askFromImages(toolContext());
  if (!v) return;
  await withTool(async () => {
    const images = await Promise.all(v.files.map(async (f) => u8(await f.arrayBuffer())));
    const bytes = u8(await track(TOOLS.fromImages, 'imagesToPdf', { images, size: v.size, orientation: v.orientation, marginMm: v.margin }, images.map((b) => b.buffer)));
    if (v.insert === 'new' || !app.bridge.hasDocument()) {
      if (await openBytes(bytes, `${v.files[0].name.replace(/\.[^.]+$/, '')}.pdf`)) markDirty();
    } else {
      await insertPdfs([{ name: TOOLS.fromImages, bytes }], v.insert);
    }
  });
}

async function flattenTool() {
  const v = await ui.askFlatten();
  if (v) await withTool(async () => reload(await runOnDocument(TOOLS.flatten, 'flatten', v)));
}

async function compressTool() {
  const v = await ui.askCompress();
  if (!v) return;
  await withTool(async () => {
    const r = await runOnDocument(TOOLS.compress, 'compress', v);
    if (!r.smaller) {
      toast(RESULTS.notSmaller);
      return;
    }
    await reload(r.bytes);
    toast(RESULTS.compressed(sizeText(r.before), sizeText(r.after)), { kind: 'success', timeout: 7000 });
  });
}

async function passwordTool() {
  const v = await ui.askPassword();
  if (!v) return;
  await withTool(async () => reload(await runOnDocument(TOOLS.password, 'password', v), { password: v.remove ? undefined : v.userPassword || undefined }));
}

async function ocrTool() {
  const v = await ui.askOcr(toolContext());
  if (!v) return;
  await withTool(async () => {
    const r = await runOnDocument(TOOLS.ocr, 'ocr', v);
    if (!r.bytes) {
      toast(RESULTS.ocrNone);
      return;
    }
    if (!r.words) {
      toast(RESULTS.ocrEmpty, { kind: 'warning' });
      return;
    }
    await reload(r.bytes);
    toast(RESULTS.ocr(r.pages, r.words), { kind: 'success', timeout: 7000 });
  });
}

async function outlineTool() {
  let items = null;
  await withTool(async () => (items = await runOnDocument(TOOLS.outline, 'readOutline')));
  if (!items) return;
  const next = await ui.askOutline(toolContext(), items);
  const same = (a) => JSON.stringify(a.map(({ title, page, level }) => [title, page, level]));
  if (next && same(next) !== same(items)) await withTool(async () => reload(await runOnDocument(TOOLS.outline, 'writeOutline', { items: next })));
}

async function propertiesTool() {
  const meta = app.bridge.plugin('metadata');
  if (!meta) return;
  let current = {};
  try {
    await meta.ensureLoaded();
    current = meta.getSnapshot() ?? {};
  } catch {
    /* empty fields */
  }
  const v = await ui.askProperties(current);
  if (!v) return;
  const changed = Object.fromEntries(Object.entries(v).filter(([k, x]) => x !== (current[k] ?? '')));
  if (!Object.keys(changed).length) return;
  try {
    await meta.update(changed);
  } catch {
    toast(ENGINE_ERRORS.internal, { kind: 'error' });
  }
}

async function blankTool() {
  const v = await ui.askBlank();
  if (v) await withTool(async () => openBytes(u8(await track(TOOLS.blank, 'blank', v)), DEFAULT_NAME));
}

// ============================================================================
// App bar, keyboard
// ============================================================================

function undo() {
  if (app.bridge?.hasDocument()) app.bridge.execute('history:undo').catch(() => {});
}

function redo() {
  if (app.bridge?.hasDocument()) app.bridge.execute('history:redo').catch(() => {});
}

function updateUi() {
  const has = !!app.bridge?.hasDocument();
  $('[data-action="save"]').disabled = !has;
  $('[data-action="to-dxf"]').disabled = !has;
  $('[data-action="undo"]').disabled = !has || !app.bridge.enabled('history:undo');
  $('[data-action="redo"]').disabled = !has || !app.bridge.enabled('history:redo');
  app.symbols?.setEnabled(has);
  renderNotices();
}

const isEditable = (el) => !!el && (el.isContentEditable || /^(input|textarea|select)$/i.test(el.tagName ?? ''));

/** The ⋯ menu: the document tools in the plan's order, then the settings. `doc` entries need an open document. */
const MENU = [
  { action: 'merge', icon: 'merge', doc: true, run: mergeTool },
  { action: 'split', icon: 'split', doc: true, run: splitTool },
  { action: 'watermark', icon: 'stamp', doc: true, run: watermarkTool },
  { action: 'pageNumbers', icon: 'number', doc: true, run: pageNumbersTool },
  { action: 'headerFooter', icon: 'pages', doc: true, run: headerFooterTool },
  { action: 'toImages', icon: 'image', doc: true, run: toImagesTool },
  { action: 'fromImages', icon: 'upload', run: fromImagesTool },
  { action: 'flatten', icon: 'layers', doc: true, run: flattenTool },
  { action: 'compress', icon: 'compress', doc: true, run: compressTool },
  { action: 'password', icon: 'lock', doc: true, run: passwordTool },
  { action: 'ocr', icon: 'ocr', doc: true, run: ocrTool },
  { action: 'outline', icon: 'bookmark', doc: true, run: outlineTool },
  { action: 'properties', icon: 'file', doc: true, run: propertiesTool },
  { action: 'blank', icon: 'plus', run: blankTool },
  { separator: true },
  { action: 'settings', icon: 'settings', settings: true, run: () => openSettings() },
].map((m) => ({ label: TOOLS[m.action], ...m }));

function renderMenu() {
  const has = !!app.bridge?.hasDocument();
  const off = (m) => (m.doc && !has) || (app.busy && !m.settings) || (!app.bridge && !m.settings);
  $('#more-list').innerHTML = String(
    html`${MENU.map((m) =>
      m.separator
        ? html`<li role="separator"><hr /></li>`
        : html`<li><button type="button" role="menuitem" data-menu="${m.action}" ${off(m) ? raw('disabled') : ''}>${icon(m.icon)}<span>${m.label}</span></button></li>`,
    )}`,
  );
  $('#more-menu').hidden = false;
}

function closeMenu() {
  $('#more-menu').classList.remove('open');
  $('[data-action="menu"]').setAttribute('aria-expanded', 'false');
}

function bindActions() {
  const setIcon = (sel, name, text) => {
    $(sel).innerHTML = String(text ? html`${icon(name)}<span class="btn-label">${text}</span>` : icon(name));
  };
  setIcon('[data-action="undo"]', 'undo');
  setIcon('[data-action="redo"]', 'redo');
  setIcon('[data-action="open"]', 'open');
  setIcon('[data-action="save"]', 'save', 'PDF');
  setIcon('[data-action="to-dxf"]', 'jump', 'DXF');
  setIcon('[data-action="menu"]', 'more');
  $('.pe-empty [data-action="open"]').innerHTML = String(html`${icon('open')}<span>PDF</span>`);
  $('[data-action="to-dxf"]').setAttribute('aria-label', ACTIONS.toDxf);

  document.addEventListener('click', (e) => {
    const item = e.target.closest('[data-menu]');
    if (item && !item.disabled) {
      closeMenu();
      MENU.find((m) => m.action === item.dataset.menu)?.run();
      return;
    }
    const a = e.target.closest('[data-action]');
    if (!a) {
      if (!e.target.closest('#more-menu')) closeMenu();
      return;
    }
    if (a.disabled) return;
    if (a.dataset.action !== 'menu') closeMenu();
    switch (a.dataset.action) {
      case 'menu': {
        renderMenu();
        const open = $('#more-menu').classList.toggle('open');
        a.setAttribute('aria-expanded', String(open));
        if (open) $('#more-list button:not([disabled])')?.focus();
        break;
      }
      case 'undo': undo(); break;
      case 'redo': redo(); break;
      case 'open': openPicked(); break;
      case 'save': save(); break;
      case 'to-dxf': toDxf(); break;
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('#more-menu').classList.contains('open')) {
      closeMenu();
      $('[data-action="menu"]').focus();
    }
  });
  // Capture on window: the app's shortcuts win over the viewer's, so each runs once. While a text field is
  // focused (also inside the viewer), Strg+Z / Strg+Y stay with the field.
  window.addEventListener(
    'keydown',
    (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      const typing = isEditable(e.composedPath()[0]);
      let run = null;
      if (k === 's') run = save;
      else if (k === 'o') run = openPicked;
      else if (!typing && k === 'z' && !e.shiftKey) run = undo;
      else if (!typing && (k === 'y' || (k === 'z' && e.shiftKey))) run = redo;
      if (!run) return;
      e.preventDefault();
      e.stopPropagation();
      run();
    },
    true,
  );
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
  app.settings = loadSettings();
  app.issues = createIssuePanel($('#issues'), { emptyText: STATUS.empty, emptyIcon: 'info' });
  addThemeButton();
  mountSourceLink();
  bindActions();
  renderMenu();
  renderNotices();
  const el = $('#viewer');
  try {
    app.bridge = await mountViewer(el, viewerConfig());
  } catch {
    setNotice('viewer', { severity: 'error', text: ERRORS.viewer });
    return;
  }
  followScheme((scheme) => (el.theme = scheme));
  app.symbols = ui.mountSymbolPanel($('#symbols-panel'), {
    getStamp: () => app.bridge.plugin('stamp'),
    worker: app.worker,
    hasDocument: () => app.bridge.hasDocument(),
    onArmed: () => app.bridge.closePanelIfFloating('symbols'),
  });
  app.bridge.onChange((source) => {
    // the viewer's own unsaved flag follows the edits; changes while a file opens are the file itself
    if (source !== 'unsaved' && !app.loading) markDirty();
  });
  app.bridge.onDocument((type) => {
    if (type === 'failed') setNotice('open-failed', { severity: 'error', text: ERRORS.damaged, dismiss: () => setNotice('open-failed', null) });
    if (type === 'opened') applySettings();
    if (type === 'opened' || type === 'closed') app.symbols.render();
    updateUi();
  });
  installLibraries();
  app.bridge.viewer.watch(
    () => `${app.bridge.enabled('history:undo')}|${app.bridge.enabled('history:redo')}`,
    () => updateUi(),
  );
  enableFileDrop(openFile);
  updateUi();
  app.slots = slotStore();
  document.addEventListener('visibilitychange', () => document.hidden && flushAutosave());
  const [handoff] = await Promise.all([takeFileHandoff(), app.slots.prune()]);
  if (handoff) await openFile(handoff);
  else showSlots();
}

start();
