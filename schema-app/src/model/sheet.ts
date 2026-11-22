// SPDX-License-Identifier: AGPL-3.0-or-later
// Paper sizes and the drawing area inside the frame (ISO 5457: 20 mm filing margin left, 10 mm elsewhere).
import type { Sheet, SheetSize } from './types.ts';
import type { Box } from './geometry.ts';

const ISO: Record<SheetSize, [number, number]> = {
  A4: [297, 210],
  A3: [420, 297],
  A2: [594, 420],
  A1: [841, 594],
  A0: [1189, 841],
};

export function paperSize(sheet: Pick<Sheet, 'size' | 'orientation'>): [number, number] {
  const [a, b] = ISO[sheet.size];
  return sheet.orientation === 'landscape' ? [a, b] : [b, a];
}

export const MARGIN = { left: 20, top: 10, right: 10, bottom: 10 };
export const TITLE_BLOCK = { w: 180, h: 30 };

export function frameBox(sheet: Sheet): Box {
  const [w, h] = paperSize(sheet);
  return { x: MARGIN.left, y: MARGIN.top, w: w - MARGIN.left - MARGIN.right, h: h - MARGIN.top - MARGIN.bottom };
}

export function titleBlockBox(sheet: Sheet): Box {
  const f = frameBox(sheet);
  return { x: f.x + f.w - TITLE_BLOCK.w, y: f.y + f.h - TITLE_BLOCK.h, w: TITLE_BLOCK.w, h: TITLE_BLOCK.h };
}

/** Area for components: inside the frame, 5 mm inset, above the title block band. */
export function drawingArea(sheet: Sheet): Box {
  const f = frameBox(sheet);
  return { x: f.x + 5, y: f.y + 5, w: f.w - 10, h: f.h - 10 - TITLE_BLOCK.h };
}
