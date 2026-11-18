// SPDX-License-Identifier: AGPL-3.0-or-later
// Exports: PDF (vector, 1:1 on the sheet size, text as text with embedded Plex), SVG, PNG 300 dpi.
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

export function baseName(fileName: string): string {
  return fileName.replace(/\.schema$/i, '') || 'prinzipschema';
}

export function exportSvgText(doc: Schema, opts: { mono?: boolean } = {}): string {
  return renderSchema(doc, { mono: opts.mono }).svg;
}

export async function makePdf(doc: Schema, opts: { mono?: boolean } = {}): Promise<Blob> {
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
  pdf.setProperties({
    title: doc.meta.title || 'Prinzipschema',
    subject: doc.meta.project,
    author: doc.meta.author,
    creator: 'HLKS-Tools Prinzipschema',
  });
  return pdf.output('blob');
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
) {
  const base = baseName(fileName);
  if (kind === 'svg') return download(`${base}.svg`, exportSvgText(doc, opts), 'image/svg+xml');
  if (kind === 'pdf') return download(`${base}.pdf`, await makePdf(doc, opts), 'application/pdf');
  return download(`${base}.png`, await makePng(doc, 300, opts), 'image/png');
}
