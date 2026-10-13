# PDF → DXF: Verfahren

Wie das Werkzeug PDF → DXF aus einer PDF eine DXF macht: Umrechnung, Bogenerkennung, Schraffur-Erkennung, Scan-Verfahren, Toleranzen und Grenzen. Details zur Bedienung stehen in den [Agentenhinweisen zum Werkzeug](../tools/pdf-to-dxf/AGENTS.md).

## Ablauf

1. **Lesen:** MuPDF (Artifex, im Browser als WebAssembly) zeichnet die Seite in ein eigenes „Gerät“. Das Werkzeug bekommt jeden Pfad, jeden Text, jede Clipping-Fläche und jede PDF-Ebene mit Farbe, Strichstärke und Strichlierung. Gerade Stücke werden Linien und Polylinien, Kurven bleiben Bézierkurven.
2. **Aufbereiten:** Layer zuordnen, Bögen erkennen, Clipping anwenden, Doppeltes entfernen, Schraffuren erkennen, Linien verbinden, Strichlierung, Bereich und Filter.
3. **Schreiben:** Umrechnen in Millimeter (oder cm, m) und die DXF schreiben (R2000 oder R12).

Alles läuft in einem Web Worker im Browser. Die PDF verlässt das Gerät nicht.

## Koordinaten und Massstab

Massgebend ist die Seite, wie ein PDF-Betrachter sie zeigt: Seitendrehung (`/Rotate`) und Seitenausschnitt (CropBox) sind schon berücksichtigt. Die PDF misst in Punkt (pt), 1 pt = 25.4/72 mm.

$$x_\text{DXF} = (x_\text{pt} - x_0) \cdot \frac{25.4}{72} \cdot \frac{M}{e}$$

- $M$: Planmassstab (1:$M$), zum Beispiel 100
- $e$: Einheit der DXF, 1 für mm, 10 für cm, 1000 für m
- $x_0$: Ursprung, 0 bei „Seitenecke“ (linke untere Ecke der Seite), sonst die Mitte der Zeichnung

Beispiel: Eine Strecke von 100 mm auf dem Papier ist bei 1:100 genau 10'000 mm lang.

**Kalibrierung:** Zwei Punkte auf dem Plan mit dem Papierabstand $d$ (mm) und die wahre Länge $L$ (mm) ergeben

$$M = \frac{L}{d}$$

Die Klicks rasten auf dem nächsten Linienende in 10 Bildschirmpixeln ein.

**Strichstärken** bleiben Papiermass: 0.35 mm auf dem Papier ergibt die DXF-Strichstärke 0.35 mm, unabhängig vom Massstab. Der Wert wird auf die nächste gültige DXF-Strichstärke gerundet (0, 0.05, 0.09, 0.13, 0.15, 0.18, 0.20, 0.25, 0.30, 0.35, 0.40, 0.50 … 2.11 mm).

**Texthöhe:** Im CAD meint die Texthöhe die Höhe der Grossbuchstaben, in der PDF die Schriftgrösse. Grossbuchstaben sind bei Arial, Helvetica und IBM Plex etwa 0.7 Schriftgrössen hoch. Deshalb gilt

$$h_\text{DXF} = 0.7 \cdot s_\text{pt} \cdot \frac{25.4}{72} \cdot \frac{M}{e}$$

Lage (Anfang der Grundlinie) und Drehung kommen aus der PDF.

## Text

Die PDF speichert Text als einzelne Zeichen an einzelnen Stellen. Das Werkzeug setzt aufeinander folgende Zeichen zu einem Text zusammen, wenn sie auf derselben Grundlinie liegen (Abweichung höchstens 0.1 Schriftgrössen), gleich gross sind (±2 %), in dieselbe Richtung laufen (±1°), dieselbe Farbe und Ebene haben und höchstens eine halbe Schriftgrösse auseinander liegen. Ist die Lücke grösser als 0.15 Schriftgrössen und fehlt ein Leerzeichen, fügt es eines ein.

Manche PDFs sagen nicht, welcher Buchstabe ein Zeichen ist (keine Zeichenzuordnung). Dann wäre der Text in der DXF unlesbar. Das Werkzeug schreibt solchen Text als Umriss: Die Form jedes Buchstabens wird eine geschlossene Polylinie.

Sonderzeichen: Die DXF ist in Windows-1252 kodiert (Umlaute, ², Ø, ° sind darin). Andere Zeichen schreibt R2000 als `\U+XXXX`, R12 als `?`.

## Bogenerkennung

Die PDF kennt keine Kreise, nur Bézierkurven. Ein Kreisbogen wird darin mit einer Bézierkurve pro höchstens 90° angenähert. Bei dieser üblichen Annäherung liegen Anfang, Ende und Mitte der Kurve genau auf dem Kreis. Das Werkzeug

1. legt den Kreis durch diese drei Punkte,
2. prüft 16 Punkte der Kurve: Weicht keiner mehr als die Bogen-Toleranz vom Kreis ab, ist die Kurve ein Bogen. Die Toleranz ist 0.02 mm auf dem Papier, bei grossen Radien höchstens 0.03 % des Radius (so viel weicht die Bézier-Annäherung selbst ab),
3. fügt aufeinander folgende Bögen desselben Pfads mit gleichem Mittelpunkt und Radius zusammen. Ergeben sie 360°, wird daraus ein Kreis.

Eine Kurve, deren Kontrollpunkte auf der Sehne liegen, wird eine Linie. Andere Kurven (Ellipsen, Freiformen) werden Polylinien mit der Kurven-Toleranz (Standard 0.05 mm auf dem Papier) oder, auf Wunsch, Splines.

## Clipping

PDFs blenden oft Teile aus, zum Beispiel ausserhalb eines Planausschnitts. Das Werkzeug schneidet Linien an der Clipping-Fläche ab: an Rechtecken mit dem Verfahren von Liang und Barsky, an anderen Flächen über die Schnittpunkte mit dem Rand und einen Punkt-in-Fläche-Test für jedes Stück. Bögen und Kurven bleiben ganz, wenn sie ganz innen liegen, sonst werden sie zuerst in Polylinien zerlegt. Ein Text bleibt, wenn sein Einfügepunkt innen liegt.

## Doppelte Linien und Verbinden

PDFs zeichnen Linien oft doppelt: eine Füllung und ihre Kontur, eine Linie zweimal, eine lange Linie in Stücken. Das Werkzeug zerlegt Linien und Polylinien in Strecken und sucht Strecken auf derselben Geraden (Richtung und Abstand innerhalb der Verbinden-Toleranz, Standard 0.05 mm). Auf einer Geraden zählt jedes Teilstück nur einmal. Wo sich Strecken überlappen, gewinnt eine Kontur gegen eine Füllung, sonst die später gezeichnete (sie liegt in der PDF oben). Strecken verschiedener PDF-Ebenen bleiben getrennt.

Danach werden Strecken mit gemeinsamen Endpunkten (innerhalb der Toleranz) zu Polylinien verbunden, wenn Layer, Farbe, Strichstärke und Strichlierung gleich sind. An Verzweigungen (drei oder mehr Strecken) endet eine Polylinie. Ein geschlossener Zug wird eine geschlossene Polylinie.

## Schraffur-Erkennung

Eine Gruppe gilt als Schraffur, wenn

- mindestens 8 Linien auf demselben Layer parallel sind (Richtung ±0.5°),
- jede Linie höchstens 100 mm lang ist (Papier),
- die Abstände zwischen benachbarten Linien gleich sind (±10 %) und höchstens 10 mm betragen,
- benachbarte Linien nebeneinander liegen (ihre Ausdehnung entlang der Richtung überlappt).

Stücke auf derselben Geraden zählen als eine Linie. Das ist eine Schätzung: Auch eine Treppe kann so aussehen. Mit der Einstellung „Eigener Layer“ gehen solche Linien nicht verloren, sie liegen nur auf `PDF_SCHRAFFUR`.

## Layer

PDF-Ebenen (Optional Content Groups) werden Layer mit demselben Namen. Ausgeschaltete Ebenen liest das Werkzeug nur auf Wunsch. Alles ohne Ebene kommt nach Farbe und Strichstärke (`PDF_RGB_255-0-0_0.35`), nach Farbe, nach Strichstärke oder auf einen Layer `PDF`. Weitere Layer: `PDF_TEXT`, `PDF_SCHRAFFUR`, `…_FILL` (Umrisse von Füllungen), `SCAN_…` (gescannte Linien nach Strichstärke). Unerlaubte Zeichen in Layernamen (`< > / \ " : ; ? * | =` und der Gravis) werden zu `_`, gleiche Namen bekommen `_2`, `_3` … In R12 sind nur A–Z, 0–9, `_`, `-` und `$` erlaubt, höchstens 31 Zeichen; Umlaute werden zu A, O, U.

## Farben

Jede Farbe wird zur nächsten AutoCAD-Farbe (ACI), gemessen mit gewichtetem Abstand im RGB-Raum. Schwarz und Weiss werden Farbe 7 (im CAD schwarz oder weiss je nach Hintergrund). In R2000 steht zusätzlich die genaue Farbe (Echtfarbe, Gruppencode 420), ausser bei Schwarz und Weiss. CMYK-, Grau- und Schmuckfarben werden vorher in RGB umgerechnet.

## Strichlierung

Strichlierte Linien bekommen den Linientyp DASHED (Strich, Lücke) oder DASHDOT (vier oder mehr Elemente). Die Musterlänge kommt von der ersten strichlierten Linie der Seite, umgerechnet wie die Geometrie. Mit „Einzelstriche“ wird jeder Strich eine eigene Linie.

## Gescannte Pläne

Ein Scan ist ein Bild ohne Linien. Das Werkzeug erkennt ihn, wenn die Seite weniger als 50 Linienstücke und 20 Texte hat und Bilder mindestens 60 % der Seite bedecken. Auf Wunsch vektorisiert es das Bild:

1. **Rendern** mit 200 bis 600 dpi (Standard 300). Grosse Seiten werden auf höchstens 40 Millionen Pixel begrenzt.
2. **Schwellwert:** Ein Pixel ist Linie, wenn es mindestens 18 % dunkler ist als der Mittelwert seiner Umgebung (Fenster 4 × 4 mm, schnell über ein Summenbild) und dunkler als Grauwert 200. Grauer oder fleckiger Hintergrund bleibt so weiss.
3. **Morphologie:** Ein Schliessen mit 3 × 3 Pixeln füllt einzelne Löcher und Lücken. Danach fallen Flecken weg: zusammenhängende Pixelgruppen, die in beiden Richtungen kleiner als 1.2 mm sind.
4. **Schräglage:** Für Winkel von −5° bis +5° (Schritte 0.25°, verfeinert 0.02°) wird geprüft, wie scharf die Zeilen- und Spaltenprofile der Linienpixel sind. Pläne haben viele waagrechte und senkrechte Linien; beim richtigen Winkel sind die Profile am schärfsten. Das Bild selbst wird nicht gedreht, sondern das Ergebnis.
5. **Mittellinie** (Standard): Das Verfahren von Zhang und Suen dünnt jeden Strich auf ein Pixel aus. Die Mittellinien werden zwischen Enden und Verzweigungen verfolgt, kurze Seitenäste (kürzer als zwei Strichbreiten oder 1 mm) fallen weg. Douglas–Peucker vereinfacht sie (0.1 mm). Linien bis 2° Abweichung werden genau waagrecht oder senkrecht, Stücke auf derselben Geraden (Abstand bis 0.35 mm, Lücke bis 0.6 mm) zusammengefügt, Ecken und T-Stösse bis 0.8 mm geschlossen. Die Strichbreite kommt aus einer Abstandskarte (doppelter Abstand der Mittellinie zum Rand) und wird auf 0.05 mm gerundet.
6. **Umriss:** Statt der Mittellinie folgt das Verfahren „Marching Squares“ dem Rand jedes Strichs; es entstehen geschlossene Polylinien.
7. **Umrechnen:** Pixel werden mit der Auflösung in Punkt umgerechnet und um die Schräglage zurückgedreht (Drehpunkt Seitenmitte). Danach gilt die gleiche Aufbereitung wie für Vektor-PDFs.

Prüfung mit einem Testplan (18 Linien, 300 dpi): sauberer Scan alle Linien innerhalb 1 mm; verschmutzter Scan (1.5° schief, grauer Hintergrund, Rauschen, Flecken, JPEG) Schräglage 1.50° erkannt, alle Linien innerhalb 1 mm.

Ein Scan hat keinen sicheren Massstab (Kopierer und Scanner vergrössern oft leicht). Darum zeigt das Werkzeug „Massstab kalibrieren“, bis du kalibriert hast.

## Toleranzen

| Toleranz | Standard (Papier) | Wirkung |
|---|---|---|
| Verbinden | 0.05 mm | Endpunkte gelten als gleich; Strecken auf derselben Geraden |
| Bogen | 0.02 mm (bei grossen Radien bis 0.03 % des Radius) | Abweichung einer Kurve vom Kreis |
| Kurven | 0.05 mm | Abweichung einer Polylinie von der Kurve |
| Scan: Fang | 2° | Linien werden genau waagrecht oder senkrecht |

## DXF

- **R2000 (AC1015):** vollständiger Aufbau mit Tabellen (Ansichtsfenster, Linientypen, Layer, Textstil, Bemassungsstil, Blöcke), Blöcken für Modell- und Papierbereich, Objekten (Layouts, Wörterbücher), eindeutigen Handles und Besitzer-Verweisen. Objekte: LINE, LWPOLYLINE, ARC, CIRCLE, TEXT, auf Wunsch SPLINE und HATCH. Einheit in `$INSUNITS`, metrisch (`$MEASUREMENT` 1).
- **R12 (AC1009):** einfacher Aufbau ohne Handles. Objekte: LINE, POLYLINE mit VERTEX, ARC, CIRCLE, TEXT. Nur AutoCAD-Farben, keine Strichstärken.
- Zeilenende CRLF, Kodierung Windows-1252 (`$DWGCODEPAGE` ANSI_1252).

## Grenzen

- Die DXF enthält Geometrie, keine Bedeutung: Wände, Türen und Bemassungen bleiben Linien, Bögen und Text.
- Bilder, Farbverläufe und Muster-Füllungen (Kachelmuster) kommen nicht in die DXF. Eine Schraffur, die in der PDF als Muster gespeichert ist, fehlt deshalb.
- Text erscheint im CAD in Arial. Laufweite und Länge weichen von der Schrift der PDF ab.
- Clipping mit Text oder Strichen als Maske und weiche Masken werden nicht angewendet (selten).
- Die Schraffur-Erkennung ist eine Schätzung.
- Scans liefern eine Unterlage mit der Genauigkeit des Scans. Text in Scans wird zu kurzen Linien.
- PDFs mit Passwort zum Öffnen kann das Werkzeug nicht lesen.
