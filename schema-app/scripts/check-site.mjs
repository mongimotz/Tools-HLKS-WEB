// SPDX-License-Identifier: AGPL-3.0-or-later
// Assembles the GitHub Pages artifact: the whole static site from the repository root plus the built
// editor under /schema/. The Pages workflow runs this script, so a local run simulates the deploy.
// Usage: node scripts/check-site.mjs [outDir]   (default: ../_site, relative to this app)
import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = resolve(fileURLToPath(new URL('..', import.meta.url)));
const ROOT = resolve(APP, '..');
const OUT = resolve(process.argv[2] ?? join(ROOT, '_site'));
const DIST = join(APP, 'dist');

// Never published: git data, CI config, dependencies, the editor's sources and local norm files.
const EXCLUDE = ['.git', '.github', '.claude', '_site', 'node_modules', 'schema-app', '.DS_Store'];

function excluded(rel) {
  const parts = rel.split('/');
  return EXCLUDE.some((e) => rel === e || rel.startsWith(`${e}/`)) || parts.includes('node_modules') || parts.at(-1) === '.DS_Store';
}

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('dist/index.html fehlt: zuerst "npm run build" ausführen.');
  process.exit(1);
}

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
await cp(ROOT, OUT, {
  recursive: true,
  filter: (src) => {
    const rel = relative(ROOT, src).replace(/\\/g, '/');
    return rel === '' || !excluded(rel);
  },
});
await cp(DIST, join(OUT, 'schema'), { recursive: true });

// Checks: existing pages are still there, CNAME and .nojekyll survive, the editor is reachable.
const required = ['index.html', 'CNAME', '.nojekyll', 'assets/css/tokens.css', 'lib/core/registry.js', 'schema/index.html'];
for (const t of await readdir(join(ROOT, 'tools'), { withFileTypes: true })) {
  if (t.isDirectory() && existsSync(join(ROOT, 'tools', t.name, 'index.html')))
    required.push(`tools/${t.name}/index.html`);
}
const missing = [];
for (const f of required) {
  try {
    await stat(join(OUT, f));
  } catch {
    missing.push(f);
  }
}
const leaked = ['schema-app', 'node_modules', '.git'].filter((f) => existsSync(join(OUT, f)));
if (missing.length || leaked.length) {
  if (missing.length) console.error(`Fehlt im Artefakt: ${missing.join(', ')}`);
  if (leaked.length) console.error(`Gehört nicht ins Artefakt: ${leaked.join(', ')}`);
  process.exit(1);
}
console.log(`Artefakt OK: ${relative(process.cwd(), OUT) || '.'} (${required.length} Pflichtdateien geprüft)`);
