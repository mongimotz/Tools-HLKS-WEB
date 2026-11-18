// SPDX-License-Identifier: AGPL-3.0-or-later
// System prompt: symbol library, media, layout rules, the current schema in compact form (positions only for
// pinned components).
import type { Schema } from '../model/types.ts';
import { MEDIA } from '../model/media.ts';
import { allSymbols } from '../symbols/library.ts';

export function symbolLines(): string {
  return allSymbols()
    .map((s) => {
      const ports = s.ports.map((p) => `${p.id}[${p.media.join('|')}]`).join(' ');
      return `${s.id} | ${s.name} | prefix ${s.prefix} | ports ${ports}${s.props.length ? ` | props ${s.props.join(', ')}` : ''}`;
    })
    .join('\n');
}

export function compactSchema(s: Schema): string {
  const out: string[] = [];
  const m = s.meta;
  out.push(`Blatt ${s.sheet.size} ${s.sheet.orientation} | Titel "${m.title}" | Projekt "${m.project}"`);
  out.push('Komponenten:');
  for (const c of s.components) {
    const props = Object.entries(c.props)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');
    out.push(
      `- ${c.id} ${c.type}${c.label !== c.id ? ` "${c.label}"` : ''}${props ? ` {${props}}` : ''}` +
        (c.pinned && c.pos ? ` pinned pos=[${c.pos.join(',')}] rot=${c.rot}${c.flip ? ' flip' : ''}` : ''),
    );
  }
  if (!s.components.length) out.push('(keine)');
  out.push('Verbindungen (from → to = Fliessrichtung):');
  for (const c of s.connections) out.push(`- ${c.id} ${c.from.join('.')} → ${c.to.join('.')} ${c.medium}`);
  if (!s.connections.length) out.push('(keine)');
  if (s.groups.length) {
    out.push('Gruppen:');
    for (const g of s.groups) out.push(`- ${g.id} "${g.label}" [${g.members.join(', ')}]${g.frame ? ' Rahmen' : ''}`);
  }
  if (s.texts.length) {
    out.push('Texte:');
    for (const t of s.texts) out.push(`- ${t.id} "${t.text}"`);
  }
  if (s.notes.length) {
    out.push('Anmerkungen:');
    for (const n of s.notes) {
      const a = n.anchor;
      const at = 'component' in a ? a.component : 'connection' in a ? a.connection : `Blatt [${a.pos.join(',')}]`;
      out.push(`- ${n.id} ${n.status} an ${at}: "${n.text}"${n.reply ? ` | Antwort: "${n.reply}"` : ''}`);
    }
  }
  return out.join('\n');
}

export function systemPrompt(s: Schema): string {
  return `Du bearbeitest ein Prinzipschema (Lüftung, HLKS) im Editor HLKS-Tools Prinzipschema.
Du änderst es nur mit dem Werkzeug apply_operations. Schreibe Bezeichnungen und Antworten auf Deutsch (Schweizer Schreibweise, kein ß).

Regeln:
- Die Zuluft läuft unten von links (AUL) nach rechts (ZUL), die Abluft oben von rechts (ABL) nach links (FOL).
- Baue Anlagen mit add_chain (strand supply/extract); das Layout setzt die Positionen. Gib keine Positionen an, ausser du wirst darum gebeten.
- Komponenten mit "pinned" nicht verschieben (move nur mit force, wenn ausdrücklich verlangt).
- from → to ist die Fliessrichtung. Abzweigungen gehen immer über eine Komponente vom Typ junction (Anschlüsse n, e, s, w). Ein Anschluss nimmt eine Verbindung.
- WRG-Symbole (air.hrc.plate, air.hrc.rotor) haben zwei Seiten: a.in/a.out (Zuluft, unten), b.in/b.out (Abluft, oben). In einer Kette: "WRG01.a" bzw. "WRG01.b" für eine bestehende WRG.
- Anschlüsse als "ID.port". Neue IDs vergibt das Werkzeug (Präfix + Nummer), wenn du keine angibst.
- Anmerkungen abarbeiten: die verlangte Änderung machen, dann resolve_note mit einer kurzen Antwort (reply), was du geändert hast. Was du nicht umsetzen kannst: offen lassen und in deiner Schlussantwort sagen, warum.
- Nach Fehlern korrigiere die Operationen und rufe das Werkzeug erneut auf. Wenn alles passt, antworte ohne Werkzeug mit einer kurzen Zusammenfassung (1–3 Sätze).

Medien: ${MEDIA.map((m) => `${m.id} ${m.code} (${m.name})`).join(', ')}

Symbole (id | Name | Präfix | Anschlüsse[Medien] | Eigenschaften):
${symbolLines()}

Beispiel: {"ops":[{"op":"add_chain","strand":"supply","items":[{"type":"air.intake"},{"type":"air.filter","props":{"Klasse":"ePM1 55%"}},{"type":"air.fan"}]}]}

Aktuelles Schema:
${compactSchema(s)}`;
}

export function notesTask(s: Schema): string {
  const open = s.notes.filter((n) => n.status === 'open');
  return `Arbeite die offenen Anmerkungen ab (${open.map((n) => n.id).join(', ')}). Setze jede umgesetzte mit resolve_note und einer kurzen Antwort auf erledigt.`;
}
