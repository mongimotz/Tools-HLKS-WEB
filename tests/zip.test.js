// SPDX-License-Identifier: AGPL-3.0-or-later
// Store-only ZIP writer of the PDF-Editor: structure, CRC-32, UTF-8 names, unique names.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crc32, zip, unzip } from '../tools/pdf-editor/zip.js';

test('crc32 matches the reference values', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  assert.equal(crc32(new Uint8Array(0)), 0);
});

test('zip: local headers, central directory, end record; files read back with their CRC', () => {
  const a = new TextEncoder().encode('%PDF-1.7 Seite 1');
  const b = new Uint8Array(70000).map((_, i) => i % 251);
  const out = zip([{ name: 'Plan_Seite-1.pdf', bytes: a }, { name: 'Lüftung Ø.png', bytes: b }, { name: 'Plan_Seite-1.pdf', bytes: a }], new Date(2026, 9, 19, 12, 30, 10));
  const view = new DataView(out.buffer);
  assert.equal(view.getUint32(0, true), 0x04034b50, 'local file header');
  assert.equal(view.getUint16(6, true) & 0x0800, 0x0800, 'UTF-8 names');
  assert.equal(view.getUint16(8, true), 0, 'stored');
  assert.equal(view.getUint32(out.length - 22, true), 0x06054b50, 'end of central directory');
  assert.equal(view.getUint16(out.length - 12, true), 3);
  const files = unzip(out);
  assert.deepEqual(files.map((f) => f.name), ['Plan_Seite-1.pdf', 'Lüftung Ø.png', 'Plan_Seite-1 (2).pdf']);
  assert.deepEqual([...files[0].bytes], [...a]);
  assert.deepEqual([...files[1].bytes], [...b]);
  for (const f of files) assert.equal(f.crc, crc32(f.bytes));
  const dosDate = view.getUint16(12, true);
  assert.deepEqual([(dosDate >> 9) + 1980, (dosDate >> 5) & 15, dosDate & 31], [2026, 10, 19]);
});
