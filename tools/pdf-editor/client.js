// SPDX-License-Identifier: AGPL-3.0-or-later
// Page side of the editor's worker (worker.js): one call per operation, progress, cancel, hard stop.

export class WorkerClient {
  constructor() {
    this.seq = 0;
    this.jobs = new Map();
    this.worker = null;
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

  /** Start an operation. Returns { id, promise }; `transfer` hands buffers over without a copy. */
  call(type, args = {}, { transfer = [], onProgress } = {}) {
    if (!this.worker) this.spawn();
    const id = ++this.seq;
    const promise = new Promise((resolve, reject) => {
      this.jobs.set(id, { resolve, reject, onProgress });
      this.worker.postMessage({ id, type, ...args }, transfer);
    });
    return { id, promise };
  }

  cancel(id) {
    this.worker?.postMessage({ type: 'cancel', target: id });
  }

  /** Hard stop: a running MuPDF call cannot be interrupted, so the worker is replaced. */
  restart() {
    this.worker?.terminate();
    for (const j of this.jobs.values()) j.reject(Object.assign(new Error('cancelled'), { code: 'cancelled' }));
    this.jobs.clear();
    this.worker = null;
  }
}
