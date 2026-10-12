// SPDX-License-Identifier: AGPL-3.0-or-later
// Phase 3: DXF writer. Structure (JS reader), encoding, colours, line weights, and the geometry of every
// vector fixture written as R2000 and R12 and read back (tolerance 0.001 mm × M).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeDxf, num, escapeText, encodeCp1252, lineweight, nearestAci, cleanLayerNames, ACI } from '../tools/pdf-to-dxf/dxf.js';
import { toDxfEntities, makeTransform, PT_MM, TEXT_HEIGHT_RATIO } from '../tools/pdf-to-dxf/pipeline.js';
import { createBackend } from '../tools/pdf-to-dxf/backend.js';
import { readDxf } from './helpers/dxf-reader.js';
import { loadFixture } from './helpers/truth.js';

const VECTOR = ['lines', 'curves', 'layers', 'clip', 'text', 'hatch', 'dash', 'dupes', 'rotated', 'multipage'];

test('numbers: plain decimals, no exponent', () => {
  assert.equal(num(0), '0.0');
  assert.equal(num(-0), '0.0');
  assert.equal(num(1e-9), '0.0');
  assert.equal(num(12), '12.0');
  assert.equal(num(1234567.1234567), '1234567.123457');
  assert.equal(num(1e21 / 1e21), '1.0');
});

test('text: Windows-1252, \\U+ escapes, %% escaped', () => {
  const bytes = encodeCp1252(escapeText('Büro 3.50 m² Ø 160 €'));
  assert.deepEqual([...bytes.subarray(1, 2)], [0xfc]);
  assert.ok(bytes.includes(0xb2) && bytes.includes(0xd8) && bytes.includes(0x80));
  assert.equal(escapeText('a → b ≤ c'), 'a \\U+2192 b \\U+2264 c');
  assert.equal(escapeText('a → b', 'R12'), 'a ? b');
  assert.equal(escapeText('50%%'), '50%%%%%%');
  assert.equal(escapeText('x\ny'), 'x y');
});

test('colours and line weights', () => {
  assert.equal(nearestAci([0, 0, 0]), 7);
  assert.equal(nearestAci([255, 255, 255]), 7);
  assert.equal(nearestAci([255, 0, 0]), 1);
  assert.equal(nearestAci([0, 0, 255]), 5);
  assert.equal(nearestAci([128, 128, 128]), 8);
  assert.deepEqual(ACI[30], [255, 127, 0]);
  assert.deepEqual(ACI[11], [255, 127, 127]);
  assert.equal(lineweight(0), 0);
  assert.equal(lineweight(0.35), 35);
  assert.equal(lineweight(0.36), 35);
  assert.equal(lineweight(0.1764), 18);
  assert.equal(lineweight(5), 211);
});

test('layer names: cleaned, unique, R12 rules', () => {
  const m = cleanLayerNames(['A/B', 'A:B', 'Wände', 'x'.repeat(300), '0', ''], 'R2000');
  assert.equal(m.get('A/B'), 'A_B');
  assert.equal(m.get('A:B'), 'A_B_2');
  assert.equal(m.get('Wände'), 'Wände');
  assert.equal(m.get('x'.repeat(300)).length, 255);
  assert.equal(m.get('0'), '0');
  assert.equal(m.get(''), 'PDF');
  const r12 = cleanLayerNames(['Wände innen', 'w'.repeat(40)], 'R12');
  assert.equal(r12.get('Wände innen'), 'WANDE_INNEN');
  assert.equal(r12.get('w'.repeat(40)).length, 31);
});

const SAMPLE = {
  layers: [
    { name: 'Wände', rgb: [0, 0, 0] },
    { name: 'Rot', rgb: [255, 0, 0] },
  ],
  entities: [
    { kind: 'line', pts: [0, 0, 1000, 0], layer: 'Wände', rgb: [0, 0, 0], lw: 0.35 },
    { kind: 'polyline', pts: [0, 0, 100, 0, 100, 100], closed: true, layer: 'Rot', rgb: [255, 0, 0], lw: 0.18, linetype: 'DASHED' },
    { kind: 'arc', cx: 10, cy: 10, r: 5, start: 0, end: 90, layer: 'Rot', rgb: [0, 128, 255], lw: 0.25 },
    { kind: 'circle', cx: 10, cy: 10, r: 5, layer: 'Wände', rgb: [0, 0, 0], lw: 0.25, linetype: 'DASHDOT' },
    { kind: 'text', x: 5, y: 5, height: 2.5, rot: 30, str: 'Büro 3.50 m² → Ø', layer: 'Wände', rgb: [0, 0, 0] },
    { kind: 'hatch', rings: [[0, 0, 10, 0, 10, 10]], layer: 'Rot', rgb: [128, 128, 128] },
    { kind: 'spline', pts: [0, 0, 1, 2, 3, 2, 4, 0], layer: 'Wände', rgb: [0, 0, 0], lw: 0.25 },
  ],
};

test('R2000: structure valid, all entity kinds read back', () => {
  const { bytes, counts } = writeDxf(SAMPLE, { version: 'R2000', units: 'mm', linetypes: { DASHED: [200, -100] } });
  const dxf = readDxf(bytes);
  assert.deepEqual(dxf.errors, []);
  assert.equal(dxf.version, 'AC1015');
  assert.equal(dxf.header.$INSUNITS[0][1], '4');
  assert.equal(dxf.header.$MEASUREMENT[0][1], '1');
  assert.equal(dxf.header.$DWGCODEPAGE[0][1], 'ANSI_1252');
  assert.deepEqual(counts, { LINE: 1, LWPOLYLINE: 1, ARC: 1, CIRCLE: 1, TEXT: 1, HATCH: 1, SPLINE: 1 });
  assert.ok(dxf.layers.has('Wände') && dxf.layers.has('Rot') && dxf.layers.has('0'));
  assert.equal(dxf.layers.get('Rot').aci, 1);
  const [line, poly, arc, circle, text, hatch, spline] = dxf.entities;
  assert.deepEqual(line.pts, [0, 0, 1000, 0]);
  assert.equal(line.lw, 35);
  assert.equal(line.aci, null, 'same colour as the layer: BYLAYER');
  assert.equal(poly.closed, true);
  assert.equal(poly.linetype, 'DASHED');
  assert.equal(arc.aci, nearestAci([0, 128, 255]));
  assert.equal(arc.trueColor, (0 << 16) | (128 << 8) | 255);
  assert.equal(circle.linetype, 'DASHDOT');
  assert.equal(text.str, 'Büro 3.50 m² → Ø');
  assert.equal(text.rot, 30);
  assert.deepEqual(hatch.rings, [[0, 0, 10, 0, 10, 10]]);
  assert.deepEqual(spline.pts, [0, 0, 1, 2, 3, 2, 4, 0]);
});

test('R12: plain entities, no handles needed, ACI only', () => {
  const { bytes } = writeDxf(SAMPLE, { version: 'R12' });
  const dxf = readDxf(bytes);
  assert.deepEqual(dxf.errors, []);
  assert.equal(dxf.version, 'AC1009');
  const types = dxf.entities.map((e) => e.type);
  assert.deepEqual(types, ['LINE', 'POLYLINE', 'ARC', 'CIRCLE', 'TEXT', 'POLYLINE']);
  assert.ok(dxf.entities.every((e) => e.trueColor == null && e.lw == null));
  assert.ok(dxf.layers.has('WANDE'));
  assert.equal(dxf.entities[4].str, 'Büro 3.50 m² ? Ø');
});

// ---- fixtures: PDF → IR → DXF → read back ----------------------------------------------------------

const backend = await createBackend();
const M = 100;
const TOL = 0.001 * M; // mm

function findPts(dxfEntities, pts) {
  return dxfEntities.find((d) => d.pts && d.pts.length === pts.length && d.pts.every((v, i) => Math.abs(v - pts[i]) <= TOL));
}

for (const name of VECTOR) {
  for (const version of ['R2000', 'R12']) {
    test(`fixture ${name} → DXF ${version}: valid, geometry equals the truth`, async () => {
      const { bytes, truth } = await loadFixture(name);
      backend.open(bytes);
      truth.pages.forEach((tp, i) => {
        const page = backend.extract(i, { hiddenLayers: true });
        const xf = makeTransform({ scale: M, unit: 'mm' });
        const ents = toDxfEntities(page.entities, xf, { curveTol: 0.01 });
        const { bytes: out } = writeDxf({ layers: [], entities: ents }, { version, units: 'mm' });
        const dxf = readDxf(out);
        assert.deepEqual(dxf.errors, [], `${name} page ${i}`);
        const k = PT_MM * M;
        for (const t of tp.entities) {
          if (t.kind === 'line' || t.kind === 'polyline') {
            const want = t.pts.flat().map((v) => v * k);
            assert.ok(findPts(dxf.entities, want), `${name}: ${t.kind} ${JSON.stringify(t.pts)}`);
          } else if (t.kind === 'cubic') {
            const [p0, , , p3] = t.pts;
            const hit = dxf.entities.find(
              (d) => d.pts && Math.abs(d.pts[0] - p0[0] * k) <= TOL && Math.abs(d.pts[1] - p0[1] * k) <= TOL && Math.abs(d.pts.at(-2) - p3[0] * k) <= TOL && Math.abs(d.pts.at(-1) - p3[1] * k) <= TOL,
            );
            assert.ok(hit, `${name}: cubic ends ${JSON.stringify(t.pts)}`);
          } else if (t.kind === 'text') {
            const hit = dxf.entities.find((d) => d.type === 'TEXT' && Math.abs(d.x - t.pos[0] * k) <= TOL && Math.abs(d.y - t.pos[1] * k) <= TOL);
            assert.ok(hit, `${name}: text ${t.str}`);
            if (!t.noUnicode && version === 'R2000') assert.equal(hit.str, t.str);
            assert.ok(Math.abs(hit.height - t.height * TEXT_HEIGHT_RATIO * k) <= TOL);
            assert.ok(Math.abs((((hit.rot - t.rot) % 360) + 360) % 360) < 0.01 || Math.abs(hit.rot - t.rot - 360) < 0.01);
          }
        }
      });
    });
  }
}

test('"Büro 3.50 m²" comes back identical', async () => {
  const { bytes } = await loadFixture('text');
  backend.open(bytes);
  const page = backend.extract(0);
  const ents = toDxfEntities(page.entities, makeTransform({ scale: 50 }));
  const dxf = readDxf(writeDxf({ entities: ents }, {}).bytes);
  const strs = dxf.entities.filter((e) => e.type === 'TEXT').map((e) => e.str);
  assert.ok(strs.includes('Büro 3.50 m²'));
  assert.ok(strs.includes('Ø 160'));
  assert.ok(strs.includes('Schräg 30°'));
});
