// SPDX-License-Identifier: AGPL-3.0-or-later
import type { SymbolDef } from '../model/types.ts';

/** Small drawing of a symbol for the palette (same SVG body as on the sheet). */
export function SymbolPreview({ def, size = 36 }: { def: SymbolDef; size?: number }) {
  const [w, h] = def.size;
  // Margin for drawing parts outside the box (actuators) and small symbols; square view.
  const side = Math.max(w, h, 10) + 10;
  const vb = `${w / 2 - side / 2} ${h / 2 - side / 2} ${side} ${side}`;
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
        strokeWidth={0.5}
        fontFamily="var(--font)"
        dangerouslySetInnerHTML={{ __html: def.svg }}
      />
    </svg>
  );
}
