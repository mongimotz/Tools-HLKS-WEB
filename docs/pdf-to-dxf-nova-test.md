# PDF → DXF: Test in Trimble Nova

Checkliste für den Import der DXF in Trimble Nova. Die Test-PDFs liegen in `tests/fixtures/pdf-to-dxf/`. Trage das Ergebnis direkt hier ein (✓, ✗ oder eine kurze Notiz) und committe die Datei.

## Vorbereitung

1. Seite öffnen: https://mongimotz.github.io/Tools-HLKS-WEB/tools/pdf-to-dxf/ (oder lokal `npm run serve`).
2. Für jede Zeile die PDF öffnen, die Einstellung wählen und mit „↓ DXF“ speichern. Ohne andere Angabe gilt: Vorgabe „NOVA“, Massstab 1:100, Einheit mm, DXF R2000.
3. In Nova: DXF als Unterlage importieren, Einheit mm.

Datum: ____________ Nova-Version: ____________

## Grundlagen

| Nr. | PDF | Einstellung | Prüfen | Erwartet | Ergebnis |
|---|---|---|---|---|---|
| 1 | lines.pdf | Standard | Import ohne Fehlermeldung | keine Meldung | |
| 2 | lines.pdf | Standard | Kontrollstrecke (lange waagrechte Linie unten) messen | genau 10'000 mm | |
| 3 | lines.pdf | Massstab 1:50 | Kontrollstrecke messen | 5'000 mm | |
| 4 | lines.pdf | Einheit m | Kontrollstrecke messen, Einheit in Nova | 10 m | |
| 5 | lines.pdf | Standard | Lage: Nullpunkt an der linken unteren Seitenecke | linke untere Ecke des schwarzen Rechtecks bei x ≈ 1'764, y ≈ 21'167 mm | |
| 6 | lines.pdf | Ursprung „Mitte“ | Nullpunkt in der Mitte der Zeichnung | Zeichnung um 0/0 | |

## Layer, Farben, Strichstärken

| Nr. | PDF | Einstellung | Prüfen | Erwartet | Ergebnis |
|---|---|---|---|---|---|
| 7 | layers.pdf | Standard | Layerliste | Layer „Waende“, „Moebel“, dazu ein `PDF_RGB_…`-Layer; kein „Bemassung“ | |
| 8 | layers.pdf | „Ausgeblendete PDF-Ebenen“ an | Layerliste | zusätzlich „Bemassung“ | |
| 9 | lines.pdf | Standard | Farben: rotes Rechteck, blaue Linie, Rest schwarz/weiss | Farben wie in der PDF | |
| 10 | lines.pdf | Standard | Strichstärken anzeigen (Linienstärke ein) | 0.35 mm Kontrollstrecke, 0.18 mm schwarzes Rechteck, 0.35 mm rotes Rechteck | |
| 11 | lines.pdf | „Echtfarben“ aus | Import und Farben | gleiche Farben über AutoCAD-Farbindex | |

## Bögen, Kurven

| Nr. | PDF | Einstellung | Prüfen | Erwartet | Ergebnis |
|---|---|---|---|---|---|
| 12 | curves.pdf | Standard | Objekttypen | 1 Kreis, 3 Bögen, 2 Polylinien (S-Kurve, Ellipse) | |
| 13 | curves.pdf | Standard | Kreis anklicken: Radius | 1'764 mm (50 pt × 25.4/72 × 100) | |
| 14 | curves.pdf | Kurven „Spline“ | S-Kurve und Ellipse | als Spline, glatt | |

## Text

| Nr. | PDF | Einstellung | Prüfen | Erwartet | Ergebnis |
|---|---|---|---|---|---|
| 15 | text.pdf | Standard | „Büro 3.50 m²“ | Umlaut und ² richtig | |
| 16 | text.pdf | Standard | „Ø 160“ | Ø richtig | |
| 17 | text.pdf | Standard | „Schräg 30°“, „Vertikal“ | Drehung 30° und 90°, ° richtig | |
| 18 | text.pdf | Standard | Texthöhe im Vergleich zur PDF | Grossbuchstaben etwa gleich hoch wie in der PDF | |
| 19 | text.pdf | Standard | „Ohne Zuordnung“ | als Umriss (Polylinien), lesbar | |
| 20 | text.pdf | Text „Umriss“ | alle Texte | als Polylinien | |

## Schraffur, Füllung, Strichlierung

| Nr. | PDF | Einstellung | Prüfen | Erwartet | Ergebnis |
|---|---|---|---|---|---|
| 21 | hatch.pdf | Standard | Schraffur | 30 Linien auf `PDF_SCHRAFFUR`, Rechteck auf eigenem Layer | |
| 22 | hatch.pdf | Füllungen „Fläche“ | Dreieck | gefüllte Fläche (HATCH) | |
| 23 | dash.pdf | Standard | Linientypen | strichliert (DASHED) und strichpunktiert (DASHDOT) | |
| 24 | dash.pdf | Strichlierung „Einzelstriche“ | obere Linie | 34 einzelne Linien | |

## Struktur

| Nr. | PDF | Einstellung | Prüfen | Erwartet | Ergebnis |
|---|---|---|---|---|---|
| 25 | dupes.pdf | Standard | Anzahl Objekte | 6, keine doppelten Linien | |
| 26 | clip.pdf | Standard | Ausschnitte | 7 Linien, nichts ausserhalb der Ausschnitte | |
| 27 | rotated.pdf | Standard | Lage | L-Form und Rechteck wie im PDF-Betrachter (Seite gedreht) | |
| 28 | multipage.pdf | Seiten „Alle nebeneinander“ | Seiten | drei Rahmen nebeneinander, 20 mm Abstand auf dem Papier | |

## Scan

| Nr. | PDF | Einstellung | Prüfen | Erwartet | Ergebnis |
|---|---|---|---|---|---|
| 29 | scan_dirty.pdf | Scan an, kalibriert auf eine bekannte Wandlänge | Linien | gerade, waagrecht und senkrecht, Layer `SCAN_…` | |

## R2000 und R12

| Nr. | PDF | Einstellung | Prüfen | Erwartet | Ergebnis |
|---|---|---|---|---|---|
| 30 | curves.pdf | DXF R12 | Import | ohne Fehlermeldung; Bögen als ARC, Kurven als Polylinie | |
| 31 | text.pdf | Vorgabe „Maximale Kompatibilität“ (R12) | Import | nur Polylinien, Text lesbar | |
| 32 | lines.pdf | DXF R12 | Kontrollstrecke | 10'000 mm | |

## Echter Plan

| Nr. | PDF | Einstellung | Prüfen | Ergebnis |
|---|---|---|---|---|
| 33 | eigener Architektenplan | NOVA, Massstab des Plans | Import, Massstab an einer bekannten Masskette, Layer, Text, Schraffur, Geschwindigkeit | |
| 34 | eigener gescannter Plan | Scan an, kalibriert | Brauchbarkeit als Unterlage | |

## Notizen

Was in Nova anders aussieht als erwartet (mit Nr.):
