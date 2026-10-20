# Klimastation: Rechenweg

Das Werkzeug hilft bei der Wahl der Klimastation nach SIA 2028:2010 für einen Standort. Es enthält keine Klimadaten der Norm. Temperaturen, Feuchte und weitere Werte nimmst du aus der Norm oder aus deinem Excel-Blatt.

## 1. Grundlagen

- **Stationen:** SIA 2028, Tabelle 1a (Name, Kürzel, geografische Breite und Länge auf Bogenminuten, Höhe) und Tabelle 1b (Klimaregion). Rünenberg steht in Tabelle 1a mit 46° 26′. Richtig ist 47° 26′.
- **Klimaregionen:** SIA 2028, Figur 1, von Hand nachgezeichnet (siehe Abschnitt 3). Die Karte der Norm ist schematisch.
- **Ortschaften:** Amtliches Ortschaftenverzeichnis von swisstopo (PLZ, Ortschaft, Gemeinde, Kanton, Koordinate LV95). Je Ortschaft gilt die Gemeinde mit dem grössten Adressanteil.
- **Adressen und Höhe:** Dienste von swisstopo (api3.geo.admin.ch). Für die Adresssuche geht der eingegebene Text an swisstopo, für die Höhe die Koordinate. PLZ-Suche, Ortssuche, Region und Rangliste laufen im Browser.

## 2. Koordinaten

Das Werkzeug rechnet in LV95 (E, N in m). Die Stationen sind in der Norm auf Bogenminuten angegeben, das sind etwa 1.9 km in Nord-Süd-Richtung und 1.3 km in Ost-West-Richtung. Für die Wahl der Station genügt das.

WGS84 → LV95 mit der Näherungsformel von swisstopo (Genauigkeit etwa 1 m):

```
φ' = (φ[″] − 169'028.66) / 10'000
λ' = (λ[″] − 26'782.5) / 10'000
E = 2'600'072.37 + 211'455.93 λ' − 10'938.51 λ'φ' − 0.36 λ'φ'² − 44.54 λ'³
N = 1'200'147.07 + 308'807.95 φ' + 3'745.25 λ'² + 76.63 φ'² − 194.56 λ'²φ' + 119.79 φ'³
```

In der Suche kannst du Koordinaten eingeben: LV95 (`2'635'345 1'244'330`), LV03 (`635345 244330`) oder WGS84 in Dezimalgrad (`47.35, 7.90`). Die Reihenfolge der zwei Zahlen spielt keine Rolle.

## 3. Klimaregion des Standorts

Die Karte der Norm wurde so nachgezeichnet:

1. **Georeferenzierung:** Die 40 Stationspunkte der Karte sind Passpunkte. Eine affine Transformation (kleinste Quadrate) bildet die Karte auf LV95 ab. Restfehler 0.65 km (quadratisches Mittel). Bern-Liebefeld (7 km) und Magadino (4 km) sind in der Karte versetzt gezeichnet und zählen nicht als Passpunkte.
2. **Flächen:** Die schwarzen Grenzlinien trennen die Flächen. Jede Fläche erhält die Region der Stationen darin.
3. **Umriss:** Die Grenzen werden als gemeinsame Linien vereinfacht (Toleranz etwa 0.35 km). Benachbarte Regionen haben dieselbe Grenzlinie, ohne Lücken.

Die Region eines Standorts ist die Fläche, in der er liegt. Liegt der Standort ausserhalb aller Flächen (z. B. knapp an der Landesgrenze oder in Liechtenstein), gilt die nächste Region. Das Werkzeug zeigt dann den Abstand. Ist der Standort mehr als 15 km von jeder Region entfernt, gilt er als ausserhalb der Schweiz. Die Rangliste rechnet dann ohne Regionszuschlag.

Liegt eine andere Region näher als 5 km, zeigt das Werkzeug eine Warnung „Grenznähe“. Die Grenzen der Norm sind schematisch, prüfe die Wahl in diesem Fall von Hand.

Bekannte Abweichung: Die Station Grand-St-Bernard (Region 12) liegt auf der Passhöhe. Die Karte zeichnet diesen Punkt in Region 10.

## 4. Rangliste der Stationen

Für jede Station rechnet das Werkzeug eine Bewertung Σ in km. Die Station mit dem kleinsten Σ ist vorgewählt.

```
d   = √((E_Station − E_Standort)² + (N_Station − N_Standort)²) / 1'000      in km
Δh  = h_Station − h_Standort                                               in m
Z   = 0, wenn die Station in der Region des Standorts liegt, sonst Zuschlag
Σ   = d + |Δh| / 100 · W + Z
```

| Gewichtung | Standard | Bedeutung |
|---|---|---|
| W | 10 km je 100 m | 100 m Höhenunterschied zählen wie 10 km Abstand |
| Z | 20 km | eine Station einer anderen Region zählt wie 20 km weiter weg |

Fehlt die Höhe des Standorts, entfällt der Höhenterm.

Beispiel Olten (4600, E 2'635'345, N 1'244'330, 396 m, Region 4):

| Station | Region | d km | Δh m | Σ km |
|---|---|---|---|---|
| Buchs-Aarau | 4 | 13.9 | −9 | 13.9 + 0.9 = 14.8 |
| Wynau | 4 | 14.4 | +26 | 14.4 + 2.6 = 17.0 |
| Rünenberg | 1 | 9.6 | +214 | 9.6 + 21.4 + 20 = 51.0 |

Die Rangliste ist eine Hilfe. Die Norm verlangt die Station, die das Klima am Standort am besten wiedergibt. Lage (Hang, Tal, Seeufer, Stadt) und Nebel- oder Föhneinfluss berücksichtigt die Formel nicht.

## 5. Höhe

Nach jedem neuen Standort fragt das Werkzeug die Höhe bei swisstopo ab (Höhenmodell, auf 1 m gerundet). Du kannst die Höhe überschreiben, sie gilt dann als Handeingabe. ↺ holt den Wert von swisstopo wieder.

## 6. Kopieren

`Kopieren` legt eine Zeile in die Zwischenablage, Spalten mit Tabulator getrennt, Dezimalpunkt, ohne Tausendertrennzeichen:

| Spalte | Inhalt |
|---|---|
| 1 | Standort |
| 2, 3 | E, N in LV95 |
| 4 | Höhe Standort in m ü. M. |
| 5 | Klimaregion |
| 6, 7 | Station und Kürzel |
| 8 | Höhe Station in m ü. M. |
| 9 | Abstand in km |
| 10 | Δh in m |

## 7. Grenzen

- Die Regionsgrenzen stammen aus einer schematischen Karte. Abweichung zur Norm bis etwa 1 km, an versetzt gezeichneten Stellen mehr.
- Die Stationskoordinaten sind auf Bogenminuten gerundet. Die Abstände sind darum auf etwa 1 km genau.
- Die Stationen entsprechen dem Messnetz 1984 bis 2003. Einige Stationen sind heute verschoben oder aufgehoben.
- Adresssuche und Höhe brauchen eine Internetverbindung zu swisstopo.
