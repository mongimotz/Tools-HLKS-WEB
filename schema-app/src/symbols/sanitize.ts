// SPDX-License-Identifier: AGPL-3.0-or-later
// Sanitiser for own symbol drawings (from the symbol editor or from a file someone sent). Pure string code
// (no DOM), so the CLI uses it too. Keeps only plain shapes and text with geometry and paint attributes;
// everything else (scripts, event handlers, links, images, styles, foreign objects) is dropped.

const TAGS = new Set(['g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan']);
const ATTRS = new Set([
  'd',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'width',
  'height',
  'points',
  'transform',
  'fill',
  'stroke',
  'stroke-dasharray',
  'stroke-linecap',
  'stroke-linejoin',
  'font-size',
  'font-weight',
  'text-anchor',
  'dominant-baseline',
  'opacity',
  'fill-opacity',
]);
// Paint: none, currentColor or a medium placeholder; no colours, urls or references.
const PAINT = /^(none|currentColor|\{\{[a-z.-]+\}\})$/;
const SAFE_VALUE = /^[-0-9a-zA-Z.,\s()%#{}_]*$/;

function escText(s: string): string {
  return s
    .replace(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/gi, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function sanitizeSvg(svg: string): string {
  const out: string[] = [];
  const open: string[] = [];
  const re = /<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>|([^<]+)|(<)/g;
  let m: RegExpExecArray | null;
  let skip = 0; // depth inside a dropped element
  while ((m = re.exec(svg))) {
    if (m[5] !== undefined || m[6] !== undefined) {
      if (!skip && open.length && /^(text|tspan)$/.test(open[open.length - 1]!)) out.push(escText(m[5] ?? '&lt;'));
      continue;
    }
    const closing = m[1] === '/';
    const tag = m[2]!.toLowerCase();
    const selfClosing = m[4] === '/' || /\/\s*$/.test(m[3] ?? '');
    const ok = TAGS.has(tag);
    if (closing) {
      // Inside a dropped element every opening tag counted one level.
      if (skip) {
        skip--;
        continue;
      }
      if (!ok) continue;
      const k = open.lastIndexOf(tag);
      if (k < 0) continue;
      while (open.length > k) out.push(`</${open.pop()}>`);
      continue;
    }
    if (!ok || skip) {
      if (!selfClosing) skip++;
      continue;
    }
    const attrs: string[] = [];
    const ar = /([a-zA-Z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
    let a: RegExpExecArray | null;
    while ((a = ar.exec(m[3] ?? ''))) {
      const name = a[1]!.toLowerCase();
      const value = a[3] ?? a[4] ?? '';
      if (!ATTRS.has(name) || !SAFE_VALUE.test(value)) continue;
      if ((name === 'fill' || name === 'stroke') && !PAINT.test(value.trim())) continue;
      attrs.push(`${name}='${value}'`);
    }
    const head = `<${tag}${attrs.length ? ' ' + attrs.join(' ') : ''}`;
    if (selfClosing) out.push(`${head}/>`);
    else {
      out.push(`${head}>`);
      open.push(tag);
    }
  }
  while (open.length) out.push(`</${open.pop()}>`);
  return out.join('');
}
