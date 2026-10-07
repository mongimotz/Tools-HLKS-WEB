# Druckverlust Lüftung: Rechenweg

Berechnungsversion 1.1.0. Jede gespeicherte Datei enthält die Berechnungsversion. Öffnest du eine Datei aus einer anderen Version, zeigt das Werkzeug die alte und die neue Version. Weicht der Druckverlust im kritischen Strang ab, zeigt es auch den alten und den neuen Wert.

## 1. Luftzustand

Der Luftdruck folgt aus der Höhe über Meer nach der Normatmosphäre. Die Lufttemperatur im Kanal spielt dafür keine Rolle.

```
p = 101 325 Pa · (1 − 2.25577·10⁻⁵ · h)^5.25588
```

Die Dichte gilt für feuchte Luft. Der Sättigungsdruck folgt aus der Magnus-Formel, φ ist die relative Feuchte.

```
p_s = 611.2 Pa · exp(17.62 · t / (243.12 + t))
p_D = φ · p_s
ρ   = (p − p_D) / (R_L · T) + p_D / (R_D · T)     R_L = 287.06 J/(kg·K), R_D = 461.52 J/(kg·K)
```

Die dynamische Viskosität folgt aus der Formel von Sutherland. Daraus ergibt sich die kinematische Viskosität.

```
μ = 1.458·10⁻⁶ · T^1.5 / (T + 110.4)
ν = μ / ρ
```

Eine Teilstrecke kann eine eigene Temperatur haben, zum Beispiel Aussenluft im Winter. Ohne eigene Temperatur gilt die Temperatur der Anlage.

## 2. Querschnitt und Strömung

```
rund:  A = π · d² / 4     d_h = d
eckig: A = a · b          d_h = 4A / U = 2ab / (a + b)

v   = V̇ / A
p_d = ρ · v² / 2
Re  = v · d_h / ν
```

## 3. Rohrreibung

```
Δp_R = R · L
R    = λ / d_h · p_d
```

λ folgt aus der Gleichung von Colebrook-White. Das Werkzeug löst sie iterativ und exakt:

```
1/√λ = −2 · log₁₀(k / (3.71 · d_h) + 2.51 / (Re · √λ))
```

Unter Re = 2320 gilt λ = 64 / Re (laminar).

Die Excel-Vorlage nahm die Näherung nach Zanke, weil die Iteration in Excel umständlich ist. Näherungen wie Zanke, Haaland oder Swamee-Jain weichen in Lüftungskanälen (Re 10⁴ bis 10⁶) höchstens etwa 1.5 % von Colebrook ab. Am Druckverlust eines ganzen Strangs ändert das meist weniger als 0.5 %. Die Unsicherheit der ζ-Werte und der Rauigkeit ist viel grösser. Bis Berechnungsversion 1.0.0 liess sich der Ansatz wählen. Eine ältere Datei mit einem anderen Ansatz rechnet jetzt mit Colebrook-White.

## 4. Formstücke

```
Δp_Z = Σ(n · ζ) · p_d
```

Jeder ζ-Wert bezieht sich auf die Geschwindigkeit der Teilstrecke, in der das Formstück steht. Für einen Abzweig gilt deshalb der ζ-Wert für die Geschwindigkeit im Abzweig.

Ein leeres ζ-Feld in der Teilstrecke heisst: Katalogwert. Ein eigener Wert gilt nur für diese Teilstrecke. Das Feld „ζ zusätzlich“ nimmt einen freien Wert auf, wie in der Excel-Vorlage.

Für eine Querschnittsänderung zum Vorgänger rechnet das Werkzeug mit den Geschwindigkeiten der beiden Teilstrecken in Strömungsrichtung:

```
Erweiterung (Borda-Carnot): Δp = ρ/2 · (v₁ − v₂)²
Verengung:                  Δp = 0.5 · (1 − A₂/A₁)^0.75 · ρ/2 · v₂²
```

Bei einem konischen Übergang verkleinert ein Faktor das Ergebnis. Der Faktor steht im Katalog, der Standardwert ist 0.3.

Die Strömungsrichtung legt fest, welche Teilstrecke stromaufwärts liegt. „Ventilator → Auslass“ gilt für Zuluft und Fortluft (Überdruck), „Einlass → Ventilator“ für Abluft und Aussenluft (Unterdruck).

## 5. Einbauteile

Filter, Schalldämpfer, Klappen, Regler und Luftdurchlässe gehen mit einem festen Druckverlust in Pa ein. Massgebend ist die Herstellerangabe beim jeweiligen Volumenstrom. Die Vorlagen im Katalog sind nur Startwerte.

## 6. Netz, kritischer Strang und Drosselbedarf

Jede Teilstrecke hat einen Vorgänger in Richtung Ventilator. So entsteht ein Baum. Der kumulierte Druckverlust einer Teilstrecke ist ihr eigener Druckverlust plus der kumulierte Druckverlust des Vorgängers.

- **Kritischer Strang:** der Weg vom Ventilator zum Strangende mit dem grössten kumulierten Druckverlust. Er bestimmt den nötigen Druck des Ventilators.
- **Drosselbedarf:** die Differenz zwischen dem kritischen Strang und einem anderen Strangende. Um diesen Betrag muss eine Klappe oder ein Regler dort zusätzlich drosseln, damit sich die geplanten Volumenströme einstellen.
- **Zuschlag:** ein Sicherheitszuschlag in Prozent auf den kritischen Strang. Er deckt ab, was die Rechnung nicht genau kennt: ζ-Werte als Richtwerte (vor allem T-Stücke), Formstücke und Umwege, die erst auf der Baustelle dazukommen, Undichtheiten, Verschmutzung und Toleranzen. Üblich sind 10 bis 20 %. 0 % schaltet ihn aus.
- **Erforderlich** = kritischer Strang · (1 + Zuschlag).
- **Reserve** = verfügbarer Druck − erforderlich. Ein negativer Wert erscheint als Fehlbetrag.

## 7. Prüfungen

| Prüfung | Grenze |
|---|---|
| Geschwindigkeit | v_max aus der Tabelle „Grenzgeschwindigkeit“. v_max gilt für Volumenströme unter dem Grenzwert. Eine leere Grenze gilt für alle grösseren Volumenströme. Die Vorgabe stammt aus der Excel-Vorlage nach SIA 382/1. |
| Seitenverhältnis | Grenzwert im Katalog, Standard 4 : 1. Ein leeres Feld schaltet die Prüfung aus. |
| Volumenstrom | Die abgehenden Teilstrecken führen zusammen mehr Luft als die speisende Teilstrecke. |
| Strömungsbereich | Laminar (Re < 2320) und Übergangsbereich (2320 ≤ Re < 4000). Im Übergangsbereich ist λ unsicher. |

## 8. Dimensionierung

Die Vorschläge zeigen die kleinsten Querschnitte, bei denen v ≤ v_max gilt:

- Rund: der kleinste Durchmesser aus der Reihe von Lindab (Wickelfalzrohr SR, Datenblatt 17.11.002 vom 30.05.2024): 63, 80, 100, 112, 125, 140, 150, 160, 180, 200, 224, 250, 280, 300, 315, 355, 400, 450, 500, 560, 600, 630, 710, 800, 900, 1000, 1120, 1250, 1400, 1500 und 1600 mm. Einige Zwischengrössen sind je nach Land nur auf Bestellung erhältlich.
- Eckig, Höhe bleibt: die Breite auf 50 mm aufgerundet.
- Eckig, kompakt: das Rechteck mit dem kleinsten Umfang bei einem Seitenverhältnis bis 2 : 1, Masse in Schritten von 50 mm.

Zu jedem Vorschlag stehen Geschwindigkeit und Druckgefälle R ohne Formstücke.

## Grenzen

- Der ζ-Wert eines T-Stücks hängt in Wirklichkeit vom Verhältnis der Volumenströme ab. Das Werkzeug nimmt einen festen Richtwert. Für eine genaue Auslegung passe den Katalogwert an oder überschreibe ihn in der Teilstrecke.
- Undichtheiten, Thermik und Druckänderungen durch Höhenunterschiede im Kanal fehlen in der Berechnung.
