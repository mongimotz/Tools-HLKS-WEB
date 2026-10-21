# HLKS-Tools

**Online:** [https://hlks.org/](https://hlks.org/)

Browser-basierte Tools für Gebäudetechniker.

## Werkzeuge

| Fachrichtung | Werkzeug      | Inhalt                                        | Stand    |
| ------------ | ------------- | --------------------------------------------- | -------- |
| Lüftung      | Druckverlust  | Druckverlust im Netz, kritischer Strang       | Released |
| Lüftung      | Kanalrechner  | Rohre und Kanäle auslegen nach SIA 382/1      | BETA     |
| Lüftung      | Schalldämpfer | Schallpegel bis zum Empfänger, Schalldämpfer  | BETA     |
| Klima        | Klimastation  | Klimastation nach SIA 2028 für einen Standort | BETA     |
| –            | PDF-Editor    | PDF-Pläne ansehen, markieren und bearbeiten   | BETA     |
| –            | PDF → DXF     | PDF-Pläne als massstäbliche DXF für CAD       | Released |

## Dokumentation

Agentenregeln und Werkzeugdetails: [AGENTS.md](AGENTS.md).

Rechenwege: [Druckverlust Lüftung](docs/duct-pressure-loss-method.md) | [Kanalrechner](docs/duct-sizing-method.md) | [Schalldämpfer](docs/silencer-method.md) | [Klimastation](docs/climate-station-method.md) | [PDF-Editor](docs/pdf-editor-method.md) | [PDF → DXF](docs/pdf-to-dxf-method.md)

## Entwicklung

Node.js 20 oder neuer erforderlich. Keine Installation von Abhängigkeiten ist nötig.

```bash
npm run serve
npm test
```

Die lokale Seite läuft unter [localhost:8080](http://localhost:8080/).

## Lizenz und Fremdcode

Copyright (C) 2025–2026 Fabio. HLKS-Tools steht unter [AGPL v3 oder später](LICENSE).

| Fremdcode                          | Lizenz                                                | Dateien                 |
| ---------------------------------- | ----------------------------------------------------- | ----------------------- |
| pdf-lib                            | [MIT](lib/vendor/pdf-lib/LICENSE.md)                  | `lib/vendor/pdf-lib/`   |
| @pdf-lib/fontkit und pako          | [MIT](lib/vendor/fontkit/LICENSE.md)                  | `lib/vendor/fontkit/`   |
| IBM Plex Sans und Mono             | [SIL Open Font License](assets/fonts/OFL-LICENSE.txt) | `assets/fonts/`         |
| MuPDF.js 1.28.1                    | [AGPL v3 oder später](lib/vendor/mupdf/LICENSE)       | `lib/vendor/mupdf/`     |
| EmbedPDF 3.0.0-next.15             | [Apache 2.0](lib/vendor/embedpdf/LICENSE)             | `lib/vendor/embedpdf/`  |
| tesseract.js 7.0.0, tessdata_fast  | [Apache 2.0](lib/vendor/tesseract/LICENSE)            | `lib/vendor/tesseract/` |
