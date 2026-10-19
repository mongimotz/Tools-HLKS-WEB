// SPDX-License-Identifier: AGPL-3.0-or-later
// PDF-Editor settings (browser draft) and the pure parts of the viewer mapping (theme.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSettings, normalizeSettings, formatDate, SCALES, MAX_STAMPS } from '../tools/pdf-editor/defaults.js';
import { toolDefinitions, swissMeasure, defaultMeasure, scalePresets, TEXT_FONT } from '../tools/pdf-editor/theme.js';

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('normalizeSettings: defaults for missing or foreign data, never throws', () => {
  for (const raw of [undefined, null, 0, 'x', [], { version: 99 }, { scales: 'a', colors: [], stamps: {} }]) {
    assert.deepEqual(normalizeSettings(raw), defaultSettings(), JSON.stringify(raw));
  }
  const rand = mulberry32(20261019);
  const junk = () => [null, -1, 3.5, 'abc', '', [], {}, true, 1e9, '<b>x</b>'][Math.floor(rand() * 10)];
  for (let i = 0; i < 300; i++) {
    const raw = { name: junk(), dateFormat: junk(), scales: [junk(), junk(), 50], colors: { markup: junk(), text: junk() }, stamps: [{ id: junk(), text: junk(), color: junk(), frame: junk() }, junk()] };
    const s = normalizeSettings(raw);
    assert.deepEqual(normalizeSettings(s), s, 'idempotent');
    assert.ok(s.scales.length > 0);
  }
});

test('normalizeSettings: keeps valid values, sorts scales, drops duplicate stamps', () => {
  const s = normalizeSettings({
    name: '  F. Muster ',
    dateFormat: 'yyyy-mm-dd',
    scales: [100, 50, 50, 0, -2, 'x', 75.5],
    colors: { markup: 3, measure: 99 },
    stamps: [
      { id: 'a', text: 'Geprüft', color: 2, frame: 'round' },
      { id: 'a', text: 'Doppelt' },
      { id: 'b', text: '' },
      { id: 'c d!', text: 'Ohne Rahmen', frame: 'none' },
    ],
  });
  assert.equal(s.name, 'F. Muster');
  assert.equal(s.dateFormat, 'yyyy-mm-dd');
  assert.deepEqual(s.scales, [50, 75.5, 100]);
  assert.deepEqual(s.colors, { markup: 3, measure: 2, highlight: 4, text: 5 });
  assert.deepEqual(s.stamps, [
    { id: 'a', text: 'Geprüft', color: 2, frame: 'round' },
    { id: 'cd', text: 'Ohne Rahmen', color: 1, frame: 'none' },
  ]);
  const many = normalizeSettings({ stamps: Array.from({ length: 60 }, (_, i) => ({ id: `s${i}`, text: `S${i}` })) });
  assert.equal(many.stamps.length, MAX_STAMPS);
  assert.deepEqual(defaultSettings().scales, SCALES);
});

test('formatDate: Swiss and ISO', () => {
  const d = new Date(2026, 9, 5);
  assert.equal(formatDate(d, 'dd.mm.yyyy'), '05.10.2026');
  assert.equal(formatDate(d, 'yyyy-mm-dd'), '2026-10-05');
});

test('toolDefinitions: colours by role, Plex for text, own cloud and whiteout tools', () => {
  const colors = ['#d42a20', '#0072b2', '#009e73', '#f0e442', '#000000', '#e69f00', '#cc79a7', '#56b4e9', '#ffffff'];
  const tools = Object.fromEntries(toolDefinitions(colors, defaultSettings().colors).map((t) => [t.id, t]));
  assert.equal(tools.square.defaults.color, '#d42a20');
  assert.equal(tools.square.defaults.strokeWidth, 1);
  assert.equal(tools.highlight.defaults.color, '#f0e442');
  assert.equal(tools.distance.defaults.color, '#0072b2');
  assert.equal(tools['free-text'].defaults.fontFamily, TEXT_FONT);
  assert.equal(tools['free-text'].defaults.fontColor, '#000000');
  assert.deepEqual([tools.cloud.extends, tools.cloud.defaults.cloudyIntensity], ['polygon', 1]);
  assert.deepEqual([tools.whiteout.extends, tools.whiteout.defaults.interiorColor, tools.whiteout.defaults.strokeWidth], ['square', '#ffffff', 0]);
  const other = Object.fromEntries(toolDefinitions(colors, { ...defaultSettings().colors, markup: 2 }).map((t) => [t.id, t]));
  assert.equal(other.cloud.defaults.color, '#0072b2');
});

test('measurement: Swiss number format, presets 1:n', () => {
  const m = defaultMeasure();
  assert.equal(swissMeasure(m), null, 'default is Swiss already');
  const plain = { ...m, distance: [{ unit: 'mm', conversion: 1, precision: 100 }] };
  const fixed = swissMeasure(plain);
  assert.equal(fixed.distance[0].thousands, '’');
  assert.equal(swissMeasure(fixed), null, 'idempotent');
  assert.deepEqual(scalePresets([50]), [{ id: 'ch-50', label: '1:50', paper: 1, real: 50, unit: 'm' }]);
});
