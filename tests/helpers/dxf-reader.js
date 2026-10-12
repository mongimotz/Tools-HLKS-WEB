// SPDX-License-Identifier: AGPL-3.0-or-later
// Small DXF reader for tests: reads the files of tools/pdf-to-dxf/dxf.js back and checks their structure
// (group code pairs, sections, unique handles, valid owner and pointer handles, layers and line types of
// entities). Returns the entities in a simple form for geometry checks.

import { cp1252Char } from '../../tools/pdf-to-dxf/dxf.js';

export function decodeCp1252(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    const part = bytes.subarray(i, i + 8192);
    s += String.fromCharCode(...Array.from(part, cp1252Char));
  }
  return s;
}

export const unescapeText = (s) => s.replace(/\\U\+([0-9A-Fa-f]{4,5})/g, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/%%%/g, '%');

/** Split pairs into objects at group code 0: [{ type, pairs: [[code, value], …] }]. */
function objectsOf(pairs) {
  const out = [];
  for (const p of pairs) {
    if (p[0] === 0) out.push({ type: p[1], pairs: [] });
    else if (out.length) out.at(-1).pairs.push(p);
  }
  return out;
}

const get = (o, code) => o.pairs.find((p) => p[0] === code)?.[1];
const getAll = (o, code) => o.pairs.filter((p) => p[0] === code).map((p) => p[1]);
const real = (o, code) => Number(get(o, code) ?? 0);

export function readDxf(bytes) {
  const errors = [];
  const text = typeof bytes === 'string' ? bytes : decodeCp1252(bytes);
  if (!text.includes('\r\n')) errors.push('line ends are not CRLF');
  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  if (lines.length % 2) errors.push('odd number of lines');
  const pairs = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const c = lines[i].trim();
    if (!/^-?\d+$/.test(c)) {
      errors.push(`line ${i + 1}: group code "${c}"`);
      break;
    }
    pairs.push([Number(c), lines[i + 1]]);
  }
  if (pairs.at(-1)?.[1] !== 'EOF') errors.push('no EOF');

  // sections
  const sections = {};
  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i][0] === 0 && pairs[i][1] === 'SECTION') {
      const name = pairs[i + 1]?.[0] === 2 ? pairs[i + 1][1] : null;
      if (!name) errors.push('SECTION without name');
      const start = i + 2;
      let j = start;
      while (j < pairs.length && !(pairs[j][0] === 0 && (pairs[j][1] === 'ENDSEC' || pairs[j][1] === 'SECTION'))) j++;
      if (pairs[j]?.[1] !== 'ENDSEC') errors.push(`section ${name} not closed`);
      if (sections[name]) errors.push(`section ${name} twice`);
      sections[name] = pairs.slice(start, j);
      i = j;
    }
  }

  // header
  const header = {};
  let cur = null;
  for (const [c, v] of sections.HEADER ?? []) {
    if (c === 9) header[(cur = v)] = [];
    else if (cur) header[cur].push([c, v]);
  }
  const version = header.$ACADVER?.[0]?.[1];
  if (!version) errors.push('no $ACADVER');
  const r2000 = version === 'AC1015';
  for (const s of r2000 ? ['HEADER', 'CLASSES', 'TABLES', 'BLOCKS', 'ENTITIES', 'OBJECTS'] : ['HEADER', 'TABLES', 'ENTITIES']) {
    if (!sections[s]) errors.push(`missing section ${s}`);
  }

  // handles and references
  const handles = new Map();
  const refs = [];
  const visit = (sectionName) => {
    for (const o of objectsOf(sections[sectionName] ?? [])) {
      for (const [c, v] of o.pairs) {
        if (c === 5 || c === 105) {
          if (handles.has(v)) errors.push(`handle ${v} used twice (${o.type})`);
          handles.set(v, o);
        }
        if (c === 330 || c === 340 || c === 350 || c === 390) refs.push([c, v, o.type]);
      }
    }
  };
  for (const s of ['TABLES', 'BLOCKS', 'ENTITIES', 'OBJECTS']) visit(s);
  if (r2000) {
    for (const [c, v, type] of refs) if (v !== '0' && !handles.has(v)) errors.push(`${type}: ${c} → unknown handle ${v}`);
    const seed = parseInt(header.$HANDSEED?.[0]?.[1] ?? '0', 16);
    const max = Math.max(0, ...[...handles.keys()].map((h) => parseInt(h, 16)));
    if (!(seed > max)) errors.push(`$HANDSEED ${seed.toString(16)} not above the largest handle ${max.toString(16)}`);
    for (const o of objectsOf(sections.ENTITIES ?? [])) {
      if (!get(o, 5)) errors.push(`${o.type} without handle`);
      if (!getAll(o, 100).includes('AcDbEntity')) errors.push(`${o.type} without AcDbEntity`);
    }
  }

  // tables
  const layers = new Map();
  const ltypes = new Set();
  let tableName = null;
  for (const o of objectsOf(sections.TABLES ?? [])) {
    if (o.type === 'TABLE') tableName = get(o, 2);
    else if (o.type === 'ENDTAB') tableName = null;
    else if (o.type !== tableName) errors.push(`${o.type} inside table ${tableName}`);
    else if (o.type === 'LAYER') {
      const name = get(o, 2);
      if (layers.has(name)) errors.push(`layer ${name} twice`);
      layers.set(name, { name, aci: Number(get(o, 62)) });
    } else if (o.type === 'LTYPE') ltypes.add(get(o, 2));
  }

  // entities
  const entities = [];
  const list = objectsOf(sections.ENTITIES ?? []);
  for (let i = 0; i < list.length; i++) {
    const o = list[i];
    const base = {
      type: o.type,
      layer: get(o, 8),
      linetype: get(o, 6) ?? null,
      aci: get(o, 62) != null ? Number(get(o, 62)) : null,
      trueColor: get(o, 420) != null ? Number(get(o, 420)) : null,
      lw: get(o, 370) != null ? Number(get(o, 370)) : null,
    };
    if (base.layer == null) errors.push(`${o.type} without layer`);
    else if (!layers.has(base.layer)) errors.push(`${o.type} on unknown layer ${base.layer}`);
    if (base.linetype && !ltypes.has(base.linetype)) errors.push(`${o.type} with unknown line type ${base.linetype}`);
    switch (o.type) {
      case 'LINE':
        entities.push({ ...base, pts: [real(o, 10), real(o, 20), real(o, 11), real(o, 21)] });
        break;
      case 'LWPOLYLINE': {
        const xs = getAll(o, 10).map(Number);
        const ys = getAll(o, 20).map(Number);
        if (xs.length !== Number(get(o, 90))) errors.push('LWPOLYLINE: vertex count');
        entities.push({ ...base, pts: xs.flatMap((x, k) => [x, ys[k]]), closed: (Number(get(o, 70)) & 1) === 1, bulges: getAll(o, 42).map(Number) });
        break;
      }
      case 'POLYLINE': {
        const pts = [];
        let j = i + 1;
        for (; j < list.length && list[j].type === 'VERTEX'; j++) pts.push(real(list[j], 10), real(list[j], 20));
        if (list[j]?.type !== 'SEQEND') errors.push('POLYLINE without SEQEND');
        entities.push({ ...base, pts, closed: (Number(get(o, 70)) & 1) === 1 });
        i = j;
        break;
      }
      case 'ARC':
        entities.push({ ...base, cx: real(o, 10), cy: real(o, 20), r: real(o, 40), start: real(o, 50), end: real(o, 51) });
        break;
      case 'CIRCLE':
        entities.push({ ...base, cx: real(o, 10), cy: real(o, 20), r: real(o, 40) });
        break;
      case 'TEXT':
        if (r2000 && getAll(o, 100).filter((v) => v === 'AcDbText').length !== 2) errors.push('TEXT needs two AcDbText markers');
        entities.push({ ...base, x: real(o, 10), y: real(o, 20), height: real(o, 40), rot: real(o, 50), str: unescapeText(get(o, 1) ?? '') });
        break;
      case 'HATCH': {
        const rings = [];
        let ring = null;
        for (const [c, v] of o.pairs) {
          if (c === 93) rings.push((ring = []));
          else if (ring && (c === 10 || c === 20) && rings.length) ring.push(Number(v));
          if (c === 97) ring = null;
        }
        if (rings.length !== Number(get(o, 91))) errors.push('HATCH: loop count');
        entities.push({ ...base, rings });
        break;
      }
      case 'SPLINE': {
        const xs = getAll(o, 10).map(Number);
        const ys = getAll(o, 20).map(Number);
        if (xs.length !== Number(get(o, 73))) errors.push('SPLINE: control point count');
        if (getAll(o, 40).length !== Number(get(o, 72))) errors.push('SPLINE: knot count');
        entities.push({ ...base, pts: xs.flatMap((x, k) => [x, ys[k]]) });
        break;
      }
      default:
        errors.push(`unexpected entity ${o.type}`);
    }
  }
  return { version, header, layers, ltypes, entities, errors, handles };
}
