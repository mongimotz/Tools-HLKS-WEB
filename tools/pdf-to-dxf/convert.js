// SPDX-License-Identifier: AGPL-3.0-or-later
// Conversion service of the PDF → DXF tool: open, extract, render. The worker (worker.js) calls it; tests call it
// directly in Node. No DOM.

import { PdfError } from './backend.js';

/** Service around one backend. Every method returns { value, transfer? } (transfer: buffers for postMessage). */
export function createService(backend) {
  const cache = new Map(); // extracted pages by page index and extraction options

  function extractCached(page, options = {}) {
    const key = `${page}|${!!options.hiddenLayers}|${options.textOutlines ?? 'none'}|${options.curveTol ?? 0.05}`;
    let p = cache.get(key);
    if (!p) {
      p = backend.extract(page, options);
      if (cache.size > 6) cache.delete(cache.keys().next().value);
      cache.set(key, p);
    }
    return p;
  }

  return {
    backend,
    extractCached,

    open({ bytes }) {
      cache.clear();
      backend.open(bytes);
      const pageCount = backend.getPageCount();
      const pages = [];
      for (let i = 0; i < pageCount; i++) pages.push(backend.getPageInfo(i));
      return { value: { pageCount, pages, layers: backend.getLayers() } };
    },

    extract({ page, options }) {
      return { value: extractCached(page, options) };
    },

    render({ page, dpi, maxPixels }) {
      if (!Number.isInteger(page)) throw new PdfError('page');
      const r = backend.renderPage(page, dpi, maxPixels ? { maxPixels } : undefined);
      return { value: r, transfer: [r.data.buffer] };
    },
  };
}
