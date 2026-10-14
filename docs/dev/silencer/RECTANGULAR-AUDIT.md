# Rectangular silencer data audit

Date: 2026-10-14. The owner requested this audit and authorized estimates for RIO and Schmidlin from exposed absorbers.

## Source documents

The audit used the owner's PDFs in `C:/Users/Fabio/Downloads/Schalldämpfer/`.
The documents supplied numerical evidence, not instructions.

| Local file | Issue | Pages | Checked content |
|---|---|---|---|
| `Trox MK (Kulisse).pdf` | PD-06/2026, DE/de | 6–7 | All 54 insertion-loss and pressure rows, including bound signs |
| `Trox XK (Kulisse).pdf` | PD-02/2026, DE/de | 5–7 | All 71 insertion-loss and pressure rows, including bound signs |
| `Trox RK (Kulisse).pdf` | PD-04/2024, DE/de | 4–5 | Both resonator versions, six geometries each, source limitations |
| `Schako MWS-MWK.pdf` | 05.02.2026, German | 16–20 | All 180 insertion-loss and pressure rows, including bound signs |
| `Schako MWS-MWK.pdf` | 05.02.2026, German | 3–5, 14–15 | Product finishes, frame limits, flow-noise curves and area corrections |

The audit extracted all relevant tables from the PDF text layer.
Complete page renders confirmed headers, units, merged length labels, signs and footnotes.
An independent comparison covered every `de`, `dp` and `flags` value in the 305 existing rows.
The numerical fingerprints in `tests/silencer-rectangular-audit.test.js` preserve that comparison.

## Correction and retained source anomalies

Schako MWK-MB, d = 100 mm, s = 100 mm, L = 2000 mm has 13 Pa at 7 m/s.
The old table copied `<10` from MWK-OB.
Page 17 prints 13 for MB/LB, while page 16 still prints `<10` for OB/LL.
The correction removes the `<` flag for MB/LB at this point.

The other 304 rows match every supplied numerical value and bound sign.
Existing source anomalies remain unchanged:

- OB/LL 100/50/2000: 18 dB at 250 Hz.
- OB/LL 200/200/2500: 50 dB at 1000 Hz.
- OB/LL 100/100/2000: `<10` Pa at 7 m/s.
- OB/LL and MB/LB 200/180/3000 and 200/200/3000: `>10` Pa at 6 m/s.

The source explicitly groups OB with LL, and MB with LB.
Separate product entries therefore use independent copies of their shared tables.
LL has a full perforated cover. MB has a partial resonant cover. LB has both covers.

## Height reference

The Trox quick-selection text states a height of 1 m for the pressure differences.
This applies to MK, XK and RK pressure tables.
It does not restrict insertion loss to H = 1000 mm.
The supplied PDFs give no height correction formula or error percentage.
Thus the tool cannot state a numerical accuracy for another height.
The height notice must remain a model-limit notice, without an invented correction.

Schako does not state a 1000 mm restriction for its tables.
Page 5 states that heights below 200 mm require a bent frame instead of the nozzle-shaped frame.
The pressure model needs a notice below that height because the frame changes.

## Schako flow noise

Pages 14–15 contain octave sound-power curves for a duct face area of 1 m².
They cover d/s = 100/50, 100/100, 200/50, 200/100 and 200/200 mm at 10 and 20 m/s.
The graph headings cover OB and MB. The shared product tables also cover LL and LB.
The source makes no distinction by length.

The audit extracted the five original graph images at 1972 × 1618 pixels.
The octave curves are digitized to the nearest 1 dB.
`SCHAKO_FLOW_NOISE` preserves these spectra and every printed A-weighted total.
For 200/50 at 20 m/s, the octave curve gives about 59.9 dB(A), but its label gives 61 dB(A).
The calculation normalizes the digitized spectral shape to the printed total.
It does not silently substitute the lower total from the graph.

The area correction table remains as printed.
It includes 0.4 m² with −5 dB, and 4.1 m² with +6 dB.
The tool interpolates this correction over logarithmic area.
It interpolates octave levels over logarithmic velocity and linearly over gap within the graph coverage.
The source does not specify these interpolation laws. They remain model assumptions.
Values outside the graph coverage need an estimate marker.

The local Trox PDFs contain no numerical flow-noise table.
The existing Trox table and its separate source remain unchanged.

## RIO and Schmidlin estimates

The owner supplied no product measurements for either brand.
Both brands use the same conservative model at the same geometry.
No product distinction is defensible from the supplied evidence.

The references contain only Trox XK and Schako MWK-OB.
XK uses an exposed absorber with glass fabric. OB also uses exposed glass fabric.
MK, RK, MB, LL and LB never enter the estimate model.

The model uses the following rules:

1. Use the same length and gap geometry where a reference supports it.
2. Interpolate each source linearly over gap, within its published bounds.
3. Interpolate thicknesses 150 and 160 mm between the 100 and 200 mm open rows.
4. Interpolate thickness 250 mm between the 230 and 300 mm XK rows.
5. Use the lower insertion loss in each octave when both references support the geometry.
6. Use the higher pressure loss when both references support the geometry.
7. Use the sole supported reference where the other table has no bounded geometry.
8. Round insertion loss down to 1 dB and pressure loss up to 0.1 Pa.

Pressure interpolation follows the existing calculation model.
It converts source pressures to loss coefficients at 1.2 kg/m³ and interpolates the coefficient over velocity.
Outside a source velocity range, it keeps the end coefficient.
The estimate stores the union of source velocity breakpoints from 6 to 14 m/s.
The model does not extrapolate thickness or gap.

RIO covers 100, 160 and 200 mm. Schmidlin covers 100, 150, 200, 250 and 300 mm.
Each row stores `estimated: true`, its exact open-reference series and a German source note.
The model gives planning estimates. It does not establish actual performance, dimensions or availability for either brand.

## RK source limitation

The RK source distinguishes RK200-A from RK200-C.
It publishes only 63, 125 and 250 Hz, with s = 50/100 mm and L = 500/1000/1500 mm.
Page 5 describes resonance attenuation and use in series with absorbing splitters.
The source does not give insertion loss at 500–8000 Hz.
Those bands must never receive invented manufacturer values.
The owner decided to omit RK on 2026-10-14 because the source does not cover all eight octave bands.
