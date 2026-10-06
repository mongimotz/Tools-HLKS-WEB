// Browser file handling: open PDF/JSON, download, hand a file over to another tool page.

import { parseEnvelope, EnvelopeError } from './envelope.js';

const isPdf = (b) => b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46; // %PDF

/** Read a File (PDF with embedded data.json, or plain .json) and return the parsed envelope. */
export async function readEnvelopeFromFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let text;
  if (isPdf(bytes)) {
    try {
      const { extractDataJson } = await import('./pdf.js'); // pdf-lib loads only when a PDF is opened
      text = await extractDataJson(bytes);
    } catch {
      throw new EnvelopeError('pdf-unreadable', 'PDF nicht lesbar');
    }
    if (!text) {
      throw new EnvelopeError('no-data', 'Keine HLKS-Tools-Daten in dieser PDF');
    }
  } else {
    text = new TextDecoder('utf-8').decode(bytes);
  }
  return parseEnvelope(text);
}

/** Open the system file picker. Resolves with a File or null. */
export function pickFile(accept = '.pdf,.json,application/pdf,application/json') {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null), { once: true });
    input.addEventListener('cancel', () => resolve(null), { once: true });
    input.click();
  });
}

export function download(data, filename, type = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function safeFileName(parts, ext) {
  const base = parts
    .filter(Boolean)
    .join('_')
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 120);
  return `${base || 'HLKS-Tools'}.${ext}`;
}

// ---- hand-over between pages (start page import → tool page) ----------------

const HANDOFF_KEY = 'hlks-tools:handoff';

export function stashHandoff(envelope) {
  try {
    sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(envelope));
    return true;
  } catch {
    return false;
  }
}

export function takeHandoff() {
  try {
    const s = sessionStorage.getItem(HANDOFF_KEY);
    sessionStorage.removeItem(HANDOFF_KEY);
    return s ? parseEnvelope(s) : null;
  } catch {
    return null;
  }
}

/** Accept files dropped anywhere on the page. Adds `is-dragging` to <body> while dragging. */
export function enableFileDrop(onFile) {
  let depth = 0;
  const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files');
  window.addEventListener('dragenter', (e) => {
    if (!hasFiles(e)) return;
    depth++;
    document.body.classList.add('is-dragging');
  });
  window.addEventListener('dragleave', (e) => {
    if (!hasFiles(e)) return;
    depth = Math.max(0, depth - 1);
    if (!depth) document.body.classList.remove('is-dragging');
  });
  window.addEventListener('dragover', (e) => {
    if (hasFiles(e)) e.preventDefault();
  });
  window.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth = 0;
    document.body.classList.remove('is-dragging');
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  });
}
