// SPDX-License-Identifier: AGPL-3.0-or-later
// Minimal static file server for local development (ES modules need http://, not file://).
// Usage: node scripts/serve.mjs [port] [--base Tools-HLKS-WEB]
// --base serves the site under a sub-path, as GitHub Pages does (checks that all paths are relative).
// Git Bash turns "/Tools-HLKS-WEB/" into a Windows path; such a value is cut back to its last part.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const baseIndex = args.indexOf('--base');
const baseArg = baseIndex >= 0 ? (args[baseIndex + 1] ?? '').replace(/\\/g, '/') : '';
const baseName = (/^[A-Za-z]:\//.test(baseArg) ? baseArg.replace(/\/+$/, '').split('/').pop() : baseArg).replace(/^\/+|\/+$/g, '');
const base = baseName ? `/${baseName}/` : '/';
const port = Number(args.find((a) => /^\d+$/.test(a)) || process.env.PORT || 8080);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.pdf': 'application/pdf',
  '.webmanifest': 'application/manifest+json',
  '.map': 'application/json',
  '.wasm': 'application/wasm',
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (!`${url.pathname}/`.startsWith(base)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end(`Not found (site under ${base})`);
      return;
    }
    let path = normalize(join(root, decodeURIComponent(url.pathname.slice(base.length - 1))));
    if (!path.startsWith(root)) {
      res.writeHead(403).end();
      return;
    }
    let info = await stat(path).catch(() => null);
    if (info?.isDirectory()) {
      if (!url.pathname.endsWith('/')) {
        res.writeHead(301, { Location: `${url.pathname}/` }).end();
        return;
      }
      path = join(path, 'index.html');
      info = await stat(path).catch(() => null);
    }
    if (!info) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
      return;
    }
    const body = await readFile(path);
    res.writeHead(200, { 'Content-Type': TYPES[extname(path)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch (e) {
    res.writeHead(500).end(String(e));
  }
}).listen(port, () => console.log(`HLKS-Tools dev server: http://localhost:${port}${base}`));
