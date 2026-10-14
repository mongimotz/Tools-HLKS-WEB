# Schalldämpfer: Rechenweg

Berechnungsversion 2.1.0, Herstellerdaten Stand 2026-10-14. Jede gespeicherte Datei enthält die Berechnungsversion. Bei einer anderen Berechnungsversion zeigt das Werkzeug die alte und die neue Version. Die Eingabeversion ist 3. Ältere Eingabeversionen übernimmt das Werkzeug während der Testphase nicht.

## 1. Pegel und Oktaven

Das Werkzeug rechnet je Oktave von 63 bis 8000 Hz. Pegel addiert es energetisch:

```
L₁ ⊕ L₂ = 10 · lg(10^(L₁/10) + 10^(L₂/10))
```

Der A-bewertete Summenpegel folgt aus den Oktavpegeln und der A-Bewertung A_i:

```
L_A = 10 · lg Σ 10^((L_i + A_i)/10)
A_i = −26.2  −16.1  −8.6  −3.2  0  +1.2  +1.0  −1.1 dB     (63 … 8000 Hz)
```

Das Werkzeug rechnet die Pegel durchgehend in dB(A) je Oktave. Eine Zeile in dB rechnet es mit A_i um: L_A,i = L_i + A_i. Eine Zeile in dB(A) übernimmt es direkt. Dämpfungen sind Differenzen und gelten gleich für dB und dB(A). Das Ergebnis ist dasselbe wie im Excel-Blatt, das in dB summiert und erst am Schluss A-bewertet: Die A-Bewertung ist je Oktave eine Konstante, und eine Konstante ändert weder die energetische Summe noch eine Differenz.

Ein leeres Feld in einem Pegelspektrum heisst: kein Schall in dieser Oktave. Ein leeres Feld in einer Dämpfung heisst: 0 dB.

## 2. Wege und Zeilen

Eine Datei enthält einen oder mehrere Wege. Ein Weg führt von der Quelle zu einem Empfänger, zum Beispiel „Zuluft Büro“. Er ist eine einfache Liste von Zeilen, wie das Excel-Blatt. Der Pegel läuft von oben nach unten durch die Zeilen. Die Reihenfolge zählt: Ein Schalldämpfer dämpft nur, was vor ihm in der Liste steht.

| Zeile | Eingabe | Wirkung auf den Pegel L [dB(A) je Oktave] |
|---|---|---|
| Quelle | L_W je Oktave, in dB oder dB(A) | L ⊕ L_W,A |
| Dämpfung | D je Oktave | L − D |
| Schalldämpfer | Datenbank oder Eingabe | (L − D_e) ⊕ L_W,Str,A |
| Abzweig | V̇ nach dem Abzweig oder ΔL | L − ΔL |
| Empfänger (am Ende) | Abstand, Richtfaktor, Raum, Ziel | gibt L_p |

Eine Dämpfung deckt bekannte Werte ab, zum Beispiel einen Bogen, eine Brandschutzklappe oder eine Mündungsreflexion. Das Eigengeräusch eines Bauteils, zum Beispiel eines Volumenstromreglers, gibst du als Quelle ein.

Die Wege beeinflussen sich nicht. Das Werkzeug rechnet kein Übersprechen und keine Abstrahlung über das Gehäuse. Teile, die mehrere Wege gemeinsam haben (zum Beispiel Ventilator und Schalldämpfer in der Zentrale), stehen in jedem Weg. Das Kopier-Symbol dupliziert einen Weg, damit du sie nicht neu eingibst.

## 3. Volumenstrom und Abzweig

Der Weg hat am Anfang einen Volumenstrom V̇. Ein Abzweig setzt den Volumenstrom für alle Zeilen danach auf seinen Wert. Die Schallleistung teilt sich im Verhältnis der Volumenströme:

```
ΔL = 10 · lg(V̇_davor / V̇_danach)
```

Beispiel: 6000 m³/h auf 2000 m³/h gibt 4.8 dB weniger in jeder Oktave. Ein eingegebener Wert ΔL ersetzt den gerechneten Wert. VDI 2081 teilt nach dem Flächenverhältnis. Bei ähnlichen Geschwindigkeiten gibt das dasselbe Ergebnis.

Fehlt ein Volumenstrom vor oder nach dem Abzweig, teilt das Werkzeug nichts auf und zeigt eine Warnung. Das Ergebnis liegt dann auf der sicheren Seite. Ist der Volumenstrom nach dem Abzweig grösser als davor, zeigt das Werkzeug ebenfalls eine Warnung.

## 4. Schalldämpfer

Ein Schalldämpfer wirkt mit seiner Einfügungsdämpfung D_e und erzeugt ein Strömungsgeräusch L_W,Str:

```
L_nach = (L_vor − D_e) ⊕ L_W,Str
```

Das Werkzeug beurteilt einen Schalldämpfer deshalb nach dieser Netto-Wirkung, nie nach D_e allein. Enge Spalte geben mehr D_e, aber auch mehr Geschwindigkeit und mehr Strömungsgeräusch. Ab einem Punkt ist ein engerer Schalldämpfer schlechter.

### 4.1 Werte aus der Datenbank

Die Datenbank enthält die Tabellen von Trox, Schako und Lindab. [silencer-data.md](silencer-data.md) nennt die Quellen und den Datenstand. Die Prüfung vom 14.10.2026 verwendet die acht vom Eigentümer bereitgestellten Hersteller-PDFs. Die Datei «Trox CS.pdf» enthält den Typ CK. Der Eigentümer bestätigte CK als richtigen Typ.

Kulissendicke d und Länge L stammen aus den Tabellen. Spalt-Zwischengrössen interpoliert das Werkzeug linear innerhalb des belegten Bereichs, getrennt für jede Dicke und Länge. Es interpoliert weder Längen noch Spalte ausserhalb dieses Bereichs.

RIO und Schmidlin enthalten ausdrücklich geschätzte Werte. Abschnitt 4.7 beschreibt deren Grundlage.

- D_e stammt aus der Herstellertabelle (Messung nach EN ISO 7235). D_e gilt für den ganzen Schalldämpfer und hängt nicht von der Zahl der Kulissen ab.
- Trox und Lindab geben Werte über 50 dB als 50 dB an, Schako schreibt „>50“. Das Werkzeug rechnet mit 50 dB und nie mit mehr.
- Jede Datei speichert eine Kopie der verwendeten Tabellenzeile. Ändern sich die Herstellerdaten später, rechnet eine alte Datei weiter mit ihren Werten. Nach dem Öffnen zeigt ein Hinweis die Schalldämpfer mit geänderten Daten. Ein Klick übernimmt die neuen Daten.

### 4.2 Kulissenschalldämpfer

Du gibst das Gehäuse vor: Breite B und Höhe H innen. Das Werkzeug setzt so viele Kulissen der Dicke d hinein, wie mit dem Spalt s der Tabelle am besten passen, und verteilt sie gleichmässig:

```
n      = B / (d + s), gerundet, mindestens 1
s′     = B / n − d                tatsächlicher Spalt, an den Wänden je s′/2
A_frei = n · s′ · H = (B − n · d) · H
v_s    = V̇ / A_frei               Spaltgeschwindigkeit
```

Ist B = n · (d + s), gilt s′ = s. Sonst verwendet das Werkzeug den tatsächlichen Spalt s′ auch für D_e und Δp. Für die benachbarten Tabellenwerte s₀ und s₁ gilt:

```
t       = (s′ − s₀) / (s₁ − s₀)
D_e,i   = (1 − t) · D_e,i(s₀) + t · D_e,i(s₁)
ζ(v,s′) = (1 − t) · ζ(v,s₀)   + t · ζ(v,s₁)
```

Die Rechnung interpoliert D_e in dB. Sie interpoliert den Druckverlustbeiwert bei gleicher Geschwindigkeit. Ein Hinweis nennt den Unterschied zwischen eingegebenem und tatsächlichem Spalt. Liegt s′ ausserhalb des belegten Bereichs, erscheint ein Fehler. Dann setzt das Werkzeug D_e konservativ auf 0 dB und weist keinen Druckverlust aus. Solche Geometrien gelten nicht als passende Varianten.

Der Druckverlust folgt aus der Herstellertabelle Δp(v_s):

```
ζ_i = Δp_i / (ρ₀/2 · v_i²)        ρ₀ = 1.2 kg/m³ (Normluft der Tabellen)
ζ   = linear über v_s interpoliert, ausserhalb der Tabelle der Randwert
Δp  = ζ · ρ/2 · v_s² · f_Einbau   f_Einbau = 1.0 Kanal, 1.1 freie Ansaugung, 1.3 freies Ausblasen
```

Das Werkzeug berechnet Δp aus dem tatsächlichen freien Querschnitt, dem Volumenstrom und der Luftdichte. Die Tabellen liefern die Grundlage für ζ. Ein allgemeines Modell aus Kanalreibung sowie Ein- und Austrittsverlusten wäre möglich. Es bräuchte aber passende Beiwerte für das Kulissenprofil und den Rahmen. Ohne Messdaten wären diese Beiwerte zusätzliche Schätzungen. Deshalb bleibt der Herstelleransatz die Grundlage.

Die Δp-Werte von Trox gelten für H = 1000 mm. Diese Bezugshöhe beschränkt nicht die Einfügungsdämpfung D_e. Andere Höhen ändern den Anteil der Kanalwände am Druckverlust. Die PDFs nennen weder eine Höhenkorrektur noch eine numerische Fehlergrenze. Das Werkzeug übernimmt den Druckansatz unverändert und zeigt bei H ≠ 1000 mm einen Hinweis. Eine bestimmte Genauigkeit kann es dafür nicht angeben.

Physikalisch lässt sich die näherungsweise gleiche Dämpfung bei anderen Höhen mit einem idealisierten offenen Kulissenspalt erklären. Die beiden Absorberflächen haben zusammen die Fläche 2 · H · L. Der freie Querschnitt beträgt s · H. Ihr Verhältnis ist 2 · L / s und hängt nicht von H ab. Bei gleicher Dicke, Spaltbreite, Länge und gleichem Material bedeutet eine halbierte Höhe deshalb keine halbierte Dämpfung in dB. Das Flächenverhältnis erklärt den Zusammenhang, ersetzt aber keine akustische Messung. Schallmoden, Rahmen, Teilungen und der Einbau können reale Werte verändern.

Bei gleichem Volumenstrom erhöht eine kleinere Höhe die Spaltgeschwindigkeit. Dadurch steigen Druckverlust und Strömungsgeräusch. Das Werkzeug berücksichtigt die geänderte Geschwindigkeit. Der resultierende Schallpegel kann deshalb trotz näherungsweise gleicher Einfügungsdämpfung steigen. Die Höhenaussage im [Trox-XK-Datenblatt, Seite 5](https://cdn.trox.de/cdcbc4c11760a49d/1b734f264a69/XK_PD_2026_02_06_DE_de.pdf) betrifft die Druckdifferenzen. Die Erklärung über das Flächenverhältnis ist eine physikalische Näherung.

Schako nennt für diese Tabellen keine Bezugshöhe von 1000 mm. Unter H = 200 mm verwendet Schako einen anderen Kulissenrahmen. Das Werkzeug zeigt dafür einen Hinweis, weil die Druckwerte diesen Rahmen nicht gesondert belegen.

### 4.3 Rohrschalldämpfer

```
A_Rohr = π/4 · dn²
A_frei = π/4 · d₀² − T · d₀       d₀ = lichter Innendurchmesser (Schako), sonst dn; T = Kernbreite, ohne Kern 0
```

Annahme: Eine Kulisse oder Mittelkulisse reicht über den ganzen Durchmesser. Die Hersteller geben A_frei nicht an. Die Geschwindigkeit v in der Tabelle des Werkzeugs gilt im freien Querschnitt. Bei Trox CA und Lindab SLU ist das die Rohrgeschwindigkeit.

Der Druckverlust folgt je Serie aus einem von drei Modellen:

| Serie | Modell | Rechnung |
|---|---|---|
| Trox CA, Lindab SLU | gerades Rohr | Δp = λ · L_gesamt/dn · ρ/2 · v_Rohr², λ nach Colebrook-White, k = 0.15 mm, Luft 20 °C |
| Trox CK | Messpunkte (V̇, Δp) | ζ_i aus jedem Punkt mit v_Rohr, linear über V̇ interpoliert, ausserhalb der Randwert |
| Schako RS-N, RS-M | Tabelle Δp(v) | wie Kulissen, v im freien Querschnitt, kein Einbaufaktor |

Trox gibt für CA einen Druckverlust wie für ein gerades Rohr an. Lindab gibt für SLU keinen Druckverlust an. Das Werkzeug nimmt denselben Ansatz an.

Die Nennlänge kann von der Gesamtlänge abweichen. Die Gesamtlänge von Schako RS enthält die Standardstutzen KA0. Bei grossen Lindab SLU sind lose Anschlussstücke nicht in der Herstellerlänge enthalten. Optionale Flansche und weiteres Zubehör brauchen zusätzlichen Platz.

SLU 500 und 630 mit Dämmung 100 und Nennlänge 900 nennen widersprüchlich nur 600 mm Gesamtlänge. Ein Hinweis nennt den Widerspruch. Die Druckschätzung verwendet bei solchen Widersprüchen mindestens die Nennlänge.

### 4.4 Strömungsgeräusch

Für Trox verwendet das Werkzeug die vorhandene Summenpegel-Tabelle mit einem relativen Oktavspektrum nach Wildeboer:

```
L_WA,Str   = L_WA(v) + 10 · lg(A / 1 m²)       Trox-Tabelle, über lg v interpoliert
L_W,Str,i  = L_WA,Str + ΔL_i                    ΔL_i = +4 −2 −1 −2 −5 −8 −14 −18 dB
```

Die Trox-Tabelle reicht von 4 bis 20 m/s. Ausserhalb gilt die Ausgleichsgerade L_WA = −12.7 + 56 · lg v (Abweichung zur Tabelle höchstens 0.5 dB). Das relative Spektrum ΔL_i stammt von Wildeboer.

| Schalldämpfer | v | A | Grundlage |
|---|---|---|---|
| Trox XK, MK | v_s | B · H | Trox-Tabelle |
| Schako MWK | v_s | B · H | Schako-Diagramme, soweit die Geometrie belegt ist, sonst Trox als Schätzung |
| RIO, Schmidlin | v_s | B · H | Trox-Tabelle, Schätzung |
| Trox CK, Schako RS-M (mit Kern) | v im freien Querschnitt | A_Rohr | Trox-Tabelle, eigene Annahme |
| Trox CA, Schako RS-N, Lindab SLU (ohne Kern) | – | – | kein Strömungsgeräusch, eigene Annahme: der freie Querschnitt entspricht dem Rohr |

Die Schako-Diagramme enthalten fünf Geometrien bei 10 und 20 m/s. Die Oktavwerte sind auf 1 dB abgelesen und deshalb keine exakten Tabellenwerte. Das Werkzeug normiert jedes Spektrum auf den gedruckten A-bewerteten Summenpegel. Es interpoliert die Spalte linear und die Geschwindigkeit über lg(v). Die Flächenkorrektur K_F stammt aus der Schako-Tabelle und wird über lg(A) interpoliert. Diese Interpolationsregeln sind Modellannahmen.

Ausserhalb von 10–20 m/s verlängert das Werkzeug die Gerade über lg(v). Ausserhalb der belegten Flächen verwendet es 10 · lg(A). Diese Werte und die Ersatzwerte für nicht belegte Schako-Geometrien erscheinen als geschätzt. Bei anderen Fabrikaten bleiben Strömungsgeräusch und relatives Oktavspektrum ebenfalls Näherungen. Für Rohrschalldämpfer ohne Kern ist 0 dB Schallleistung nicht gemeint: Das Modell fügt keinen zusätzlichen Schall hinzu.

### 4.5 Eingegebene Werte

Für ein Produkt ausserhalb der Datenbank gibst du D_e und L_W,Str je Oktave ein, L_W,Str in dB oder dB(A), dazu Δp. Das Werkzeug rechnet dann wie mit Datenbankwerten.

### 4.6 Warnungen

Die Warnungen blockieren nichts.

| Warnung | Grenze |
|---|---|
| Geschwindigkeit | v > 20 m/s (Abrieb der Glasseide, Trox) |
| Druckverlust | Δp > 100 Pa je Schalldämpfer (Planungswert 80 bis 100 Pa) |
| Strömungsgeräusch | L_WA nach (L − D_e) weniger als 10 dB über L_WA,Str |
| Spalt bei Trox | s < 0.25 · d, s < 40 mm oder s > 2 · d |
| Höhe bei Trox | H ≠ 1000 mm (Δp gilt für 1000 mm) |
| Spalt im Gehäuse | s′ ≠ s: Hinweis; ausserhalb der Daten: Fehler und keine belegte Auslegung |
| Höhe bei Schako | H < 200 mm: anderer Kulissenrahmen, Δp nicht gesondert belegt |
| Gehäuse | B ≤ d (keine Kulisse passt) oder B, H fehlen: Fehler |
| Abzweig | Volumenstrom fehlt oder ist nach dem Abzweig grösser |
| Eingegebene Dämpfung | D_e > 50 dB in einer Oktave |
| Tabellenzeile | die Herstellerangabe ist auffällig, der Hinweis nennt den Grund |

### 4.7 Schätzwerte für RIO und Schmidlin

Die Schätzung verwendet ausschliesslich die offenen Absorptionskulissen Trox XK und Schako MWK-OB. MK, RK, MB, LL und LB gehen nicht ein. Es liegen keine Messungen für RIO oder Schmidlin vor. Deshalb erhalten beide Fabrikate bei gleicher Geometrie dieselben Schätzwerte.

- RIO: d = 100, 160 und 200 mm.
- Schmidlin: d = 100, 150, 200, 250 und 300 mm.
- Zwischen 100 und 200 mm interpoliert das Modell die Dicke linear. Für 250 mm verwendet es XK 230 und 300 mm.
- Es vergleicht gleiche Längen und innerhalb der jeweiligen Tabelle belegte Spalte. Stützt nur eine offene Referenz die Geometrie, verwendet es diese.
- Stützen beide Referenzen die Geometrie, nimmt es je Oktave die kleinere Dämpfung und bei gleicher Geschwindigkeit den grösseren Druckverlust.
- Es rundet D_e nach unten auf ganze dB und Δp nach oben auf 0.1 Pa. Es extrapoliert weder Dicke noch Spalt.

Diese Werte dienen einer vorläufigen Planung. Sie bestätigen weder reale Produktleistung noch Lieferbarkeit oder Fertigungsmasse. Die Kennzeichnung «geschätzt» bleibt in App, PDF, CSV und gespeicherten Daten erhalten.

## 5. Empfänger

```
L_pA,i = L_WA,i + 10 · lg(Q / (4π r²) + 4 / A)       L_WA,i: Pegel nach der letzten Zeile, dB(A) je Oktave
A      = 0.163 · V / T                 wenn V und T statt A gegeben sind
L_pA   = 10 · lg Σ 10^(L_pA,i/10)
```

r ist der Abstand in m, Q der Richtfaktor (1 Raummitte, 2 Wand oder Boden, 4 Kante, 8 Ecke), A die äquivalente Absorptionsfläche des Raums in m². Ohne A rechnet das Werkzeug nur mit dem Direktschall (Freifeld, zum Beispiel aussen).

## 6. Ziel

Jeder Empfänger hat eines von drei Zielen. Das Werkzeug vergleicht den Pegel mit einer Nachkommastelle mit dem Ziel. 28.0 dB(A) erfüllt also ein Ziel von 28 dB(A).

### 6.1 Raumtyp (innen)

Die Raumtypen sind die 45 Raumnutzungen von SIA 2024:2021, Anhang A, Tabelle 12 (1.01 Wohnen MFH bis 12.12 Serverraum). Die Tabelle gibt je Raumnutzung die Lärmempfindlichkeit nach SIA 181. Daraus folgt der Anforderungswert L_H für Dauergeräusche haustechnischer Anlagen nach SIA 181:2020. Nach SIA 382/1:2025 gilt er auch für lufttechnische Anlagen innerhalb einer Nutzungseinheit.

| Lärmempfindlichkeit | Mindestanforderung | Erhöhte Anforderung |
|---|---|---|
| keine | – | – |
| gering | 33 dB(A) | 29 dB(A) |
| mittel | 28 dB(A) | 25 dB(A) |
| hoch | 25 dB(A) | 25 dB(A) |

Für einige Raumnutzungen empfiehlt SIA 2024 einen tieferen Wert für die Auslegung: 25 dB(A) für Wohnen MFH und EFH, Hotelzimmer, Einzel- und Gruppenbüro sowie Bettenzimmer. Die Wahl „Auslegung“ gilt nur für diese Raumnutzungen.

Das Werkzeug vergleicht L_pA mit L_H. Eine Fussnote der Tabelle erscheint als Hinweis beim Empfänger, zum Beispiel für Wohnen: mechanische Lüftung von Wohngebäuden nach SIA 382/5, Ziffer 2.2.8. Die Werte 33 und 28 dB(A) stehen in Tabelle 12. Die erhöhten Anforderungen stammen aus SIA 181:2020. Jede Datei speichert die Liste der Raumtypen mit.

### 6.2 LSV (aussen)

Für Lärm von Heizungs-, Lüftungs- und Klimaanlagen gilt Anhang 6 der Lärmschutz-Verordnung (LSV). Das Werkzeug rechnet den Beurteilungspegel für den Tag (07 bis 19 Uhr) und die Nacht (19 bis 07 Uhr):

```
L_r = L_pA + K1 + K2 + K3 + 10 · lg(t / 12 h)
K1  = 5 dB am Tag, 10 dB in der Nacht
K2  = 0, 2, 4, 6 dB      Tongehalt: nicht, schwach, deutlich, stark hörbar
K3  = 0, 2, 4, 6 dB      Impulsgehalt: nicht, schwach, deutlich, stark hörbar
t   = Betriebsdauer in der Periode, leer = 12 h, 0 h = Periode nicht beurteilt
```

| Empfindlichkeitsstufe | Planungswert Tag / Nacht | Immissionsgrenzwert Tag / Nacht |
|---|---|---|
| ES I | 50 / 40 dB(A) | 55 / 45 dB(A) |
| ES II | 55 / 45 dB(A) | 60 / 50 dB(A) |
| ES III | 60 / 50 dB(A) | 65 / 55 dB(A) |
| ES IV | 65 / 55 dB(A) | 70 / 60 dB(A) |

Neue Anlagen halten den Planungswert ein (Art. 7), wesentlich geänderte Anlagen den Immissionsgrenzwert (Art. 8). Für Räume in Betrieben in ES I bis III gelten die Werte um 5 dB höher (Art. 42), nicht aber für Schulen, Anstalten und Heime. Massgebend ist der Pegel in der Mitte des offenen Fensters eines lärmempfindlichen Raums (Art. 39). Wird ein Gebäude nur am Tag oder nur in der Nacht genutzt, setze die Betriebsdauer der anderen Periode auf 0 h (Art. 41 Abs. 3).

Grenze: Das Werkzeug beurteilt jeden Empfänger in seinem Weg. Wirken zum Beispiel Aussenluft und Fortluft desselben Monoblocks auf dasselbe Fenster, addiere die Pegel selbst. Eine Summe über Wege folgt in einer späteren Version.

### 6.3 Wert

Ein eingegebener Wert gilt direkt für L_pA, zum Beispiel eine Vorgabe der Bauherrschaft.

## 7. Varianten

Für den gewählten Schalldämpfer zeigt das Werkzeug Varianten derselben Serie. Es setzt jede Variante an die Stelle des Schalldämpfers. Der Rest des Wegs bleibt, wie er ist. Die Länge L bleibt die gewählte Länge. Bei Rohrschalldämpfern nimmt das Werkzeug je Variante die Länge, die am nächsten bei der gewählten Länge liegt.

Neben B und H steht je eine Taste «Fix»:

- Fix: Die Varianten behalten diese Seite.
- Nicht fix: Das Feld heisst «B max.» oder «H max.». Das Werkzeug prüft diese Seite in Schritten von 50 mm, von 100 mm bis zum Höchstmass. Die Frontansicht zeigt das Mass des gewählten Schalldämpfers.

Eine Variante ist:

- Kulissen, B fix: eine Kulissendicke d mit einer Kulissenzahl n. Der tatsächliche Spalt s′ = B / n − d muss im belegten Bereich der Tabelle liegen. Das Werkzeug interpoliert Zwischenwerte.
- Kulissen, B nicht fix: eine Kulissendicke d. Das Werkzeug prüft jede Breite und jede Kulissenzahl mit belegtem Spalt s′.
- Rohrschalldämpfer: eine Dämmdicke mit einer Kernbreite beim gleichen Durchmesser.

Eine Variante erfüllt die Bedingungen, wenn:

- v ≤ 12 m/s (Planungswert)
- Δp ≤ 100 Pa
- L_WA nach (L − D_e) mindestens 10 dB über L_WA,Str liegt
- der Weg keinen Fehler hat
- der Empfänger sein Ziel einhält (wenn er ein Ziel hat)

Mit einer nicht fixen Seite nimmt das Werkzeug je Variante das kleinste Gehäuse B × H, das alle Bedingungen erfüllt. Gibt es keines, nimmt es das Gehäuse mit dem tiefsten L_pA, das die Grenzen für v, Δp und Strömungsgeräusch einhält. Liegen zwei L_pA weniger als 0.05 dB auseinander, gilt das kleinere Gehäuse. Eine kleinere Höhe dämpft nie besser, sie erhöht nur v, Δp und das Strömungsgeräusch. Die kleinste Lösung liegt deshalb oft nahe bei v = 12 m/s. Wer mehr Reserve will, fixiert die Seite.

Die Liste zeigt zuerst die Varianten, die die Grenzen einhalten, sortiert nach L_pA (beste Dämpfung zuerst), dann nach Δp. Danach folgen die übrigen. Graue Varianten erfüllen mindestens eine Bedingung nicht. Ein Klick übernimmt eine Variante. Das Werkzeug prüft nur die gewählte Serie. Die Gehäuseaussenmasse brauchen Platz für Wand und Anschlüsse zusätzlich zu B × H innen.

Mit mehreren Schalldämpfern auf einem Weg legst du einen nach dem anderen aus. Die übrigen bleiben, wie sie gewählt sind.

## 8. Nicht enthalten

- Dämpfung in Kanälen und Bögen, Mündungsreflexion, Eigengeräusch von Formstücken. Kennst du solche Werte, gib sie als Dämpfung oder als Quelle ein.
- Ventilatorgeräusch aus Formeln (VDI 2081). Gib die Schallleistung aus dem Datenblatt ein.
- Übersprechen zwischen Wegen und Abstrahlung über Gehäuse und Kanalwände.
- NR-Kurven und Zielwerte je Oktave.
- Interpolation in L. Andere Kulissendicken als die Herstellerwerte gibt es nur als gekennzeichnete RIO- und Schmidlin-Schätzwerte.
