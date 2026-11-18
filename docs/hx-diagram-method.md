# h,x-Diagramm: Rechenweg

Das Werkzeug zeigt Zustände feuchter Luft und Prozesse der Luftaufbereitung im h,x-Diagramm nach Mollier und rechnet die Leistungen. Alle Werte gelten je kg trockene Luft.

## 1. Stoffwerte

Quelle: ASHRAE Handbook Fundamentals, Kapitel 1. Es gelten dieselben Gleichungen wie im h,x-Blatt in Typst.

| Grösse | Wert |
|---|---|
| Molmassenverhältnis ε = M_W / M_L | 0.621945 |
| Gaskonstante trockene Luft R_L | 287.042 J/(kg K) |
| c_L trockene Luft | 1.006 kJ/(kg K) |
| c_D Wasserdampf | 1.86 kJ/(kg K) |
| Verdampfungsenthalpie r₀ bei 0 °C | 2501 kJ/kg |
| c_W Wasser | 4.19 kJ/(kg K) |
| c_E Eis, Schmelzenthalpie | 2.05 kJ/(kg K), 333.4 kJ/kg |

**Luftdruck** aus der Höhe H (Normatmosphäre ICAO):

$$p = 101\,325 \cdot \left(1 - \frac{0.0065\,H}{288.15}\right)^{5.255877}\ \text{Pa}$$

**Sättigungsdampfdruck** p_s(t) nach Hyland und Wexler (1983), ab 0 °C über Wasser, unter 0 °C über Eis. Der Realgasfaktor f_E (WMO, Buck 1981) erhöht ihn leicht:

$$f_E = 1.0016 + 3.15\cdot10^{-6}\,p - \frac{0.074}{p}\quad (p\text{ in mbar})$$

**Zustandsgrössen** (x in kg/kg, im Werkzeug in g/kg):

$$x = \varepsilon\,\frac{p_D}{p - p_D},\qquad \varphi = \frac{p_D}{f_E\,p_s(t)}$$

$$h = c_L\,t + x\,(r_0 + c_D\,t)$$

$$\rho = \frac{p\,(1 + x)}{R_L\,T\,(1 + x/\varepsilon)}$$

- Taupunkt t_τ: Temperatur mit f_E p_s(t_τ) = p_D, unter 0 °C Reifpunkt.
- Feuchtkugeltemperatur t_f: Sättigungszustand, den die Luft adiabat mit Wasser von t_f erreicht: h(t, x) + (x_s(t_f) − x) h_W(t_f) = h_s(t_f). Unter 0 °C mit Eis.
- **Nebelgebiet:** Liegt x über der Sättigung x_s, ist der Rest Wasser (ab 0 °C) oder Eis: h = h(t, x_s) + (x − x_s) h_W(t). φ zeigt dann 100 %.

Ein Punkt ist durch zwei beliebige Grössen aus t, φ, x, h, t_τ und t_f bestimmt. Die Paare x + t_τ und h + t_f legen keinen Zustand fest. Fehlende Grössen löst das Werkzeug mit Bisektion.

Eine Grösse kann auch auf einen früheren Punkt verweisen: Die Eingabe `AU` übernimmt den Wert des Punkts AU, `AU+2` oder `AU-2` den Wert mit einem Versatz in der Einheit der Grösse. Ein Verweis auf einen späteren oder fehlenden Punkt gibt einen Fehler.

## 2. Diagramm

- Schiefwinklige Darstellung: Abszisse x, Ordinate h − r₀ x. Die 0-°C-Isotherme liegt waagrecht, die Isenthalpen fallen nach rechts.
- Bereich: Standard t von −20 bis 50 °C, x von 0 bis 20 g/kg. Jede Berechnung hat ihren eigenen Bereich (Felder t und x über dem Diagramm, Mausrad, Verschieben). Grenzen: t von −50 bis 80 °C, x bis 100 g/kg. Punkte ausserhalb erzeugen einen Hinweis.
- Das Diagramm füllt die Fläche (Bildschirm oder A4-Seite). Die Achsen sind deshalb nicht in einem festen Verhältnis.
- Linien: Isothermen, Isenthalpen mit Skala an der Sättigungslinie, relative Feuchte 5 bis 50 % (15, 25, 35 und 45 % gestrichelt) und 60 bis 100 % (bei kleinem Bereich auch 55 bis 95 %), Dichte (gestrichelt), Teildruck p_D oben in mbar. Der Abstand der Linien richtet sich nach dem Massstab, in Schritten von 1, 2 oder 5 × 10ⁿ: beim Standardbereich am Bildschirm Isothermen je 1 K (alle 5 K kräftig), Dichte je 0.05 kg/m³.
- Sättigungslinie, Feuchtelinien, Dichtelinien und die Teildruckskala hängen vom Luftdruck ab, also von der Höhe. Isothermen und Isenthalpen hängen nicht davon ab. Ein Test prüft für mehrere Höhen (0 bis 3000 m) und Bereiche, dass jeder gezeichnete Linienpunkt seinen Wert einhält (t, x, h, φ, ρ).

## 3. Massenstrom und Leistung

Der Volumenstrom V̇ gilt beim Zustand des Punkts, an dem er eingegeben ist (eigener Wert am Punkt oder V̇ der Berechnung). Massenstrom trockene Luft:

$$\dot m = \frac{\dot V\,\rho}{1 + x}$$

Ein Prozess gibt ṁ an seinen Austritt weiter. Leistung und Wasser:

$$Q = \dot m\,(h_2 - h_1),\qquad \dot m_W = \dot m\,(x_2 - x_1)$$

Q > 0 heisst Wärmezufuhr, Q < 0 Wärmeentzug. Wasser > 0 heisst Befeuchtung, Wasser < 0 Kondensat.

## 4. Prozesse

| Baustein | Modell | Vorgabe |
|---|---|---|
| Lufterhitzer | x bleibt gleich | Austrittstemperatur t oder Leistung Q |
| Ventilator | x bleibt gleich, Erwärmung Δt (Standard 1 K) | Δt |
| Lufterhitzer, wasserseitig | ṁ_W = \|Q\| / (c_W \|t_VL − t_RL\|) | optional t_VL, t_RL |
| Luftkühler | Gerade vom Eintritt zum Kühlerpunkt (siehe unten) | Austrittstemperatur t, Kälteleistung Q_K oder Bypassfaktor BF |
| Dampfbefeuchter | Dampf mit t_D: Δh = Δx (r₀ + c_D t_D), Standard t_D = 100 °C | x, φ oder Dampfmenge ṁ_D |
| Adiabatbefeuchter | Wasser mit der Feuchtkugeltemperatur des Eintritts: Δh = Δx h_W(t_f), also fast h = konstant | Befeuchtungsgrad η, x oder φ |
| WRG | Rückwärmzahl Φ_t, beim Rotor zusätzlich Rückfeuchtzahl Φ_x, Frostgrenze der Fortluft | Φ_t, Φ_x, t_FO,min (Standard 0 °C, leer = ohne) |
| Mischung | Massen- und Enthalpiebilanz, zwei oder mehr Eintritte | Anteile in % oder die Volumenströme der Eintritte |
| Raum | Sensible Last erwärmt, Feuchtelast befeuchtet die Zuluft | Q_s in kW, Feuchtelast ṁ_W in kg/h |
| Verbindung | Gerade zwischen zwei Punkten, kein Prozess | – |
| Behaglichkeit | Fläche im Diagramm, kein Prozess | Kategorie I, II, III oder t min/max, φ min/max, x max |

**Wasserseite.** Mit Vor- und Rücklauftemperatur rechnet das Werkzeug den Wassermassenstrom des Registers:

$$\dot m_W = \frac{|Q| \cdot 3600}{c_W\,|t_{VL} - t_{RL}|}\ \text{kg/h}$$

**Luftkühler.** Der Kühlerpunkt liegt auf der Sättigungslinie bei der mittleren Oberflächentemperatur t_O. Ohne eigene Eingabe gilt t_O = (t_VL + t_RL) / 2 + 1 K. Liegt t_O unter dem Taupunkt des Eintritts, verläuft die Zustandsänderung auf der Geraden vom Eintritt zum Kühlerpunkt (Entfeuchtung). Sonst kühlt der Kühler trocken bei gleichem x. Die Austrittstemperatur kann nicht unter t_O liegen. Ausgegeben werden Q, der sensible Anteil Q_s = ṁ (c_L + c_D x₂)(t₂ − t₁), das Kondensat und der Bypassfaktor:

$$BF = \frac{h_2 - h_O}{h_1 - h_O}$$

Der Austritt ist eine Mischung aus dem Anteil BF unbehandelter Luft und dem Anteil 1 − BF Luft im Kühlerpunkt. Mit der Vorgabe BF liegt der Austritt deshalb auf derselben Geraden. BF = 0 erreicht den Kühlerpunkt.

**Dampferzeuger.** Er erwärmt Speisewasser von 10 °C und verdampft es auf die Dampfenthalpie:

$$Q_{DE} = \dot m_D\,(r_0 + c_D\,t_D - c_W \cdot 10\ \text{K}) / 3600\ \text{kW}$$

Verluste des Geräts sind nicht enthalten.

**Adiabatbefeuchter.** Der Befeuchtungsgrad ist das Verhältnis zur Befeuchtung bis zur Sättigung auf derselben Zustandsänderung: η = Δx / Δx_s.

**WRG.** Aussenluft (Index 1) und Abluft (Index AB):

$$t_2 = t_1 + \Phi_t\,(t_{AB} - t_1),\qquad x_2 = x_1 + \Phi_x\,(x_{AB} - x_1)$$

Ohne Feuchteübertragung (Platte, KVS) gilt x₂ = x₁. Die Fortluft folgt aus der Energie- und Wasserbilanz mit dem Massenstromverhältnis r = ṁ_AU / ṁ_AB (ohne Massenströme r = 1):

$$h_{FO} = h_{AB} - r\,(h_2 - h_1),\qquad x_{FO} = x_{AB} - r\,(x_2 - x_1)$$

Liegt die Fortluft im Nebelgebiet, fällt Kondensat aus. Die Fortluft ist dann gesättigt bei derselben Enthalpie. Im Diagramm kühlt die Abluft zuerst bei gleichem x (Platte) bis zum Taupunkt ab und folgt dann der Sättigungslinie bis zur Fortluft. Beim Rotor verläuft der trockene Teil als Gerade zur Fortluft ohne Kondensation.

**Frostgrenze.** Mit t_FO,min bleibt die Fortluft mindestens auf dieser Temperatur. Liegt sie mit den eingegebenen Werten tiefer, überträgt die WRG nur den Teil der Energie, der bis zur Frostgrenze möglich ist: Φ_t und Φ_x sinken um denselben Faktor k (wie Bypass oder kleinere Rotordrehzahl), bis t_FO = t_FO,min gilt. Das Werkzeug zeigt die wirksamen Werte und einen Hinweis. Ohne Frostgrenze warnt es vor Vereisung, wenn die Fortluft unter 0 °C feucht ist.

**Mischung.**

$$h_M = \frac{\sum \dot m_i h_i}{\sum \dot m_i},\qquad x_M = \frac{\sum \dot m_i x_i}{\sum \dot m_i}$$

Mit Vorgabe `Anteil` gelten Massenanteile: Der erste und jeder weitere Eintritt haben einen Anteil in %, der zweite Eintritt erhält den Rest auf 100 %. Der Massenstrom am Austritt folgt dann aus dem V̇ der Berechnung beim Mischzustand.

**Raum.** Die Zuluft mit dem Massenstrom ṁ nimmt die sensible Last Q_s und die Feuchtelast ṁ_W auf:

$$x_2 = x_1 + \frac{\dot m_W \cdot 1000}{\dot m},\qquad t_2 = t_1 + \frac{Q_s \cdot 3600}{\dot m\,(c_L + c_D\,x_2)}$$

Ausgegeben werden die Gesamtlast Q = ṁ (h₂ − h₁), die latente Last Q_l = Q − Q_s und die Randmassstab-Grösse Δh/Δx. Ohne V̇ rechnet der Baustein nicht.

**Verbindung.** Zeigt Δh, Δx und die Randmassstab-Grösse Δh/Δx in kJ/kg zwischen zwei Punkten.

**Behaglichkeit.** Zeigt eine Fläche im Diagramm: Temperatur von t min bis t max, relative Feuchte von φ min bis φ max, auf Wunsch Wassergehalt bis x max. Die Kategorien setzen die Grenzen nach SIA 382/1:2025:

| Kategorie | t (Tabelle 6, IEQ) | φ (Tabelle 35, IDA (H2O)) |
|---|---|---|
| I | 21.1 bis 25.2 °C | 40 bis 50 % |
| II (Standard) | 19.8 bis 26.1 °C | 30 bis 60 % |
| III | 18.8 bis 26.8 °C | 20 bis 70 % |

- t min ist die untere Grenze für die Heizung (1.0 clo), t max die obere Grenze für die Kühlung (0.5 clo), bei 1.2 met und v < 0.1 m/s. φ min ist der Bemessungswert für Befeuchtung, φ max für Entfeuchtung. Ohne besondere Vereinbarung gilt Kategorie II (SIA 382/1, 2.2.6.2, mit SIA 2024 Tabelle 11).
- Die Felder in SIA 382/1, Anhang D, sind nach PMV/PPD berechnet und deshalb keine Rechtecke aus Isothermen und Feuchtelinien. Das Werkzeug vereinfacht sie zu einer Fläche zwischen t min, t max, φ min und φ max. Für die Planung gelten die Figuren 27 bis 38 der Norm.
- SIA 382/1 kennt keine feste Grenze für den Wassergehalt («Schwülegrenze», 2.2.6.8). x max ist deshalb leer und nur für eigene Vorgaben gedacht. Über 26 °C und 10 g/kg verlangt die Norm die Prüfung der thermischen Akzeptanz PTA nach Gleichung (17). Das Werkzeug macht diese Prüfung nicht.

## 4a. Rechenweg im PDF

Die Tabellenseite jeder Berechnung zeigt nach den Prozessen die Summen (Lufterhitzer, Luftkühler, WRG, Dampf, Dampferzeuger, verdunstetes Wasser, Kondensat) und für jeden Prozess die Formeln mit den eingesetzten Zahlen. Im PDF steht m für den Massenstrom trockener Luft ṁ.

## 5. Grenzen

- Der Kühler ist ein vereinfachtes Modell. Der Bypassfaktor beschreibt nur die Lage des Austritts auf der Geraden. Reifbildung und Wasserabscheidung im Kühler sind nicht abgebildet.
- Der Raum nimmt die Feuchtelast als Dampf bei Raumtemperatur auf. Strahlung, Schichtung und Luftführung sind nicht abgebildet.
- Dampf über 100 °C gilt als überhitzt. Wasser im Adiabatbefeuchter hat die Feuchtkugeltemperatur des Eintritts.
- Die WRG rechnet mit konstanten Rückwärmzahlen. Die Frostgrenze gilt für die Temperatur der Fortluft, unabhängig von ihrer Feuchte. Herstellerkurven und Abtauen sind nicht abgebildet.
- Zustände über 85 °C und Höhen über 4000 m sind nicht vorgesehen.
- Das Diagramm zeigt −20 bis 50 °C und 0 bis 20 g/kg. Die Rechnung gilt auch ausserhalb.
