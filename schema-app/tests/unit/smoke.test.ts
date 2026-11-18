// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('scaffold', () => {
  it('vite base is relative, so /schema/ and any sub-path work', () => {
    expect(readFileSync(new URL('../../vite.config.ts', import.meta.url), 'utf8')).toContain("base: './'");
  });
});
