// SPDX-License-Identifier: AGPL-3.0-or-later
// Web Worker of the PDF-Editor: MuPDF document tools, symbols, stamps and OCR run here, so the page stays usable.
//
// Messages in:  { id, type, ...args }   type: an operation of engine.js, or 'cancel' { target }
// Messages out: { id, type: 'progress', value (0…1), label }
//               { id, type: 'done', result }
//               { id, type: 'error', code, message }

import { createEngine } from './engine.js';

let engine = null;
const cancelled = new Set();

const readAsset = async (path) => {
  const res = await fetch(new URL(`../../${path}`, import.meta.url));
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
};

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
    engine ??= await createEngine({ readAsset });
    const op = engine.ops[type];
    if (typeof op !== 'function') throw Object.assign(new Error(`unknown message ${type}`), { code: 'internal' });
    const { value, transfer = [] } = (await op(e.data, ctx)) ?? {};
    self.postMessage({ id, type: 'done', result: value }, transfer);
  } catch (err) {
    self.postMessage({ id, type: 'error', code: err?.code ?? 'internal', message: String(err?.message ?? err) });
  } finally {
    cancelled.delete(id);
  }
};
