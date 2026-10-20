// SPDX-License-Identifier: AGPL-3.0-or-later
// User-facing texts of the Klimastation tool (German, Swiss spelling). No DOM. Explanations go to AGENTS.md and the method document.

import { fmt } from '../../lib/core/format.js';

export const TITLE = 'Klimastation';

export const ACTIONS = {
  undo: 'Rückgängig (Strg+Z)',
  redo: 'Wiederholen (Strg+Y)',
  copy: 'Werte kopieren',
  copyLabel: 'Kopieren',
  fit: 'Ganze Schweiz',
  zoomIn: 'Vergrössern',
  zoomOut: 'Verkleinern',
  mapLink: 'Auf map.geo.admin.ch öffnen',
  heightReset: 'Höhe von swisstopo',
  stationReset: 'Beste Station',
  weightsReset: 'Standard',
  showAll: 'Alle Stationen',
  showTop: 'Beste drei',
  search: 'Adresse, PLZ, Ort, Koordinaten',
  clear: 'Leeren',
};

export const SECTIONS = {
  site: 'Standort',
  station: 'Station',
  weights: 'Gewichtung',
};

export const FIELDS = {
  height: 'Höhe',
  heightUnit: 'm ü. M.',
  region: 'Klimaregion',
  weightHeight: 'Höhe',
  weightHeightUnit: 'km je 100 m',
  weightRegion: 'Andere Region',
  weightRegionUnit: 'km',
};

export const COLUMNS = {
  station: 'Station',
  region: 'Region',
  distance: 'km',
  dh: 'Δh m',
  score: 'Σ km',
};

export const SOURCES = {
  swisstopo: 'swisstopo',
  manual: 'Hand',
  map: 'Karte',
  coords: 'Koordinaten',
};

export const STATUS = {
  empty: 'Standort wählen',
  copied: 'Werte kopiert',
  copyFailed: 'Kopieren nicht möglich',
  searching: 'Suche …',
  noResult: 'Kein Treffer',
  addressOffline: 'Adresssuche nicht erreichbar',
  dataFailed: 'Daten nicht lesbar',
};

export const ATTRIBUTION = 'Klimaregionen nach SIA 2028 (nachgezeichnet) | Ortschaften, Adressen, Höhe © swisstopo';

export const NOTICES = {
  heightPending: 'Höhe wird abgefragt',
  heightFailed: 'Höhe nicht abrufbar, von Hand eingeben',
  heightMissing: 'Höhe fehlt: Rangliste ohne Höhenunterschied',
  outside: 'Standort ausserhalb der Schweiz',
  nearest: (region, km) => `Ausserhalb der Kartenregionen: nächste Region ${region} (${fmt(km, 1)} km)`,
  border: (region, km) => `Grenznähe: ${fmt(km, 1)} km bis Region ${region}`,
  manual: (name) => `Station von Hand gewählt: ${name}`,
};

export const coordsLabel = (system) => `Koordinaten ${system}`;
export const regionLabel = (region) => (region ? `${region.id} ${region.name}` : '–');
