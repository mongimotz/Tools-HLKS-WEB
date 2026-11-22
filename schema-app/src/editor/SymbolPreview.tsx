// SPDX-License-Identifier: AGPL-3.0-or-later
import type { SymbolDef } from '../model/types.ts';
import { medium } from '../model/media.ts';
import { DEFAULT_STYLE } from '../render/style.ts';

/** Same SVG body as on the sheet, medium placeholders in their colour, plus the default inner text. */
export function previewSvg(def: SymbolDef, text?: string): string {
  let svg = def.svg.replace(
    /\{\{([a-z.-]+)\}\}/g,
    (_, id: string) => DEFAULT_STYLE.colors.media[id] ?? medium(id)?.color ?? 'currentColor',
  );
  const t = def.text;
  const value = text ?? t?.value;
  if (t && value) {
    const esc = value.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    svg += `<text x="${t.at[0]}" y="${t.at[1] + t.size * 0.35}" font-size="${t.size}" text-anchor="${t.align ?? 'middle'}" fill="currentColor" stroke="none">${esc}</text>`;
  }
  return svg;
}

/** Small drawing of a symbol for the palette and the variant picker. */
export function SymbolPreview({ def, size = 36, text }: { def: SymbolDef; size?: number; text?: string }) {
  const [bx, by, bw, bh] = def.bounds ?? [0, 0, def.size[0], def.size[1]];
  // Margin for small symbols; square view around the drawing.
  const side = Math.max(bw, bh, 10) + 6;
  const cx = bx + bw / 2,
    cy = by + bh / 2;
  const vb = `${cx - side / 2} ${cy - side / 2} ${side} ${side}`;
  return (
    <svg
      className="sym-preview"
      width={size}
      height={size}
      viewBox={vb}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <g
        fill="none"
        stroke="currentColor"
        color="currentColor"
        strokeWidth={Math.max(0.35, side / 90)}
        fontFamily="var(--font)"
        dangerouslySetInnerHTML={{ __html: previewSvg(def, text) }}
      />
    </svg>
  );
}
