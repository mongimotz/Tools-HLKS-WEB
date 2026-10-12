// SPDX-License-Identifier: AGPL-3.0-or-later
// Test helpers for the PDF → DXF corpus: load a fixture and its truth file, compare entities.

import { readFile } from 'node:fs/promises';
import { toPlain } from '../../tools/pdf-to-dxf/ir.js';

export const FIXTURES = new URL('../fixtures/pdf-to-dxf/', import.meta.url);

export async function loadFixture(name) {
  const bytes = new Uint8Array(await readFile(new URL(`${name}.pdf`, FIXTURES)));
  const truth = JSON.parse(await readFile(new URL(`${name}.truth.json`, FIXTURES), 'utf8'));
  return { bytes, truth };
}

const near = (a, b, tol) => Math.abs(a - b) <= tol;
const rgb255 = (c) => (c.every((v) => v <= 1) ? c.map((v) => Math.round(v * 255)) : c);

function samePts(a, b, tol) {
  return a.length === b.length && a.every((p, i) => near(p[0], b[i][0], tol) && near(p[1], b[i][1], tol));
}

/** Does entity `act` (readable form) match truth entity `exp`? Attributes are only compared when present in exp. */
export function sameEntity(act, exp, tol = 0.01, { attrs = true } = {}) {
  if (act.kind !== exp.kind) return false;
  if (exp.kind === 'text') {
    if (!near(act.pos[0], exp.pos[0], tol) || !near(act.pos[1], exp.pos[1], tol)) return false;
    if (!near(act.height, exp.height, tol) || !near(act.rot, exp.rot ?? 0, tol)) return false;
    if (exp.noUnicode) return act.unmapped === true && [...act.str].length === [...exp.str].length;
    return act.str === exp.str && !act.unmapped;
  }
  if (exp.kind === 'arc' || exp.kind === 'circle') {
    if (!near(act.c[0], exp.c[0], tol) || !near(act.c[1], exp.c[1], tol) || !near(act.r, exp.r, tol)) return false;
    if (exp.kind === 'arc' && (!near(act.start, exp.start, 0.05) || !near(act.end, exp.end, 0.05))) return false;
  } else {
    if (exp.closed !== undefined && !!act.closed !== !!exp.closed) return false;
    if (!samePts(act.pts, exp.pts, tol)) return false;
  }
  if (!attrs) return true;
  if (exp.rgb && JSON.stringify(rgb255(exp.rgb)) !== JSON.stringify(act.rgb)) return false;
  if (exp.lineWidthPt !== undefined && !near(act.lineWidthPt, exp.lineWidthPt, tol)) return false;
  if (exp.source && act.source !== exp.source) return false;
  if (exp.layer !== undefined && (act.layer ?? null) !== (exp.layer ?? null)) return false;
  if (exp.dash !== undefined) {
    const a = act.dash ?? [];
    const e = exp.dash ?? [];
    if (a.length !== e.length || a.some((v, i) => !near(v, e[i], tol))) return false;
  }
  return true;
}

/**
 * Match two lists one to one. Returns { missing: truth entities without a partner, extra: actual
 * entities without a partner }.
 */
export function matchAll(actualEntities, expected, tol = 0.01, opts = {}) {
  const act = actualEntities.map((e) => (e.a || e.pts instanceof Float64Array ? toPlain(e) : e));
  const used = new Uint8Array(act.length);
  const missing = [];
  for (const exp of expected) {
    const i = act.findIndex((a, k) => !used[k] && sameEntity(a, exp, tol, opts));
    if (i < 0) missing.push(exp);
    else used[i] = 1;
  }
  return { missing, extra: act.filter((_, k) => !used[k]) };
}
