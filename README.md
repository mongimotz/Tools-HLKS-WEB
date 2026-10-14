# HLKS-Tools

**Online:** https://mongimotz.github.io/Tools-HLKS-WEB/

Browser-basierte Tools für Gebäudetechniker.

## Werkzeuge

| Fachrichtung | Werkzeug      | Inhalt                                                                                                                     | Stand       |
| ------------ | ------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------- |
| Lüftung      | Druckverlust  | Teilstrecken mit Formstücken und Einbauteilen, kritischer Strang, Drosselbedarf                                            | Testversion |
| Lüftung      | Kanalrechner  | Rohre und Kanäle auslegen (rund, eckig, flachoval) nach SIA 382/1                                                          | Testversion |
| Lüftung      | Schalldämpfer | Schallpegelberechnung je Oktave von der Quelle bis zum Empfänger, Schalldämpfer aus Herstellerdaten (Trox, Schako, Lindab) | Testversion |
| –            | PDF → DXF     | PDF-Pläne als massstäbliche DXF für CAD                                                                                    | Testversion |

## Dokumentation

Agentenregeln und Werkzeugdetails: [AGENTS.md](AGENTS.md).


Rechenwege: [Druckverlust Lüftung](docs/duct-pressure-loss-method.md) | [Kanalrechner](docs/duct-sizing-method.md) | [Schalldämpfer](docs/silencer-method.md) | [PDF → DXF](docs/pdf-to-dxf-method.md).

## Entwicklung

Node.js 20 oder neuer erforderlich. Keine Installation von Abhängigkeiten ist nötig.

```bash
npm run serve
npm test
```

Die lokale Seite läuft unter [localhost:8080](http://localhost:8080/).

## Lizenz und Fremdcode

Copyright (C) 2025–2026 Fabio. HLKS-Tools steht unter [AGPL v3 oder später](LICENSE).

| Fremdcode                 | Lizenz                                                | Dateien               |
| ------------------------- | ----------------------------------------------------- | --------------------- |
| pdf-lib                   | [MIT](lib/vendor/pdf-lib/LICENSE.md)                  | `lib/vendor/pdf-lib/` |
| @pdf-lib/fontkit und pako | [MIT](lib/vendor/fontkit/LICENSE.md)                  | `lib/vendor/fontkit/` |
| IBM Plex Sans und Mono    | [SIL Open Font License](assets/fonts/OFL-LICENSE.txt) | `assets/fonts/`       |
| MuPDF.js 1.28.1           | [AGPL v3 oder später](lib/vendor/mupdf/LICENSE)       | `lib/vendor/mupdf/`   |
