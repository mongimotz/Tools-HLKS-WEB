// SPDX-License-Identifier: AGPL-3.0-or-later
// PDF-Editor passwords: an encrypted result needs its password, permissions are set, removing works.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as mupdf from '../lib/vendor/mupdf/mupdf.js';
import { createEngine } from '../tools/pdf-editor/engine.js';

const ROOT = new URL('../', import.meta.url);
const readAsset = async (p) => new Uint8Array(await readFile(new URL(p, ROOT)));
const { ops } = await createEngine({ readAsset });
const plan = await readAsset('tests/fixtures/pdf-editor/plan.pdf');
const open = (bytes) => mupdf.Document.openDocument(bytes, 'application/pdf');

test('open password: the result needs it (AES-256), the wrong one fails', async () => {
  const { value } = await ops.password({ bytes: plan, userPassword: 'Plan2026', ownerPassword: 'Chef!' });
  const doc = open(value);
  assert.equal(doc.needsPassword(), true);
  assert.equal(doc.authenticatePassword('falsch'), 0);
  assert.ok(doc.authenticatePassword('Plan2026') > 0);
  assert.equal(doc.countPages(), 3);
  assert.match(new TextDecoder('latin1').decode(value), /\/AESV3|\/V 5/, 'AES-256 (V5, AESV3)');
});

test('permission password only: opens without a password, permissions apply', async () => {
  const { value } = await ops.password({ bytes: plan, ownerPassword: 'Chef!', permissions: { print: true, copy: false, modify: false, annotate: true, forms: true } });
  const doc = open(value);
  assert.equal(doc.needsPassword(), false);
  assert.equal(doc.hasPermission('print'), true);
  assert.equal(doc.hasPermission('copy'), false);
  assert.equal(doc.hasPermission('edit'), false);
  assert.equal(doc.hasPermission('annotate'), true);
});

test('remove the password when it is known; no password at all is refused', async () => {
  const locked = (await ops.password({ bytes: plan, userPassword: 'abc' })).value;
  await assert.rejects(ops.password({ bytes: locked, remove: true }), (e) => e.code === 'password');
  const { value } = await ops.password({ bytes: locked, password: 'abc', remove: true });
  assert.equal(open(value).needsPassword(), false);
  assert.match(open(value).loadPage(0).toStructuredText().asText(), /Lüftungsplan/);
  await assert.rejects(ops.password({ bytes: plan }), (e) => e.code === 'input');
  const fixture = await readAsset('tests/fixtures/pdf-editor/encrypted.pdf');
  assert.equal(open((await ops.password({ bytes: fixture, password: 'geheim', remove: true })).value).needsPassword(), false);
});
