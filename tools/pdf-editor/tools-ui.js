// SPDX-License-Identifier: AGPL-3.0-or-later
// Own UI of the PDF-Editor around the viewer: the Symbole panel (inside the viewer, slot `panel:symbols`),
// the settings dialog and the dialogs of the document tools. Labels from labels.js; DESIGN.md rules.

import { html, raw, icon, toast } from '../../lib/core/ui.js';
import { pickFile, download } from '../../lib/core/files.js';
import { DATE_FORMATS, STAMP_FRAMES, COLOR_ROLES, normalizeSettings } from './defaults.js';
import { ACTIONS, COLOR_NAMES, ROLE_LABELS, FRAME_LABELS, DATE_LABELS, SETTINGS, SYMBOLS, TOOLS, F, POSITION_LABELS, NUMBER_FORMATS } from './labels.js';
import { SYMBOL_KIND, OWN_LIBRARY_ID, addOwnSymbols, exportOwn, importOwn, ownLibrary } from './library.js';
import { parseRanges, POSITIONS } from './pages.js';
import { DPI_MIN, DPI_MAX } from './images.js';

// ---- dialogs ------------------------------------------------------------------------------------------

/**
 * A modal dialog in the shared catalogue-window look: title, close icon, body, apply icon.
 * `onApply(form)` returns false to keep it open. Escape and an outside click close it.
 */
export function openDialog({ title, body, onApply, onOpen, onClose, wide = false }) {
  const dlg = document.createElement('dialog');
  dlg.className = `catalog-dialog pe-dialog${wide ? ' is-wide' : ''}`;
  dlg.innerHTML = String(html`
    <form method="dialog" class="dialog-form">
      <div class="catalog-dialog-head">
        <h2>${title}</h2>
        <button type="button" class="btn ghost icon-only" data-dialog="close" title="${ACTIONS.close}" aria-label="${ACTIONS.close}">${icon('close')}</button>
      </div>
      <div class="dialog-body">${raw(body)}</div>
      <div class="dialog-actions">
        <button type="submit" class="btn primary icon-only" data-dialog="apply" title="${ACTIONS.apply}" aria-label="${ACTIONS.apply}">${icon('check')}</button>
      </div>
    </form>`);
  document.body.append(dlg);
  const form = dlg.querySelector('form');
  const opener = document.activeElement;
  const close = () => {
    if (!dlg.isConnected) return;
    if (dlg.open) dlg.close();
    dlg.remove();
    opener?.focus?.({ preventScroll: true });
    onClose?.();
  };
  dlg.addEventListener('cancel', (e) => (e.preventDefault(), close())); // Escape
  dlg.addEventListener('click', (e) => {
    if (e.target.closest('[data-dialog="close"]')) close();
    else if (e.target === dlg) {
      const r = dlg.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close();
    }
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if ((await onApply?.(form)) !== false) close();
  });
  onOpen?.(form);
  dlg.showModal();
  return { dlg, form, close };
}

const swatches = (name, colors, selected, count = colors.length) =>
  html`<div class="pe-swatches" role="radiogroup">${colors.slice(0, count).map(
    (c, i) => html`<label class="pe-swatch" title="${COLOR_NAMES[i]}" style="--sw:${c}"><input type="radio" name="${name}" value="${i + 1}" ${i + 1 === selected ? raw('checked') : ''} aria-label="${COLOR_NAMES[i]}" /><span></span></label>`,
  )}</div>`;

// ---- settings -------------------------------------------------------------------------------------------

/** Settings dialog: name and date for stamps, default colours by role, plan scales, own stamps. */
export function openSettingsDialog(settings, colors, onSave) {
  const stampRow = (s, i) => html`
    <li class="pe-stamp-row" data-i="${i}">
      <input class="input" name="stamp-text" value="${s.text}" aria-label="${SETTINGS.stampText}" maxlength="60" />
      ${swatches(`stamp-color-${i}`, colors, s.color, 8)}
      <select class="select" name="stamp-frame" aria-label="${SETTINGS.frame}">${STAMP_FRAMES.map((f) => html`<option value="${f}" ${f === s.frame ? raw('selected') : ''}>${FRAME_LABELS[f]}</option>`)}</select>
      <button type="button" class="btn ghost icon-only small" data-stamp="delete" title="${SETTINGS.deleteStamp}" aria-label="${SETTINGS.deleteStamp}">${icon('trash')}</button>
    </li>`;
  let stamps = settings.stamps.map((s) => ({ ...s }));
  const body = String(html`
    <div class="dialog-row">
      <label class="field"><span class="field-label">${SETTINGS.name}</span><input class="input" name="name" value="${settings.name}" maxlength="80" autocomplete="name" /></label>
      <label class="field"><span class="field-label">${SETTINGS.dateFormat}</span>
        <select class="select" name="dateFormat">${DATE_FORMATS.map((f) => html`<option value="${f}" ${f === settings.dateFormat ? raw('selected') : ''}>${DATE_LABELS[f]}</option>`)}</select></label>
    </div>
    <fieldset class="pe-fieldset"><legend class="field-label">${SETTINGS.colors}</legend>
      ${COLOR_ROLES.map((role) => html`<div class="pe-color-row"><span>${ROLE_LABELS[role]}</span>${swatches(`color-${role}`, colors, settings.colors[role])}</div>`)}
    </fieldset>
    <label class="field"><span class="field-label">${SETTINGS.scales}</span><input class="input" name="scales" value="${settings.scales.map((n) => `1:${n}`).join(', ')}" /></label>
    <fieldset class="pe-fieldset"><legend class="field-label">${SETTINGS.ownStamps}</legend>
      <ul class="pe-stamp-list" id="pe-stamp-list">${stamps.map(stampRow)}</ul>
      <button type="button" class="btn ghost icon-only small" data-stamp="add" title="${SETTINGS.addStamp}" aria-label="${SETTINGS.addStamp}">${icon('plus')}</button>
    </fieldset>`);
  const readStamps = (form) =>
    [...form.querySelectorAll('.pe-stamp-row')].map((row) => ({
      id: stamps[Number(row.dataset.i)].id,
      text: row.querySelector('[name="stamp-text"]').value,
      color: Number(row.querySelector('input[type="radio"]:checked')?.value ?? 1),
      frame: row.querySelector('[name="stamp-frame"]').value,
    }));
  return openDialog({
    title: SETTINGS.title,
    body,
    wide: true,
    onOpen: (form) => {
      form.addEventListener('click', (e) => {
        const b = e.target.closest('[data-stamp]');
        if (!b) return;
        stamps = readStamps(form);
        if (b.dataset.stamp === 'add') stamps.push({ id: `s${Date.now().toString(36)}`, text: '', color: 1, frame: 'rect' });
        else stamps.splice(Number(b.closest('.pe-stamp-row').dataset.i), 1);
        form.querySelector('#pe-stamp-list').innerHTML = String(html`${stamps.map(stampRow)}`);
        if (b.dataset.stamp === 'add') form.querySelector('.pe-stamp-row:last-child input')?.focus();
      });
    },
    onApply: (form) => {
      const value = (n) => form.querySelector(`[name="${n}"]`)?.value;
      const next = normalizeSettings({
        ...settings,
        name: value('name'),
        dateFormat: value('dateFormat'),
        colors: Object.fromEntries(COLOR_ROLES.map((r) => [r, Number(form.querySelector(`[name="color-${r}"]:checked`)?.value)])),
        scales: (value('scales') ?? '').split(/[,;\s]+/).map((s) => Number(s.replace(/^1\s*:\s*/, '').replace(/[’']/g, ''))).filter(Boolean),
        stamps: readStamps(form),
      });
      onSave(next);
    },
  });
}

// ---- Symbole panel --------------------------------------------------------------------------------------

/** Categories in HLKS order (symbols/libraries.json ids). */
const SYMBOL_ORDER = ['heizung', 'lueftung', 'klima', 'sanitaer', 'allgemein'];

/**
 * The Symbole panel: built-in symbol libraries by category, the own library (add SVG files by button or drop,
 * delete with undo), save and open the own library as one PDF. A click arms a symbol; the next click on the
 * page places it.
 */
export function mountSymbolPanel(host, { getStamp, worker, hasDocument, onArmed }) {
  const previews = new Map(); // asset id → object URL
  let busy = false;

  const preview = async (stamp, id, img) => {
    if (!previews.has(id)) {
      const p = stamp.getAssetPreview(id) ?? (await stamp.renderAssetPreview(id, { width: 96 }).catch(() => null));
      if (!p) return;
      previews.set(id, URL.createObjectURL(new Blob([p.bytes], { type: p.mimeType })));
    }
    img.src = previews.get(id);
  };

  async function render() {
    const stamp = getStamp();
    if (!stamp) return;
    const libs = stamp.listLibraries({ kind: SYMBOL_KIND });
    const own = libs.find((l) => l.id === OWN_LIBRARY_ID);
    const order = (id) => SYMBOL_ORDER.indexOf(id.replace(/^hlks-symbole-/, '')) >>> 0; // unknown ones last
    const builtIn = libs.filter((l) => l.id !== OWN_LIBRARY_ID).sort((a, b) => order(a.id) - order(b.id));
    const doc = hasDocument();
    const tile = (asset, deletable) => html`
      <li class="pe-symbol">
        <button type="button" data-arm="${asset.id}" title="${asset.label}" aria-label="${asset.label}" ${doc ? '' : raw('disabled')}><img alt="" /></button>
        ${deletable ? html`<button type="button" class="pe-symbol-del" data-del="${asset.id}" title="${SYMBOLS.delete}" aria-label="${SYMBOLS.delete}: ${asset.label}">${icon('close', { size: 12 })}</button>` : ''}
      </li>`;
    const section = (title, lib, deletable) => {
      const assets = stamp.listAssets({ libraryId: lib.id });
      return html`<section class="pe-symbol-group"><h3>${title}</h3>${assets.length ? html`<ul class="pe-symbol-grid">${assets.map((a) => tile(a, deletable))}</ul>` : html`<div class="pe-symbol-empty">${icon('upload', { size: 20 })}<span>SVG</span></div>`}</section>`;
    };
    host.innerHTML = String(html`
      <div class="pe-symbols-bar">
        <button type="button" class="btn ghost icon-only small" data-sym="add" title="${SYMBOLS.add}" aria-label="${SYMBOLS.add}">${icon('plus')}</button>
        <button type="button" class="btn ghost icon-only small" data-sym="open" title="${SYMBOLS.open}" aria-label="${SYMBOLS.open}">${icon('open')}</button>
        <button type="button" class="btn ghost icon-only small" data-sym="save" title="${SYMBOLS.save}" aria-label="${SYMBOLS.save}" ${own?.assetIds.length ? '' : raw('disabled')}>${icon('save')}</button>
      </div>
      ${builtIn.map((l) => section(l.name.replace(/^Symbole\s+/, ''), l, false))}
      ${section(SYMBOLS.own, own ?? { id: OWN_LIBRARY_ID }, true)}`);
    for (const img of host.querySelectorAll('[data-arm] img')) preview(stamp, img.closest('[data-arm]').dataset.arm, img);
  }

  const addFiles = async (files) => {
    const svgs = [...files].filter((f) => /\.svg$/i.test(f.name) || f.type === 'image/svg+xml');
    if (!svgs.length || busy) return;
    busy = true;
    try {
      const { added, failed } = await addOwnSymbols(getStamp(), worker, svgs);
      if (added.length) toast(SYMBOLS.added(added.length), { kind: 'success' });
      if (failed.length) toast(SYMBOLS.failed(failed.join(', ')), { kind: 'error', timeout: 8000 });
    } finally {
      busy = false;
      render();
    }
  };

  host.addEventListener('click', async (e) => {
    const stamp = getStamp();
    const arm = e.target.closest('[data-arm]');
    const del = e.target.closest('[data-del]');
    const sym = e.target.closest('[data-sym]');
    if (arm && !arm.disabled) {
      await stamp.armAsset(arm.dataset.arm).catch(() => {});
      onArmed?.(); // an overlay panel closes, so the next click on the page places the symbol
    } else if (del) {
      const id = del.dataset.del;
      const asset = stamp.getAsset(id);
      const bytes = stamp.readAssetBytes(id);
      await stamp.deleteAsset(id).catch(() => {});
      // an empty library would come back from storage with a blank page: remove it instead
      if (!stamp.getLibrary(OWN_LIBRARY_ID)?.assetIds.length) await stamp.deleteLibrary(OWN_LIBRARY_ID).catch(() => {});
      render();
      if (asset && bytes) {
        const restore = async () => {
          await ownLibrary(stamp);
          await stamp.createAsset({ libraryId: OWN_LIBRARY_ID, source: bytes, label: asset.label }).catch(() => null);
          render();
        };
        toast(SYMBOLS.deleted(asset.label), { action: { icon: 'undo', label: ACTIONS.undo, run: restore } });
      }
    } else if (sym?.dataset.sym === 'add') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.svg,image/svg+xml';
      input.multiple = true;
      input.addEventListener('change', () => addFiles(input.files ?? []), { once: true });
      input.click();
    } else if (sym?.dataset.sym === 'save') {
      try {
        download(await exportOwn(stamp), SYMBOLS.fileName, 'application/pdf');
      } catch {
        toast(SYMBOLS.saveFailed, { kind: 'error' });
      }
    } else if (sym?.dataset.sym === 'open') {
      const file = await pickFile('.pdf,application/pdf');
      if (!file) return;
      try {
        toast(SYMBOLS.added(await importOwn(stamp, new Uint8Array(await file.arrayBuffer()))), { kind: 'success' });
      } catch {
        toast(SYMBOLS.openFailed, { kind: 'error' });
      }
      render();
    }
  });
  // own SVG files dropped on the panel (the page-wide drop opens PDFs and must not see them)
  host.addEventListener('dragover', (e) => {
    if ([...(e.dataTransfer?.types ?? [])].includes('Files')) {
      e.preventDefault();
      host.classList.add('is-over');
    }
  });
  host.addEventListener('dragleave', () => host.classList.remove('is-over'));
  host.addEventListener('drop', (e) => {
    host.classList.remove('is-over');
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault(); // enableFileDrop then leaves the files to this panel
    addFiles(e.dataTransfer.files);
  });

  /** Symbols can be armed only while a document is open. */
  const setEnabled = (on) => host.querySelectorAll('[data-arm]').forEach((b) => (b.disabled = !on));

  return { render, addFiles, setEnabled };
}

// ---- document tools -------------------------------------------------------------------------------------
// Each ask…(ctx) opens the tool's dialog and resolves its options, or null when it is closed.
// ctx: { pageCount, current (0-based page), colors (--annot-*), hasDocument }.

/** Options of the last run per tool, so a repeated run starts from them (this visit only, no files). */
const last = new Map();

const opt = (value, label, cur) => html`<option value="${value}" ${String(value) === String(cur) ? raw('selected') : ''}>${label}</option>`;
const fieldLabel = (label, unit) => html`<span class="field-label">${label}${unit ? html` <span class="unit">${unit}</span>` : ''}</span>`;
const selectField = (name, label, options, cur, { unit, when } = {}) =>
  html`<label class="field" ${when ? raw(`data-when="${when}"`) : ''}>${fieldLabel(label, unit)}<select class="select" name="${name}">${options.map(([v, l]) => opt(v, l, cur))}</select></label>`;
const textField = (name, label, value = '', { unit, when, attrs = '' } = {}) =>
  html`<label class="field" ${when ? raw(`data-when="${when}"`) : ''}>${fieldLabel(label, unit)}<input class="input" name="${name}" value="${value}" autocomplete="off" ${raw(attrs)} /></label>`;
const numField = (name, label, value, { min, max, step = 1, unit, when } = {}) =>
  textField(name, label, value, { unit, when, attrs: `type="number" inputmode="decimal" min="${min}" max="${max}" step="${step}"` });
const check = (name, label, on) => html`<label class="check"><input type="checkbox" name="${name}" ${on ? raw('checked') : ''} />${label}</label>`;

const val = (form, name) => String(form.elements[name]?.value ?? '');
/** Mark a field invalid and keep the dialog open (ask's `read` returns undefined). */
const invalid = (el) => {
  el?.setAttribute('aria-invalid', 'true');
  el?.focus();
  return undefined;
};
const num = (form, name, min, max) => {
  const el = form.elements[name];
  const n = Number(String(el.value).replace(',', '.'));
  return Number.isFinite(n) && n >= min && n <= max ? n : invalid(el);
};

/** Show `[data-when="field=a|b"]` only while the field has one of the values (checkbox: on / off). */
function syncWhen(form) {
  for (const el of form.querySelectorAll('[data-when]')) {
    const [name, values] = el.dataset.when.split('=');
    const field = form.elements[name];
    const cur = field?.type === 'checkbox' ? (field.checked ? 'on' : 'off') : String(field?.value ?? '');
    el.hidden = !values.split('|').includes(cur);
  }
}

/** A tool dialog. Resolves `read(form)` on apply, or null when it is closed. */
function ask({ id, title, body, read, onOpen, wide = false }) {
  return new Promise((resolve) => {
    let value = null;
    openDialog({
      title,
      body: String(body),
      wide,
      onOpen: (form) => {
        form.addEventListener('change', () => syncWhen(form));
        form.addEventListener('input', (e) => e.target.removeAttribute?.('aria-invalid'));
        onOpen?.(form);
        syncWhen(form);
      },
      onApply: (form) => {
        const v = read(form);
        if (v === undefined) return false;
        value = v;
        if (id) last.set(id, { ...v, files: undefined });
        return true;
      },
      onClose: () => resolve(value),
    });
  });
}

const PAGE_MODES = ['all', 'current', 'range', 'odd', 'even'];
const RANGE_ATTRS = 'placeholder="1-3, 5, 8-" spellcheck="false"';

const pageChoice = (cur = {}, extra = '') => html`
  <div class="dialog-row">
    ${selectField('pages-mode', F.pages, PAGE_MODES.map((m) => [m, F[m]]), cur.mode ?? 'all')}
    ${textField('pages-range', F.range, cur.range ?? '', { attrs: RANGE_ATTRS, when: 'pages-mode=range' })}
    ${extra}
  </div>`;

/** A range field: valid ranges inside the document, else invalid. */
function readRange(el, ctx) {
  const r = parseRanges(el.value, ctx.pageCount);
  return el.value.trim() && !r.errors.length && r.pages.length ? el.value.trim() : invalid(el);
}

function readPages(form, ctx) {
  const mode = val(form, 'pages-mode');
  if (mode !== 'range') return { mode, current: ctx.current };
  const range = readRange(form.elements['pages-range'], ctx);
  return range === undefined ? undefined : { mode, range, current: ctx.current };
}

const positionField = (cur) => selectField('position', F.position, POSITIONS.map((p) => [p, POSITION_LABELS[p]]), cur);

/** Where new pages go in the open document (or a new one). */
const insertField = (cur, { newDocument = false, hasDocument = true } = {}) =>
  selectField(
    'insert',
    F.position,
    hasDocument
      ? [['end', F.atEnd], ['after', F.afterCurrent], ['start', F.atStart], ...(newDocument ? [['new', F.newDocument]] : [])]
      : [['new', F.newDocument]],
    hasDocument ? cur : 'new',
  );

/** File list with add, reorder, remove and drop onto the dialog. `files` is filled in place. */
function fileBox(form, files, { accept, test, kind }) {
  const box = form.querySelector('.pe-files');
  const render = () => {
    box.innerHTML = String(html`
      ${files.length
        ? html`<ul class="pe-file-list">${files.map(
            (f, i) => html`
              <li class="pe-file" data-i="${i}">
                ${icon('file', { size: 14 })}<span class="pe-file-name" title="${f.name}">${f.name}</span>
                <button type="button" class="btn ghost icon-only small" data-file="up" title="${F.up}" aria-label="${F.up}: ${f.name}" ${i ? '' : raw('disabled')}>${icon('up')}</button>
                <button type="button" class="btn ghost icon-only small" data-file="down" title="${F.down}" aria-label="${F.down}: ${f.name}" ${i < files.length - 1 ? '' : raw('disabled')}>${icon('down')}</button>
                <button type="button" class="btn ghost icon-only small" data-file="remove" title="${F.remove}" aria-label="${F.remove}: ${f.name}">${icon('trash')}</button>
              </li>`,
          )}</ul>`
        : ''}
      <button type="button" class="pe-file-add" data-file="add" title="${F.addFiles}" aria-label="${F.addFiles}">${icon(files.length ? 'plus' : 'upload', { size: files.length ? 16 : 20 })}<span>${kind}</span></button>`);
  };
  const add = (list) => {
    const ok = [...list].filter(test);
    if (!ok.length) return;
    files.push(...ok);
    render();
  };
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-file]');
    if (!b || b.disabled) return;
    const i = Number(b.closest('[data-i]')?.dataset.i);
    if (b.dataset.file === 'add') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept;
      input.multiple = true;
      input.addEventListener('change', () => add(input.files ?? []), { once: true });
      input.click();
      return;
    }
    if (b.dataset.file === 'remove') files.splice(i, 1);
    else {
      const j = b.dataset.file === 'up' ? i - 1 : i + 1;
      [files[i], files[j]] = [files[j], files[i]];
    }
    render();
    const next = box.querySelector(`[data-i="${Math.min(i, files.length - 1)}"] [data-file="${b.dataset.file}"]:not([disabled])`);
    (next ?? box.querySelector('[data-file="add"]')).focus();
  });
  // files dropped on the dialog belong to it (enableFileDrop leaves prevented drops alone)
  const dlg = form.closest('dialog');
  dlg.addEventListener('dragover', (e) => {
    if ([...(e.dataTransfer?.types ?? [])].includes('Files')) {
      e.preventDefault();
      box.classList.add('is-over');
    }
  });
  dlg.addEventListener('dragleave', () => box.classList.remove('is-over'));
  dlg.addEventListener('drop', (e) => {
    box.classList.remove('is-over');
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault();
    add(e.dataTransfer.files);
  });
  render();
}

const isPdfFile = (f) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf';
const isImageFile = (f) => /\.(png|jpe?g)$/i.test(f.name) || /^image\/(png|jpeg)$/.test(f.type);

export function askMerge() {
  const p = { insert: 'end', ...last.get('merge') };
  const files = [];
  return ask({
    id: 'merge',
    title: TOOLS.merge,
    body: html`<div class="pe-files"></div><div class="dialog-row">${insertField(p.insert)}</div>`,
    onOpen: (form) => fileBox(form, files, { accept: '.pdf,application/pdf', test: isPdfFile, kind: 'PDF' }),
    read: (form) => (files.length ? { files: [...files], insert: val(form, 'insert') } : invalid(form.querySelector('[data-file="add"]'))),
  });
}

const SPLIT_MODES = [['range', F.oneFile], ['groups', F.perRange], ['every', F.everyN], ['each', F.each], ['odd', F.odd], ['even', F.even]];

export function askSplit(ctx) {
  const p = { mode: 'range', range: '', n: 2, ...last.get('split') };
  return ask({
    id: 'split',
    title: TOOLS.split,
    body: html`<div class="dialog-row">
      ${selectField('mode', F.mode, SPLIT_MODES, p.mode)}
      ${textField('range', F.range, p.range, { attrs: RANGE_ATTRS, when: 'mode=range|groups' })}
      ${numField('n', F.n, p.n, { min: 1, max: 9999, when: 'mode=every' })}
    </div>`,
    read: (form) => {
      const mode = val(form, 'mode');
      if (mode === 'range' || mode === 'groups') {
        const range = readRange(form.elements.range, ctx);
        return range === undefined ? undefined : { mode, range };
      }
      if (mode === 'every') {
        const n = num(form, 'n', 1, Math.max(1, ctx.pageCount));
        return n === undefined ? undefined : { mode, n: Math.floor(n) };
      }
      return { mode };
    },
  });
}

export function askWatermark(ctx) {
  const p = { kind: 'text', text: 'ENTWURF', size: 72, scale: 40, color: 1, opacity: 30, angle: 45, position: 'center', tile: false, pages: {}, image: null, imageName: '', ...last.get('watermark') };
  let image = p.image;
  let imageName = p.imageName;
  return ask({
    id: 'watermark',
    title: TOOLS.watermark,
    wide: true,
    body: html`
      <div class="dialog-row">
        ${selectField('kind', F.kind, [['text', F.text], ['image', F.image]], p.kind)}
        ${textField('text', F.text, p.text, { when: 'kind=text', attrs: 'maxlength="120"' })}
        <div class="field" data-when="kind=image">${fieldLabel(F.image)}<button type="button" class="btn pe-pick" data-pick="image">${icon('image')}<span class="pe-pick-name">${imageName || 'PNG, JPG'}</span></button></div>
      </div>
      <div class="dialog-row">
        ${numField('size', F.size, p.size, { min: 4, max: 400, unit: 'pt', when: 'kind=text' })}
        ${numField('scale', F.size, p.scale, { min: 5, max: 100, unit: '%', when: 'kind=image' })}
        ${numField('opacity', F.opacity, p.opacity, { min: 5, max: 100, step: 5, unit: '%' })}
        ${numField('angle', F.angle, p.angle, { min: -180, max: 180, step: 15, unit: '°' })}
      </div>
      <div class="field" data-when="kind=text">${fieldLabel(F.color)}${swatches('color', ctx.colors, p.color, 8)}</div>
      <div class="dialog-row">
        ${selectField('position', F.position, POSITIONS.map((v) => [v, POSITION_LABELS[v]]), p.position, { when: 'tile=off' })}
        <div class="pe-check-field">${check('tile', F.tile, p.tile)}</div>
      </div>
      ${pageChoice(p.pages)}`,
    onOpen: (form) => {
      const pick = form.querySelector('[data-pick="image"]');
      pick.addEventListener('click', async () => {
        const file = await pickFile('.png,.jpg,.jpeg,image/png,image/jpeg');
        if (!file) return;
        image = new Uint8Array(await file.arrayBuffer());
        imageName = file.name;
        pick.removeAttribute('aria-invalid');
        form.querySelector('.pe-pick-name').textContent = file.name;
      });
    },
    read: (form) => {
      const kind = val(form, 'kind');
      const text = val(form, 'text').trim();
      if (kind === 'text' && !text) return invalid(form.elements.text);
      if (kind === 'image' && !image) return invalid(form.querySelector('[data-pick="image"]'));
      const size = kind === 'text' ? num(form, 'size', 4, 400) : 0;
      const scale = kind === 'image' ? num(form, 'scale', 5, 100) : 0;
      const opacity = num(form, 'opacity', 5, 100);
      const angle = num(form, 'angle', -180, 180);
      const pages = readPages(form, ctx);
      if ([size, scale, opacity, angle, pages].includes(undefined)) return undefined;
      const color = Number(form.querySelector('[name="color"]:checked')?.value ?? 1);
      return {
        kind, text, image: kind === 'image' ? image : null, imageName, size, scale, color, opacity, angle,
        position: val(form, 'position'), tile: form.elements.tile.checked, pages,
      };
    },
  });
}

/** Watermark dialog values as engine options. */
export function watermarkOptions(v, colors) {
  return {
    text: v.kind === 'text' ? v.text : '',
    image: v.kind === 'image' ? v.image.slice() : null,
    size: v.size,
    scale: v.scale / 100,
    color: colors[v.color - 1] ?? colors[0],
    opacity: v.opacity / 100,
    angle: v.angle,
    position: v.position,
    tile: v.tile,
    pages: v.pages,
  };
}

export function askPageNumbers(ctx) {
  const p = { template: NUMBER_FORMATS[0], position: 'bottom-center', start: 1, size: 10, pages: {}, ...last.get('pageNumbers') };
  return ask({
    id: 'pageNumbers',
    title: TOOLS.pageNumbers,
    body: html`
      <div class="dialog-row">
        ${textField('template', F.template, p.template, { attrs: 'list="pe-number-formats" maxlength="80" spellcheck="false"' })}
        ${positionField(p.position)}
      </div>
      <datalist id="pe-number-formats">${NUMBER_FORMATS.map((f) => html`<option value="${f}"></option>`)}</datalist>
      <div class="dialog-row">
        ${numField('start', F.start, p.start, { min: 0, max: 99999 })}
        ${numField('size', F.size, p.size, { min: 4, max: 72, unit: 'pt' })}
      </div>
      ${pageChoice(p.pages)}`,
    read: (form) => {
      const template = val(form, 'template').trim();
      if (!template) return invalid(form.elements.template);
      const start = num(form, 'start', 0, 99999);
      const size = num(form, 'size', 4, 72);
      const pages = readPages(form, ctx);
      if ([start, size, pages].includes(undefined)) return undefined;
      return { template, position: val(form, 'position'), start: Math.floor(start), size, pages };
    },
  });
}

const SLOTS = ['headerLeft', 'headerCenter', 'headerRight', 'footerLeft', 'footerCenter', 'footerRight'];
const PLACEHOLDERS = ['{datei}', '{datum}', '{n}', 'Seite {n} von {total}', '{n}/{total}'];

export function askHeaderFooter(ctx) {
  const p = { slots: {}, size: 9, pages: {}, ...last.get('headerFooter') };
  const slot = (name) => textField(name, F[name], p.slots[name] ?? '', { attrs: 'list="pe-placeholders" maxlength="120" spellcheck="false"' });
  return ask({
    id: 'headerFooter',
    title: TOOLS.headerFooter,
    wide: true,
    body: html`
      <div class="dialog-row pe-row-3">${SLOTS.slice(0, 3).map(slot)}</div>
      <div class="dialog-row pe-row-3">${SLOTS.slice(3).map(slot)}</div>
      <datalist id="pe-placeholders">${PLACEHOLDERS.map((f) => html`<option value="${f}"></option>`)}</datalist>
      ${pageChoice(p.pages, numField('size', F.size, p.size, { min: 4, max: 48, unit: 'pt' }))}`,
    read: (form) => {
      const slots = Object.fromEntries(SLOTS.map((s) => [s, val(form, s).trim()]));
      if (!Object.values(slots).some(Boolean)) return invalid(form.elements.headerLeft);
      const size = num(form, 'size', 4, 48);
      const pages = readPages(form, ctx);
      if ([size, pages].includes(undefined)) return undefined;
      return { slots, size, pages };
    },
  });
}

const DPI_CHOICES = [72, 96, 150, 200, 300, 600].filter((d) => d >= DPI_MIN && d <= DPI_MAX);

export function askToImages(ctx) {
  const p = { format: 'png', dpi: 150, pages: {}, ...last.get('toImages') };
  return ask({
    id: 'toImages',
    title: TOOLS.toImages,
    body: html`
      <div class="dialog-row">
        ${selectField('format', F.format, [['png', 'PNG'], ['jpg', 'JPG']], p.format)}
        ${selectField('dpi', F.dpi, DPI_CHOICES.map((d) => [d, String(d)]), p.dpi, { unit: 'dpi' })}
      </div>
      ${pageChoice(p.pages)}`,
    read: (form) => {
      const pages = readPages(form, ctx);
      return pages === undefined ? undefined : { format: val(form, 'format'), dpi: Number(val(form, 'dpi')), pages };
    },
  });
}

export function askFromImages(ctx) {
  const p = { size: 'A4', orientation: 'auto', margin: 10, insert: 'after', ...last.get('fromImages') };
  const files = [];
  return ask({
    id: 'fromImages',
    title: TOOLS.fromImages,
    body: html`
      <div class="pe-files"></div>
      <div class="dialog-row">
        ${selectField('size', F.paper, [['image', F.imageSize], ['A4', 'A4'], ['A3', 'A3']], p.size)}
        ${selectField('orientation', F.orientation, [['auto', F.auto], ['portrait', F.portrait], ['landscape', F.landscape]], p.orientation, { when: 'size=A4|A3' })}
        ${numField('margin', F.margin, p.margin, { min: 0, max: 50, unit: 'mm', when: 'size=A4|A3' })}
      </div>
      <div class="dialog-row">${insertField(p.insert, { newDocument: true, hasDocument: ctx.hasDocument })}</div>`,
    onOpen: (form) => fileBox(form, files, { accept: '.png,.jpg,.jpeg,image/png,image/jpeg', test: isImageFile, kind: 'JPG, PNG' }),
    read: (form) => {
      if (!files.length) return invalid(form.querySelector('[data-file="add"]'));
      const size = val(form, 'size');
      const margin = size === 'image' ? 0 : num(form, 'margin', 0, 50);
      if (margin === undefined) return undefined;
      return { files: [...files], size, orientation: val(form, 'orientation'), margin, insert: val(form, 'insert') };
    },
  });
}

export function askFlatten() {
  const p = { annotations: true, fields: true, ...last.get('flatten') };
  return ask({
    id: 'flatten',
    title: TOOLS.flatten,
    body: html`<div class="pe-fieldset">${check('annotations', F.annotations, p.annotations)}${check('fields', F.fields, p.fields)}</div>`,
    read: (form) => {
      const v = { annotations: form.elements.annotations.checked, fields: form.elements.fields.checked };
      return v.annotations || v.fields ? v : invalid(form.elements.annotations);
    },
  });
}

export function askCompress() {
  const p = { dpi: 150, ...last.get('compress') };
  return ask({
    id: 'compress',
    title: TOOLS.compress,
    body: html`<div class="dialog-row">${selectField('dpi', F.images, [['', F.unchanged], ['300', '300'], ['200', '200'], ['150', '150']], p.dpi ?? '', { unit: 'dpi' })}</div>`,
    read: (form) => ({ dpi: val(form, 'dpi') ? Number(val(form, 'dpi')) : null }),
  });
}

const PERMISSIONS = ['print', 'copy', 'modify', 'annotate', 'forms'];

export function askPassword() {
  return ask({
    title: TOOLS.password,
    body: html`
      <div class="dialog-row">${selectField('action', F.action, [['set', F.setPassword], ['remove', F.removePassword]], 'set')}</div>
      <div class="dialog-row" data-when="action=set">
        ${textField('user', F.openPassword, '', { attrs: 'type="password" autocomplete="new-password"' })}
        ${textField('owner', F.ownerPassword, '', { attrs: 'type="password" autocomplete="new-password"' })}
      </div>
      <fieldset class="pe-fieldset" data-when="action=set"><legend class="field-label">${F.allow}</legend>
        <div class="pe-checks">${PERMISSIONS.map((k) => check(`perm-${k}`, F[k], true))}</div>
      </fieldset>`,
    read: (form) => {
      if (val(form, 'action') === 'remove') return { remove: true };
      const [user, owner] = [val(form, 'user'), val(form, 'owner')];
      if (!user && !owner) return invalid(form.elements.user);
      if (user.includes(',')) return invalid(form.elements.user);
      if (owner.includes(',')) return invalid(form.elements.owner);
      return { remove: false, userPassword: user, ownerPassword: owner, permissions: Object.fromEntries(PERMISSIONS.map((k) => [k, form.elements[`perm-${k}`].checked])) };
    },
  });
}

/** The password of the open file, asked again when a document tool needs it. Resolves null when closed. */
export function askOpenPassword(wrong = false) {
  return ask({
    title: F.currentPassword,
    body: html`<div class="dialog-row">${textField('password', F.currentPassword, '', { attrs: `type="password" autocomplete="current-password" ${wrong ? 'aria-invalid="true"' : ''}` })}</div>`,
    onOpen: (form) => setTimeout(() => form.elements.password.focus()),
    read: (form) => val(form, 'password') || invalid(form.elements.password),
  });
}

const MAX_LEVEL = 6;

/** Bookmarks: title, page and level per row; indent, outdent, remove, add one for the current page. */
export function askOutline(ctx, items) {
  let rows = items.map((it) => ({ title: it.title, page: it.page >= 0 ? it.page + 1 : 1, level: it.level }));
  const row = (r, i) => html`
    <li class="pe-outline-row" data-i="${i}" style="--level:${r.level}">
      <input class="input" name="title" value="${r.title}" aria-label="${F.title}" maxlength="200" />
      <input class="input num" name="page" type="number" min="1" max="${ctx.pageCount}" value="${r.page}" aria-label="${F.page}" />
      <button type="button" class="btn ghost icon-only small" data-row="outdent" title="${F.outdent}" aria-label="${F.outdent}" ${r.level ? '' : raw('disabled')}>${icon('back')}</button>
      <button type="button" class="btn ghost icon-only small" data-row="indent" title="${F.indent}" aria-label="${F.indent}" ${i && r.level < Math.min(MAX_LEVEL, rows[i - 1].level + 1) ? '' : raw('disabled')}>${icon('chevron')}</button>
      <button type="button" class="btn ghost icon-only small" data-row="remove" title="${F.remove}" aria-label="${F.remove}">${icon('trash')}</button>
    </li>`;
  const readRows = (form) =>
    [...form.querySelectorAll('.pe-outline-row')].map((li) => ({
      title: li.querySelector('[name="title"]').value,
      page: Number(li.querySelector('[name="page"]').value),
      level: rows[Number(li.dataset.i)].level,
    }));
  const render = (form, focus) => {
    form.querySelector('.pe-outline').innerHTML = String(html`${rows.map(row)}`);
    if (focus) form.querySelector(focus)?.focus();
  };
  return ask({
    title: TOOLS.outline,
    wide: true,
    body: html`
      <ul class="pe-outline"></ul>
      <div><button type="button" class="btn ghost icon-only small" data-row="add" title="${F.addBookmark}" aria-label="${F.addBookmark}">${icon('plus')}</button></div>`,
    onOpen: (form) => {
      render(form);
      form.addEventListener('click', (e) => {
        const b = e.target.closest('[data-row]');
        if (!b || b.disabled) return;
        rows = readRows(form);
        const i = Number(b.closest('[data-i]')?.dataset.i);
        const kind = b.dataset.row;
        if (kind === 'add') {
          rows.push({ title: `${F.page} ${ctx.current + 1}`, page: ctx.current + 1, level: rows.at(-1)?.level ?? 0 });
          render(form, '.pe-outline-row:last-child [name="title"]');
          return;
        }
        // children of a removed or outdented row move up one level, so the tree stays valid
        const lift = () => {
          for (let k = i + 1; k < rows.length && rows[k].level > rows[i].level; k++) rows[k].level--;
        };
        if (kind === 'remove') {
          lift();
          rows.splice(i, 1);
        } else if (kind === 'indent') rows[i].level++;
        else if (kind === 'outdent') {
          lift();
          rows[i].level--;
        }
        render(form, rows.length ? `[data-i="${Math.min(i, rows.length - 1)}"] [name="title"]` : '[data-row="add"]');
      });
    },
    read: (form) => {
      rows = readRows(form);
      for (const li of form.querySelectorAll('.pe-outline-row')) {
        const page = li.querySelector('[name="page"]');
        if (!(Number(page.value) >= 1 && Number(page.value) <= ctx.pageCount)) return invalid(page);
      }
      return rows.filter((r) => r.title.trim()).map((r) => ({ title: r.title.trim(), page: r.page - 1, level: r.level }));
    },
  });
}

const META = ['title', 'author', 'subject', 'keywords'];

/** Document properties (title, author, subject, keywords). */
export function askProperties(meta) {
  return ask({
    title: TOOLS.properties,
    body: html`${META.map((k) => html`<div class="dialog-row">${textField(k, F[k], meta?.[k] ?? '', { attrs: 'maxlength="500"' })}</div>`)}`,
    read: (form) => Object.fromEntries(META.map((k) => [k, val(form, k).trim()])),
  });
}

export function askBlank() {
  const p = { size: 'A4', orientation: 'portrait', ...last.get('blank') };
  return ask({
    id: 'blank',
    title: TOOLS.blank,
    body: html`<div class="dialog-row">
      ${selectField('size', F.paper, [['A4', 'A4'], ['A3', 'A3']], p.size)}
      ${selectField('orientation', F.orientation, [['portrait', F.portrait], ['landscape', F.landscape]], p.orientation)}
    </div>`,
    read: (form) => ({ size: val(form, 'size'), orientation: val(form, 'orientation') }),
  });
}
