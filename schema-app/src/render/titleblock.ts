// SPDX-License-Identifier: AGPL-3.0-or-later
// Built-in title block: an SVG template in title-block-local mm (180 × 30) with {{…}} placeholders.
import type { Schema } from '../model/types.ts';
import { esc } from './text.ts';

export const DEFAULT_TITLE_BLOCK = `
<rect x="0" y="0" width="180" height="30" class="tb-line"/>
<path d="M115 0V30M115 10H180M115 20H180M147.5 0V30" class="tb-line"/>
<text x="3" y="5" class="tb-label">Prinzipschema</text>
<text x="3" y="14.5" class="tb-title">{{meta.title}}</text>
<text x="3" y="23" class="tb-value">{{meta.project}}</text>
<text x="117" y="3.6" class="tb-label">Datum</text>
<text x="117" y="8.3" class="tb-value">{{meta.date}}</text>
<text x="149.5" y="3.6" class="tb-label">Revision</text>
<text x="149.5" y="8.3" class="tb-value">{{meta.revision}}</text>
<text x="117" y="13.6" class="tb-label">Bearbeiter</text>
<text x="117" y="18.3" class="tb-value">{{meta.author}}</text>
<text x="149.5" y="13.6" class="tb-label">Format</text>
<text x="149.5" y="18.3" class="tb-value">{{sheet.size}}</text>
<text x="117" y="23.6" class="tb-label">Massstab</text>
<text x="117" y="28.3" class="tb-value">ohne</text>
<text x="149.5" y="23.6" class="tb-label">Blatt</text>
<text x="149.5" y="28.3" class="tb-value">1</text>
`;

/** Fills {{meta.x}} and {{sheet.x}} placeholders with XML-escaped values. Unknown ones become "". */
export function fillTemplate(tpl: string, s: Schema): string {
  return tpl.replace(/\{\{\s*([a-zA-Z]+)\.([a-zA-Z]+)\s*\}\}/g, (_, obj: string, key: string) => {
    const src =
      obj === 'meta'
        ? (s.meta as unknown as Record<string, unknown>)
        : obj === 'sheet'
          ? (s.sheet as unknown as Record<string, unknown>)
          : null;
    const v = src?.[key];
    return v == null ? '' : esc(String(v));
  });
}
