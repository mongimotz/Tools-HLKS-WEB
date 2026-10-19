// SPDX-License-Identifier: AGPL-3.0-or-later
// SVG for symbols and stamps: sanitising, placeholder filling, SVG → one-page PDF and stamp library PDFs.
// No DOM (runs in the editor's worker and in Node). The MuPDF module is passed in by the caller; the SVG
// itself is drawn by svg-render.js (the MuPDF.js build has no SVG reader).
//
// A stamp library is a plain PDF the viewer imports as one library: one page per symbol, the page size is
// the symbol's size, `/Info /Title` is the library's name and the catalog's `/Names /Pages` tree registers
// each page as `<id>=<label>` (the format Acrobat uses for stamp files, which EmbedPDF reads).

import { renderSvg } from './svg-render.js';

export class SvgError extends Error {
  /** code: 'not-svg' | 'empty' | 'too-large' */
  constructor(code) {
    super(code);
    this.code = code;
  }
}

export const MAX_SVG_BYTES = 2 * 1024 * 1024;
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };
export const xmlEscape = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

/**
 * Remove what an SVG must not bring along: scripts, event handlers, foreign HTML, external references
 * (links, images, fonts, styles from other files), animations that could set them, and document type
 * declarations (entity expansion). Keeps shapes, paths, text, gradients and inline data images.
 */
export function sanitizeSvg(text) {
  if (typeof text !== 'string') throw new SvgError('not-svg');
  if (text.length > MAX_SVG_BYTES) throw new SvgError('too-large');
  let s = text.replace(/^﻿/, '');
  s = s.replace(/<!DOCTYPE[^[>]*(\[[\s\S]*?\])?\s*>/gi, '').replace(/<!ENTITY[\s\S]*?>/gi, '');
  s = s.replace(/<\?(?!xml\s)[\s\S]*?\?>/gi, ''); // processing instructions other than the XML declaration
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  for (const tag of ['script', 'foreignObject', 'iframe', 'embed', 'object', 'audio', 'video', 'animate', 'animateTransform', 'animateMotion', 'set', 'handler', 'listener']) {
    s = s.replace(new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}\\s*>`, 'gi'), '').replace(new RegExp(`<${tag}\\b[^>]*/?>`, 'gi'), '');
  }
  s = s.replace(/\s(on[a-z]+)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  // href / xlink:href: only local fragments (#id) and inline raster images stay
  s = s.replace(/\s((?:xlink:)?href)\s*=\s*("([^"]*)"|'([^']*)')/gi, (m, attr, _q, a, b) => {
    const v = (a ?? b ?? '').trim();
    return v.startsWith('#') || /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(v) ? m : '';
  });
  s = s.replace(/url\(\s*(['"]?)(?!#)[^)]*\1\s*\)/gi, 'none');
  s = s.replace(/@import[^;]*;?/gi, '');
  s = s.replace(/javascript:/gi, '');
  if (!/<svg[\s>]/i.test(s)) throw new SvgError('not-svg');
  return s;
}

/**
 * Fill `{name}`, `{datum}`, `{text}` (XML-escaped) and replace `currentColor` with `color`. A ` | ` that
 * an empty value leaves at the start or end of a text is removed (`{name} | {datum}` without a name).
 */
export function fillPlaceholders(svg, values = {}, color = '#000000') {
  return svg
    .replace(/\{(name|datum|text)\}/g, (_, key) => xmlEscape(String(values[key] ?? '').trim()))
    .replace(/>\s*\|\s*/g, '>')
    .replace(/\s*\|\s*</g, '<')
    .replace(/currentColor/g, color);
}

/** Size of an SVG in PDF points from its width / height (mm, cm, in, pt, px) or its viewBox. */
export function svgSize(svg) {
  const root = svg.match(/<svg\b[^>]*>/i)?.[0] ?? '';
  const attr = (name) => root.match(new RegExp(`\\s${name}\\s*=\\s*["']([^"']+)["']`, 'i'))?.[1];
  const unit = { mm: 72 / 25.4, cm: 720 / 25.4, in: 72, pt: 1, px: 0.75, '': 0.75 };
  const len = (v) => {
    const m = String(v ?? '').trim().match(/^([\d.]+)\s*(mm|cm|in|pt|px)?$/i);
    return m ? Number(m[1]) * unit[(m[2] ?? '').toLowerCase()] : null;
  };
  const vb = attr('viewBox')?.split(/[\s,]+/).map(Number);
  const w = len(attr('width')) ?? (vb ? vb[2] * 0.75 : null);
  const h = len(attr('height')) ?? (vb ? vb[3] * 0.75 : null);
  return w > 0 && h > 0 ? { width: w, height: h } : null;
}

const base64ToBytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/** Glyph encoder for svg-render.js: IBM Plex Sans regular (/F1) and semibold (/F2), CID = glyph id. */
export function plexText(mupdf, fonts) {
  const loaded = {};
  const font = (bold) => (loaded[bold ? 'F2' : 'F1'] ??= new mupdf.Font(bold ? 'PlexSemibold' : 'Plex', bold ? fonts.semibold : fonts.regular));
  const encode = (str, bold) => {
    const f = font(bold);
    const gids = [...str].map((c) => Math.max(0, f.encodeCharacter(c.codePointAt(0))));
    return { hex: gids.map((g) => g.toString(16).padStart(4, '0')).join(''), width: gids.reduce((s, g) => s + f.advanceGlyph(g, 0), 0) };
  };
  return { encode, font: (name) => font(name === 'F2') };
}

/**
 * One-page PDF of an SVG (vector, page size = SVG size), drawn by svg-render.js. `fonts` ({ regular,
 * semibold } TTF bytes of IBM Plex Sans) is needed only for SVGs with text; without it text is left out.
 */
export function svgToPdf(mupdf, svg, { fonts } = {}) {
  const text = fonts ? plexText(mupdf, fonts) : null;
  let r;
  try {
    r = renderSvg(svg, { text: text?.encode });
  } catch {
    throw new SvgError('not-svg');
  }
  if (!(r.width > 0 && r.height > 0)) throw new SvgError('empty');
  const doc = new mupdf.PDFDocument();
  const res = doc.newDictionary();
  if (r.fonts.size) {
    const fd = doc.newDictionary();
    for (const name of r.fonts) fd.put(name, doc.addFont(text.font(name)));
    res.put('Font', fd);
  }
  if (r.alphas.length) {
    const gs = doc.newDictionary();
    r.alphas.forEach((a, i) => {
      const d = doc.newDictionary();
      d.put('ca', doc.newReal(Number(a)));
      d.put('CA', doc.newReal(Number(a)));
      gs.put(`GA${i}`, doc.addObject(d));
    });
    res.put('ExtGState', gs);
  }
  let content = r.content;
  if (r.images.length) {
    const xo = doc.newDictionary();
    for (const im of r.images) {
      try {
        xo.put(im.name, doc.addImage(new mupdf.Image(base64ToBytes(im.base64))));
      } catch {
        content = content.replace(`/${im.name} Do`, ''); // an image MuPDF cannot read is left out
      }
    }
    res.put('XObject', xo);
  }
  doc.insertPage(-1, doc.addPage([0, 0, r.width, r.height], 0, res, content));
  if (r.fonts.size) doc.subsetFonts();
  return doc.saveToBuffer('compress,garbage').asUint8Array().slice();
}

/** Whether page `index` of a PDF draws anything (its rendering has ink). */
export function pageHasInk(mupdf, pdf, index = 0) {
  const page = mupdf.Document.openDocument(pdf, 'application/pdf').loadPage(index);
  const pix = page.toPixmap(mupdf.Matrix.scale(2, 2), mupdf.ColorSpace.DeviceGray, false);
  const px = pix.getPixels();
  for (let i = 0; i < px.length; i++) if (px[i] < 200) return true;
  return false;
}

/**
 * A stamp library PDF from one-page PDFs: items [{ id, label, pdf }], title, libraryId (stable id), source
 * (a fingerprint of the sources, kept in the catalog so a test or the page can tell whether it is current).
 */
export function buildLibrary(mupdf, items, { title, libraryId, source = '' }) {
  const doc = new mupdf.PDFDocument();
  const names = doc.newArray();
  items.forEach((item, i) => {
    const src = new mupdf.PDFDocument(item.pdf);
    doc.graftPage(i, src, 0);
    names.push(doc.newString(`${item.id}=${item.label}`));
    names.push(doc.findPage(i));
  });
  const catalog = doc.getTrailer().get('Root');
  const pagesTree = doc.newDictionary();
  pagesTree.put('Names', names);
  const nameDict = doc.newDictionary();
  nameDict.put('Pages', pagesTree);
  catalog.put('Names', nameDict);
  const priv = doc.newDictionary();
  priv.put('Id', doc.newString(libraryId));
  priv.put('Source', doc.newString(source));
  const lib = doc.newDictionary();
  lib.put('Private', priv);
  // EmbedPDF reads its own PieceInfo for a stable library id (`getLibrary(id)` after every import)
  const embdPriv = doc.newDictionary();
  embdPriv.put('Id', doc.newString(libraryId));
  embdPriv.put('Kind', doc.newName('StampLibrary'));
  embdPriv.put('Locale', doc.newString('de'));
  embdPriv.put('Version', doc.newInteger(2));
  const embd = doc.newDictionary();
  embd.put('Private', embdPriv);
  const piece = doc.newDictionary();
  piece.put('HLKS_Library', lib);
  piece.put('EMBD_StampLibrary', embd);
  catalog.put('PieceInfo', piece);
  doc.setMetaData('info:Title', title);
  doc.setMetaData('info:Producer', 'HLKS-Tools');
  return doc.saveToBuffer('compress,garbage').asUint8Array().slice();
}

/** The names, labels and source fingerprint a library PDF carries (see buildLibrary). */
export function readLibrary(mupdf, pdf) {
  const doc = new mupdf.PDFDocument(pdf);
  const catalog = doc.getTrailer().get('Root');
  const names = catalog.get('Names', 'Pages', 'Names');
  const entries = [];
  for (let i = 0; i + 1 < names.length; i += 2) {
    const [id, ...label] = names.get(i).asString().split('=');
    entries.push({ id, label: label.join('=') });
  }
  return {
    title: doc.getMetaData('info:Title'),
    entries,
    pages: doc.countPages(),
    source: catalog.get('PieceInfo', 'HLKS_Library', 'Private', 'Source').asString?.() ?? '',
  };
}
