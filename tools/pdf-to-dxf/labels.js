// SPDX-License-Identifier: AGPL-3.0-or-later
// User-facing texts of the PDF → DXF tool (German, Swiss spelling). No DOM. Explanations go to README.md.

export const TITLE = 'PDF → DXF';

export const ACTIONS = {
  undo: 'Rückgängig (Strg+Z)',
  redo: 'Wiederholen (Strg+Y)',
  open: 'PDF öffnen (Strg+O)',
  save: 'DXF speichern (Strg+S)',
  fit: 'Ganze Seite',
  calibrate: 'Kalibrieren',
  area: 'Bereich wählen',
  areaClear: 'Bereich aufheben',
  underlay: 'PDF-Bild',
  scan: 'Scan vektorisieren',
  prev: 'Vorherige Seite',
  next: 'Nächste Seite',
  cancel: 'Abbrechen',
  apply: 'Übernehmen',
};

export const SECTIONS = {
  pages: 'Seiten',
  scale: 'Massstab',
  output: 'Ausgabe',
  content: 'Inhalt',
  tol: 'Toleranzen',
  scan: 'Scan',
  layers: 'Layer',
  colors: 'Farben',
  widths: 'Strichstärken',
};

export const FIELDS = {
  pages: 'Seiten',
  scale: 'Massstab 1 :',
  unit: 'Einheit',
  origin: 'Ursprung',
  version: 'DXF',
  trueColor: 'Echtfarben',
  preset: 'Vorgabe',
  layerMode: 'Layer ohne PDF-Ebenen',
  hiddenLayers: 'Ausgeblendete PDF-Ebenen',
  text: 'Text',
  fills: 'Füllungen',
  hatch: 'Schraffuren',
  arcs: 'Bögen erkennen',
  curves: 'Kurven',
  dashes: 'Strichlierung',
  clip: 'Clipping anwenden',
  dedupe: 'Doppelte entfernen',
  join: 'Linien verbinden',
  minLengthMm: 'Mindestlänge',
  tolJoin: 'Verbinden',
  tolArc: 'Bogen',
  tolFlatten: 'Kurven',
  scanDpi: 'Auflösung',
  scanMode: 'Verfahren',
  scanSnap: 'Fang 0° / 90°',
  calibLength: 'Länge',
};

export const OPTIONS = {
  pages: { current: 'Aktuelle Seite', each: 'Jede Seite einzeln', sideBySide: 'Alle nebeneinander' },
  origin: { page: 'Seitenecke', center: 'Mitte' },
  preset: { nova: 'Nova-Unterlage', geometry: 'Nur Geometrie', compat: 'Maximale Kompatibilität', custom: 'Benutzerdefiniert' },
  layerMode: { colorWidth: 'Farbe und Strichstärke', color: 'Farbe', width: 'Strichstärke', single: 'Ein Layer' },
  text: { text: 'Text', outline: 'Umriss', omit: 'Aus' },
  fills: { outline: 'Umriss', hatch: 'Fläche', ignore: 'Aus' },
  hatch: { layer: 'Eigener Layer', remove: 'Entfernen', keep: 'Lassen' },
  curves: { polyline: 'Polylinie', spline: 'Spline' },
  dashes: { solid: 'Linientyp', explode: 'Einzelstriche' },
  scanMode: { centerline: 'Mittellinie', outline: 'Umriss' },
};

export const ERRORS = {
  damaged: 'PDF nicht lesbar',
  password: 'PDF mit Passwort geschützt',
  empty: 'PDF ohne Seiten',
  page: 'Seite fehlt',
  notPdf: 'Keine PDF',
  cancelled: 'Abgebrochen',
  internal: 'Umwandlung fehlgeschlagen',
  worker: 'Browser ohne Web Worker (Modul)',
};

/** Short status texts for warnings (details in README.md). */
export function warningText(w) {
  switch (w.code) {
    case 'unmapped':
      return `Text ohne Zeichenzuordnung: ${w.count}`;
    case 'scan':
      return 'Seite ist ein Bild';
    case 'skew':
      return `Schräglage ${w.count}°`;
    case 'calibrate':
      return 'Massstab kalibrieren';
    case 'images':
      return `Bilder: ${w.count}`;
    case 'shadings':
      return `Verläufe: ${w.count}`;
    case 'damaged':
      return 'PDF teilweise beschädigt';
    default:
      return w.code;
  }
}

/** Progress label of a pipeline step. */
export const STEPS = {
  open: 'Öffnen',
  extract: 'Lesen',
  curves: 'Bögen',
  clip: 'Clipping',
  dedupe: 'Doppelte',
  hatch: 'Schraffuren',
  join: 'Verbinden',
  dashes: 'Strichlierung',
  page: 'Seiten',
  scan: 'Scan',
  done: '',
};

export const saved = (name) => `Gespeichert: ${name}`;
