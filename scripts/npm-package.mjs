// SPDX-License-Identifier: AGPL-3.0-or-later
// Fetch one npm package version from the registry and unpack it in memory (no npm install, no node_modules).
// Used by the vendoring scripts. The tarball's sha512 is checked against the registry's `dist.integrity`.

import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

const REGISTRY = 'https://registry.npmjs.org';

/** Registry metadata of one version: { version, dist: { tarball, integrity }, license, … }. */
export async function packageMeta(name, version) {
  const res = await fetch(`${REGISTRY}/${name.replace('/', '%2F')}/${encodeURIComponent(version)}`);
  if (!res.ok) throw new Error(`${name}@${version}: registry answered ${res.status}`);
  return res.json();
}

/** Files of a tar archive: Map(path → Uint8Array). Regular files only; the leading `package/` is removed. */
export function untar(tar) {
  const files = new Map();
  const text = (a, b) => new TextDecoder().decode(tar.subarray(a, b)).replace(/\0.*$/s, '');
  let longName = null;
  for (let off = 0; off + 512 <= tar.length; ) {
    if (tar[off] === 0) break;
    const size = parseInt(text(off + 124, off + 136).trim() || '0', 8);
    const type = String.fromCharCode(tar[off + 156] || 48);
    let name = longName ?? (text(off + 345, off + 500) ? `${text(off + 345, off + 500)}/${text(off, off + 100)}` : text(off, off + 100));
    longName = null;
    const body = tar.subarray(off + 512, off + 512 + size);
    if (type === 'L') longName = text(off + 512, off + 512 + size);
    else if (type === '0' || type === '7') files.set(name.replace(/^package\//, ''), new Uint8Array(body));
    off += 512 + Math.ceil(size / 512) * 512;
  }
  return files;
}

/** Download, check and unpack `name@version`. Resolves { meta, files }. */
export async function fetchPackage(name, version) {
  const meta = await packageMeta(name, version);
  const res = await fetch(meta.dist.tarball);
  if (!res.ok) throw new Error(`${name}@${version}: tarball answered ${res.status}`);
  const tgz = new Uint8Array(await res.arrayBuffer());
  const [algo, expected] = meta.dist.integrity.split('-');
  const actual = createHash(algo).update(tgz).digest('base64');
  if (actual !== expected) throw new Error(`${name}@${version}: integrity mismatch`);
  return { meta, files: untar(gunzipSync(tgz)) };
}
