# HLKS-Tools

Browser-based calculation tools for HVAC (Heizung, Lüftung, Klima, Sanitär). Static site, no build step, no server. Every result is saved as a PDF report with the inputs embedded as `data.json`, so the PDF can be opened again and edited.

## Tools

| Tool | Status |
|---|---|
| Druckverlust Lüftung (`tools/duct-pressure-loss/`) | test version |
| Kanalrechner, Schalldämpfer, Monoblock, Dämmung | planned |

### Druckverlust Lüftung – what is new compared to the Excel sheet

- **Branched networks:** every section has a predecessor ("Vorgänger"). The tool finds the critical path and the throttling needed at every other end ("Drosselbedarf").
- **Exact Colebrook-White** (iterative) instead of the Zanke approximation. Churchill, Haaland, Swamee-Jain and Zanke are selectable for comparison.
- **Fitting catalogue** with ζ values per section (count × ζ, override per entry), plus computed transitions to the predecessor (Borda-Carnot / contraction).
- **Components with fixed Δp** (filter, silencer, fire damper, VAV, diffuser …).
- **Air state:** standard atmosphere pressure, humidity, per-section temperature (Excel used 0 °C for rows without a temperature).
- **Fan check:** available pressure, safety margin, reserve or shortfall.
- **Sizing help:** smallest standard round duct and rectangular sizes that keep v ≤ v_max, one click to apply.
- **Checks:** velocity limit, aspect ratio, flow continuity at branches, laminar/transition regime.
- Pressure profile along the critical path, network schematic, undo/redo, local draft autosave, CSV export for Excel.

## Run locally

ES modules need http (not `file://`):

```bash
npm run serve
```

Then open http://localhost:8080/. Node 20+ is the only requirement; there are no dependencies to install.

## Test

```bash
npm test
```

Covers the calculation (reference values, the original Excel row, network sums), the JSON envelope, the PDF round trip (export → import → export keeps the data identical) and regression against the reference PDFs in `tests/fixtures/`.

## Deploy (GitHub Pages)

Push to `main` and enable Pages for the `main` branch (root). `.nojekyll` is included. For an own domain add a `CNAME` file later.

## Notes

- Conventions for contributors and agents: `AGENTS.md`. Design rules: `docs/DESIGN.md`. Original idea and plan: `IDEA.md`.
- Colours: `dragon-ink.md`. Fonts: IBM Plex Sans + Mono only.
- Third-party: pdf-lib (MIT, `lib/vendor/pdf-lib/`), @pdf-lib/fontkit + pako (MIT, `lib/vendor/fontkit/`), IBM Plex fonts (SIL OFL, `assets/fonts/`).
