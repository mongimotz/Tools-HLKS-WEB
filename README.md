# HLKS-Tools

**Online:** https://mongimotz.github.io/Tools-HLKS-WEB/

Rechenwerkzeuge für Heizung, Lüftung, Klima und Sanitär. Die Werkzeuge laufen im Browser. Es gibt keinen Server und keine Anmeldung. Die Daten bleiben auf deinem Gerät, nichts wird hochgeladen.

## Werkzeuge

| Fachrichtung | Werkzeug | Inhalt | Stand |
|---|---|---|---|
| Lüftung | Druckverlust Lüftung | Teilstrecken mit Formstücken und Einbauteilen, kritischer Strang, Drosselbedarf, Reserve des Ventilators | Testversion |
| Lüftung | Kanalrechner | Rohre und Kanäle (rund, eckig, flachoval) nach SIA 382/1, Tabellen 49 und 50: Abmessung oder Prüfung, Druckgefälle, Pins | Testversion |
| Lüftung | Schalldämpfer | Schallpegel je Oktave von der Quelle bis zum Empfänger, Schalldämpfer aus Herstellerdaten (Trox, Schako, Lindab), Ziel nach SIA 2024 / SIA 181 oder LSV, Varianten für ein vorgegebenes Gehäuse | Testversion |
| – | PDF → DXF | PDF-Pläne als massstäbliche DXF für CAD (Trimble Nova): Layer, Bögen, Text, Schraffuren, Kalibrierung, gescannte Pläne | Testversion |

Die Startseite zeigt die Werkzeuge nach Fachrichtung: Heizung, Lüftung, Klima und Sanitär. Jede Fachrichtung hat drei Abzweige. Heizung, Klima und Sanitär zeigen graue Einträge «Platzhalter 1» bis «Platzhalter 3». Zeigst du auf ein bereites Werkzeug, öffnet sich sein Ventil oder seine Klappe. Das Medium fliesst bis zum Endgerät. Unter einem Werkzeug steht der Name der letzten Berechnung, wenn dieser Browser einen Entwurf gespeichert hat.

Werkzeuge ohne Fachrichtung stehen als Kacheln unter den Netzen, zum Beispiel PDF → DXF.

## Speichern und öffnen

- **PDF** speichert einen Bericht. Die PDF enthält die Eingaben als Anhang `data.json`.
- **Öffnen** (Ordner-Symbol) liest eine PDF oder JSON aus HLKS-Tools. Du kannst die Datei auch auf die Seite ziehen. Auf der Startseite öffnet sich die Datei im passenden Werkzeug. Eine andere PDF, zum Beispiel ein Plan des Architekten, öffnet sich auf der Startseite in PDF → DXF.
- **PDF → DXF** speichert nur die DXF. Es gibt keinen Bericht, kein JSON und keine CSV. Die PDF bleibt auf deinem Gerät und wird nicht gespeichert; der Browser merkt sich nur die Einstellungen.
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

Wählst du für eine Teilstrecke einen anderen Vorgänger, rückt die Zeile unter diesen Vorgänger und seine Abzweige. Die Nummer änderst du selbst. Mit dem Griff (sechs Punkte) ziehst du eine Zeile an eine andere Stelle der Liste. Das ändert nur die Reihenfolge der Zeilen, nicht den Vorgänger. Esc bricht das Ziehen ab.

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
| Sechs Punkte | Zeile ziehen |
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

## Schalldämpfer

Das Werkzeug rechnet den Schallpegel je Oktave (63 bis 8000 Hz) von der Quelle bis zum Empfänger. Links steht die Pegelliste wie in einer Excel-Tabelle: eine Zeile pro Quelle, Dämpfung, Schalldämpfer und Abzweig. Rechts legst du den gewählten Schalldämpfer aus Herstellerdaten aus: Einfügungsdämpfung, Druckverlust und Strömungsgeräusch.

### Eingabe

1. **Weg:** Ein Weg geht von der Quelle bis zu einem Empfänger, zum Beispiel „Zuluft Büro“. Gib oben die Bezeichnung und den Volumenstrom V̇ am Anfang ein. Mehrere Wege stehen als Reiter nebeneinander. Jeder Reiter zeigt den L_pA am Empfänger, rot bei Überschreitung. Plus legt einen neuen Weg an, das Kopier-Symbol dupliziert ihn, der Papierkorb löscht ihn.
2. **Zeilen:** Die Knöpfe unter der Liste fügen eine Zeile am Ende an:
   - **Quelle** (+): Schallleistung L_W je Oktave, zum Beispiel Ventilator oder VAV. Der Pegel davor und L_W addieren sich energetisch.
   - **Dämpfung** (−): D je Oktave, zum Beispiel Bogen oder Mündungsreflexion.
   - **Schalldämpfer** (−): Einfügungsdämpfung D_e. Darunter steht das Strömungsgeräusch (+).
   - **Abzweig** (−): V̇ nach dem Abzweig. Die Schallleistung teilt sich im Verhältnis der Volumenströme: ΔL = 10·lg(V̇ davor / V̇ danach). Einen eigenen Wert tippst du ins Feld ΔL. Nach dem Abzweig rechnen die Schalldämpfer mit dem neuen V̇.
3. **Empfänger:** Er steht unter der Liste. Gib den Abstand r, den Richtfaktor Q und den Raum ein: Absorptionsfläche A oder Volumen V mit Nachhallzeit T. Ohne Raum gilt Freifeld (aussen). Das Ziel wählst du nach Raumtyp (innen: Raumnutzung nach SIA 2024, Anforderung nach SIA 181 oder empfohlene Auslegung), nach LSV (aussen: Empfindlichkeitsstufe, Tag und Nacht) oder als Wert.

### dB und dB(A)

Jede Zeile mit einem Pegel hat in der Spalte Einheit einen Knopf: **dB** oder **dB(A)**. Ein Klick wechselt die Einheit. Die Werte bleiben dabei gleich, nur ihre Bedeutung ändert sich.

- Eine Zeile in dB bekommt darunter eine Zeile A-Bewertung (−26.2 … −1.1 dB). So siehst du, dass das Werkzeug die Werte auf dB(A) umrechnet.
- Eine Zeile in dB(A) ist blau markiert und hat keine A-Bewertung.
- Dämpfungen, D_e und ΔL sind Differenzen. Sie gelten gleich für dB und dB(A) und haben keinen Knopf.
- Die Summe und der Empfänger stehen immer in dB(A). Die Spalte Σ zeigt für jede Zeile den A-bewerteten Summenpegel.

### Schalldämpfer auslegen

Ein Klick in eine Schalldämpfer-Zeile zeigt ihn rechts.

1. **Typ:** Wähle die Serie: rechteckige Kulissen (Trox XK und MK, Schako MWK-OB und MWK-MB), Rohrschalldämpfer (Trox CA und CK, Schako RS-N und RS-M, Lindab SLU) oder Hand.
2. **Kulisse:** Gib die Grösse des Gehäuses ein, B × H innen in mm, und den Einbau (Kanal, Ansaugung frei, Ausblasen frei).
   - Die Frontansicht zeigt das Gehäuse im richtigen Seitenverhältnis mit den Kulissen darin.
   - Wähle Kulissendicke d, Spalt s und Länge L. Es gibt nur Werte, die in den Herstellertabellen stehen.
   - Die Anzahl Kulissen n folgt aus B: n = B / (d + s), gerundet. Die Kulissen sitzen gleichmässig im Gehäuse, mit dem Spalt s′ = B / n − d. Weicht s′ von s ab, nennt ein Hinweis die Abweichung.
3. **Rohr:** Wähle den Durchmesser, die Dämmdicke, die Kernbreite (wo es sie gibt) und die Länge.
4. **Hand:** D_e und Strömungsgeräusch tippst du in der Liste ein, Δp rechts. So erfasst du Produkte ausserhalb der Datenbank.
5. **Varianten:** Die Liste unter den Werten zeigt die Varianten für dieses Gehäuse (Kulisse) oder diesen Durchmesser (Rohr):
   - Kulisse: eine Zeile pro Kulissendicke und Spalt, die ins Gehäuse passt (s′ höchstens 20 % von s entfernt).
   - Rohr: eine Zeile pro Dämmdicke und Kern.
   - Je Variante steht die kürzeste Länge, die das Ziel erfüllt. Erfüllt keine Länge das Ziel, steht die Länge mit dem tiefsten L_pA.
   - Zuerst stehen die Varianten, die alles einhalten (v ≤ 12 m/s, Δp ≤ 100 Pa, Strömungsgeräusch mindestens 10 dB unter dem Pegel, Ziel), sortiert nach Δp. Graue Varianten halten etwas nicht ein.
   - Ein Klick auf eine Zeile übernimmt die Variante.

### Bedienung

- **Ziehen:** Mit dem Griff (sechs Punkte) ziehst du eine Zeile an eine andere Stelle. Ein Schalldämpfer nimmt sein Strömungsgeräusch mit. Esc bricht ab.
- **Aus Excel einfügen:** Kopiere acht Oktavwerte einer Excel-Zeile. Füge sie in das erste Oktavfeld ein. Das Werkzeug verteilt sie auf die Oktaven.
- **Hinweise:** Sie nennen Grenzen, die eine Zeile nicht einhält, zum Beispiel ein zu lautes Strömungsgeräusch. Der Pfeil springt zur Zeile. Ein roter Strich links markiert eine Zeile mit Fehler, ein oranger Strich eine Warnung.

### Herstellerdaten

Jede Datei speichert eine Kopie der Tabellenzeilen, die sie verwendet. Eine alte Datei rechnet deshalb mit ihren Werten weiter, auch wenn sich die Daten ändern. Nach dem Öffnen nennt ein Hinweis die Schalldämpfer mit geänderten Daten. Das Symbol ↺ im Hinweis übernimmt die neuen Daten.

### Symbole und Tastatur

| Symbol, Taste | Bedeutung |
|---|---|
| Sechs Punkte | Zeile ziehen |
| dB, dB(A) | Einheit der Zeile wechseln |
| Papierkorb | Zeile löschen. Die Meldung danach hat ein Symbol für Rückgängig. |
| +, Kopie, Papierkorb bei den Reitern | Weg anlegen, duplizieren, löschen |
| ↺ im Hinweis nach dem Öffnen | Aktuelle Herstellerdaten übernehmen |
| Enter, Umschalt+Enter | Gleiche Oktave in der nächsten oder vorherigen Zeile |
| Strg+Z, Strg+Y, Strg+S, Strg+O | Rückgängig, Wiederholen, PDF speichern, Öffnen |

### Rechenweg

Formeln, Daten, Annahmen und Grenzen: [docs/silencer-method.md](docs/silencer-method.md).

## PDF → DXF

PDF → DXF macht aus einem PDF-Plan eine DXF für CAD, massstäblich in Millimetern. Das Ziel ist eine saubere Unterlage für Trimble Nova. Die Umwandlung läuft ganz im Browser; die PDF verlässt dein Gerät nicht. Links stehen die Einstellungen, in der Mitte die Vorschau, rechts die Layer.

### Bedienung

1. **Öffnen:** Ordner-Symbol, Strg+O oder die PDF auf die Seite ziehen. Auf der Startseite öffnet sich jede PDF ohne HLKS-Daten hier.
2. **Seite:** Bei mehreren Seiten wählst du die Seite mit den Miniaturen oder mit ‹ und › über der Vorschau.
3. **Massstab:** Den Planmassstab wählst du in der Liste (1:1 bis 1:1000) oder tippst ihn ein, auch krumme Werte wie 98.7. Stimmt der Massstab nicht sicher, kalibrierst du (siehe unten).
4. **Vorgabe:** „Nova-Unterlage“ passt für die meisten Pläne. Die anderen Vorgaben stehen unter „Einstellungen“.
5. **Layer:** Rechts schaltest du Layer, Farben und Strichstärken aus, die du nicht brauchst. Was ausgeschaltet ist, kommt nicht in die DXF.
6. **Speichern:** „↓ DXF“ oder Strg+S.

Die Vorschau zeigt, was in die DXF kommt. Schwarze und weisse Linien erscheinen in der Textfarbe der Seite, wie im CAD. Mausrad oder zwei Finger zoomen, Ziehen verschiebt.

**Kalibrieren:** Wähle das Lineal, klicke auf Anfang und Ende einer bekannten Strecke (zum Beispiel eine Masskette) und gib die wahre Länge in Millimetern ein. Die Klicks rasten auf dem nächsten Linienende ein. Das Werkzeug rechnet den Massstab aus und zeigt ihn über der Vorschau (zum Beispiel 1:98.7). Eine Kalibrierung gilt nur für diese PDF: Öffnest du eine andere, gilt wieder der nächste Normmassstab.

**Bereich:** Mit dem Zuschneide-Symbol ziehst du ein Rechteck auf. Nur was darin liegt, kommt in die DXF; Linien am Rand werden abgeschnitten. × hebt den Bereich auf. Der Bereich gilt für die Seite, auf der du ihn gezogen hast.

### Symbole und Tastatur

| Symbol, Taste | Bedeutung |
|---|---|
| Ordner, Strg+O | PDF öffnen |
| ↓ DXF, Strg+S | DXF speichern |
| ↶ ↷, Strg+Z, Strg+Y | Einstellungen rückgängig, wiederholen |
| Vier Ecken | Ganze Seite zeigen |
| Lineal | Kalibrieren: zwei Punkte, dann die Länge in mm. Enter übernimmt, Esc bricht ab |
| Zuschneide-Winkel | Bereich wählen |
| × über der Vorschau | Bereich aufheben |
| Bild | PDF-Bild unter der Vorschau ein- oder ausblenden |
| Rahmen mit Linie | Scan vektorisieren (nur bei gescannten Seiten) |
| ‹ › | Vorherige, nächste Seite |
| × in der Statuszeile | Laufende Umwandlung abbrechen |
| Esc | Kalibrieren oder Bereich wählen beenden |

### Einstellungen

**Seiten** (nur bei mehreren Seiten): „Aktuelle Seite“ speichert die gewählte Seite. „Jede Seite einzeln“ speichert eine DXF pro Seite (mehrere Downloads, der Browser fragt eventuell nach). „Alle nebeneinander“ legt alle Seiten mit 20 mm Abstand (auf dem Papier) nebeneinander in eine DXF.

**Ausgabe**

- **Einheit:** mm (Standard), cm oder m. Die DXF meldet die Einheit dem CAD.
- **Ursprung:** „Seitenecke“ legt den Nullpunkt in die linke untere Ecke der Seite. „Mitte“ legt ihn in die Mitte der Zeichnung.
- **DXF:** R2000 (Standard) oder R12 für alte Programme. R12 kennt keine Splines, keine Flächen, keine Echtfarben und keine Strichstärken; Polylinien sind dort POLYLINE statt LWPOLYLINE.
- **Echtfarben:** schreibt die genaue Farbe zusätzlich zur nächsten AutoCAD-Farbe (nur R2000). Schwarz und Weiss sind immer Farbe 7.

**Inhalt**

- **Vorgabe:**
  - *Nova-Unterlage:* R2000, Linien verbunden, Bögen erkannt, Text als Text, Schraffuren auf eigenem Layer, Füllungen als Umriss, Clipping an.
  - *Nur Geometrie:* wie Nova-Unterlage, aber ohne Text, ohne Schraffuren und ohne Füllungen.
  - *Maximale Kompatibilität:* R12, nur Linien und Polylinien: Bögen als Polylinie, Text als Umriss.
  - *Benutzerdefiniert:* erscheint, sobald du eine Einstellung änderst.
- **Layer ohne PDF-Ebenen:** Hat die PDF Ebenen, wird jede Ebene ein Layer mit ihrem Namen. Alles andere kommt nach Farbe und Strichstärke (`PDF_RGB_255-0-0_0.35`), nur nach Farbe (`PDF_RGB_255-0-0`), nur nach Strichstärke (`PDF_0.35`) oder auf einen Layer (`PDF`). Text liegt auf `PDF_TEXT`, Schraffuren auf `PDF_SCHRAFFUR`, Umrisse von Füllungen auf `…_FILL`, gescannte Linien auf `SCAN_…`.
- **Ausgeblendete PDF-Ebenen:** nimmt auch Ebenen mit, die in der PDF ausgeschaltet sind. In der Layerliste steht dann „ausgeblendet“.
- **Text:** „Text“ schreibt TEXT-Objekte (Höhe, Lage und Drehung wie in der PDF, Schrift Arial). „Umriss“ schreibt die Buchstaben als geschlossene Polylinien. „Aus“ lässt Text weg. Text ohne Zeichenzuordnung (siehe Hinweise) wird immer als Umriss geschrieben, ausser bei „Aus“.
- **Füllungen:** „Umriss“ schreibt den Rand gefüllter Flächen als Polylinie. „Fläche“ schreibt eine gefüllte Fläche (HATCH, nur R2000). „Aus“ lässt Füllungen weg. Weisse Füllungen fallen immer weg; sie decken in der PDF nur andere Linien ab.
- **Schraffuren:** Mindestens 8 parallele, gleich weit auseinander liegende kurze Linien gelten als Schraffur. „Eigener Layer“ legt sie auf `PDF_SCHRAFFUR`, „Entfernen“ lässt sie weg, „Lassen“ schaltet die Erkennung aus. Auch eine Treppe kann als Schraffur gelten; mit „Eigener Layer“ geht sie nicht verloren.
- **Kurven:** Kurven, die keine Kreisbögen sind, werden zur Polylinie oder (nur R2000) zum Spline.
- **Strichlierung:** „Linientyp“ schreibt strichlierte Linien als durchgehende Linie mit dem Linientyp DASHED oder DASHDOT. „Einzelstriche“ schreibt jeden Strich als eigene Linie.
- **Bögen erkennen:** Kreisbögen und Kreise aus der PDF werden ARC und CIRCLE.
- **Clipping anwenden:** schneidet ab, was die PDF ausserhalb eines Ausschnitts verdeckt (zum Beispiel ein Planausschnitt). Ohne Clipping kommt auch das Verdeckte mit.
- **Doppelte entfernen:** Doppelte und überlappende Linien kommen nur einmal in die DXF. Liegt eine Kontur auf dem Rand einer Füllung, bleibt die Kontur.
- **Linien verbinden:** Linien mit gemeinsamen Endpunkten werden zu Polylinien, wenn Layer, Farbe und Strichstärke gleich sind.
- **Mindestlänge:** Linien, die auf dem Papier kürzer sind, fallen weg (0 = aus).

**Toleranzen** (aufklappen, Werte auf dem Papier in mm): Verbinden (Endpunkte gelten als gleich, Standard 0.05), Bogen (Abweichung für Kreisbögen, 0.02), Kurven (Abweichung der Polylinie von der Kurve, 0.05).

**Scan** (nur bei eingeschaltetem Scan): Verfahren „Mittellinie“ (eine Linie pro Strich, Standard) oder „Umriss“ (Rand jedes Strichs als geschlossene Polylinie), Auflösung 200 bis 600 dpi (Standard 300), Fang 0° / 90° (Linien bis zu diesem Winkel werden genau waagrecht oder senkrecht, Standard 2°, 0 schaltet aus).

### Gescannte Pläne

Ist eine Seite nur ein Bild, steht in der Statuszeile „Seite ist ein Bild“, die Vorschau zeigt das Bild, und über der Vorschau erscheint das Scan-Symbol. Mit dem Symbol vektorisiert das Werkzeug das Bild: Es trennt Linien vom Hintergrund, entfernt Flecken, misst die Schräglage, macht aus jedem Strich eine Linie und dreht das Ergebnis gerade. Die Statuszeile zeigt die gefundene Schräglage. Weil die Linien gerade gedreht sind, liegen sie in der Vorschau leicht schräg zum Bild darunter.

Ein Scan hat keinen sicheren Massstab. Solange du nicht kalibriert hast, steht in der Statuszeile „Massstab kalibrieren“; ein Klick darauf startet die Kalibrierung. Ein Scan ist eine Unterlage zum Nachzeichnen, kein genauer Plan.

### Statuszeile und Hinweise

Die Statuszeile zeigt die Anzahl Objekte aus der PDF und die Anzahl, die in die DXF kommt, dazu die Zeit. Dauert die Umwandlung länger, erscheint ein Balken mit × zum Abbrechen.

| Hinweis | Bedeutung |
|---|---|
| Text ohne Zeichenzuordnung | Die PDF sagt bei diesem Text nicht, welche Buchstaben die Zeichen sind. Das Werkzeug schreibt ihn als Umriss. |
| Seite ist ein Bild | Die Seite enthält fast keine Linien, nur ein Bild: ein Scan. Scan-Symbol verwenden. |
| Bilder | Die Seite enthält Bilder (Logos, Fotos, Planausschnitte als Bild). Bilder kommen nicht in die DXF. |
| Verläufe | Farbverläufe der PDF kommen nicht in die DXF. |
| PDF teilweise beschädigt | MuPDF konnte die Seite nur teilweise lesen. Prüfe die DXF besonders. |
| Schräglage | Gefundene Schräglage eines Scans, die das Werkzeug ausgeglichen hat. |
| Massstab kalibrieren | Der Massstab eines Scans ist noch nicht kalibriert. |

Fehlermeldungen: „PDF nicht lesbar“ (beschädigte Datei), „PDF mit Passwort geschützt“ (Datei zuerst ohne Passwort speichern), „PDF ohne Seiten“, „Keine PDF“.

### Grenzen

- Die DXF enthält Linien, keine Bedeutung: Eine Wand ist zwei Linien, kein Wandobjekt. Bemassungen sind Linien und Text, keine Bemassungsobjekte.
- Text erscheint in Arial. Länge und Abstände können von der Schrift der PDF abweichen.
- Bilder, Verläufe und Muster-Füllungen der PDF fallen weg.
- Gescannte Pläne liefern eine Unterlage mit der Genauigkeit des Scans. Text in Scans wird zu kurzen Linien.
- Die Schraffur-Erkennung ist eine Schätzung. Prüfe den Layer `PDF_SCHRAFFUR`.

### Rechenweg und Test in Nova

Umrechnung, Bogenerkennung, Schraffur-Erkennung, Scan-Verfahren, Toleranzen und Grenzen: [docs/pdf-to-dxf-method.md](docs/pdf-to-dxf-method.md). Checkliste für den Test in Trimble Nova: [docs/pdf-to-dxf-nova-test.md](docs/pdf-to-dxf-nova-test.md).

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

Wie auf GitHub Pages unter einem Unterpfad (prüft, dass alle Pfade relativ sind):

```bash
node scripts/serve.mjs 8080 --base Tools-HLKS-WEB
```

Die Seite läuft dann unter http://localhost:8080/Tools-HLKS-WEB/.

Hilfen für PDF → DXF:

```bash
node scripts/pdf-to-dxf.mjs plan.pdf --out ausgabe
```

Wandelt eine PDF mit dem Code des Werkzeugs um und zeigt pro Seite eine Statistik. Optionen: `--preset nova|geometry|compat`, `--scale 100`, `--unit mm|cm|m`, `--version R2000|R12`, `--pages current|each|sideBySide`, `--page 1`, `--scan`, `--json`.

```bash
node scripts/make-pdf-to-dxf-fixtures.mjs
```

Schreibt die Test-PDFs mit ihren Solldaten in `tests/fixtures/pdf-to-dxf/` neu. Nur nötig, wenn sich die Test-PDFs ändern sollen.

```bash
python scripts/check-dxf.py ausgabe/plan.dxf
```

Prüft DXF-Dateien mit ezdxf (braucht `pip install ezdxf`), nicht Teil von `npm test`.

Eigene Pläne zum Testen legst du in `tests/fixtures/pdf-to-dxf/real/`. Der Ordner kommt nicht ins Repo; `npm test` wandelt jede PDF darin um und prüft die DXF.

Regeln für Mitwirkende und Agenten: [AGENTS.md](AGENTS.md). Gestaltung: [docs/DESIGN.md](docs/DESIGN.md) und [docs/dragon-ink.md](docs/dragon-ink.md).

### Veröffentlichen

Die Seite läuft unter https://mongimotz.github.io/Tools-HLKS-WEB/. GitHub Pages veröffentlicht den Zweig `main` (Ordner root) nach jedem Push, meist innerhalb von ein bis zwei Minuten. Die Datei `.nojekyll` ist vorhanden.

## Lizenz und Fremdcode

HLKS-Tools: Copyright (C) 2025–2026 Fabio. Lizenz: GNU AGPL v3 oder später, siehe [LICENSE](LICENSE).

Du darfst die Werkzeuge nutzen, ändern und weitergeben. Wer eine geänderte Version weitergibt oder online anbietet, muss den Quellcode unter derselben Lizenz offenlegen. Das Symbol `</>` unten auf jeder Seite führt zum Quellcode.

Fremdcode behält seine eigene Lizenz:

- pdf-lib (MIT): `lib/vendor/pdf-lib/`
- @pdf-lib/fontkit und pako (MIT): `lib/vendor/fontkit/`
- IBM Plex Sans und Mono (SIL Open Font License): `assets/fonts/`
- MuPDF.js 1.28.1 von Artifex Software (GNU AGPL v3 oder später): `lib/vendor/mupdf/`, unverändert aus dem npm-Paket `mupdf`. Quellcode von MuPDF: https://cgit.ghostscript.com/mupdf.git/ und https://mupdf.com
