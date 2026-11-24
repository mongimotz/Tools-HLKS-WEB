// SPDX-License-Identifier: AGPL-3.0-or-later
// Exports: PDF (vector, 1:1 on the sheet size, text as text with embedded Plex and data.json), SVG, PNG 300 dpi.
// Never with grid or note pins. jsPDF and svg2pdf load only when a PDF is made.
import type { Schema } from '../model/types.ts';
import { paperSize } from '../model/sheet.ts';
import { renderSchema } from '../render/render.ts';
import { download } from './files.ts';

// Fonts are static files next to the page (public/fonts → dist/fonts), so relative to the document.
const fontUrl = (w: number) => new URL(`fonts/plex-sans-${w}.ttf`, document.baseURI).href;

const FAMILY = 'IBM Plex Sans Var';

async function fontBase64(url: string): Promise<string> {
  const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

function bytesToLatin1(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return out;
}

/** Standard HLKS-Tools envelope wrapping a Prinzipschema document for data.json embedding. */
export function schemaEnvelope(doc: Schema, fileName = '') {
  return {
    format: 'hlks-tools',
    envelopeVersion: 1,
    tool: 'schema',
    version: doc.version,
    calcVersion: '1.0.0',
    savedAt: new Date().toISOString(),
    project: {
      name: doc.meta.project || doc.meta.title || '',
      number: '',
      author: doc.meta.author || '',
      date: doc.meta.date || '',
    },
    inputs: doc,
    snapshot: {
      fileName: fileName || undefined,
      title: doc.meta.title,
      components: doc.components.length,
      connections: doc.connections.length,
      size: doc.sheet.size,
    },
  };
}

/** Attach data.json into a jsPDF document's /Names /EmbeddedFiles tree so HLKS-Tools can reopen the PDF. */
function attachEnvelopeToJsPdf(pdf: unknown, envelope: unknown) {
  const internal = (pdf as {
    internal: {
      events: { subscribe(event: string, fn: () => void): void };
      newObject(): number;
      out(s: string): void;
    };
  }).internal;
  const jsonBytes = new TextEncoder().encode(JSON.stringify(envelope, null, 2));
  const payload = bytesToLatin1(jsonBytes);
  let treeObj = 0;
  internal.events.subscribe('putResources', () => {
    const efObj = internal.newObject();
    internal.out(`<< /Type /EmbeddedFile /Subtype /application#2Fjson /Length ${jsonBytes.length} >>`);
    internal.out('stream');
    internal.out(payload);
    internal.out('endstream');
    internal.out('endobj');

    const specObj = internal.newObject();
    internal.out(
      `<< /Type /Filespec /F (data.json) /UF (data.json) /Desc (HLKS-Tools Eingabedaten) /EF << /F ${efObj} 0 R /UF ${efObj} 0 R >> >>`,
    );
    internal.out('endobj');

    treeObj = internal.newObject();
    internal.out(`<< /Names [(data.json) ${specObj} 0 R] >>`);
    internal.out('endobj');
  });
  internal.events.subscribe('putCatalog', () => {
    if (treeObj) internal.out(`/Names << /EmbeddedFiles ${treeObj} 0 R >>`);
  });
}

function sanitizePart(s: string): string {
  return s
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, '-');
}

export function baseName(fileName: string, doc?: Schema): string {
  const stem = fileName.replace(/\.schema$/i, '');
  if (stem && stem !== 'prinzipschema') return stem;
  if (doc) {
    const title = doc.meta.title && doc.meta.title !== 'Neues Prinzipschema' ? doc.meta.title : '';
    const parts = ['Prinzipschema', doc.meta.project, title, doc.meta.date].map((p) => sanitizePart(p || '')).filter(Boolean);
    if (parts.length > 1) return parts.join('_').slice(0, 120);
  }
  return stem || 'prinzipschema';
}

export function exportSvgText(doc: Schema, opts: { mono?: boolean } = {}): string {
  return renderSchema(doc, { mono: opts.mono }).svg;
}

export async function makePdf(doc: Schema, opts: { mono?: boolean; fileName?: string } = {}): Promise<Blob> {
  const [{ jsPDF }] = await Promise.all([import('jspdf'), import('svg2pdf.js')]);
  const [W, H] = paperSize(doc.sheet);
  const pdf = new jsPDF({ unit: 'mm', format: [W, H], orientation: W > H ? 'landscape' : 'portrait', compress: true });
  const [r400, r600] = await Promise.all([fontBase64(fontUrl(400)), fontBase64(fontUrl(600))]);
  pdf.addFileToVFS('plex-400.ttf', r400);
  pdf.addFileToVFS('plex-600.ttf', r600);
  pdf.addFont('plex-400.ttf', FAMILY, 'normal');
  // svg2pdf asks for "600normal" at font-weight 600, "bold" at 700.
  pdf.addFont('plex-600.ttf', FAMILY, '600normal');
  pdf.addFont('plex-600.ttf', FAMILY, 'bold');
  const svg = new DOMParser().parseFromString(exportSvgText(doc, opts), 'image/svg+xml').documentElement;
  await pdf.svg(svg, { x: 0, y: 0, width: W, height: H });
  attachEnvelopeToJsPdf(pdf, schemaEnvelope(doc, opts.fileName));
  pdf.setProperties({
    title: doc.meta.title || 'Prinzipschema',
    subject: doc.meta.project || 'HLKS-Tools: Prinzipschema',
    author: doc.meta.author,
    keywords: 'hlks-tools, schema',
    creator: 'HLKS-Tools Prinzipschema',
  });
  return pdf.output('blob');
}

/** Extract an embedded data.json string from a PDF (supports both uncompressed and FlateDecode streams). */
export async function extractDataJsonFromPdf(bytes: Uint8Array): Promise<string | null> {
  const latin1 = bytesToLatin1(bytes);
  const re = /\/Type\s*\/EmbeddedFile([\s\S]*?)>>\s*stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(latin1))) {
    const dict = m[1] ?? '';
    const start = m.index + m[0].length;
    const end = latin1.indexOf('endstream', start);
    if (end < 0) continue;
    let sliceEnd = end;
    if (bytes[sliceEnd - 1] === 0x0a) sliceEnd--;
    if (bytes[sliceEnd - 1] === 0x0d) sliceEnd--;
    let raw = bytes.subarray(start, sliceEnd);
    if (/\/FlateDecode\b/.test(dict) && typeof DecompressionStream !== 'undefined') {
      try {
        const copy = new Uint8Array(raw);
        const ds = new DecompressionStream('deflate');
        const out = await new Response(new Blob([copy]).stream().pipeThrough(ds)).arrayBuffer();
        raw = new Uint8Array(out);
      } catch {
        continue;
      }
    }
    const text = new TextDecoder('utf-8').decode(raw).trim();
    if (text.startsWith('{') && (text.includes('"hlks-tools"') || text.includes('"hlks-schema"'))) return text;
  }
  return null;
}

/** Hand the exported PDF directly over to HLKS-Tools PDF-Editor via the shared IndexedDB handoff store. */
export async function openInPdfEditor(doc: Schema, fileName: string, opts: { mono?: boolean } = {}): Promise<boolean> {
  const blob = await makePdf(doc, { ...opts, fileName });
  const name = `${baseName(fileName, doc)}.pdf`;
  const file = new File([blob], name, { type: 'application/pdf' });
  const ok = await new Promise<boolean>((resolve) => {
    try {
      const req = indexedDB.open('hlks-tools', 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains('handoff')) req.result.createObjectStore('handoff');
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('handoff', 'readwrite');
        tx.objectStore('handoff').put(file, 'file');
        tx.oncomplete = () => (db.close(), resolve(true));
        tx.onerror = tx.onabort = () => (db.close(), resolve(false));
      };
      req.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
  if (ok) location.href = '../tools/pdf-editor/';
  return ok;
}

/** PNG at `dpi` (default 300), fonts embedded so the image looks like the PDF. */
export async function makePng(doc: Schema, dpi = 300, opts: { mono?: boolean } = {}): Promise<Blob> {
  const [W, H] = paperSize(doc.sheet);
  const [r400, r600] = await Promise.all([fontBase64(fontUrl(400)), fontBase64(fontUrl(600))]);
  const style = `<style>@font-face{font-family:'${FAMILY}';font-weight:400;src:url(data:font/ttf;base64,${r400})}@font-face{font-family:'${FAMILY}';font-weight:600;src:url(data:font/ttf;base64,${r600})}</style>`;
  const px = (mm: number) => Math.round((mm / 25.4) * dpi);
  const svg = exportSvgText(doc, opts)
    .replace(/width="[^"]+mm" height="[^"]+mm"/, `width="${px(W)}" height="${px(H)}"`)
    .replace(/(<svg[^>]*>)/, `$1${style}`);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = px(W);
    canvas.height = px(H);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error('PNG fehlgeschlagen'))), 'image/png'),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function exportAs(
  doc: Schema,
  fileName: string,
  kind: 'pdf' | 'svg' | 'png',
  opts: { mono?: boolean } = {},
): Promise<string> {
  const base = baseName(fileName, doc);
  const name = `${base}.${kind}`;
  if (kind === 'svg') download(name, exportSvgText(doc, opts), 'image/svg+xml');
  else if (kind === 'pdf') download(name, await makePdf(doc, { ...opts, fileName }), 'application/pdf');
  else download(name, await makePng(doc, 300, opts), 'image/png');
  return name;
}
