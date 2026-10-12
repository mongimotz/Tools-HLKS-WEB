# Schalldämpfer: Rechenweg

Berechnungsversion 1.0.0, Herstellerdaten Stand 2026-10-12. Jede gespeicherte Datei enthält die Berechnungsversion. Öffnest du eine Datei aus einer anderen Version, zeigt das Werkzeug die alte und die neue Version. Weicht der Pegel am schlechtesten Empfänger ab, zeigt es auch den alten und den neuen Wert.

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

Ein leeres Feld in einem Pegelspektrum heisst: kein Schall in dieser Oktave. Ein leeres Feld in einer Dämpfung heisst: 0 dB.

## 2. Stränge und Elemente

Eine Datei enthält einen oder mehrere Stränge, zum Beispiel Aussenluft, Zuluft, Abluft und Fortluft eines Monoblocks. Die Stränge beeinflussen sich nicht. Das Werkzeug rechnet kein Übersprechen und keine Abstrahlung über das Gehäuse.

Ein Strang ist ein Baum aus Elementen. Jedes Element hat einen Vorgänger, das erste Element ist eine Quelle. Der Schall läuft von der Quelle zum Empfänger. Das Eigengeräusch eines Bauteils läuft nicht zurück in andere Abzweige.

| Element | Eingabe | Wirkung auf das Spektrum L |
|---|---|---|
| Quelle | L_W je Oktave | am Anfang: Startwert, später im Strang: L ⊕ L_W |
| Bauteil | D und L_W je Oktave, beide frei | (L − D) ⊕ L_W |
| Schalldämpfer | Datenbank oder Eingabe | (L − D_e) ⊕ L_W,Str |
| Empfänger | Abstand, Richtfaktor, Raum, Ziel | gibt L_p, ändert L nicht |

Ein Bauteil deckt bekannte Werte ab, zum Beispiel einen Volumenstromregler, eine Brandschutzklappe oder eine Mündungsreflexion.

## 3. Volumenstrom und Abzweig

Der Strang hat einen Auslegungs-Volumenstrom. Jedes Element übernimmt den Volumenstrom seines Vorgängers, ausser es hat einen eigenen Wert.

Ist der Volumenstrom eines Elements kleiner als der seines Vorgängers, teilt sich die Schallleistung im Verhältnis der Volumenströme:

```
ΔL = 10 · lg(V̇_Abzweig / V̇_davor)
```

Beispiel: 6000 m³/h auf 2000 m³/h gibt −4.8 dB in jeder Oktave. Ein eingegebener Wert ΔL ersetzt den gerechneten Wert. VDI 2081 teilt nach dem Flächenverhältnis. Bei ähnlichen Geschwindigkeiten gibt das dasselbe Ergebnis.

Hat ein Abzweig keinen eigenen Volumenstrom, teilt das Werkzeug nichts auf und zeigt einen Hinweis. Das Ergebnis liegt dann auf der sicheren Seite. Führen die Elemente nach einem Element zusammen mehr Luft als das Element selbst, zeigt das Werkzeug eine Warnung.

## 4. Schalldämpfer

Ein Schalldämpfer wirkt mit seiner Einfügungsdämpfung D_e und erzeugt ein Strömungsgeräusch L_W,Str:

```
L_nach = (L_vor − D_e) ⊕ L_W,Str
```

Das Werkzeug beurteilt einen Schalldämpfer deshalb nach dieser Netto-Wirkung, nie nach D_e allein. Enge Spalte geben mehr D_e, aber auch mehr Geschwindigkeit und mehr Strömungsgeräusch. Ab einem Punkt ist ein engerer Schalldämpfer schlechter.

### 4.1 Werte aus der Datenbank

Die Datenbank enthält die Tabellen von Trox, Schako und Lindab (Quellen und Datenstand in [silencer-data.md](silencer-data.md)). Wählbar sind nur Kombinationen, die in den Tabellen stehen. Das Werkzeug interpoliert nicht in der Länge L oder im Spalt s.

- D_e stammt aus der Herstellertabelle (Messung nach EN ISO 7235). D_e gilt für den ganzen Schalldämpfer und hängt nicht von der Zahl der Kulissen ab.
- Trox und Lindab geben Werte über 50 dB als 50 dB an, Schako schreibt „>50“. Das Werkzeug rechnet mit 50 dB und nie mit mehr.
- Jede Datei speichert eine Kopie der verwendeten Tabellenzeile. Ändern sich die Herstellerdaten später, rechnet eine alte Datei weiter mit ihren Werten. Nach dem Öffnen zeigt ein Hinweis die Schalldämpfer mit geänderten Daten. Ein Klick übernimmt die neuen Daten.

### 4.2 Kulissenschalldämpfer

Geometrie mit n Kulissen der Dicke d, Spalt s und Höhe H:

```
B      = n · (d + s)          Breite, mit zwei Randspalten s/2
A_frei = n · s · H            freier Querschnitt
v_s    = V̇ / A_frei           Spaltgeschwindigkeit
```

Der Druckverlust folgt aus der Herstellertabelle Δp(v_s):

```
ζ_i = Δp_i / (ρ₀/2 · v_i²)        ρ₀ = 1.2 kg/m³ (Normluft der Tabellen)
ζ   = linear über v_s interpoliert, ausserhalb der Tabelle der Randwert
Δp  = ζ · ρ/2 · v_s² · f_Einbau   f_Einbau = 1.0 Kanal, 1.1 freie Ansaugung, 1.3 freies Ausblasen
```

Die Δp-Werte von Trox gelten für H = 1000 mm. Bei kleinerer Höhe ist der Wandanteil grösser und Δp etwas höher. Das Werkzeug korrigiert das nicht und zeigt einen Hinweis.

Gibst du eine feste Breite B ein, die nicht n · (d + s) ist, rechnet das Werkzeug trotzdem mit B = n · (d + s) und zeigt eine Warnung. Die Korrektur für andere Randspalte folgt in einer späteren Version.

### 4.3 Rohrschalldämpfer

```
A_Rohr = π/4 · dn²
A_frei = π/4 · d₀² − T · d₀       d₀ = lichter Innendurchmesser (Schako), sonst dn; T = Kernbreite, ohne Kern 0
```

Annahme: Eine Kulisse oder Mittelkulisse reicht über den ganzen Durchmesser. Die Hersteller geben A_frei nicht an. Die Geschwindigkeit v in der Tabelle des Werkzeugs gilt im freien Querschnitt. Bei Trox CA und Lindab SLU ist das die Rohrgeschwindigkeit.

Der Druckverlust folgt je Serie aus einem von drei Modellen:

| Serie | Modell | Rechnung |
|---|---|---|
| Trox CA, Lindab SLU | gerades Rohr | Δp = λ · L/dn · ρ/2 · v_Rohr², λ nach Colebrook-White, k = 0.15 mm, Luft 20 °C |
| Trox CK | Messpunkte (V̇, Δp) | ζ_i aus jedem Punkt mit v_Rohr, Mittelwert der ζ_i |
| Schako RS-N, RS-M | Tabelle Δp(v) | wie Kulissen, v im freien Querschnitt, kein Einbaufaktor |

Trox gibt für CA einen Druckverlust wie für ein gerades Rohr an. Lindab gibt für SLU keinen Druckverlust an. Das Werkzeug nimmt denselben Ansatz an.

### 4.4 Strömungsgeräusch

Herstellerdaten gibt es nur für die Kulissen von Trox. Alle anderen Werte schätzt das Werkzeug mit derselben Tabelle ab.

```
L_WA,Str   = L_WA(v) + 10 · lg(A / 1 m²)       Trox-Tabelle, über lg v interpoliert
L_W,Str,i  = L_WA,Str + ΔL_i                    ΔL_i = +4 −2 −1 −2 −5 −8 −14 −18 dB
```

Die Trox-Tabelle reicht von 4 bis 20 m/s. Ausserhalb gilt die Ausgleichsgerade L_WA = −12.7 + 56 · lg v (Abweichung zur Tabelle höchstens 0.5 dB). Das relative Spektrum ΔL_i stammt von Wildeboer.

| Schalldämpfer | v | A | Grundlage |
|---|---|---|---|
| Trox XK, MK | v_s | B · H | Trox-Tabelle |
| Schako MWK | v_s | B · H | Trox-Tabelle, Schätzung (Schako gibt nur Diagramme) |
| Trox CK, Schako RS-M (mit Kern) | v im freien Querschnitt | A_Rohr | Trox-Tabelle, eigene Annahme |
| Trox CA, Schako RS-N, Lindab SLU (ohne Kern) | – | – | kein Strömungsgeräusch, eigene Annahme: der freie Querschnitt entspricht dem Rohr |

### 4.5 Eingegebene Werte

Für ein Produkt ausserhalb der Datenbank gibst du D_e, Δp und L_W,Str je Oktave ein. Das Werkzeug rechnet dann wie mit Datenbankwerten.

### 4.6 Warnungen

Die Warnungen blockieren nichts.

| Warnung | Grenze |
|---|---|
| Geschwindigkeit | v > 20 m/s (Abrieb der Glasseide, Trox) |
| Druckverlust | Δp > 100 Pa je Schalldämpfer (Planungswert 80 bis 100 Pa) |
| Strömungsgeräusch | L_WA nach (L − D_e) weniger als 10 dB über L_WA,Str |
| Spalt bei Trox | s < 0.25 · d, s < 40 mm oder s > 2 · d |
| Höhe bei Trox | H ≠ 1000 mm (Δp gilt für 1000 mm) |
| Breite | feste Breite B ≠ n · (d + s) |
| Eingegebene Dämpfung | D_e > 50 dB in einer Oktave |
| Tabellenzeile | die Herstellerangabe ist auffällig, der Hinweis nennt den Grund |

## 5. Empfänger

```
L_p,i = L_W,i + 10 · lg(Q / (4π r²) + 4 / A)
A     = 0.163 · V / T                 wenn V und T statt A gegeben sind
L_pA  = 10 · lg Σ 10^((L_p,i + A_i)/10)
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

Grenze: Das Werkzeug beurteilt jeden Empfänger in seinem Strang. Wirken zum Beispiel Aussenluft und Fortluft desselben Monoblocks auf dasselbe Fenster, addiere die Pegel selbst. Eine Summe über Stränge folgt in einer späteren Version.

### 6.3 Wert

Ein eingegebener Wert gilt direkt für L_pA, zum Beispiel eine Vorgabe der Bauherrschaft.

## 7. Vorschlag

Im Modus „Vorschlag“ sucht das Werkzeug für einen Schalldämpfer passende Produkte. Es setzt jede Tabellenzeile der gewählten Art (Kulisse oder Rohr) an die Stelle des Schalldämpfers. Der Rest des Strangs bleibt, wie er ist.

- Kulissen mit B max: n ist die grösste Zahl mit n · (d + s) ≤ B max. Damit sind v_s, Δp und Strömungsgeräusch dieser Zeile am kleinsten.
- Kulissen ohne B max: n ist die kleinste Zahl ab v_s ≤ v max, die alle Bedingungen erfüllt. Das ist der kleinste passende Schalldämpfer dieser Zeile.
- Rohrschalldämpfer: jede Zeile im Bereich Ø von … bis, mit Aussen-Ø max und L max.

Ein Kandidat passt, wenn er alle Bedingungen erfüllt:

- v ≤ v max (Standard 12 m/s, Planungswert)
- Δp ≤ Δp max (Standard 100 Pa)
- L_WA nach (L − D_e) liegt mindestens 10 dB über L_WA,Str
- jeder Empfänger nach dem Schalldämpfer hält sein Ziel ein

Die Liste zeigt die besten 10 Kandidaten, je Tabellenzeile einen, sortiert nach Δp und dann nach L. Passt keiner, zeigt sie den Kandidaten, der die Grenzen einhält und das Ziel am knappsten verfehlt.

Mit mehreren Schalldämpfern auf einem Weg sucht das Werkzeug für einen Schalldämpfer nach dem anderen. Die übrigen bleiben, wie sie gewählt sind.

## 8. Nicht enthalten

- Dämpfung in Kanälen und Bögen, Mündungsreflexion, Eigengeräusch von Formstücken. Kennst du solche Werte, gib sie als Bauteil ein.
- Ventilatorgeräusch aus Formeln (VDI 2081). Gib die Schallleistung aus dem Datenblatt ein.
- Übersprechen zwischen Strängen und Abstrahlung über Gehäuse und Kanalwände.
- NR-Kurven und Zielwerte je Oktave.
- Interpolation in L und s, Kulissendicken 150, 160 und 250 mm, Korrektur für andere Randspalte.
