// SPDX-License-Identifier: AGPL-3.0-or-later
// Stamp library of the PDF-Editor: the templates in stamps/ and the user's own stamps (settings), filled
// with name and date, drawn in IBM Plex Sans, as one library PDF for the viewer. No DOM.

import { fillPlaceholders, svgToPdf, buildLibrary, xmlEscape } from './svg.js';

export const STAMP_LIBRARY_ID = 'hlks-stempel';
export const STAMP_LIBRARY_TITLE = 'Stempel';

/** SVG of an own stamp: its text in semibold, name and date below, frame rect / round / none. */
export function ownStampSvg({ text, frame }, measure = (s) => s.length * 0.55) {
  const width = Math.max(224, Math.ceil(measure(text, true) * 24 + 48));
  const rx = frame === 'round' ? 32 : 6;
  const box = frame === 'none' ? '' : `<rect x="2" y="2" width="${width - 4}" height="60" rx="${rx}" fill="none" stroke="currentColor" stroke-width="3"/>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width / 4}mm" height="16mm" viewBox="0 0 ${width} 64">` +
    box +
    `<text x="${width / 2}" y="30" font-size="24" font-weight="600" text-anchor="middle" fill="currentColor">${xmlEscape(text)}</text>` +
    `<text x="${width / 2}" y="52" font-size="13" text-anchor="middle" fill="currentColor">{name} | {datum}</text></svg>`
  );
}

/**
 * The stamp library PDF. templates: [{ id, label, svg, color }] (stamps/manifest.json with the SVG text),
 * own: settings.stamps, values: { name, datum }, colors: [annot-1 …], fonts: { regular, semibold } (TTF).
 * `measure(text, bold)` gives the advance width in em (for own stamps), from the Plex font.
 */
export function buildStampLibrary(mupdf, { templates, own = [], values, colors, fonts, source = '', measure }) {
  const color = (slot) => colors[slot - 1] ?? colors[0] ?? '#000000';
  const items = [
    ...templates.map((t) => ({ id: t.id, label: t.label, svg: t.svg, color: t.color })),
    ...own.map((s) => ({ id: `eigen-${s.id}`, label: s.text, svg: ownStampSvg(s, measure), color: s.color })),
  ].map((t) => ({ id: t.id, label: t.label, pdf: svgToPdf(mupdf, fillPlaceholders(t.svg, values, color(t.color)), { fonts }) }));
  return buildLibrary(mupdf, items, { title: STAMP_LIBRARY_TITLE, libraryId: STAMP_LIBRARY_ID, source });
}
