# Kanalrechner: Rechenweg

Berechnungsversion 1.0.0. Jede gespeicherte Datei enthält die Berechnungsversion. Öffnest du eine Datei aus einer anderen Version und ergibt die Eingabe oder ein Pin eine andere Abmessung, zeigt das Werkzeug die alte und die neue Abmessung.

Grundlage ist SIA 382/1:2025, Ziffern 5.11.5.7 und 5.11.5.8 mit den Tabellen 49 und 50, sowie Anhang G für die Elektro-Volllaststunden.

## 1. Grenzgeschwindigkeit in runden Leitungen (Tabelle 49)

Tabelle 49 gibt die maximale Geschwindigkeit v_a,du,rd in runden Leitungen. Sie hängt vom Auslegungs-Volumenstrom und von den Elektro-Volllaststunden ab.

| V̇ in m³/h | bis 2'000 h/a | 4'000 h/a | 8'000 h/a |
|---|---|---|---|
| unter 40 | 2.5 m/s | 2.5 m/s | 2.5 m/s |
| 40 bis unter 1'000 | 3 m/s | 3 m/s | 3 m/s |
| 1'000 bis unter 2'000 | 4 m/s | 4 m/s | 3.5 m/s |
| 2'000 bis unter 4'000 | 5 m/s | 5 m/s | 4 m/s |
| 4'000 bis unter 10'000 | 6 m/s | 5.5 m/s | 4.5 m/s |
| ab 10'000 | 7 m/s | 6 m/s | 5 m/s |

- **Zeilen:** Die Stufe wechselt schon an der Grenze. 1'000 m³/h gehören zur Zeile 4 m/s. Die SIA-Tabelle schreibt „bis 1'000 m³/h“. Das Werkzeug folgt bewusst der Praxis der ersten Version und von „Druckverlust Lüftung“.
- **Spalten:** Zwischen den Spalten interpoliert das Werkzeug linear (Fussnote 1 der Tabelle). Unter 2'000 h/a gilt die Spalte 2'000 h/a, über 8'000 h/a die Spalte 8'000 h/a.
- Die Werte gelten für den kritischen Strang. In untergeordneten Strängen sind höhere Geschwindigkeiten zulässig, wenn der Schallschutz es erlaubt.

Beispiel aus der Norm: 5'800 m³/h und 2'740 h/a ergeben 6 − (6 − 5.5) · 740 / 2'000 = 5.8 m/s.

## 2. Nichtrunde Leitungen (Tabelle 50)

Eckige und flachovale Leitungen haben bei gleicher Fläche und Geschwindigkeit einen höheren Druckverlust als runde. Deshalb reduziert der Faktor f_va,du nach Tabelle 50 die Grenzgeschwindigkeit:

```
v_max = v_a,du,rd · f_va,du
```

| Seitenverhältnis | 1/1 | 1/2 | 1/3 | 1/4 | 1/5 | 1/6 | 1/7 | 1/8 | 1/9 | 1/10 |
|---|---|---|---|---|---|---|---|---|---|---|
| eckig | 0.941 | 0.914 | 0.876 | 0.842 | 0.813 | 0.788 | 0.766 | 0.746 | 0.729 | 0.714 |
| flachoval | – | 0.933 | 0.893 | 0.857 | 0.825 | 0.798 | 0.775 | 0.754 | 0.736 | 0.720 |

- Das Seitenverhältnis ist kurze Seite durch lange Seite (1/n). Das Werkzeug rechnet mit dem Verhältnis der fertigen, gerundeten Abmessung.
- Zwischen den Spalten interpoliert das Werkzeug linear. Ausserhalb der Tabelle gilt der Randwert, zum Beispiel f für 1/2 bei einem ovalen Kanal mit 1/1.5. Ein Hinweis zeigt das an.
- Schlanker als 1/5 empfiehlt die Norm nicht (grauer Bereich der Tabelle). Das Werkzeug zeigt dafür eine Warnung.

Beispiel aus der Norm, Seitenverhältnis 1/5: eckig 5.8 · 0.813 = 4.7 m/s, flachoval 5.8 · 0.825 = 4.8 m/s.

## 3. Einfacher Modus

- **Einfacher Modus aus:** Tabelle 49 mit den Elektro-Volllaststunden und Tabelle 50 für nichtrunde Leitungen.
- **Einfacher Modus ein:** nur Tabelle 49, Spalte 2'000 h/a, ohne Reduktionsfaktor, wie in der ersten Version.

## 4. Elektro-Volllaststunden

Du gibst die Elektro-Volllaststunden t_el ein. Unter „Betriebsstufen“ rechnet das Werkzeug sie aus den Stufen, der Knopf mit ↑ setzt das Ergebnis ins Feld. Die Elektro-Volllaststunden sind nicht die Betriebsstunden: Teillast zählt nur mit dem Anteil der elektrischen Leistung (SIA 382/1, 1.1.13.7).

```
t_el = Σ (V̇_i / V̇_max)^n · t_i
```

- V̇_i / V̇_max: Volumenstrom der Stufe in Prozent des Auslegungs-Volumenstroms
- t_i: Dauer der Stufe in h/a
- n = 2.5 ohne genauere Angaben (SIA 382/1, G.3.1.5, Formel 49)
- n = 1.5 bei Anlagen mit konstanten Druckverlustanteilen, zum Beispiel mit Volumenstromreglern (Formel 50)

Das Ergebnis wird auf 10 h gerundet. Ist die Summe der Stufen grösser als 8'760 h/a, erscheint eine Warnung. Stimmt t_el mit der Abschätzung überein, zeigt die PDF die Betriebsstufen.

Unterschiede zur ersten Version:

- Die erste Version rechnete mit n = 3 (ideales Ventilatorgesetz). Die Norm nimmt 2.5, weil der Wirkungsgrad bei Teillast sinkt.
- Die erste Version übernahm die nächsthöhere Spalte (2'000, 4'000 oder 8'000 h/a). Weil die Norm Zwischenwerte erlaubt, übernimmt das Werkzeug den gerechneten Wert.

Beispiel: 100 % während 2'500 h und 60 % während 3'500 h ergeben mit n = 2.5: 2'500 + 0.6^2.5 · 3'500 = 3'476 h, gerundet 3'480 h/a.

## 5. Querschnitte

```
rund:      A = π · d² / 4                 d_h = d
eckig:     A = B · H                      d_h = 2 · B · H / (B + H)
flachoval: A = π · H² / 4 + H · (B − H)   d_h = 4 · A / U,  U = π · H + 2 · (B − H)

v = V̇ / A
```

Ein flachovaler Kanal hat zwei Halbkreise mit dem Durchmesser H und gerade Seiten dazwischen. B ist die ganze Breite, deshalb gilt B ≥ H.

## 6. Vorgaben und Abmessungen

Die Vorgabe wählst du unter Querschnitt:

| Form | Vorgabe | Eingabe | Ergebnis |
|---|---|---|---|
| rund | Auslegen | V̇ | kleinster Ø der Normreihe mit v ≤ v_max |
| rund | Prüfen | V̇, Ø | v gegen v_max |
| eckig, oval | Verhältnis | V̇, 1/n | B und H |
| eckig, oval | Höhe | V̇, H | B |
| eckig, oval | Prüfen | V̇, B, H | v gegen v_max |

**Rund:** Erforderlich ist d = √(4 · V̇ / (π · v_max)). Das Werkzeug nimmt den nächsten Durchmesser der Normreihe. Über dem grössten Durchmesser rundet es auf 50 mm auf und warnt.

**Höhe:** Das Werkzeug sucht die Breite B, bei der v = v_max gilt. Weil v_max über f vom Seitenverhältnis abhängt, rechnet es iterativ. Dann rundet es B auf. Ist v dann noch zu hoch (das Runden ändert f), vergrössert es B um einen Schritt, bis v ≤ v_max gilt. Bei flachovalen Kanälen kann H so gross sein, dass schon der Kreis mit Durchmesser H reicht. Dann ist B = H und eine Warnung erscheint.

**Verhältnis:** Das Werkzeug rechnet zuerst die Höhe für das gewählte Verhältnis:

```
eckig:     H = √(A / n)
flachoval: H = √(A / (π/4 + n − 1))
mit A = V̇ / v_max(n)
```

Dann rundet es H ab und auf (eckig nach dem Raster, oval auf die Standardhöhen). Für beide Höhen sucht es die kleinste Breite wie bei der Vorgabe Höhe. Es nimmt die Variante, deren Seitenverhältnis näher am gewählten liegt. Schlanker als 1/5 wird der Kanal dabei nur, wenn auch das gewählte Verhältnis schlanker als 1/5 ist. Das gewählte Verhältnis ist deshalb ein Richtwert. Das tatsächliche steht beim Reduktionsfaktor f_va,du.

Die erste Version rundete Breite und Höhe unabhängig auf. Das ergab oft einen zu grossen Kanal (Beispiel der Norm, Raster 50 mm: 1'350 × 300 statt 1'100 × 300).

**Prüfen:** Ist v grösser als v_max, zeigt die Meldung die nötige Grösse: rund den nächsten Durchmesser der Normreihe, eckig und oval die Breite B bei gleicher Höhe.

**Raster:** Eckige Seiten und die Breite ovaler Kanäle werden auf 1, 5, 10, 25, 50 oder 100 mm aufgerundet, mindestens auf 100 mm. Die Höhe ovaler Kanäle kommt aus der Liste der Standardhöhen (Katalog). Über der grössten Standardhöhe gilt das Raster.

**Normreihe:** Die Durchmesser stammen aus der Firmenliste der ersten Version: 80, 100, 125, 160, 180, 200, 224, 250, 280, 300, 315, 355, 400, 450, 500, 560, 630, 710, 800, 900, 1'000, 1'120, 1'250, 1'400, 1'500, 1'600, 1'800 und 2'000 mm. Sie lassen sich im Katalog ändern. „Druckverlust Lüftung“ nimmt dagegen die ganze Reihe von Lindab (63 bis 1'600 mm). Das ist Absicht: Beim Auslegen soll das Werkzeug nur gängige Grössen vorschlagen. Zwischengrössen wie 112, 140, 150 oder 600 mm sind oft nur auf Bestellung erhältlich. Beim Druckverlust gibst du bestehende Rohre ein, dort braucht es alle Grössen.

**Ziehen in der Zeichnung:** Die Griffe ändern die Abmessung in den gleichen Schritten wie oben: Ø zum nächstgelegenen Durchmesser der Normreihe, eckige Seiten und die Breite ovaler Kanäle auf das Raster, die Höhe ovaler Kanäle zur nächstgelegenen Standardhöhe (B bleibt ≥ H). Eine gezogene Abmessung ist eine Vorgabe: Die Vorgabe wechselt auf „Prüfen“.

## 7. Druckgefälle

Das Druckgefälle R ist ein Richtwert für gerade Strecken ohne Formstücke:

```
R  = λ / d_h · ρ · v² / 2
Re = v · d_h / ν
1/√λ = −2 · log₁₀(k / (3.71 · d_h) + 2.51 / (Re · √λ))     (Colebrook-White, iterativ)
```

Unter Re = 2320 gilt λ = 64 / Re. Die Luft ist trocken, auf Meereshöhe (1'013 hPa), mit der Temperatur aus dem Katalog (Standard 20 °C). Die Rauigkeit k steht ebenfalls im Katalog (Standard 0.15 mm, verzinktes Blech). Dichte und Viskosität rechnet das Werkzeug wie „Druckverlust Lüftung“ (siehe [Rechenweg Druckverlust](duct-pressure-loss-method.md), Abschnitt 1). Die erste Version nahm die Näherung nach Haaland mit festen Stoffwerten. Der Unterschied liegt unter 1.5 %.

Für den Druckverlust eines ganzen Netzes mit Formstücken und Einbauteilen dient das Werkzeug „Druckverlust Lüftung“.

## Grenzen

- Die Grenzgeschwindigkeiten sind Richtwerte nach SIA 382/1. Schallschutz, Platz und Wirtschaftlichkeit können andere Werte verlangen.
- Das Werkzeug prüft jeden Kanal für sich. Es kennt kein Netz und keinen kritischen Strang.
- Für Luftbehandlungsgeräte gilt ein eigener Richtwert (SIA 382/1, 5.11.5.6: 1.5 m/s im Gerät). Das Werkzeug prüft ihn nicht.
