// SPDX-License-Identifier: AGPL-3.0-or-later
// Store-only ZIP writer (no compression: PDFs and images are compressed already). No DOM.
// Files [{ name, bytes, date? }] → one ZIP archive (Uint8Array). Names are UTF-8 (general purpose flag 11).

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** CRC-32 (IEEE 802.3) of bytes. */
export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** MS-DOS date and time of a Date (local time, 2 s steps, 1980 at the earliest). */
function dosTime(d) {
  const year = Math.max(1980, d.getFullYear());
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/** A ZIP archive of `files`. Duplicate names get " (2)", " (3)" … before the extension. */
export function zip(files, now = new Date()) {
  const enc = new TextEncoder();
  const used = new Map();
  const unique = (name) => {
    const n = (used.get(name) ?? 0) + 1;
    used.set(name, n);
    return n === 1 ? name : name.replace(/(\.[^.]*)?$/, (ext) => ` (${n})${ext}`);
  };
  const entries = files.map((f) => {
    const name = enc.encode(unique(f.name));
    return { name, bytes: f.bytes, crc: crc32(f.bytes), ...dosTime(f.date ?? now) };
  });
  const localSize = entries.reduce((s, e) => s + 30 + e.name.length + e.bytes.length, 0);
  const centralSize = entries.reduce((s, e) => s + 46 + e.name.length, 0);
  if (localSize + centralSize > 0xffffffff || entries.length > 0xffff) throw new Error('zip too large');
  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);
  let p = 0;
  const offsets = [];
  for (const e of entries) {
    offsets.push(p);
    view.setUint32(p, 0x04034b50, true);
    view.setUint16(p + 4, 20, true); // version needed
    view.setUint16(p + 6, 0x0800, true); // UTF-8 names
    view.setUint16(p + 8, 0, true); // stored
    view.setUint16(p + 10, e.time, true);
    view.setUint16(p + 12, e.date, true);
    view.setUint32(p + 14, e.crc, true);
    view.setUint32(p + 18, e.bytes.length, true);
    view.setUint32(p + 22, e.bytes.length, true);
    view.setUint16(p + 26, e.name.length, true);
    view.setUint16(p + 28, 0, true);
    out.set(e.name, p + 30);
    out.set(e.bytes, p + 30 + e.name.length);
    p += 30 + e.name.length + e.bytes.length;
  }
  const central = p;
  entries.forEach((e, i) => {
    view.setUint32(p, 0x02014b50, true);
    view.setUint16(p + 4, 20, true); // version made by
    view.setUint16(p + 6, 20, true);
    view.setUint16(p + 8, 0x0800, true);
    view.setUint16(p + 10, 0, true);
    view.setUint16(p + 12, e.time, true);
    view.setUint16(p + 14, e.date, true);
    view.setUint32(p + 16, e.crc, true);
    view.setUint32(p + 20, e.bytes.length, true);
    view.setUint32(p + 24, e.bytes.length, true);
    view.setUint16(p + 28, e.name.length, true);
    // extra, comment, disk, internal and external attributes stay 0
    view.setUint32(p + 42, offsets[i], true);
    out.set(e.name, p + 46);
    p += 46 + e.name.length;
  });
  view.setUint32(p, 0x06054b50, true);
  view.setUint16(p + 8, entries.length, true);
  view.setUint16(p + 10, entries.length, true);
  view.setUint32(p + 12, p - central, true);
  view.setUint32(p + 16, central, true);
  return out;
}

/** Read a store-only ZIP back (for tests): [{ name, bytes, crc }]. */
export function unzip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0) throw new Error('not a zip');
  const count = view.getUint16(end + 10, true);
  let p = view.getUint32(end + 16, true);
  const dec = new TextDecoder();
  const out = [];
  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error('bad central directory');
    const crc = view.getUint32(p + 16, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extra = view.getUint16(p + 30, true);
    const comment = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    const dataStart = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    out.push({ name, crc, bytes: bytes.subarray(dataStart, dataStart + size) });
    p += 46 + nameLen + extra + comment;
  }
  return out;
}
