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
| Luftkühler | Gerade vom Eintritt zum Kühlerpunkt (siehe unten) | Austrittstemperatur t oder Kälteleistung Q_K |
| Dampfbefeuchter | Dampf mit t_D: Δh = Δx (r₀ + c_D t_D), Standard t_D = 100 °C | x, φ oder Dampfmenge ṁ_D |
| Adiabatbefeuchter | Wasser mit der Feuchtkugeltemperatur des Eintritts: Δh = Δx h_W(t_f), also fast h = konstant | Befeuchtungsgrad η, x oder φ |
| WRG | Rückwärmzahl Φ_t, beim Rotor zusätzlich Rückfeuchtzahl Φ_x | Φ_t, Φ_x |
| Mischung | Massen- und Enthalpiebilanz | Anteil des ersten Eintritts in % oder die Volumenströme beider Eintritte |
| Verbindung | Gerade zwischen zwei Punkten, kein Prozess | – |

**Luftkühler.** Der Kühlerpunkt liegt auf der Sättigungslinie bei der mittleren Oberflächentemperatur t_O. Liegt t_O unter dem Taupunkt des Eintritts, verläuft die Zustandsänderung auf der Geraden vom Eintritt zum Kühlerpunkt (Entfeuchtung). Sonst kühlt der Kühler trocken bei gleichem x. Die Austrittstemperatur kann nicht unter t_O liegen. Ausgegeben werden Q, der sensible Anteil Q_s = ṁ (c_L + c_D x₂)(t₂ − t₁) und das Kondensat.

**Adiabatbefeuchter.** Der Befeuchtungsgrad ist das Verhältnis zur Befeuchtung bis zur Sättigung auf derselben Zustandsänderung: η = Δx / Δx_s.

**WRG.** Aussenluft (Index 1) und Abluft (Index AB):

$$t_2 = t_1 + \Phi_t\,(t_{AB} - t_1),\qquad x_2 = x_1 + \Phi_x\,(x_{AB} - x_1)$$

Ohne Feuchteübertragung (Platte, KVS) gilt x₂ = x₁. Die Fortluft folgt aus der Energie- und Wasserbilanz mit dem Massenstromverhältnis r = ṁ_AU / ṁ_AB (ohne Massenströme r = 1):

$$h_{FO} = h_{AB} - r\,(h_2 - h_1),\qquad x_{FO} = x_{AB} - r\,(x_2 - x_1)$$

Liegt die Fortluft im Nebelgebiet, fällt Kondensat aus. Die Fortluft ist dann gesättigt bei derselben Enthalpie. Liegt sie unter 0 °C, warnt das Werkzeug vor Vereisung.

**Mischung.**

$$h_M = \frac{\dot m_1 h_1 + \dot m_2 h_2}{\dot m_1 + \dot m_2},\qquad x_M = \frac{\dot m_1 x_1 + \dot m_2 x_2}{\dot m_1 + \dot m_2}$$

Mit Vorgabe `Anteil` gilt der Massenanteil des ersten Eintritts. Der Massenstrom am Austritt folgt dann aus dem V̇ der Berechnung beim Mischzustand.

**Verbindung.** Zeigt Δh, Δx und die Randmassstab-Grösse Δh/Δx in kJ/kg, z. B. für eine Raumzustandsänderung.

## 5. Grenzen

- Der Kühler ist ein vereinfachtes Modell. Bypassfaktor, Reifbildung und Wasserabscheidung im Kühler sind nicht abgebildet.
- Dampf über 100 °C gilt als überhitzt. Wasser im Adiabatbefeuchter hat die Feuchtkugeltemperatur des Eintritts.
- Die WRG rechnet mit konstanten Rückwärmzahlen. Vereisungsgrenzen der Hersteller und Abtauen sind nicht abgebildet.
- Zustände über 85 °C und Höhen über 4000 m sind nicht vorgesehen.
- Das Diagramm zeigt −20 bis 50 °C und 0 bis 20 g/kg. Die Rechnung gilt auch ausserhalb.
