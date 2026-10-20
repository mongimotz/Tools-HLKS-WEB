# Klimastation

This file records the tool's behavior and controls for agents. Obey the repository's root `AGENTS.md` and `docs/DESIGN.md`.

The tool helps to choose the SIA 2028 climate station for a building site. The user finds the site, the tool shows its climate region on a map and ranks the 40 stations. The result is copied into the owner's Excel sheet, which holds the climate data.

## Scope (owner decisions, 2026-10-20)

- **No SIA climate data in the repository or on the page.** SIA 2028 is copyrighted. The tool may contain only station names, abbreviations, positions, heights and their climate region, and the region map traced by us. Never add temperatures, humidity, radiation, wind or any other value of the norm, not even hidden or for tests.
- No altitude correction of temperatures, no periods "kalt" / "trüb", no automatic noise sensitivity level, no LSV values, no air density. These belong to the Excel sheet.
- Keep the tool small: find a site, see the region, pick a station, copy. A later extension may add MeteoSwiss stations as a second aid; it is not planned yet.

## References

- [Method](../../docs/climate-station-method.md): coordinates, region lookup, ranking formula, limits.
- `scripts/build-climate-regions.py`: traces `data/regions.json` from an image of SIA 2028 figure 1 (the image is not in the repository).
- `scripts/build-places.mjs`: builds `data/places.json` from swisstopo's official directory of localities (AMTOVZ, CSV LV95).

## Files and saved state

- `app.js` and `map.js` control the DOM. `calc.js`, `defaults.js` and `labels.js` have no DOM.
- `data/stations.json`: table 1a / 1b of SIA 2028 (name, abbreviation, degrees and minutes, height, region) and LV95 computed from the degrees. Rünenberg is corrected to 47° 26′ (table 1a misprints 46° 26′).
- `data/regions.json`: 12 regions as rings in LV95 (m), the country outline and lakes, plus a label point per region. Neighbouring regions share their border points exactly.
- `data/places.json`: one row per locality `[plz, name, municipality (empty = name), canton, e, n]`. Liechtenstein has canton `FL`.
- Saved state is a browser draft `{ inputs: { site, station, weights } }` (`normalizeInputs`, idempotent) and the page URL. There is no envelope, no PDF, JSON or CSV export and no ⋯ menu (owner decision: the result goes to Excel by copy).
- URL parameters: `e`, `n` (LV95), `h` (height, only when typed by hand), `st` (station chosen by hand), `q` (site label). A link restores the site; weights come from the draft.
- Undo and redo cover site, height, station and weights. A height from swisstopo is merged into the step that set the site.

## Network

Place search, region lookup and ranking run locally. Two requests go to swisstopo (`api3.geo.admin.ch`), CORS enabled, no key:

- Address search: `SearchServer` with the typed text, `type=locations`, `origins=address,gazetteer`, `sr=2056`, after 250 ms without typing and from three letters on.
- Height: `height?easting=…&northing=…&sr=2056` after every new site, unless the height was typed by hand.

Offline, place and coordinate search still work; the notice row asks for the height by hand. The attribution line on the map names SIA 2028 and swisstopo.

## Layout and workflow

Notice row on top, search above the map on the left, site and stations on the right. Below 860 px: notices, search, map (45 % of the height), panel.

1. Type a postcode, place, address or coordinates (LV95, LV03 or WGS84) and pick a result (↑ / ↓, Enter), or click into the map.
2. The site shows label, LV95, height (swisstopo, or typed: tag `Hand`, ↺ fetches it again) and climate region. → opens map.geo.admin.ch at the site.
3. The table shows the best three stations: region, distance, Δh (station − site), score Σ. The best is chosen. A row or a station on the map chooses another one; ↺ returns to the best. `Alle Stationen` lists all 40.
4. `Gewichtung` (folded) sets the height weight (km per 100 m) and the penalty for another region (km); ↺ restores 10 and 20.
5. `Kopieren` (or Strg+C without a text selection outside inputs) copies one tab-separated row for Excel: Standort, E, N, Höhe Standort, Klimaregion, Station, Kürzel, Höhe Station, Abstand km, Δh m (`COPY_COLUMNS` in `calc.js`).

Notices: height pending (info), height missing or not available (warning, → height field), site outside Switzerland (warning, more than 15 km from every region; ranking without region penalty), site outside the traced regions near the border (info, nearest region), border closer than 5 km to another region (warning), station chosen by hand (info, ↺).

## Map

Own SVG in LV95, no tiles. Regions in `--surface` with `--border-strong` borders, the site's region in `--accent-subtle` / `--accent` (the screen's one accent), lakes in `--primary-subtle`, stations as dots with their abbreviation, the best three and their links to the site in `--primary` (chosen: solid, others dashed), the site as a ring in `--text-strong`.

Wheel or two fingers zoom about the pointer, dragging pans, a click sets the site, a click on a station chooses it. + / − / four corners in the map corner; with focus on the map: arrows pan, + / − zoom, 0 shows all. Zoom stops at 30 px per km, as the source map is coarse. A new site from the search zooms to the site and its best three stations.

## Rebuilding the data

- Regions: `python scripts/build-climate-regions.py map.png` (numpy, Pillow). It prints the fit (38 control points, rms about 0.65 km; Bern-Liebefeld and Magadino are drawn 7 and 4 km off in the source and left out). It stops with a message when a border line has a gap (add a `PATCHES` line) or a closed area has no station (add a `SEEDS` entry). Check the result against the source map before committing.
- Places: `node scripts/build-places.mjs AMTOVZ_CSV_LV95.csv` with the current file from swisstopo.
- `tests/climate-station.test.js` checks table 1b, every station in its region (exception: Grand-St-Bernard, which the map draws inside region 10), every locality near a region, the Olten ranking and the state.
