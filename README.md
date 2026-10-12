# HLKS-Tools

**Online:** https://mongimotz.github.io/Tools-HLKS-WEB/

Rechenwerkzeuge für Heizung, Lüftung, Klima und Sanitär. Die Werkzeuge laufen im Browser. Es gibt keinen Server und keine Anmeldung. Die Daten bleiben auf deinem Gerät, nichts wird hochgeladen.

## Werkzeuge

| Fachrichtung | Werkzeug | Inhalt | Stand |
|---|---|---|---|
| Lüftung | Druckverlust Lüftung | Teilstrecken mit Formstücken und Einbauteilen, kritischer Strang, Drosselbedarf, Reserve des Ventilators | Testversion |
| Lüftung | Kanalrechner | Rohre und Kanäle (rund, eckig, flachoval) nach SIA 382/1, Tabellen 49 und 50: Abmessung oder Prüfung, Druckgefälle, Pins | Testversion |
| Lüftung | Schalldämpfer | Auslegung mit Schallpegel im Oktavband | geplant |
| Lüftung | Monoblock | Ventilatorleistung, Heiz- und Kühlleistung, Befeuchtung, Filter | geplant |
| Heizung | Heizlast | Heizlast eines Raums oder Gebäudes | geplant |
| Heizung | Rohrnetz Heizung | Rohrdimensionen und Druckverlust im Heiznetz | geplant |
| Heizung | Ausdehnungsgefäss | Auslegung von Ausdehnungsgefäss und Vordruck | geplant |
| Heizung | Dämmung | Abschätzung der Dämmstärke für Leitungen und Kanäle | geplant |
| Klima | Kühllast-Check | Grobe Prüfung der Kühllast eines Raums | geplant |
| Klima | h,x-Diagramm | Luftzustände und Zustandsänderungen | geplant |
| Klima | Kältemittel | Kältemittelmenge und Grenzwerte für den Raum | geplant |
| Sanitär | Trinkwasser | Leitungsdimensionen für Trinkwasser | geplant |
| Sanitär | Warmwasser | Speicher und Leistung für Warmwasser | geplant |
| Sanitär | Entwässerung | Leitungsdimensionen für Schmutzwasser | geplant |

Die Startseite zeigt die Werkzeuge nach Fachrichtung: Heizung, Lüftung, Klima und Sanitär. Jede Fachrichtung ist ein kleines Netz, jedes Werkzeug ein Abzweig. Ein geplantes Werkzeug ist grau. Zeigst du auf ein bereites Werkzeug, öffnet sich sein Ventil oder seine Klappe und das Medium fliesst bis zum Endgerät. Unter einem Werkzeug steht der Name der letzten Berechnung, wenn dieser Browser einen Entwurf gespeichert hat.

## Speichern und öffnen

- **PDF** speichert einen Bericht. Die PDF enthält die Eingaben als Anhang `data.json`.
- **Öffnen** (Ordner-Symbol) liest eine PDF oder JSON aus HLKS-Tools. Du kannst die Datei auch auf die Seite ziehen. Auf der Startseite öffnet sich die Datei im passenden Werkzeug.
- Bewahre die Original-PDF auf. Wenn ein anderes Programm die PDF neu druckt oder neu speichert, geht der Anhang oft verloren.
- Der Browser speichert die laufende Berechnung als Entwurf. Der Entwurf gilt nur für diesen Browser auf diesem Gerät.
- Das Menü ⋯ enthält: Neue Berechnung, Beispiel laden, JSON speichern (nur Daten), CSV speichern (Tabelle für Excel, Trennzeichen Semikolon).
- Das Werkzeug rechnet die Ergebnisse nach dem Öffnen neu. Stammt die Datei aus einer anderen Berechnungsversion, erscheint ein Hinweis mit beiden Versionen. Weicht das Ergebnis ab, zeigt der Hinweis auch den alten und den neuen Wert.

## Druckverlust Lüftung

### Eingabe

1. Trage die Anlage ein: Strömungsrichtung, Höhe, Lufttemperatur, Feuchte, verfügbarer Druck des Ventilators und Zuschlag.
2. Erfasse die Teilstrecken vom Ventilator weg. Jede Teilstrecke hat einen Vorgänger in Richtung Ventilator. „Venti“ heisst: Die Teilstrecke beginnt am Ventilator.
3. Für einen Abzweig drücke das Abzweig-Symbol in der Zeile. Die neue Teilstrecke hängt an dieser Zeile und bekommt deren Nummer plus .1, .2 … (Abzweig von 2: 2.1). Ein Abzweig ist in der Spalte Nr. eingerückt. Die Einrückung folgt der Nummer: 2.1 eine Stufe, 2.1.1 zwei Stufen.
4. Öffne mit dem Pfeil links die Details einer Teilstrecke: Formstücke, Einbauteile, eigene Temperatur, Bemerkung, Dimensionierung und Zwischenwerte.

Ein runder Kanal zeigt Ø vor dem Durchmesser. Ein Klick ins Feld öffnet die Durchmesser von Lindab (Wickelfalzrohr SR, 63 bis 1600 mm). ↑ und ↓ gehen zum nächsten Lindab-Mass. Ein anderes Mass tippst du direkt ein. Eckige Kanäle nehmen freie Masse.

Der **Zuschlag** ist ein Sicherheitszuschlag in Prozent auf den Druckverlust des kritischen Strangs. Er deckt Unsicherheiten ab: ζ-Werte als Richtwerte, Formstücke, die erst auf der Baustelle dazukommen, Undichtheiten und Verschmutzung. Üblich sind 10 bis 20 %. 0 % schaltet ihn aus.

Die Strömungsrichtung „Ventilator → Auslass“ gilt für Zuluft und Fortluft (Überdruck). „Einlass → Ventilator“ gilt für Abluft und Aussenluft (Unterdruck). Die Richtung bestimmt, wie das Werkzeug Querschnittsänderungen rechnet.

### Symbole

| Symbol | Bedeutung |
|---|---|
| ↶ ↷ | Rückgängig, Wiederholen |
| Ordner | Öffnen |
| ↓ PDF | PDF speichern |
| ⋯ | Weitere Aktionen |
| Halbkreis, Sonne, Mond | Farbschema: System, Hell, Dunkel |
| Abzweig | Neue Teilstrecke, die an dieser Zeile hängt |
| Papierkorb | Teilstrecke löschen. Die Meldung danach hat ein Symbol für Rückgängig. |
| ↺ | Katalog auf Standardwerte setzen |
| → in den Hinweisen | Springt zur Teilstrecke |
| ↑ hinter v | Geschwindigkeit über dem Grenzwert |
| Ø | Runder Kanal. Klick: Lindab-Durchmesser, Eingabe: eigenes Mass |
| Spalten (über der Tabelle) | Ergebnisspalten: Kompakt, Standard, Alle |
| TS | Teilstrecke |

### Tastatur

| Taste | Wirkung |
|---|---|
| Enter, Umschalt+Enter | Gleiche Spalte, eine Zeile tiefer oder höher |
| ↑, ↓ im Feld Ø | Nächster Lindab-Durchmesser |
| Strg+Z, Strg+Y | Rückgängig, Wiederholen |
| Strg+S | PDF speichern |
| Strg+O | Öffnen |

### Ergebnisse

- Oben steht der erforderliche Druck: der kritische Strang inklusive Zuschlag. Rechts davon die Reserve oder der Fehlbetrag.
- Der Balken teilt den erforderlichen Druck in Reibung, Formstücke, Einbauteile und Zuschlag auf. Die graue Spur dahinter ist der verfügbare Druck, ihr leerer Rest die Reserve. Reicht der Druck nicht, ist der Teil über dem verfügbaren Druck schraffiert.
- Der Druckverlauf zeigt den kritischen Strang. Die Reibung steigt linear über die Länge. Formstücke und Einbauteile erscheinen als Sprung am Ende der Teilstrecke.
- Das Strangschema zeigt das Netz. Die Linienstärke folgt dem Volumenstrom. Der kritische Strang ist farbig. An den übrigen Enden steht der Drosselbedarf. Ein Klick auf eine Teilstrecke öffnet ihre Zeile.
- Ein farbiger Strich links in der Tabelle markiert den kritischen Strang. Seine Werte Δp kum. sind farbig hinterlegt. Ein roter Strich markiert eine Teilstrecke mit Fehler.
- Das Menü Spalten über der Tabelle wählt die Ergebnisse: Kompakt (v, Δp TS, Δp kum., Drossel), Standard (dazu d_h, R, Δp R·L, Δp Z) oder Alle (dazu p_d, Re, λ). Der Browser merkt sich die Wahl.
- Die Spalten haben eine feste Breite. Ein Wert, der nicht Platz hat, endet mit „…“. Meist steckt dahinter ein Eingabefehler, zum Beispiel ein zu kleiner Durchmesser.

### Kataloge

Die Kataloge enthalten Materialien, Formstücke, Vorlagen für Einbauteile, Grenzgeschwindigkeiten und das maximale Seitenverhältnis. Jede Datei speichert ihre Kataloge mit. Eine Änderung gilt deshalb nur für diese Berechnung.

Alle Werte sind Richtwerte. Massgebend sind die Herstellerangaben.

### Rechenweg

Formeln, Ansätze und Grenzen der Berechnung: [docs/duct-pressure-loss-method.md](docs/duct-pressure-loss-method.md).

## Kanalrechner

Der Kanalrechner bestimmt die Abmessung eines Lüftungsrohrs oder -kanals nach SIA 382/1:2025, Tabellen 49 und 50, oder prüft eine gegebene Abmessung. Links steht die Eingabe, in der Mitte Zeichnung und Resultat, rechts die gepinnten Resultate.

### Eingabe

1. **Luftmenge:** Bezeichnung (frei, erscheint im Pin und in der PDF) und Auslegungs-Volumenstrom. Den Volumenstrom änderst du schnell mit dem Schieber darunter (10 bis 100'000 m³/h, logarithmisch, runde Werte) oder mit ↑ und ↓ im Feld (zwei gültige Ziffern, mit Umschalt eine: 5'800 → 5'900, mit Umschalt 7'000).
2. **Betrieb:** Der einfache Modus nimmt nur Tabelle 49, Spalte 2'000 h/a, ohne Reduktionsfaktor. Ohne einfachen Modus gibst du die Elektro-Volllaststunden ein. Ein Klick ins Feld zeigt 2'000, 4'000 und 8'000 h/a, Zwischenwerte tippst du direkt ein.
3. **Betriebsstufen** (aufklappen): Je Stufe Volumenstrom V̇ in % des Auslegungs-Volumenstroms und Dauer t in h/a. n ist der Exponent: 2.5 als Standard, 1.5 bei Anlagen mit Volumenstromreglern. Der Knopf mit ↑ zeigt das Ergebnis und setzt es ins Feld Volllaststunden.
4. **Querschnitt:** Form (Rund, Eckig, Oval) und Vorgabe:
   - Rund: **Auslegen** wählt den Durchmesser, **Prüfen** prüft einen gegebenen Durchmesser Ø.
   - Eckig, oval: **Verhältnis** rechnet Breite B und Höhe H zum gewählten Seitenverhältnis, **Höhe** rechnet B zu einer gegebenen Höhe H (zum Beispiel wegen der Deckenhöhe), **Prüfen** prüft gegebene B und H.
   - **Raster** rundet die Seiten eckiger Kanäle und die Breite ovaler Kanäle auf (1 bis 100 mm). Bei „Prüfen“ gibt das Raster die Schritte beim Ziehen und mit ↑ und ↓ vor.

Ein Klick ins Feld Ø zeigt die Normreihe, ↑ und ↓ gehen zum nächsten Durchmesser. Bei ovalen Kanälen gilt das Gleiche für H. In den Feldern B und H gehen ↑ und ↓ einen Rasterschritt weiter. Wechselst du zu einer Vorgabe mit leerem Feld, übernimmt das Feld die bisher gerechnete Abmessung. Wechselst du die Form und fehlen für die neue Form die Masse, rechnet das Werkzeug sie aus (Auslegen oder Verhältnis).

**Grösse in der Zeichnung ziehen:** Die Kreise am Querschnitt sind Griffe. Rund: Griff unten rechts am Rand ändert Ø entlang der Normreihe. Eckig und oval: Griff rechts ändert B, Griff unten ändert H, der Griff schräg neben der Ecke unten rechts beide. Die Masse stehen oben (B) und links (H), damit sie den Griffen nicht im Weg sind. B und eckige H springen im Raster, ovale H über die Standardhöhen. Die Vorgabe wechselt dabei auf „Prüfen“, v und die Ausnutzung laufen mit. Die Kante bleibt unter dem Zeiger. Mit der Tastatur: Griff mit Tab wählen, Pfeiltasten gehen einen Schritt.

### Resultat

- Die Zeichnung zeigt den Querschnitt mit Massen in mm. Sie ist nicht massstäblich: Die gezeichnete Grösse wächst mit der Quadratwurzel der Kanalgrösse. Ø 80 bleibt erkennbar, 2'000 mm füllen die Zeichenfläche, das Seitenverhältnis stimmt immer.
- Meldungen stehen über dem Resultat: Grenzwert überschritten (mit der nötigen Grösse), Seitenverhältnis schlanker als 1/5, Normreihe überschritten und Ähnliches.
- **Abmessung:** die Normgrösse.
- **v:** Geschwindigkeit mit Ausnutzung v / v_max. Haken: bis 92 %. Warnzeichen: über 92 %. Fehlerzeichen und rote Zahl: über dem Grenzwert.
- **v_max:** Grenzgeschwindigkeit nach Tabelle 49, bei eckigen und ovalen Kanälen mal f.
- **f_va,du:** Reduktionsfaktor nach Tabelle 50 mit dem tatsächlichen Seitenverhältnis (nur eckig und oval, nicht im einfachen Modus).
- **R:** Druckgefälle einer geraden Strecke in Pa/m.
- **erforderlich:** Abmessung vor dem Runden.

### Pins

- Die Stecknadel neben der Abmessung pinnt das Resultat. Die Pins stehen rechts, nummeriert. Der Pin mit Strich links entspricht der aktuellen Eingabe.
- Ein Klick auf einen Pin lädt ihn in die Eingabe. × entfernt einen Pin, der Papierkorb alle. Die Meldung danach hat ein Symbol für Rückgängig.
- Die Pins sind Teil der Datei. Die PDF und die CSV enthalten alle Pins, dazu die aktuelle Eingabe, wenn sie nicht gepinnt ist.

### Kataloge

Der Reiter Kataloge enthält Tabelle 49, Tabelle 50, die Normreihe der runden Rohre, die Standardhöhen der flachovalen Kanäle sowie Rauigkeit und Lufttemperatur für das Druckgefälle R. Die Listen trennst du mit Leerzeichen. ↺ setzt einen Katalog auf die Standardwerte. Jede Datei speichert ihre Kataloge mit.

### Symbole und Tastatur

| Symbol, Taste | Bedeutung |
|---|---|
| Kreis am Querschnitt | Griff: ziehen ändert die Grösse |
| Stecknadel | Resultat pinnen |
| ×, Papierkorb | Pin entfernen, alle Pins entfernen |
| + bei den Betriebsstufen | Stufe hinzufügen |
| ↑ bei den Betriebsstufen | Ergebnis als Volllaststunden übernehmen |
| ↺ | Katalog auf Standardwerte setzen |
| ↑ hinter v im Pin | Geschwindigkeit über dem Grenzwert |
| Strg+Z, Strg+Y, Strg+S, Strg+O | Rückgängig, Wiederholen, PDF speichern, Öffnen |

### Rechenweg

Formeln, Ansätze, Rundung und Grenzen: [docs/duct-sizing-method.md](docs/duct-sizing-method.md).

## Entwicklung

Das Projekt braucht keinen Build-Schritt. Node 20 oder neuer genügt, es gibt keine Abhängigkeiten zum Installieren.

```bash
npm run serve
```

Danach läuft die Seite unter http://localhost:8080/.

```bash
npm test
```

Die Tests prüfen die Berechnung, das Dateiformat, die PDF (speichern, öffnen, wieder speichern) und die Referenz-PDFs in `tests/fixtures/`.

Regeln für Mitwirkende und Agenten: [AGENTS.md](AGENTS.md). Gestaltung: [docs/DESIGN.md](docs/DESIGN.md) und [docs/dragon-ink.md](docs/dragon-ink.md).

### Veröffentlichen

Die Seite läuft unter https://mongimotz.github.io/Tools-HLKS-WEB/. GitHub Pages veröffentlicht den Zweig `main` (Ordner root) nach jedem Push, meist innerhalb von ein bis zwei Minuten. Die Datei `.nojekyll` ist vorhanden. Für eine eigene Domain kommt später eine Datei `CNAME` dazu.

## Lizenz und Fremdcode

HLKS-Tools: Copyright (C) 2025–2026 Fabio. Lizenz: GNU AGPL v3 oder später, siehe [LICENSE](LICENSE).

Du darfst die Werkzeuge nutzen, ändern und weitergeben. Wer eine geänderte Version weitergibt oder online anbietet, muss den Quellcode unter derselben Lizenz offenlegen. Das Symbol `</>` unten auf jeder Seite führt zum Quellcode.

Fremdcode behält seine eigene Lizenz:

- pdf-lib (MIT): `lib/vendor/pdf-lib/`
- @pdf-lib/fontkit und pako (MIT): `lib/vendor/fontkit/`
- IBM Plex Sans und Mono (SIL Open Font License): `assets/fonts/`
