// Static description of the calculation ("Rechenweg" tab). German, user-facing.

import { CALC_VERSION } from './calc.js';

export function methodHtml() {
  return `
<article class="method-text">
  <p class="lead">So rechnet das Tool. Berechnungsversion ${CALC_VERSION}. Jede gespeicherte Datei merkt sich diese Version; öffnet man eine Datei aus einer älteren Version und das Ergebnis weicht ab, erscheint ein Hinweis.</p>

  <h3>1. Luftzustand</h3>
  <p>Luftdruck aus der Höhe über Meer nach der Normatmosphäre, unabhängig von der Lufttemperatur im Kanal:</p>
  <p class="formula">p = 101 325 Pa · (1 − 2.25577·10⁻⁵ · h)<sup>5.25588</sup></p>
  <p>Dichte feuchter Luft mit dem Sättigungsdruck nach Magnus und der relativen Feuchte φ:</p>
  <p class="formula">p<sub>s</sub> = 611.2 Pa · exp(17.62 · t / (243.12 + t)),  p<sub>D</sub> = φ · p<sub>s</sub><br>ρ = (p − p<sub>D</sub>) / (R<sub>L</sub> · T) + p<sub>D</sub> / (R<sub>D</sub> · T),  R<sub>L</sub> = 287.06 J/(kg·K), R<sub>D</sub> = 461.52 J/(kg·K)</p>
  <p>Dynamische Viskosität nach Sutherland, daraus die kinematische Viskosität:</p>
  <p class="formula">μ = 1.458·10⁻⁶ · T<sup>1.5</sup> / (T + 110.4),  ν = μ / ρ</p>
  <p>Eine Teilstrecke kann eine eigene Temperatur haben (z. B. Aussenluft im Winter). Sonst gilt die Temperatur der Anlage.</p>

  <h3>2. Querschnitt und Strömung</h3>
  <p class="formula">Rund: A = π·d²/4, d<sub>h</sub> = d     Eckig: A = a·b, d<sub>h</sub> = 4A/U = 2ab/(a+b)</p>
  <p class="formula">v = V̇ / A,  p<sub>d</sub> = ρ·v²/2,  Re = v·d<sub>h</sub>/ν</p>

  <h3>3. Rohrreibung</h3>
  <p class="formula">Δp<sub>R</sub> = R · L,  R = λ / d<sub>h</sub> · p<sub>d</sub></p>
  <p>Für λ stehen mehrere Ansätze zur Wahl. Unter Re = 2320 gilt λ = 64/Re (ausser bei Churchill).</p>
  <ul>
    <li><strong>Colebrook-White</strong> (Standard): 1/√λ = −2·log<sub>10</sub>(k/(3.71·d<sub>h</sub>) + 2.51/(Re·√λ)), iterativ exakt gelöst. In Excel nur umständlich möglich, deshalb verwendete die Vorlage eine Näherung.</li>
    <li><strong>Churchill</strong> (1977): eine Gleichung für laminar, Übergang und turbulent, ohne Sprung bei Re = 2320.</li>
    <li><strong>Haaland</strong> und <strong>Swamee-Jain</strong>: explizite Näherungen, Abweichung zu Colebrook meist unter 2 %.</li>
    <li><strong>Zanke</strong>: die Näherung aus der Excel-Vorlage, zum Vergleich mit alten Berechnungen.</li>
  </ul>

  <h3>4. Formstücke</h3>
  <p class="formula">Δp<sub>Z</sub> = Σ(n·ζ) · p<sub>d</sub></p>
  <p>Alle ζ-Werte beziehen sich auf die Geschwindigkeit der Teilstrecke, in der das Formstück eingetragen ist. Bei Abzweigen deshalb den Wert für die Abzweig-Geschwindigkeit verwenden.</p>
  <p>Querschnittsänderungen zum Vorgänger berechnet das Tool aus den Geschwindigkeiten der beiden Teilstrecken (in Strömungsrichtung):</p>
  <p class="formula">Erweiterung (Borda-Carnot): Δp = ρ/2 · (v<sub>1</sub> − v<sub>2</sub>)²<br>Verengung: Δp = 0.5 · (1 − A<sub>2</sub>/A<sub>1</sub>)<sup>0.75</sup> · ρ/2 · v<sub>2</sub>²</p>
  <p>Für konische Übergänge wird das Ergebnis mit einem Faktor (Katalog, Standard 0.3) verkleinert.</p>

  <h3>5. Einbauteile</h3>
  <p>Filter, Schalldämpfer, Klappen, Regler und Luftdurchlässe gehen mit ihrem festen Druckverlust in Pa ein. Massgebend sind die Herstellerangaben beim jeweiligen Volumenstrom.</p>

  <h3>6. Netz, kritischer Strang und Drosselbedarf</h3>
  <p>Jede Teilstrecke hat einen Vorgänger in Richtung Ventilator. So entsteht ein Baum. Der kumulierte Druckverlust einer Teilstrecke ist ihr eigener Druckverlust plus der ihres Vorgängers.</p>
  <ul>
    <li><strong>Kritischer Strang:</strong> der Weg vom Ventilator zum Strangende mit dem grössten kumulierten Druckverlust. Er bestimmt die nötige Pressung.</li>
    <li><strong>Drosselbedarf:</strong> an allen anderen Strangenden die Differenz zum kritischen Strang. So viel muss dort zusätzlich gedrosselt werden, damit sich die Volumenströme wie geplant einstellen.</li>
    <li><strong>Erforderlich</strong> = kritischer Strang · (1 + Zuschlag). <strong>Reserve</strong> = verfügbare Pressung − erforderlich.</li>
  </ul>

  <h3>7. Prüfungen</h3>
  <ul>
    <li>Geschwindigkeit über dem Grenzwert aus der Tabelle (nach Volumenstrom).</li>
    <li>Seitenverhältnis eckiger Kanäle über dem Grenzwert.</li>
    <li>Abgehende Teilstrecken mit mehr Volumenstrom als die speisende Teilstrecke.</li>
    <li>Laminare Strömung und Übergangsbereich (2320 ≤ Re &lt; 4000), wo λ unsicher ist.</li>
  </ul>

  <h3>Grenzen</h3>
  <p>ζ-Werte für T-Stücke hängen in Wirklichkeit vom Volumenstromverhältnis ab. Hier ist ein fester Richtwert hinterlegt; für genaue Auslegungen den Katalogwert anpassen oder in der Teilstrecke überschreiben. Undichtheiten, Thermik und Druckänderungen durch Höhenunterschiede im Kanal werden nicht berücksichtigt.</p>
</article>`;
}
