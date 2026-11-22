// SPDX-License-Identifier: AGPL-3.0-or-later
// Writes examples/symbol-catalog.schema: every symbol with its name, as a visual test of the library.
// Usage: npx tsx scripts/make-catalog.ts
import { writeFileSync } from 'node:fs';
import { emptySchema } from '../src/model/create.ts';
import { serialize } from '../src/model/serialize.ts';
import { allSymbols, CATEGORIES, symbolVariant } from '../src/symbols/library.ts';
import { drawingArea } from '../src/model/sheet.ts';
import { snap } from '../src/model/geometry.ts';

const s = emptySchema('Symbolübersicht', '2026-11-18');
s.meta.project = 'HLKS-Tools Prinzipschema';
s.sheet.legend = false;
s.sheet.size = 'A1';
const area = drawingArea(s.sheet);
const COLS = 10,
  CW = (area.w - 10) / COLS;
// Every variant of every offered symbol (hidden legacy types are left out).
const defs = CATEGORIES.flatMap((cat) =>
  allSymbols()
    .filter((d) => d.category === cat.id && !d.hidden)
    .flatMap((d) =>
      d.variants?.length
        ? d.variants.map((v) => ({ ...symbolVariant(d.id, v.id), name: v.name, variant: v.id, typeId: d.id }))
        : [{ ...d, variant: '', typeId: d.id }],
    ),
);
const H = (d: { size: number[]; bounds?: number[] }) => Math.max(d.bounds?.[3] ?? d.size[1] ?? 0, 15);
// Row height from the tallest symbol in the row.
const rowTop: number[] = [area.y + 12];
for (let r = 0; r * COLS < defs.length; r++) {
  const h = Math.max(...defs.slice(r * COLS, r * COLS + COLS).map(H));
  rowTop.push(rowTop[r]! + h + 22);
}
let i = 0;
{
  for (const d of defs) {
    const col = i % COLS,
      row = Math.floor(i / COLS);
    const rh = Math.max(...defs.slice(row * COLS, row * COLS + COLS).map(H));
    const x = snap(area.x + 5 + col * CW + CW / 2, 2.5),
      y = snap(rowTop[row]! + 6 + Math.max(d.size[1], 15) / 2, 2.5);
    s.components.push({
      id: `S${String(i + 1).padStart(2, '0')}`,
      type: d.typeId,
      ...(d.variant ? { variant: d.variant } : {}),
      label: '',
      props: {},
      pos: [x, y],
      rot: 0,
      flip: false,
      pinned: true,
    });
    const name = d.name;
    s.texts.push({
      id: `T${String(i + 1).padStart(2, '0')}`,
      pos: [snap(x - CW / 2 + 3, 0.5), rowTop[row]! + 6 + rh + 4],
      text: name,
      size: 2.5,
    });
    s.texts.push({
      id: `I${String(i + 1).padStart(2, '0')}`,
      pos: [snap(x - CW / 2 + 3, 0.5), rowTop[row]! + 6 + rh + 7.5],
      text: d.variant ? `${d.typeId} #${d.variant}` : d.typeId,
      size: 2,
    });
    i++;
  }
}
writeFileSync(new URL('../examples/symbol-catalog.schema', import.meta.url), serialize(s));
console.log(`${i} symbols → examples/symbol-catalog.schema`);
