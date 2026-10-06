# Druckverlust Lüftung: Rechenweg

Berechnungsversion 1.0.0. Jede gespeicherte Datei enthält die Berechnungsversion. Öffnest du eine Datei aus einer anderen Version, zeigt das Werkzeug die alte und die neue Version. Weicht der Druckverlust im kritischen Strang ab, zeigt es auch den alten und den neuen Wert.

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

Für λ gibt es fünf Ansätze. Unter Re = 2320 gilt bei allen ausser Churchill λ = 64 / Re.

| Ansatz | Beschreibung |
|---|---|
| Colebrook-White (Standard) | 1/√λ = −2 · log₁₀(k / (3.71 · d_h) + 2.51 / (Re · √λ)). Das Werkzeug löst die Gleichung iterativ und exakt. In Excel war das umständlich, deshalb nahm die Vorlage eine Näherung. |
| Churchill (1977) | Eine Gleichung für laminar, Übergang und turbulent. Sie hat keinen Sprung bei Re = 2320. |
| Haaland, Swamee-Jain | Explizite Näherungen. Die Abweichung zu Colebrook liegt meist unter 2 %. |
| Zanke | Die Näherung aus der Excel-Vorlage. Sie dient zum Vergleich mit alten Berechnungen. |

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

- **Kritischer Strang:** der Weg vom Ventilator zum Strangende mit dem grössten kumulierten Druckverlust. Er bestimmt die nötige Pressung.
- **Drosselbedarf:** die Differenz zwischen dem kritischen Strang und einem anderen Strangende. Um diesen Betrag muss eine Klappe oder ein Regler dort zusätzlich drosseln, damit sich die geplanten Volumenströme einstellen.
- **Erforderlich** = kritischer Strang · (1 + Zuschlag).
- **Reserve** = verfügbare Pressung − erforderlich. Ein negativer Wert erscheint als Fehlbetrag.

## 7. Prüfungen

| Prüfung | Grenze |
|---|---|
| Geschwindigkeit | v_max aus der Tabelle „Grenzgeschwindigkeit“. v_max gilt für Volumenströme unter dem Grenzwert. Eine leere Grenze gilt für alle grösseren Volumenströme. Die Vorgabe stammt aus der Excel-Vorlage nach SIA 382/1. |
| Seitenverhältnis | Grenzwert im Katalog, Standard 4 : 1. Ein leeres Feld schaltet die Prüfung aus. |
| Volumenstrom | Die abgehenden Teilstrecken führen zusammen mehr Luft als die speisende Teilstrecke. |
| Strömungsbereich | Laminar (Re < 2320) und Übergangsbereich (2320 ≤ Re < 4000). Im Übergangsbereich ist λ unsicher. |

## 8. Dimensionierung

Die Vorschläge zeigen die kleinsten Querschnitte, bei denen v ≤ v_max gilt:

- Rund: der kleinste Normdurchmesser aus der Reihe 80 bis 1250 mm.
- Eckig, Höhe bleibt: die Breite auf 50 mm aufgerundet.
- Eckig, kompakt: das Rechteck mit dem kleinsten Umfang bei einem Seitenverhältnis bis 2 : 1, Masse in Schritten von 50 mm.

Zu jedem Vorschlag stehen Geschwindigkeit und Druckgefälle R ohne Formstücke.

## Grenzen

- Der ζ-Wert eines T-Stücks hängt in Wirklichkeit vom Verhältnis der Volumenströme ab. Das Werkzeug nimmt einen festen Richtwert. Für eine genaue Auslegung passe den Katalogwert an oder überschreibe ihn in der Teilstrecke.
- Undichtheiten, Thermik und Druckänderungen durch Höhenunterschiede im Kanal fehlen in der Berechnung.
