// SPDX-License-Identifier: AGPL-3.0-or-later
// Screenshot test: every example renders to a PNG that matches its reference in tests/visual/.
// Update references deliberately with UPDATE_VISUAL=1 npx vitest run tests/unit/visual.test.ts (and say so in the commit).
import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { parseText } from '../../src/model/migrate.ts';
import { renderSchema } from '../../src/render/render.ts';
import { svgToPng } from '../../cli/png.ts';

const EX = new URL('../../examples/', import.meta.url);
const REF = new URL('../visual/', import.meta.url);
const OUT = new URL('../../test-results/visual/', import.meta.url);
const files = existsSync(EX)
  ? readdirSync(EX)
      .filter((f) => f.endsWith('.schema'))
      .sort()
  : [];

function diff(a: PNG, b: PNG): number {
  if (a.width !== b.width || a.height !== b.height) return 1;
  let bad = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const d = Math.max(
      Math.abs(a.data[i]! - b.data[i]!),
      Math.abs(a.data[i + 1]! - b.data[i + 1]!),
      Math.abs(a.data[i + 2]! - b.data[i + 2]!),
    );
    if (d > 48) bad++;
  }
  return bad / (a.width * a.height);
}

describe('visual references', () => {
  it.each(files)('%s', (f) => {
    const s = parseText(readFileSync(new URL(f, EX), 'utf8'));
    const png = svgToPng(renderSchema(s).svg, 100);
    const name = f.replace(/\.schema$/, '.png');
    const ref = new URL(name, REF);
    if (process.env.UPDATE_VISUAL || !existsSync(ref)) {
      mkdirSync(REF, { recursive: true });
      writeFileSync(ref, png);
      return;
    }
    const d = diff(PNG.sync.read(png), PNG.sync.read(readFileSync(ref)));
    if (d > 0.0005) {
      mkdirSync(OUT, { recursive: true });
      writeFileSync(new URL(name, OUT), png);
    }
    expect(d, `${name}: ${(d * 100).toFixed(3)} % pixels differ (actual in test-results/visual/)`).toBeLessThanOrEqual(
      0.0005,
    );
  });
});
