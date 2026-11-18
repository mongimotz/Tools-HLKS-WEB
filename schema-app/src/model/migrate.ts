// SPDX-License-Identifier: AGPL-3.0-or-later
// Version migrations. Version 1 is the first; later versions add steps here (v1 → v2 → …).
import { FORMAT, VERSION, SchemaError, parseSchema } from './schema.ts';
import type { Schema } from './types.ts';

type Step = (raw: Record<string, unknown>) => Record<string, unknown>;
/** MIGRATIONS[n] migrates version n to n + 1. */
const MIGRATIONS: Record<number, Step> = {};

export function migrate(raw: unknown): Schema {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new SchemaError('Die Datei enthält kein JSON-Objekt.');
  let obj = raw as Record<string, unknown>;
  if (obj.format !== FORMAT) throw new SchemaError(`Kein Prinzipschema: "format" muss "${FORMAT}" sein.`);
  let v = obj.version;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1)
    throw new SchemaError(`Unbekannte Dateiversion: ${JSON.stringify(v)}.`);
  if (v > VERSION)
    throw new SchemaError(
      `Die Datei hat Version ${v}, dieses Programm kennt nur Version ${VERSION}. Bitte neuere Version des Editors verwenden.`,
    );
  while (v < VERSION) {
    const step = MIGRATIONS[v];
    if (!step) throw new SchemaError(`Keine Migration von Version ${v} vorhanden.`);
    obj = { ...step(obj), version: v + 1 };
    v++;
  }
  return parseSchema(obj);
}

/** Parses file text: JSON syntax errors report line and column. */
export function parseText(text: string): Schema {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    const msg = (e as Error).message;
    const m = /position (\d+)/.exec(msg);
    if (m) {
      const pos = Number(m[1]);
      const before = text.slice(0, pos);
      const line = before.split('\n').length;
      const col = pos - before.lastIndexOf('\n');
      throw new SchemaError(`JSON-Fehler in Zeile ${line}, Spalte ${col}: ${msg}`, [
        { path: `Zeile ${line}`, message: msg },
      ]);
    }
    throw new SchemaError(`JSON-Fehler: ${msg}`);
  }
  return migrate(raw);
}
