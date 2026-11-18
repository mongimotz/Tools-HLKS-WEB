// SPDX-License-Identifier: AGPL-3.0-or-later
// Core types of the .schema file (format "hlks-schema", version 1). All coordinates are mm on the sheet,
// origin top left. A component's `pos` is the centre of its symbol.

export type Vec = [number, number];
export type Dir = 'N' | 'E' | 'S' | 'W';
export type Rotation = 0 | 90 | 180 | 270;

export interface Meta {
  title: string;
  project: string;
  author: string;
  date: string;
  revision: string;
}

export type SheetSize = 'A4' | 'A3' | 'A2' | 'A1';

export interface Sheet {
  size: SheetSize;
  orientation: 'landscape' | 'portrait';
  grid: number;
  titleBlock: string;
  legend: boolean;
}

export interface Component {
  id: string;
  type: string;
  label: string;
  props: Record<string, string>;
  pos: Vec | null;
  rot: Rotation;
  flip: boolean;
  pinned: boolean;
}

export type PortRef = [string, string];

export interface Connection {
  id: string;
  from: PortRef;
  to: PortRef;
  medium: string;
  waypoints: Vec[];
  pinned: boolean;
}

export interface Group {
  id: string;
  label: string;
  members: string[];
  frame: boolean;
}

export interface TextItem {
  id: string;
  pos: Vec;
  text: string;
  size: number;
}

export type NoteAnchor = { component: string } | { connection: string } | { pos: Vec };

export interface Note {
  id: string;
  anchor: NoteAnchor;
  text: string;
  status: 'open' | 'done';
  created: string;
  reply: string | null;
}

export interface Schema {
  format: 'hlks-schema';
  version: 1;
  meta: Meta;
  sheet: Sheet;
  style: string;
  components: Component[];
  connections: Connection[];
  groups: Group[];
  texts: TextItem[];
  notes: Note[];
}

/** One port of a symbol, in symbol-local coordinates (origin top left of the symbol box). */
export interface PortDef {
  id: string;
  at: Vec;
  dir: Dir;
  /** Allowed media, glob patterns such as "air.*". */
  media: string[];
  /** An open optional port is no warning (e.g. a sensor's signal output). */
  optional?: boolean;
}

export interface SymbolDef {
  id: string;
  name: string;
  category: string;
  /** Norm the drawing follows, or "" for own symbols. */
  norm: string;
  /** false until the drawing was checked against the norm PDF. */
  checked: boolean;
  size: Vec;
  ports: PortDef[];
  labelAnchor: Vec;
  /** Label text alignment relative to labelAnchor. */
  labelAlign?: 'start' | 'middle' | 'end';
  props: string[];
  /** Prefix for new component IDs, e.g. "VE" → VE01. */
  prefix: string;
  keywords?: string[];
  /** SVG body in symbol-local mm, without stroke widths or colours (they come from the style). */
  svg: string;
}

export type Severity = 'error' | 'warning';

export interface Issue {
  severity: Severity;
  code: string;
  /** JSON path, e.g. "connections[2].to". */
  path: string;
  message: string;
  /** IDs of the affected elements, for highlighting. */
  ids: string[];
}
