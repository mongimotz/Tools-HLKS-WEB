// SPDX-License-Identifier: AGPL-3.0-or-later
// Thin wrapper around the EmbedPDF viewer (lib/vendor/embedpdf, Apache-2.0): mount it, open and export bytes,
// history, current page, page edits, change events. The page talks to the viewer only through this module.
// EmbedPDF is loaded here, on demand (`await import()`), never by a shared module.

import { swissMeasure } from './theme.js';

const EMBEDPDF = '../../lib/vendor/embedpdf/embedpdf.js';

/** Load the viewer module and mount `<embedpdf-viewer>` with `config`. Resolves the bridge once it is live. */
export async function mountViewer(el, config) {
  await import(EMBEDPDF);
  const ready = new Promise((resolve) => {
    const onReady = config.onReady;
    config = { ...config, onReady: (viewer) => (onReady?.(viewer), resolve(viewer)) };
  });
  el.config = config;
  await ready;
  return new ViewerBridge(el);
}

class ViewerBridge {
  constructor(el) {
    this.el = el;
    this.listeners = new Set();
    this.detach = null;
    // document plugins exist per document: subscribe again for each one that opens
    this.documents.onOpened(() => this.attach());
    this.documents.onClosed(() => this.detach?.());
  }

  attach() {
    this.detach?.();
    const off = [this.swissScales()];
    const emit = (source) => this.listeners.forEach((f) => f(source));
    const hook = (plugin, events) => {
      const p = this.plugin(plugin);
      for (const e of events) if (typeof p?.[e] === 'function') off.push(p[e](() => emit(plugin)));
    };
    hook('annotation', ['onCreated', 'onUpdated', 'onDeleted']);
    hook('form', ['onValueChanged', 'onFieldCreated', 'onFieldUpdated', 'onFieldDeleted']);
    hook('metadata', ['onUpdated']);
    hook('measurement', ['onScaleChanged']);
    off.push(this.documents.onPagesChanged(() => emit('pages')), this.documents.onUnsavedChangesChanged(() => emit('unsaved')));
    this.detach = () => {
      off.forEach((f) => f?.());
      this.detach = null;
    };
  }

  get viewer() {
    return this.el.viewer;
  }

  get documents() {
    return this.viewer.documents;
  }

  plugin(name) {
    return this.viewer.tryGet(name);
  }

  /** The open document's info, or null. */
  active() {
    return this.documents.getActive();
  }

  hasDocument() {
    return this.active()?.status === 'ready';
  }

  hasUnsavedChanges() {
    return !!this.active()?.hasUnsavedChanges;
  }

  /** Open bytes as the only document (an open one closes). Resolves the document info (`ready` or `locked`). */
  async open(bytes, { name, password } = {}) {
    await this.documents.closeAll();
    const { document } = await this.documents.open({ kind: 'bytes', bytes }, { name, ...(password ? { password } : {}) });
    return document;
  }

  async unlock(password) {
    const id = this.documents.getActiveId();
    if (id) await this.documents.unlock(id, { password });
  }

  async close() {
    await this.documents.closeAll();
  }

  /** The PDF with every change. Incremental (appended), so existing digital signatures stay valid. */
  bytes() {
    return this.documents.download();
  }

  pageCount() {
    return this.active()?.pageCount ?? 0;
  }

  currentPage() {
    return this.plugin('stage')?.getCurrentPageIndex() ?? 0;
  }

  goToPage(index) {
    this.plugin('stage')?.goToPage(index);
  }

  execute(id, args) {
    return this.viewer.commands.execute(id, args === undefined ? undefined : { args });
  }

  enabled(id) {
    try {
      return !!this.viewer.commands.resolveCommand(id)?.enabled;
    } catch {
      return false;
    }
  }

  /** Call `onChange(source)` whenever the document content changes (annotations, form, pages, metadata, scale). */
  onChange(onChange) {
    this.listeners.add(onChange);
    return () => this.listeners.delete(onChange);
  }

  /** Call `onEvent(type, detail)` for document life cycle events: opened, locked, failed, closed. */
  onDocument(onEvent) {
    const d = this.documents;
    const off = [
      d.onOpened((e) => onEvent('opened', e)),
      d.onLocked((e) => onEvent('locked', e)),
      d.onOpenFailed((e) => onEvent('failed', e)),
      d.onClosed((e) => onEvent('closed', e)),
    ];
    return () => off.forEach((f) => f?.());
  }

  /** Keep every page scale in Swiss number format (1’234.50), also after calibration or a preset. */
  swissScales() {
    const m = this.plugin('measurement');
    if (typeof m?.onScaleChanged !== 'function') return null;
    return m.onScaleChanged(({ page }) => {
      const scale = m.getPageScale(page);
      if (scale?.source !== 'owned') return; // the default scale is Swiss already (theme.js defaultMeasure)
      const next = swissMeasure(scale.measure);
      if (next) m.setScale(page, next).catch(() => {});
    });
  }

  // ---- pages (EmbedPDF page-edit plugin; each edit is one undo step in the viewer) ----------------------

  get pages() {
    const edit = () => this.plugin('pageEdit');
    const at = () => this.currentPage();
    return {
      rotate: (delta) => edit().rotateBy([at()], delta),
      insertBlank: () => edit().insertBlank({ placement: { after: at() } }),
      duplicate: () => edit().duplicate([at()], { placement: { after: at() } }),
      /** Delete the current page. Resolves { index, bytes } to restore it (the page with its annotations), or null. */
      delete: async () => {
        if (this.pageCount() < 2) return null;
        const index = at();
        const bytes = await edit().extract([index]);
        await edit().delete([index]);
        return { index, bytes };
      },
      restore: async ({ index, bytes }) => {
        await edit().insertFromBytes(bytes, { placement: index === 0 ? 'start' : { after: index - 1 } });
        this.goToPage(index);
      },
      move: async (step) => {
        const i = at();
        const j = i + step;
        if (j < 0 || j >= this.pageCount()) return;
        await edit().reorder([i], step < 0 ? { before: j } : { after: j });
        this.goToPage(j);
      },
      insertBytes: (bytes, placement = 'end') => edit().insertFromBytes(bytes, { placement }),
    };
  }
}
