# PDF-Editor: Verfahren

Wie der PDF-Editor misst, Text erkennt, komprimiert und speichert, und wo seine Grenzen liegen. Details zur Bedienung stehen in den [Agentenhinweisen zum Werkzeug](../tools/pdf-editor/AGENTS.md).

## Aufbau

- **Ansicht und Bearbeiten:** EmbedPDF (PDFium als WebAssembly) zeigt die PDF und schreibt Kommentare, Markierungen, Messungen, Stempel, Unterschriften und Formularfelder als normale PDF-Anmerkungen. Andere Programme (Acrobat, Bluebeam, Edge) können sie weiter bearbeiten.
- **Dokumentwerkzeuge** (Menü ⋯): MuPDF (Artifex, WebAssembly) in einem Web Worker.
- **Texterkennung:** tesseract.js im selben Worker.

Alles läuft im Browser. Die PDF verlässt das Gerät nicht.

## Speichern

↓ PDF und Strg+S speichern die PDF unter ihrem ursprünglichen Namen. Der Editor hängt die Änderungen an die Datei an (inkrementelles Speichern). Der ursprüngliche Inhalt bleibt unverändert in der Datei, darum bleibt eine vorhandene digitale Signatur gültig.

Dokumentwerkzeuge (Wasserzeichen, Seitenzahlen, Komprimieren, Kennwort, OCR …) schreiben die Datei dagegen neu. Danach ist eine vorhandene digitale Signatur ungültig, und der Verlauf (↶ ↷) beginnt neu.

## Messen mit Massstab

Die PDF misst in Punkt (pt), 1 pt = 25.4/72 mm auf dem Papier. Eine Strecke von $d$ pt auf dem Plan im Massstab 1:$M$ ist in Wirklichkeit

$$L = d \cdot \frac{25.4}{72} \cdot M \quad \text{(mm)}$$

lang. Flächen wachsen mit $M^2$.

**Massstab wählen:** Die Vorgaben 1:1 bis 1:1000 (in den Einstellungen änderbar) setzen $M$ direkt. Ohne Wahl gilt 1:1 in Metern.

**Kalibrieren:** Eine Linie über ein bekanntes Mass ziehen und dessen wahre Länge $L_\text{bekannt}$ eingeben. Daraus folgt

$$M = \frac{L_\text{bekannt}}{d \cdot 25.4/72}$$

Der Massstab gilt für die ganze Seite und wird in der PDF gespeichert. Er ist PDF-Standard (`/VP /Measure`), Programme mit Messfunktion wie Acrobat lesen ihn. Zahlen stehen im Schweizer Format (`5’000.00 mm`).

**Genauigkeit:** Zwei Dinge begrenzen sie.

1. **Der Plan selbst.** Eine Vorgabe 1:$M$ stimmt nur, wenn die PDF wirklich im Massstab 1:$M$ geplottet wurde (nicht „an Seite anpassen“, nicht verkleinert gedruckt und wieder gescannt). Bei gescannten Plänen kommt der Verzug von Papier und Scanner dazu. Sicherer ist das Kalibrieren an einem langen, bemassten Mass auf derselben Seite. Ein Messfehler des kalibrierten Masses überträgt sich anteilig auf alle Messungen: 1 % daneben beim Kalibrieren ergibt 1 % bei jeder Messung.
2. **Der Klick.** Ein Punkt sitzt auf etwa einen Bildschirmpixel genau. Bei 100 % Zoom ist ein Pixel 25.4/96 ≈ 0.26 mm auf dem Papier, bei einem Zoom $z$ (100 % = 1) also

$$\Delta L \approx \frac{0.26}{z} \cdot M \quad \text{(mm, je Endpunkt)}$$

Beispiel 1:100: bei 100 % rund 26 mm je Endpunkt, bei 400 % rund 7 mm. Für genaue Masse nahe heranzoomen und lange Strecken messen. Der Editor rastet nicht auf Linien ein.

## Seitenzahlen, Kopf- und Fusszeile

Platzhalter im Text:

| Platzhalter | Wert |
|---|---|
| `{n}` | Seitenzahl |
| `{total}` | Seitenzahl gesamt |
| `{datei}` | Dateiname |
| `{datum}` | heutiges Datum im Format der Einstellungen |

Bei Seitenzahlen gilt `{total}` für die nummerierten Seiten: Werden die Seiten 3 bis 10 ab 1 nummeriert, ist `{total}` gleich 8. Der Text ist IBM Plex Sans und bleibt durchsuchbar.

## Texterkennung (OCR)

Für gescannte Pläne und Dokumente ohne Textebene.

1. Jede gewählte Seite wird so gezeichnet, wie sie erscheint (Drehung und Ausschnitt berücksichtigt), in Graustufen mit 300 dpi. Seiten über 40 Megapixel (grösser als etwa A2 bei 300 dpi) werden mit tieferer Auflösung gelesen.
2. tesseract.js liest das Bild mit den Sprachen Deutsch und Englisch (neuronales Modell, schnelle Variante).
3. Jedes erkannte Wort kommt als unsichtbarer Text genau über das Wort im Bild. Das Bild bleibt unverändert. Danach findet die Suche den Text, und er lässt sich markieren und kopieren.

Standard sind die Seiten ohne Text. Wer Seiten mit Text auswählt, hat dort den Text danach doppelt (vorhandener und erkannter).

**Grenzen:**

- Die Qualität hängt vom Scan ab: schräge, verschmierte oder sehr kleine Schrift wird schlecht erkannt.
- Handschrift wird nicht erkannt.
- Schrift in Plänen (Bemassung, gedrehte Beschriftung zwischen Linien) erkennt OCR deutlich schlechter als Fliesstext. Um 90°, 180° und 270° gedrehte Zeilen gehen, schräger Text kaum.
- Nur die Sprachmodelle Deutsch und Englisch sind dabei.
- Grosse Seiten brauchen Zeit und Speicher.

## Komprimieren

1. **Verlustfrei:** Nicht verwendete Objekte entfernen, Datenströme komprimieren, Objekte in Objektströme packen.
2. **Optional Bilder:** Farb- und Graubilder mit mehr Pixeln, als die gewählte Auflösung (300, 200 oder 150 dpi) über die ganze Seite braucht (mit 25 % Spielraum), werden auf diese Auflösung verkleinert und als JPEG (Qualität 75) gespeichert. Schwarzweissbilder (Fax, JBIG2) und Masken bleiben.

Die neue Datei ist nie grösser: Bringt das Komprimieren nichts, bleibt die Datei unverändert (`Keine Verkleinerung möglich`).

**Grenzen:** Vektorpläne aus CAD sind meist schon kompakt, der Gewinn ist klein. Viel bringt das Verfahren bei Scans und Fotos. Weil die Auflösung über die ganze Seite gerechnet wird, wird ein kleines Bild auf einer grossen Seite eher zu wenig als zu viel verkleinert. Auf der Seite wird kein Bild unschärfer als die gewählte Auflösung.

## Kennwort

Verschlüsselt mit AES-256. Kennwort zum Öffnen und Kennwort für Rechte (Drucken, Kopieren, Ändern, Kommentieren, Formulare ausfüllen) sind getrennt. Die Rechte sind eine Bitte an das Programm, kein Schutz: Wer das Kennwort zum Öffnen hat oder keines braucht, kann sie mit vielen Programmen übergehen. Kommas sind im Kennwort nicht erlaubt.

Ein vergessenes Kennwort zum Öffnen lässt sich nicht wiederherstellen.

## Reduzieren

Kommentare, Markierungen und Formularfelder werden fester Seiteninhalt: Sie sehen gleich aus, lassen sich aber nicht mehr bearbeiten oder ausfüllen. Sinnvoll vor dem Versand an Programme, die Anmerkungen nicht oder falsch zeigen.

## Seiten als Bilder

PNG oder JPG mit 72 bis 600 dpi. Seiten über 100 Megapixel (zum Beispiel A0 mit 300 dpi) werden kleiner gerechnet, eine Meldung sagt das.

## Automatisch sichern

Der Editor sichert die offene PDF mit ihren Änderungen 2 Sekunden nach der letzten Änderung in diesem Browser auf diesem Gerät (IndexedDB). Er behält höchstens 3 Dateien, keine älter als 14 Tage. Nach einem Absturz oder versehentlichem Schliessen zeigt die Hinweiszeile `Ungesicherte Änderungen` mit Wiederherstellen und Verwerfen. Speichern (↓ PDF) löscht die Sicherung.

Die Sicherung ersetzt das Speichern nicht: Sie ist weg, wenn die Browserdaten gelöscht werden, und auf einem anderen Gerät nicht vorhanden.

## Nicht unterstützt und Grenzen

- **Vorhandenen Text ändern:** Ob und wie gut das geht, hängt von der PDF ab (Schrift eingebettet, Aufbau der Zeilen). Mehrspaltige oder umfliessende Texte ordnen sich nicht neu an. Der sichere Weg: alten Text abdecken (`Abdecken`) oder schwärzen und ein neues Textfeld setzen.
- **XFA-Formulare** (dynamische Formulare aus Adobe LiveCycle) werden nicht unterstützt, nur normale PDF-Formulare (AcroForm).
- **Digitale Signaturen:** Unterschriften im Editor sind gezeichnet oder als Bild eingefügt, nicht kryptografisch signiert.
- **Sehr grosse Dateien** (über 200 MB oder über 1000 Seiten) können den Speicher des Browsers sprengen, besonders auf Telefonen.
- **SVG-Symbole:** Pfade, Formen, Text und eingebettete Bilder werden übernommen. Clipping, Masken, Filter und Muster fallen weg, Verläufe werden zur ersten Farbe.
- **Editor-Version:** EmbedPDF 3 ist eine Vorabversion. Die Version ist fest eingebunden. Ein Wechsel wird jedes Mal mit den Tests und einer Prüfung von Hand bestätigt.
