// SPDX-License-Identifier: AGPL-3.0-or-later
// Example schemas from examples/, loaded on demand (each one its own small chunk).
import { parseText } from '../model/migrate.ts';
import type { Schema } from '../model/types.ts';

const FILES = import.meta.glob('../../examples/*.schema', { query: '?raw', import: 'default' }) as Record<
  string,
  () => Promise<string>
>;

export const EXAMPLES: { id: string; name: string }[] = [
  { id: 'zu-abluft-einfach', name: 'Einfache Zu- und Abluftanlage' },
  { id: 'monoblock-platten-wrg', name: 'Monoblock mit Platten-WRG' },
  { id: 'monoblock-rotor-erhitzer-kuehler', name: 'Monoblock mit Rotor, Erhitzer und Kühler' },
  { id: 'kvs-system', name: 'Zu- und Abluftgerät mit KVS-System' },
  { id: 'vvs-3-zonen', name: 'VVS-Regler für 3 Zonen' },
  { id: 'heizgruppe', name: 'Heizgruppe mit Beimischung' },
  { id: 'kaelte', name: 'Kältekreis' },
  { id: 'symbol-catalog', name: 'Symbolübersicht' },
];

export async function loadExample(id: string): Promise<Schema> {
  const f = FILES[`../../examples/${id}.schema`];
  if (!f) throw new Error(`Beispiel ${id} fehlt.`);
  return parseText(await f());
}
