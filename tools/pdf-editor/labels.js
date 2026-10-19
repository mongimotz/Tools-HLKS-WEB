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

/** Labels of own annotation tools (the viewer takes them as plain text). */
export const TOOL_LABELS = {
  cloud: 'Revisionswolke',
  whiteout: 'Abdecken',
};
