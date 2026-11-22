// SPDX-License-Identifier: AGPL-3.0-or-later
// Topology rules on a parsed schema: unique IDs, valid references, port use, media, overlaps.
import type { Issue, Schema } from './types.ts';
import { findSymbol, symbolFor } from '../symbols/library.ts';
import { medium, mediumMatches } from './media.ts';
import { boxesOverlap, componentBox, isBackground } from './geometry.ts';

export function validate(s: Schema): Issue[] {
  const issues: Issue[] = [];
  const add = (severity: Issue['severity'], code: string, path: string, message: string, ids: string[] = []) =>
    issues.push({ severity, code, path, message, ids });

  // Unique IDs across all element kinds (they share one namespace: notes and assistant ops refer to them).
  const seen = new Map<string, string>();
  const lists = [
    ['components', s.components],
    ['connections', s.connections],
    ['groups', s.groups],
    ['texts', s.texts],
    ['notes', s.notes],
  ] as const;
  for (const [key, list] of lists) {
    list.forEach((el, i) => {
      const prev = seen.get(el.id);
      if (prev) add('error', 'duplicate-id', `${key}[${i}].id`, `ID "${el.id}" ist doppelt (auch ${prev}).`, [el.id]);
      else seen.set(el.id, `${key}[${i}]`);
    });
  }

  const comps = new Map(s.components.map((c) => [c.id, c]));
  s.components.forEach((c, i) => {
    if (!findSymbol(c.type))
      add('error', 'unknown-type', `components[${i}].type`, `Unbekannter Symboltyp "${c.type}".`, [c.id]);
  });

  const used = new Map<string, string>();
  s.connections.forEach((con, i) => {
    if (!medium(con.medium))
      add('error', 'unknown-medium', `connections[${i}].medium`, `Unbekanntes Medium "${con.medium}".`, [con.id]);
    for (const end of ['from', 'to'] as const) {
      const [cid, pid] = con[end];
      const path = `connections[${i}].${end}`;
      const c = comps.get(cid);
      if (!c) {
        add('error', 'unknown-component', path, `Komponente "${cid}" gibt es nicht.`, [con.id]);
        continue;
      }
      const def = findSymbol(c.type) && symbolFor(c);
      if (!def) continue;
      const port = def.ports.find((p) => p.id === pid);
      if (!port) {
        add(
          'error',
          'unknown-port',
          path,
          `${def.name} "${cid}" hat keinen Anschluss "${pid}" (vorhanden: ${def.ports.map((p) => p.id).join(', ') || 'keine'}).`,
          [con.id, cid],
        );
        continue;
      }
      const key = `${cid}:${pid}`;
      const other = used.get(key);
      if (other)
        add('error', 'port-used', path, `Anschluss ${cid}.${pid} ist schon mit ${other} verbunden.`, [
          con.id,
          other,
          cid,
        ]);
      else used.set(key, con.id);
      if (medium(con.medium) && !port.media.some((m) => mediumMatches(m, con.medium)))
        add(
          'warning',
          'medium-mismatch',
          path,
          `Medium ${medium(con.medium)!.code} passt nicht zu ${cid}.${pid} (erlaubt: ${port.media.join(', ')}).`,
          [con.id, cid],
        );
    }
    if (con.from[0] === con.to[0] && con.from[1] === con.to[1])
      add('error', 'self-loop', `connections[${i}]`, 'Verbindung beginnt und endet am selben Anschluss.', [con.id]);
  });

  // Open ports: every non-optional port of a known symbol should be connected.
  s.components.forEach((c, i) => {
    const def = findSymbol(c.type) && symbolFor(c);
    if (!def) return;
    const open = def.ports.filter((p) => !p.optional && !used.has(`${c.id}:${p.id}`)).map((p) => p.id);
    if (open.length)
      add('warning', 'open-port', `components[${i}]`, `${c.id}: offener Anschluss ${open.join(', ')}.`, [c.id]);
  });

  // Junctions need at least 3 connections (otherwise they are no branch).
  s.components.forEach((c, i) => {
    if (c.type !== 'junction') return;
    const n = symbolFor(c).ports.filter((p) => used.has(`${c.id}:${p.id}`)).length;
    if (n < 3)
      add('warning', 'junction-degree', `components[${i}]`, `Abzweig ${c.id} hat nur ${n} Verbindung(en).`, [c.id]);
  });

  s.groups.forEach((g, i) =>
    g.members.forEach((m, j) => {
      if (!comps.has(m))
        add(
          'error',
          'unknown-member',
          `groups[${i}].members[${j}]`,
          `Gruppe ${g.id}: Komponente "${m}" gibt es nicht.`,
          [g.id],
        );
    }),
  );

  const conIds = new Set(s.connections.map((c) => c.id));
  s.notes.forEach((n, i) => {
    if ('component' in n.anchor && !comps.has(n.anchor.component))
      add(
        'warning',
        'note-anchor',
        `notes[${i}].anchor`,
        `Anmerkung ${n.id}: Komponente "${n.anchor.component}" fehlt.`,
        [n.id],
      );
    if ('connection' in n.anchor && !conIds.has(n.anchor.connection))
      add(
        'warning',
        'note-anchor',
        `notes[${i}].anchor`,
        `Anmerkung ${n.id}: Verbindung "${n.anchor.connection}" fehlt.`,
        [n.id],
      );
  });

  // Overlapping symbols (placed ones only).
  const placed = s.components.filter((c) => c.pos && c.type !== 'junction' && !isBackground(c));
  for (let a = 0; a < placed.length; a++)
    for (let b = a + 1; b < placed.length; b++) {
      const A = placed[a]!,
        B = placed[b]!;
      if (boxesOverlap(componentBox(A), componentBox(B), -0.01))
        add('warning', 'overlap', `components[${s.components.indexOf(B)}].pos`, `${A.id} und ${B.id} überlappen.`, [
          A.id,
          B.id,
        ]);
    }

  // Off-grid positions.
  const g = s.sheet.grid;
  const off = (v: number) => Math.abs(v / g - Math.round(v / g)) > 1e-6;
  s.components.forEach((c, i) => {
    if (c.pos && (off(c.pos[0]) || off(c.pos[1])))
      add('warning', 'off-grid', `components[${i}].pos`, `${c.id} liegt nicht auf dem Raster (${g} mm).`, [c.id]);
  });

  return issues;
}

export function errors(issues: Issue[]): Issue[] {
  return issues.filter((i) => i.severity === 'error');
}
