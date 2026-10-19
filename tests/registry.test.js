// SPDX-License-Identifier: AGPL-3.0-or-later
// Tool registry: unique ids, every ready tool has its page, tools without a discipline have an icon.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stat } from 'node:fs/promises';
import { TOOLS, GENERAL, GROUPS } from '../lib/core/registry.js';
import { icon } from '../lib/core/ui.js';

test('registry: unique ids, known groups, pages and icons exist', async () => {
  const ids = TOOLS.map((t) => t.id);
  assert.deepEqual(ids, [...new Set(ids)], 'unique ids');
  const groups = new Set([GENERAL, ...GROUPS.map((g) => g.id)]);
  for (const t of TOOLS) {
    assert.ok(groups.has(t.group), `${t.id}: group`);
    if (t.status !== 'ready') continue;
    assert.ok((await stat(new URL(`../${t.path}index.html`, import.meta.url))).isFile(), `${t.id}: page`);
    if (t.group === GENERAL) assert.match(String(icon(t.icon)), /<path|<rect|<circle/, `${t.id}: icon ${t.icon}`);
  }
});
