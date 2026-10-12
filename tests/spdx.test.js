// SPDX-License-Identifier: AGPL-3.0-or-later
// Every own source file carries the license header (AGENTS.md, section License).
// Third-party code (lib/vendor/), fonts and test fixtures are excluded.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, relative, extname } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ID = 'SPDX-License-Identifier: AGPL-3.0-or-later';
const SKIP = ['lib/vendor', 'assets/fonts', 'tests/fixtures', 'node_modules', '.git', '.claude', 'docs'];
const EXT = new Set(['.js', '.mjs', '.css', '.html', '.py']);

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    const rel = relative(ROOT, p).replace(/\\/g, '/');
    if (SKIP.some((s) => rel === s || rel.startsWith(`${s}/`))) continue;
    if (e.isDirectory()) yield* walk(p);
    else if (EXT.has(extname(p))) yield { p, rel };
  }
}

test('own source files start with the SPDX header', async () => {
  const missing = [];
  let n = 0;
  for await (const { p, rel } of walk(ROOT)) {
    const head = (await readFile(p, 'utf8')).split('\n', 3).join('\n');
    if (!head.includes(ID)) missing.push(rel);
    n++;
  }
  assert.ok(n > 20, 'source files found');
  assert.deepEqual(missing, [], `missing SPDX header: ${missing.join(', ')}`);
});
