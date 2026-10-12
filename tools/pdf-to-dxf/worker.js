// SPDX-License-Identifier: AGPL-3.0-or-later
// Web Worker of the PDF → DXF tool: MuPDF, extraction, pipeline and DXF writing run here, so the page stays usable.
//
// Messages in:  { id, type, ...args }   type: 'open' | 'extract' | 'render' | 'process' | 'export' | 'scan' | 'cancel'
// Messages out: { id, type: 'progress', value (0…1), label }
//               { id, type: 'done', result }
//               { id, type: 'error', code, message }
// 'cancel' { target } marks a running job; it stops at the next step. Hard stop: terminate the worker.

import { createBackend } from './backend.js';
import { createService } from './convert.js';

let service = null;
const cancelled = new Set();

async function getService() {
  service ??= createService(await createBackend());
  return service;
}

self.onmessage = async (e) => {
  const { id, type } = e.data ?? {};
  if (type === 'cancel') {
    cancelled.add(e.data.target);
    return;
  }
  const ctx = {
    progress: (value, label = '') => self.postMessage({ id, type: 'progress', value, label }),
    isCancelled: () => cancelled.has(id),
  };
  try {
    const svc = await getService();
    const handler = svc[type];
    if (typeof handler !== 'function') throw Object.assign(new Error(`unknown message ${type}`), { code: 'internal' });
    const { value, transfer = [] } = (await handler(e.data, ctx)) ?? {};
    self.postMessage({ id, type: 'done', result: value }, transfer);
  } catch (err) {
    self.postMessage({ id, type: 'error', code: err?.code ?? 'internal', message: String(err?.message ?? err) });
  } finally {
    cancelled.delete(id);
  }
};
