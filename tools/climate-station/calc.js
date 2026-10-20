// SPDX-License-Identifier: AGPL-3.0-or-later
// Pure functions of the Klimastation tool: coordinates, climate region of a point, station ranking,
// place search, coordinate parsing and the copy row. No DOM, no network.

// ---- coordinates ------------------------------------------------------------

/** WGS84 (degrees) → LV95 (m). Approximate formula of swisstopo, about 1 m within Switzerland. */
export function wgs84ToLv95(lat, lon) {
  const p = (lat * 3600 - 169028.66) / 10000;
  const l = (lon * 3600 - 26782.5) / 10000;
  return {
    e: 2600072.37 + 211455.93 * l - 10938.51 * l * p - 0.36 * l * p * p - 44.54 * l ** 3,
    n: 1200147.07 + 308807.95 * p + 3745.25 * l * l + 76.63 * p * p - 194.56 * l * l * p + 119.79 * p ** 3,
  };
}

/** LV95 (m) → WGS84 (degrees). Approximate formula of swisstopo. */
export function lv95ToWgs84(e, n) {
  const y = (e - 2600000) / 1e6;
  const x = (n - 1200000) / 1e6;
  const lon = 2.6779094 + 4.728982 * y + 0.791484 * y * x + 0.1306 * y * x * x - 0.0436 * y ** 3;
  const lat = 16.9023892 + 3.238272 * x - 0.270978 * y * y - 0.002528 * x * x - 0.0447 * y * y * x - 0.014 * x ** 3;
  return { lat: (lat * 100) / 36, lon: (lon * 100) / 36 };
}

/** Rough bounding box of Switzerland and Liechtenstein in LV95, with a margin. */
export const BOUNDS = { e0: 2480000, e1: 2840000, n0: 1070000, n1: 1300000 };

export const inBounds = (e, n) => e >= BOUNDS.e0 && e <= BOUNDS.e1 && n >= BOUNDS.n0 && n <= BOUNDS.n1;

/**
 * Coordinates typed into the search: LV95 (2'635'345 1'244'330), LV03 (635345 / 244330) or WGS84 in decimal degrees
 * (47.35, 7.9 in either order). Returns { e, n, system } or null.
 */
export function parseCoordinates(text) {
  let nums = String(text ?? '')
    .replace(/[’']/g, '')
    .match(/-?\d+(?:[.,]\d+)?/g);
  if (nums?.length === 1 && /^\d{6,7},\d{6,7}$/.test(nums[0])) nums = nums[0].split(','); // 2635345,1244330
  if (!nums || nums.length !== 2 || /[a-zäöü]{2,}/i.test(text)) return null;
  const [a, b] = nums.map((s) => Number(s.replace(',', '.')));
  const pick = (e, n, system) => (inBounds(e, n) ? { e: Math.round(e), n: Math.round(n), system } : null);
  if (a > 1e6 && b > 1e6) return a > b ? pick(a, b, 'LV95') : pick(b, a, 'LV95');
  if (a > 1e4 && b > 1e4) return a > b ? pick(a + 2e6, b + 1e6, 'LV03') : pick(b + 2e6, a + 1e6, 'LV03');
  if (Math.abs(a) <= 90 && Math.abs(b) <= 180) {
    const [lat, lon] = a > b ? [a, b] : [b, a]; // in Switzerland the latitude (45.8–47.9) exceeds the longitude (5.9–10.5)
    const { e, n } = wgs84ToLv95(lat, lon);
    return pick(e, n, 'WGS84');
  }
  return null;
}

// ---- regions ----------------------------------------------------------------

function inRing(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function segDist(x, y, [x1, y1], [x2, y2]) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / l2)) : 0;
  return Math.hypot(x - x1 - t * dx, y - y1 - t * dy);
}

function ringsDist(rings, x, y) {
  let best = Infinity;
  for (const ring of rings) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) best = Math.min(best, segDist(x, y, ring[j], ring[i]));
  return best;
}

/** Even-odd test over all rings of a region (holes included). */
export const inRegion = (region, e, n) => region.rings.reduce((inside, ring) => (inRing(ring, e, n) ? !inside : inside), false);

/**
 * Climate region at a point. `regions` as in data/regions.json.
 * Returns { id, inside, distance, neighbour, border }:
 *   inside     the point lies in the traced region (false: nearest region, e.g. at the country border)
 *   distance   m from the point to that region (0 when inside)
 *   neighbour  nearest other region, border its distance in m (for the border warning)
 */
export function regionAt(regions, e, n) {
  let hit = regions.find((r) => inRegion(r, e, n));
  let distance = 0;
  if (!hit) {
    distance = Infinity;
    for (const r of regions) {
      const d = ringsDist(r.rings, e, n);
      if (d < distance) [distance, hit] = [d, r];
    }
  }
  let neighbour = null;
  let border = Infinity;
  for (const r of regions) {
    if (r === hit) continue;
    const d = ringsDist(r.rings, e, n);
    if (d < border) [border, neighbour] = [d, r.id];
  }
  return { id: hit?.id ?? null, inside: distance === 0, distance, neighbour, border };
}

// ---- station ranking --------------------------------------------------------

export const DEFAULT_WEIGHTS = Object.freeze({ height: 10, region: 20 });

/**
 * Stations by score = distance km + |Δh| / 100 m · weights.height + (other region ? weights.region : 0).
 * Δh = station height − site height; without a site height the height term is left out.
 * Returns [{ station, distance (km), dh (m or null), sameRegion, score }], best first.
 */
export function rankStations(stations, site, weights = DEFAULT_WEIGHTS) {
  const hasHeight = Number.isFinite(site.height);
  return stations
    .map((station) => {
      const distance = Math.hypot(station.e - site.e, station.n - site.n) / 1000;
      const dh = hasHeight ? station.height - site.height : null;
      const sameRegion = site.region == null || station.region === site.region;
      const score = distance + (hasHeight ? (Math.abs(dh) / 100) * weights.height : 0) + (sameRegion ? 0 : weights.region);
      return { station, distance, dh, sameRegion, score };
    })
    .sort((a, b) => a.score - b.score || a.distance - b.distance);
}

// ---- place search -----------------------------------------------------------

/** Lower case without accents, for matching "zurich" to "Zürich" and "geneve" to "Genève". */
export const fold = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/**
 * Local search in data/places.json rows [plz, name, municipality, canton, e, n].
 * Digits match the postcode from the start; text matches the start of a word in the name or municipality first,
 * then anywhere. Returns at most `limit` place objects.
 */
export function searchPlaces(places, query, limit = 8) {
  const q = fold(query);
  if (!q) return [];
  const toPlace = ([plz, name, municipality, canton, e, n]) => ({ plz, name, municipality: municipality || name, canton, e, n });
  const digits = q.match(/^\d{1,4}/)?.[0];
  const words = q.replace(/^\d{1,4}\s*/, '');
  const scored = [];
  for (const row of places) {
    if (digits && !String(row[0]).startsWith(digits)) continue;
    let rank = digits ? 1 : 9;
    if (words) {
      const name = fold(row[1]);
      const town = fold(row[2]);
      if (name === words || name.startsWith(`${words} `)) rank = 0;
      else if (name.startsWith(words)) rank = 1;
      else if (new RegExp(`(^|[\\s(/-])${words.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(`${name} ${town}`)) rank = 2;
      else if (`${name} ${town}`.includes(words)) rank = 3;
      else continue;
    }
    scored.push([rank, row]);
  }
  scored.sort((a, b) => a[0] - b[0] || a[1][1].length - b[1][1].length || a[1][0] - b[1][0]);
  return scored.slice(0, limit).map(([, row]) => toPlace(row));
}

// ---- output -----------------------------------------------------------------

/** Number for Excel: plain, decimal point, no grouping. */
const xl = (v, digits = 0) => (Number.isFinite(v) ? (Math.round(v * 10 ** digits) / 10 ** digits).toFixed(digits) : '');

/** Column order of the copied row (tab separated, one line). */
export const COPY_COLUMNS = ['Standort', 'E', 'N', 'Höhe Standort', 'Klimaregion', 'Station', 'Kürzel', 'Höhe Station', 'Abstand km', 'Δh m'];

export function copyRow({ site, region, pick }) {
  const s = pick?.station;
  return [
    site.label ?? '',
    xl(site.e),
    xl(site.n),
    xl(site.height),
    region ?? '',
    s?.name ?? '',
    s?.id ?? '',
    xl(s?.height),
    xl(pick?.distance, 1),
    xl(pick?.dh),
  ].join('\t');
}
