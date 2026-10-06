// CSV export (opens in Excel: semicolon separated, UTF-8 with BOM). No DOM, no pdf-lib.

function nrMap(sections) {
  const m = new Map();
  sections.forEach((s, i) => m.set(s.id, s.nr || `Zeile ${i + 1}`));
  return m;
}

export function buildCsv(doc, result) {
  const { inputs } = doc;
  const nr = nrMap(inputs.sections);
  const materials = new Map(inputs.catalogs.materials.map((m) => [m.id, m]));
  const n = (v, d) => (v == null || !Number.isFinite(v) ? '' : v.toFixed(d));
  const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const head = ['Nr.', 'Vorgänger', 'Form', 'Material', 'V [m3/h]', 'B [mm]', 'H [mm]', 'D [mm]', 'L [m]', 'dh [mm]', 'v [m/s]', 'v max [m/s]', 'pd [Pa]', 'Re', 'lambda', 'R [Pa/m]', 'Summe zeta', 'dp Reibung [Pa]', 'dp Formstücke [Pa]', 'dp Einbauteile [Pa]', 'dp Teilstrecke [Pa]', 'dp kumuliert [Pa]', 'Drosselbedarf [Pa]', 'Kritischer Strang', 'Bemerkung'];
  const lines = [head.map(q).join(';')];
  for (const s of inputs.sections) {
    const r = result.sections.get(s.id);
    const ok = r?.status === 'ok';
    lines.push(
      [
        q(nr.get(s.id)),
        q(s.parent ? nr.get(s.parent) : 'Ventilator'),
        q(s.shape === 'round' ? 'rund' : 'eckig'),
        q(materials.get(s.material)?.name ?? ''),
        n(s.flow, 0),
        s.shape === 'rect' ? n(s.width, 0) : '',
        s.shape === 'rect' ? n(s.height, 0) : '',
        s.shape === 'round' ? n(s.diameter, 0) : '',
        n(s.length, 2),
        ok ? n(r.dh * 1000, 1) : '',
        ok ? n(r.velocity, 3) : '',
        ok ? n(r.vmax, 1) : '',
        ok ? n(r.dynamicPressure, 3) : '',
        ok ? n(r.reynolds, 0) : '',
        ok ? n(r.lambda, 5) : '',
        ok ? n(r.gradient, 4) : '',
        ok ? n(r.zetaSum, 3) : '',
        n(r?.dpFriction, 2),
        n(r?.dpFittings, 2),
        n(r?.dpComponents, 2),
        n(r?.dp, 2),
        n(r?.cum, 2),
        r?.terminal ? n(r.throttle, 2) : '',
        r?.critical ? 'ja' : '',
        q(s.note),
      ].join(';'),
    );
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}
