# HLKS-Tools

**Online:** https://mongimotz.github.io/Tools-HLKS-WEB/

Rechenwerkzeuge für Heizung, Lüftung, Klima und Sanitär. Die Werkzeuge laufen im Browser. Es gibt keinen Server und keine Anmeldung. Die Daten bleiben auf deinem Gerät, nichts wird hochgeladen.

## Werkzeuge

| Werkzeug | Inhalt | Stand |
|---|---|---|
| Druckverlust Lüftung | Teilstrecken mit Formstücken und Einbauteilen, kritischer Strang, Drosselbedarf, Reserve des Ventilators | Testversion |
| Kanalrechner | Kanal- und Rohrdimensionen aus Volumenstrom und Geschwindigkeit | geplant |
| Schalldämpfer | Auslegung mit Schallpegel im Oktavband | geplant |
| Monoblock | Ventilatorleistung, Heiz- und Kühlleistung, Befeuchtung, Filter | geplant |
| Dämmung | Abschätzung der Dämmstärke für Leitungen und Kanäle | geplant |

Auf der Startseite zeigt eine Lüftungsleitung die Werkzeuge. Ein Werkzeug mit Luft im Abzweig ist bereit. Ein Werkzeug hinter einer geschlossenen Klappe ist geplant. Unter einem Werkzeug steht der Name der letzten Berechnung, wenn dieser Browser einen Entwurf gespeichert hat.

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

## Lizenzen

- pdf-lib (MIT): `lib/vendor/pdf-lib/`
- @pdf-lib/fontkit und pako (MIT): `lib/vendor/fontkit/`
- IBM Plex Sans und Mono (SIL Open Font License): `assets/fonts/`
