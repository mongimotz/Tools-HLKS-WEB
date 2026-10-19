// SPDX-License-Identifier: AGPL-3.0-or-later
// Own UI of the PDF-Editor around the viewer: the Symbole panel (inside the viewer, slot `panel:symbols`),
// the settings dialog and the dialogs of the document tools. Labels from labels.js; DESIGN.md rules.

import { html, raw, icon, toast } from '../../lib/core/ui.js';
import { pickFile, download } from '../../lib/core/files.js';
import { DATE_FORMATS, STAMP_FRAMES, COLOR_ROLES, normalizeSettings } from './defaults.js';
import { ACTIONS, COLOR_NAMES, ROLE_LABELS, FRAME_LABELS, DATE_LABELS, SETTINGS, SYMBOLS } from './labels.js';
import { SYMBOL_KIND, OWN_LIBRARY_ID, addOwnSymbols, exportOwn, importOwn, ownLibrary } from './library.js';

// ---- dialogs ------------------------------------------------------------------------------------------

/**
 * A modal dialog in the shared catalogue-window look: title, close icon, body, apply icon.
 * `onApply(form)` returns false to keep it open. Escape and an outside click close it.
 */
export function openDialog({ title, body, onApply, onOpen, wide = false }) {
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
    if (dlg.open) dlg.close();
    dlg.remove();
    opener?.focus?.({ preventScroll: true });
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
