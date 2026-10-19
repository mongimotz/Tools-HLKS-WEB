// SPDX-License-Identifier: AGPL-3.0-or-later
// Page controller of the PDF-Editor: app bar, notice row, the EmbedPDF viewer (bridge.js), open and save,
// keyboard, start-page hand-over and → DXF. The PDF stays in this browser; only the edited PDF is saved.

import { TOOL_ID, normalizeSettings } from './defaults.js';
import { ACTIONS, DEFAULT_NAME, ERRORS, STATUS, TITLE, VIEWER_STRINGS, pageDeleted, saved } from './labels.js';
import { SWISS_DE } from './viewer-strings.js';
import { VIEWER_ICONS, currentScheme, defaultMeasure, followScheme, readAnnotColors, scalePresets, toolDefinitions, viewerFonts } from './theme.js';
import { mountViewer } from './bridge.js';
import { pickFile, download, enableFileDrop, takeFileHandoff, stashFileHandoff } from '../../lib/core/files.js';
import { html, icon, toast, bindThemeToggle, mountSourceLink } from '../../lib/core/ui.js';
import { createIssuePanel } from '../../lib/core/issues.js';
import { toolUrl } from '../../lib/core/registry.js';

const SETTINGS_KEY = `hlks-tools:${TOOL_ID}:settings`;
const $ = (sel, root = document) => root.querySelector(sel);
const isPdf = (b) => b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46; // %PDF

const app = {
  bridge: null,
  settings: null,
  issues: null,
  notices: new Map(),
  file: null, // { name } of the open document
  loading: false,
  dirty: false, // changed since the last save by the user
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
  const colors = readAnnotColors();
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
    },
  };
}

// ============================================================================
// Open, save, hand-over
// ============================================================================

async function openPicked() {
  openFile(await pickFile('.pdf,application/pdf'));
}

async function openFile(file) {
  if (!file || !app.bridge) return;
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

async function openBytes(bytes, name) {
  app.loading = true;
  setNotice('open-failed', null);
  try {
    const doc = await app.bridge.open(bytes, { name });
    app.file = { name };
    app.dirty = false;
    document.title = `${name} – ${TITLE} – HLKS-Tools`;
    return doc;
  } catch {
    app.file = null;
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
  renderNotices();
}

const isEditable = (el) => !!el && (el.isContentEditable || /^(input|textarea|select)$/i.test(el.tagName ?? ''));

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
    const a = e.target.closest('[data-action]');
    if (!a || a.disabled) return;
    switch (a.dataset.action) {
      case 'undo': undo(); break;
      case 'redo': redo(); break;
      case 'open': openPicked(); break;
      case 'save': save(); break;
      case 'to-dxf': toDxf(); break;
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
  renderNotices();
  const el = $('#viewer');
  try {
    app.bridge = await mountViewer(el, viewerConfig());
  } catch {
    setNotice('viewer', { severity: 'error', text: ERRORS.viewer });
    return;
  }
  followScheme((scheme) => (el.theme = scheme));
  app.bridge.onChange(() => {
    app.dirty = true;
    updateUi();
  });
  app.bridge.onDocument((type) => {
    if (type === 'failed') setNotice('open-failed', { severity: 'error', text: ERRORS.damaged, dismiss: () => setNotice('open-failed', null) });
    updateUi();
  });
  app.bridge.viewer.watch(
    () => `${app.bridge.enabled('history:undo')}|${app.bridge.enabled('history:redo')}`,
    () => updateUi(),
  );
  enableFileDrop(openFile);
  updateUi();
  const handoff = await takeFileHandoff();
  if (handoff) await openFile(handoff);
}

start();
