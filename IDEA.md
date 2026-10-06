**WICHTIG:** Das Backend vom Projekt ist english, inklusive Dateistruktur. Frontend ist komplett auf deutsch!



- Kanalrechner
    Build experimental version with 3D-Model and fluid simulation
- Druckverlust
- Schalldämpfer-Auslegung
    inkl. Schallpegel-Berechnung Oktavband
- Berechnung Monoblock
    Ventilatorleistung, Heiz- Kühlleistung, Befeuchtung, Filterauslegung
- Dämmungs-Rechner (Abschätzung)

## Technical

- output PDF with data embedded inside PDF as .json (for details see claude)
- maybe allow permanent storage (not just in-browser) through google drive integration or something?
- ads??
- export as Excel-Sheet?

---

## Plan

### Side Note: rules i added manually

Design: follow outlined design guidelines, important like colors, fonts and sizes to keep things consistent between tools, however if practical stuff can look different between different tools.

Homepage: All tools should be accessible from a dedicated homepage as well, here visuals matter a lot more / can be more creative.

Important guideline: animations are fine on stuff like the start page, but even there everything should stay responsive and react **immediately**, i don't want to wait half an hour before an element appears when i scroll down just so i can display a nice animation. But in essence: pretty visuals and animations are fine as long as they don't slow me down.

---

everything below is outlined by claude:

**1. Setup**

- Create a new repo (e.g. `ht-tools`) and turn on GitHub Pages so it deploys from `main`.
- Plain HTML/JS with no build step to start, so a `git push` is the whole deploy.
- Copy `pdf-lib` and `pdf.js` into `/lib/vendor/` instead of loading them from a CDN, so the site still works offline later.

**2. Shared core (`/lib/`)**

- **PDF export:** a visible report plus the attached `data.json`.
- **PDF import:** read `data.json`, check the `tool` and `version` fields, then open the right tool.
- **Common pieces:** project info (project, author, date), units and a consistent layout.
- **JSON envelope:** `{ tool, version, calcVersion, inputs }`. It stores inputs only, and results are always recalculated.

**3. First tool: duct pressure loss**

- A table of sections with live calculation per section and summed along the run.
- Editable ζ and roughness tables that get saved in the JSON.
- Round-trip test: export, import and edit, then export again, and the data must stay identical.

**4. Start page**

- A list of tools and one import field that accepts any tool's PDF.

**5. Hardening (once the first tool works well)**

- PWA/service worker, so it works offline and can be installed.
- A warning when an old PDF was calculated with a different `calcVersion`.
- A few saved test PDFs that you re-import after changes to catch regressions.

**6. Add more tools**

- Each new tool is a folder in `/tools/` that uses the shared core: Messprotokoll, Kühllast check and so on.

**7. Later: your own domain**

- Buy a domain, add a `CNAME` file to the repo, set the DNS record and turn on HTTPS in the Pages settings.
- If you ever leave GitHub, the same files run unchanged on Hetzner or Cloudflare.
