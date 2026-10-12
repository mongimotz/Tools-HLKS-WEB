// SPDX-License-Identifier: AGPL-3.0-or-later
// A large plan-like PDF built at test time (not committed): walls, furniture polylines, hatching, arcs and
// short texts, at least `segments` straight or curved pieces in total.

import { PDFDocument, StandardFonts } from '../../lib/vendor/pdf-lib/pdf-lib.esm.min.js';

export async function heavyPdf({ segments = 300000, seed = 7 } = {}) {
  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  const W = 2383.94; // A1 landscape
  const H = 1683.78;
  const f = (v) => v.toFixed(2);
  const ops = [];
  let n = 0;
  ops.push('0.5 w 0 0 0 RG');
  // grid of rooms: rectangles
  while (n < segments * 0.2) {
    const x = rand() * (W - 60);
    const y = rand() * (H - 60);
    ops.push(`${f(x)} ${f(y)} ${f(10 + rand() * 50)} ${f(10 + rand() * 50)} re S`);
    n += 4;
  }
  // furniture: polylines with 20 points
  ops.push('0.25 w 0.2 0.2 0.6 RG');
  while (n < segments * 0.6) {
    let x = rand() * W;
    let y = rand() * H;
    let p = `${f(x)} ${f(y)} m`;
    for (let k = 0; k < 20; k++) {
      x = Math.min(W, Math.max(0, x + (rand() - 0.5) * 8));
      y = Math.min(H, Math.max(0, y + (rand() - 0.5) * 8));
      p += ` ${f(x)} ${f(y)} l`;
    }
    ops.push(`${p} S`);
    n += 20;
  }
  // hatching: groups of 12 parallel short lines
  ops.push('0.1 w 0 0 0 RG');
  while (n < segments * 0.9) {
    const x = rand() * (W - 40);
    const y = rand() * (H - 40);
    let p = '';
    for (let k = 0; k < 12; k++) p += `${f(x + k * 2)} ${f(y)} m ${f(x + k * 2 + 10)} ${f(y + 10)} l `;
    ops.push(`${p}S`);
    n += 12;
  }
  // door swings: quarter circles as Béziers
  ops.push('0.3 w 0 0 0 RG');
  const k = 0.5523;
  while (n < segments) {
    const cx = rand() * W;
    const cy = rand() * H;
    const r = 5 + rand() * 20;
    ops.push(`${f(cx + r)} ${f(cy)} m ${f(cx + r)} ${f(cy + k * r)} ${f(cx + k * r)} ${f(cy + r)} ${f(cx)} ${f(cy + r)} c S`);
    n += 1;
  }
  const doc = await PDFDocument.create();
  const page = doc.addPage([W, H]);
  page.node.addContentStream(doc.context.register(doc.context.flateStream(ops.join('\n'))));
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let t = 0; t < 400; t++) page.drawText(`R ${t}`, { x: rand() * (W - 50), y: rand() * (H - 20), size: 6, font });
  return { bytes: await doc.save(), segments: n };
}
