// SPDX-License-Identifier: AGPL-3.0-or-later
// German strings of the PDF-Editor's own UI (app bar, notice row, dialogs, own viewer commands). No DOM.
// The viewer's own words come from EmbedPDF (locale de) with the Swiss overrides in viewer-strings.js.

export const TITLE = 'PDF-Editor';
export const DEFAULT_NAME = 'Dokument.pdf';

export const ACTIONS = {
  open: 'PDF öffnen (Strg+O)',
  save: 'PDF speichern (Strg+S)',
  toDxf: 'An PDF → DXF übergeben',
  more: 'Weitere Aktionen',
  undo: 'Rückgängig (Strg+Z)',
  redo: 'Wiederholen (Strg+Y)',
  close: 'Schliessen',
  apply: 'Übernehmen',
  cancel: 'Abbrechen',
  retry: 'Erneut versuchen',
  restore: 'Wiederherstellen',
  discard: 'Verwerfen',
};

export const STATUS = {
  empty: 'Keine PDF',
  loading: 'PDF wird geöffnet',
  locked: 'Kennwort erforderlich',
  historyReset: 'Verlauf nach Dokumentwerkzeug zurückgesetzt',
};

export const ERRORS = {
  notPdf: 'Keine PDF',
  damaged: 'PDF nicht lesbar',
  password: 'Kennwort falsch',
  viewer: 'Editor nicht geladen',
  worker: 'Dieser Browser unterstützt keine Module-Worker',
  handoff: 'Übergabe blockiert (Browser-Speicher gesperrt)',
  save: 'PDF nicht gespeichert',
  internal: 'Fehler im Editor',
};

export const saved = (name) => `${name} gespeichert`;
export const pageDeleted = (n) => `Seite ${n} gelöscht`;

/** Words for the viewer's own commands, modes and tools that this tool adds (strings option, locale de). */
export const VIEWER_STRINGS = {
  hlks: {
    mode: { pages: 'Seiten' },
    pages: {
      rotateLeft: 'Seite links drehen',
      rotateRight: 'Seite rechts drehen',
      insertBlank: 'Leere Seite danach',
      duplicate: 'Seite duplizieren',
      delete: 'Seite löschen',
      moveUp: 'Seite nach vorne',
      moveDown: 'Seite nach hinten',
    },
    symbols: 'Symbole',
    stamps: 'Stempel',
  },
};

/** Names of the annotation colours (--annot-1 … 9), for titles and screen readers. */
export const COLOR_NAMES = ['Rot', 'Blau', 'Grün', 'Gelb', 'Schwarz', 'Orange', 'Magenta', 'Cyan', 'Weiss'];
export const ROLE_LABELS = { markup: 'Markierung', measure: 'Messung', highlight: 'Hervorhebung', text: 'Text' };
export const FRAME_LABELS = { rect: 'Rechteck', round: 'Rund', none: 'Ohne Rahmen' };
export const DATE_LABELS = { 'dd.mm.yyyy': 'TT.MM.JJJJ', 'yyyy-mm-dd': 'JJJJ-MM-TT' };

export const SETTINGS = {
  title: 'Einstellungen',
  name: 'Name für Stempel',
  dateFormat: 'Datum',
  colors: 'Standardfarben',
  scales: 'Massstäbe',
  ownStamps: 'Eigene Stempel',
  stampText: 'Stempeltext',
  frame: 'Rahmen',
  addStamp: 'Stempel hinzufügen',
  deleteStamp: 'Stempel löschen',
};

export const SYMBOLS = {
  own: 'Eigene',
  add: 'SVG hinzufügen',
  open: 'Symbol-Bibliothek öffnen',
  save: 'Eigene Symbole speichern',
  delete: 'Symbol löschen',
  fileName: 'Eigene-Symbole.pdf',
  added: (n) => (n === 1 ? '1 Symbol hinzugefügt' : `${n} Symbole hinzugefügt`),
  failed: (names) => `SVG nicht lesbar: ${names}`,
  deleted: (label) => `${label} gelöscht`,
  saveFailed: 'Symbole nicht gespeichert',
  openFailed: 'Keine Symbol-Bibliothek',
  installFailed: 'Symbole nicht geladen',
  stampsFailed: 'Stempel nicht geladen',
};

/** Document tools (⋯ menu), in the plan's order. */
export const TOOLS = {
  merge: 'PDFs anhängen',
  split: 'Seiten teilen / extrahieren',
  watermark: 'Wasserzeichen',
  pageNumbers: 'Seitenzahlen',
  headerFooter: 'Kopf- und Fusszeile',
  toImages: 'Seiten als Bilder',
  fromImages: 'Bilder als Seiten',
  flatten: 'Reduzieren',
  compress: 'Komprimieren',
  password: 'Kennwort',
  ocr: 'Texterkennung (OCR)',
  outline: 'Lesezeichen',
  properties: 'Eigenschaften',
  blank: 'Neues Dokument',
  settings: 'Einstellungen',
};

/** Field labels of the document-tool dialogs. */
export const F = {
  pages: 'Seiten',
  all: 'Alle',
  current: 'Aktuelle Seite',
  range: 'Bereich',
  odd: 'Ungerade',
  even: 'Gerade',
  files: 'Dateien',
  position: 'Position',
  atEnd: 'Am Ende',
  atStart: 'Am Anfang',
  afterCurrent: 'Nach aktueller Seite',
  mode: 'Aufteilen',
  action: 'Aktion',
  oneFile: 'Bereich als eine Datei',
  perRange: 'Eine Datei je Bereich',
  everyN: 'Alle n Seiten',
  each: 'Jede Seite einzeln',
  n: 'n',
  kind: 'Art',
  text: 'Text',
  image: 'Bild',
  size: 'Grösse',
  color: 'Farbe',
  opacity: 'Deckkraft',
  angle: 'Winkel',
  tile: 'Kacheln',
  template: 'Vorlage',
  start: 'Beginnt mit',
  headerLeft: 'Kopf links',
  headerCenter: 'Kopf Mitte',
  headerRight: 'Kopf rechts',
  footerLeft: 'Fuss links',
  footerCenter: 'Fuss Mitte',
  footerRight: 'Fuss rechts',
  format: 'Format',
  dpi: 'Auflösung',
  paper: 'Seitengrösse',
  imageSize: 'Bildgrösse',
  orientation: 'Ausrichtung',
  auto: 'Automatisch',
  portrait: 'Hochformat',
  landscape: 'Querformat',
  margin: 'Rand',
  target: 'Ziel',
  newDocument: 'Neues Dokument',
  annotations: 'Kommentare und Markierungen',
  fields: 'Formularfelder',
  images: 'Bilder',
  unchanged: 'Unverändert',
  setPassword: 'Kennwort setzen',
  removePassword: 'Kennwort entfernen',
  openPassword: 'Kennwort zum Öffnen',
  ownerPassword: 'Kennwort für Rechte',
  currentPassword: 'Kennwort',
  allow: 'Erlaubt',
  print: 'Drucken',
  copy: 'Kopieren',
  modify: 'Ändern',
  annotate: 'Kommentieren',
  forms: 'Formulare ausfüllen',
  title: 'Titel',
  author: 'Autor',
  subject: 'Betreff',
  keywords: 'Stichwörter',
  bookmark: 'Lesezeichen',
  page: 'Seite',
  addBookmark: 'Lesezeichen für aktuelle Seite',
  indent: 'Einrücken',
  outdent: 'Ausrücken',
  remove: 'Entfernen',
  addFiles: 'Dateien hinzufügen',
  up: 'Nach oben',
  down: 'Nach unten',
};

export const POSITION_LABELS = {
  'top-left': 'Oben links',
  'top-center': 'Oben Mitte',
  'top-right': 'Oben rechts',
  'middle-left': 'Mitte links',
  center: 'Mitte',
  'middle-right': 'Mitte rechts',
  'bottom-left': 'Unten links',
  'bottom-center': 'Unten Mitte',
  'bottom-right': 'Unten rechts',
};

export const NUMBER_FORMATS = ['{n}', 'Seite {n}', 'Seite {n} von {total}', '{n}/{total}'];

/** Errors of the worker (engine.js codes). */
export const ENGINE_ERRORS = {
  damaged: 'PDF nicht lesbar',
  password: 'Kennwort falsch',
  empty: 'PDF ohne Seiten',
  range: 'Seitenbereich ungültig',
  image: 'Bild nicht lesbar',
  'not-svg': 'SVG nicht lesbar',
  cancelled: 'Abgebrochen',
  input: 'Angaben fehlen',
  worker: 'Dieser Browser unterstützt keine Module-Worker',
  internal: 'Fehler im Dokumentwerkzeug',
};

export const RESULTS = {
  saved: (name) => `${name} gespeichert`,
  compressed: (before, after) => `${before} → ${after}`,
  notSmaller: 'Keine Verkleinerung möglich',
  reduced: (pages) => `Auflösung gesenkt auf Seite ${pages}`,
  repaired: 'PDF repariert',
  inserted: (n) => (n === 1 ? '1 Seite eingefügt' : `${n} Seiten eingefügt`),
  notInserted: (names) => `Nicht eingefügt: ${names}`,
};

/** Progress text of a running document tool. */
export const progress = (label, value) => (value > 0 && value < 1 ? `${label} ${Math.round(value * 100)} %` : label);

/** Labels of own annotation tools (the viewer takes them as plain text). */
export const TOOL_LABELS = {
  cloud: 'Revisionswolke',
  whiteout: 'Abdecken',
};
