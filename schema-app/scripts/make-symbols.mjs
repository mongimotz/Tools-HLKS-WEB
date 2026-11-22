// SPDX-License-Identifier: AGPL-3.0-or-later
// Writes the ventilation (air) and MSR (control) symbol JSON files in src/symbols/. The drawings follow the
// owner's sample sheet (Lüftung, 2026-11-22): one element per row, the row's drawings are its variants.
// Usage: node scripts/make-symbols.mjs   (then npm run symbols)
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const DIR = fileURLToPath(new URL('../src/symbols/', import.meta.url));
const n = (v) => Math.round(v * 1000) / 1000;
const P = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${n(p[0])} ${n(p[1])}`).join('');
const rect = (x, y, w, h, extra = '') => `<rect x='${n(x)}' y='${n(y)}' width='${n(w)}' height='${n(h)}'${extra}/>`;
const circle = (cx, cy, r, extra = '') => `<circle cx='${n(cx)}' cy='${n(cy)}' r='${n(r)}'${extra}/>`;
const path = (d, extra = '') => `<path d='${d}'${extra}/>`;
const FILL = " fill='currentColor' stroke='none'";
const text = (x, y, size, t, extra = '') =>
  `<text x='${n(x)}' y='${n(y + size * 0.35)}' font-size='${size}' text-anchor='middle'${FILL}${extra}>${t}</text>`;

/** Arrow head (triangle) at `tip`, coming from `from`. */
function head(from, tip, len, half, filled) {
  const dx = tip[0] - from[0],
    dy = tip[1] - from[1];
  const l = Math.hypot(dx, dy);
  const ux = dx / l,
    uy = dy / l;
  const b = [tip[0] - ux * len, tip[1] - uy * len];
  const d = P([tip, [b[0] - uy * half, b[1] + ux * half], [b[0] + uy * half, b[1] - ux * half]]) + 'Z';
  return { svg: path(d, filled ? " fill='currentColor'" : ''), base: b };
}

/** Diagonal hatch "/" inside a rectangle, spacing s (vertical). */
function hatch(x, y, w, h, s) {
  const segs = [];
  for (let c = s; c < h + w; c += s) {
    // line x' + y' = c in local coords (origin bottom-left going up-right)
    const pts = [];
    const x0 = Math.max(0, c - h),
      x1 = Math.min(w, c);
    if (x1 - x0 < 1e-6) continue;
    pts.push([x + x0, y + h - (c - x0)], [x + x1, y + h - (c - x1)]);
    segs.push(P(pts));
  }
  return path(segs.join(''));
}

const pivot = (x, y) => circle(x, y, 0.5) + circle(x, y, 0.2);
const W = (id, at, media = ['air.*']) => ({ id, at, dir: 'W', media });
const E = (id, at, media = ['air.*']) => ({ id, at, dir: 'E', media });
const N = (id, at, media = ['air.*']) => ({ id, at, dir: 'N', media });
const sig = (id, at, dir) => ({ id, at, dir, media: ['signal'], optional: true });
const inOut = (w, h) => [W('in', [0, h / 2]), E('out', [w, h / 2])];

const defs = [];
const def = (file, d) => defs.push({ file, d: { category: 'air', norm: '', checked: false, ...d } });

// --- Schalldämpfer -------------------------------------------------------------------------------------
def('air/silencer.json', {
  id: 'air.silencer',
  name: 'Schalldämpfer',
  size: [2.5, 10],
  prefix: 'SD',
  ports: inOut(2.5, 10),
  labelAnchor: [1.25, -1.5],
  props: ['L', 'De'],
  keywords: ['Kulissenschalldämpfer', 'Rohrschalldämpfer', 'Telefonieschalldämpfer'],
  variants: [
    {
      id: 'kulisse',
      name: 'Kulissenschalldämpfer',
      svg: rect(0, 0, 2.5, 10) + path('M0 2.5H2.5M0 5H2.5M0 7.5H2.5'),
    },
    {
      id: 'rohr',
      name: 'Rohrschalldämpfer',
      size: [10, 5],
      ports: inOut(10, 5),
      labelAnchor: [5, -1.5],
      svg: rect(0, 0, 10, 5) + path('M2.5 0V2.5M7.5 0V2.5M5 5V2.5'),
    },
  ],
});

// --- Klappen -------------------------------------------------------------------------------------------
const blades = [
  {
    id: 'gleich',
    name: 'Gliederklappe gleichläufig',
    svg: path('M0 3.75L2.5 1.25M0 8.75L2.5 6.25') + pivot(1.25, 2.5) + pivot(1.25, 7.5),
  },
  {
    id: 'gegen',
    name: 'Gliederklappe gegenläufig',
    svg: path('M0 3.75L2.5 1.25M0 6.25L2.5 8.75') + pivot(1.25, 2.5) + pivot(1.25, 7.5),
  },
  { id: 'einstell', name: 'Einstellklappe', svg: path('M0.3 4.05L2.2 5.95') + pivot(1.25, 5) },
  {
    id: 'jalousie',
    name: 'Jalousieklappe',
    svg: path('M0.95 2.35L1.95 4.05M0.95 7.35L1.95 9.05') + pivot(0.65, 1.9) + pivot(0.65, 6.9),
  },
];
const damperBase = {
  size: [2.5, 10],
  prefix: 'KL',
  ports: inOut(2.5, 10),
  props: ['Funktion'],
};
def('air/damper.json', {
  id: 'air.damper',
  name: 'Klappe',
  ...damperBase,
  labelAnchor: [1.25, -1.5],
  keywords: ['Gliederklappe', 'Jalousieklappe', 'Einstellklappe', 'Regulierklappe', 'Handklappe'],
  variants: blades.map((b) => ({ ...b, svg: rect(0, 0, 2.5, 10) + b.svg })),
});
const actuator =
  path('M1.25 0V-1.25') + rect(0, -3.75, 2.5, 2.5) + circle(1.25, -2.5, 1.05) + text(1.25, -2.5, 1.3, 'M');
def('air/damper-motor.json', {
  id: 'air.damper.motor',
  name: 'Klappe mit Antrieb',
  ...damperBase,
  labelAnchor: [1.25, -5.25],
  bounds: [0, -3.75, 2.5, 13.75],
  text: { at: [3, -2.5], size: 1.5, align: 'start', value: '' },
  keywords: ['Motorklappe', 'Stellantrieb', 'Gliederklappe', 'Jalousieklappe', 'Absperrklappe'],
  variants: blades.map((b) => ({ ...b, svg: rect(0, 0, 2.5, 10) + b.svg + actuator })),
});
def('air/damper-single.json', {
  id: 'air.damper.single',
  name: 'Absperr-, Drossel-, Rückschlagklappe',
  size: [5, 10],
  prefix: 'KL',
  ports: inOut(5, 10),
  labelAnchor: [2.5, -1.5],
  props: ['Funktion'],
  keywords: ['Absperrklappe', 'Drosselklappe', 'Rückschlagklappe', 'DLK'],
  variants: [
    { id: 'absperr', name: 'Absperrklappe', svg: rect(0, 0, 5, 10) + path('M0 10L5 0') + circle(2.5, 5, 0.45, FILL) },
    {
      id: 'drossel',
      name: 'Drosselklappe',
      svg: rect(0, 0, 5, 10) + path('M0.3 7.3L4.7 2.8') + circle(2.5, 5.05, 0.3, FILL),
      text: { at: [0.4, 1.1], size: 1.2, align: 'start', value: 'DLK' },
    },
    { id: 'rueck', name: 'Rückschlagklappe', svg: rect(0, 0, 5, 10) + path('M0 10L5 0') + circle(0, 10, 0.4, FILL) },
  ],
});
def('air/firedamper.json', {
  id: 'air.firedamper',
  name: 'Brandschutzklappe',
  size: [5, 10],
  prefix: 'BSK',
  ports: inOut(5, 10),
  labelAnchor: [2.5, -1.5],
  props: ['EI', 'Auslösung'],
  keywords: ['BSK', 'Brandschutz', 'Feuerschutzklappe'],
  svg:
    rect(0, 0, 5, 10) +
    path(
      P([
        [1.07, 1.05],
        [4.57, 8.65],
        [3.93, 8.95],
        [0.43, 1.35],
      ]) + 'Z',
    ) +
    path(
      P([
        [3.063, 4.906],
        [2.937, 4.634],
        [1.937, 5.094],
        [2.063, 5.366],
      ]) + 'Z',
      " fill='currentColor'",
    ),
});

// --- Wetterschutz (Aussenluft, Fortluft) ---------------------------------------------------------------
const weather = rect(0, 0, 2.5, 10) + hatch(0, 0, 2.5, 10, 1.25);
def('air/intake.json', {
  id: 'air.intake',
  name: 'Wetterschutz (Aussenluft)',
  size: [2.5, 10],
  prefix: 'AF',
  ports: [E('out', [2.5, 5])],
  labelAnchor: [1.25, -1.5],
  props: [],
  keywords: ['Wetterschutzgitter', 'Aussenluftgitter', 'Ansaugung', 'AUL'],
  svg: weather,
});
def('air/outlet.json', {
  id: 'air.outlet',
  name: 'Wetterschutz (Fortluft)',
  size: [2.5, 10],
  prefix: 'FA',
  ports: [W('in', [0, 5])],
  labelAnchor: [1.25, -1.5],
  props: [],
  keywords: ['Wetterschutzgitter', 'Fortluftgitter', 'Ausblas', 'FOL'],
  svg: weather,
});

// --- Mischkammer ---------------------------------------------------------------------------------------
const bladeX = (x, y) =>
  path(
    P([
      [x - 0.75, y - 0.75],
      [x + 0.75, y + 0.75],
    ]),
  ) + pivot(x, y);
def('air/mixbox.json', {
  id: 'air.mixbox',
  name: 'Mischkammer',
  size: [10, 10],
  prefix: 'MK',
  ports: [W('in', [0, 5]), N('rec', [5, 0]), E('out', [10, 5])],
  flow: [
    ['in', 'out'],
    ['rec', 'out'],
  ],
  labelAnchor: [-1, -1.5],
  labelAlign: 'end',
  props: [],
  keywords: ['Mischluft', 'Umluft', 'Mischkasten'],
  svg:
    path('M2.5 0H10V10H0V2.5H2.5ZM2.5 2.5H10M6.25 0V2.5M2.5 2.5V10M0 6.25H2.5') +
    bladeX(4.375, 1.25) +
    bladeX(8.125, 1.25) +
    bladeX(1.25, 4.375) +
    bladeX(1.25, 8.125) +
    path('M5.95 2.5L6.25 5L6.55 2.5M2.5 5.95L5 6.25L2.5 6.55'),
});

// --- Filter --------------------------------------------------------------------------------------------
const filterBox = rect(0, 0, 5, 10) + path('M0 0L5 5L0 10');
const bolt = head([2.4, 5.0], [0.95, 7.85], 0.9, 0.35, true);
def('air/filter.json', {
  id: 'air.filter',
  name: 'Filter',
  size: [5, 10],
  prefix: 'FI',
  ports: inOut(5, 10),
  labelAnchor: [2.5, -1.5],
  props: ['Klasse', 'dp'],
  keywords: ['Luftfilter', 'ePM1', 'ePM10', 'ISO 16890'],
  text: { at: [1.9, 5], size: 1.5, align: 'middle', width: 2.9, value: 'F7' },
  variants: [
    { id: 'standard', name: 'Filter', svg: filterBox },
    {
      id: 'elektro',
      name: 'Elektrostatischer Filter',
      text: null,
      keywords: ['Elektrofilter', 'E-Filter'],
      svg: filterBox + path(P([[2.4, 3.3], [1.4, 5.6], [2.4, 5.0], bolt.base])) + bolt.svg,
    },
    {
      id: 'fett',
      name: 'Fettfilter',
      text: null,
      keywords: ['Küchenabluft', 'Fettabscheider'],
      svg: filterBox + path('M2.3 3.4C1 3.6 1 5 2 5.1C1 5.2 1 6.6 2.3 6.8'),
    },
  ],
});

// --- Lufterhitzer, Luftkühler (mit Hydraulik) ----------------------------------------------------------
function hydraulics(kind, cooler) {
  const fl = cooler ? 'water.chill.flow' : 'water.heat.flow';
  const rt = cooler ? 'water.chill.return' : 'water.heat.return';
  const col = (m) => ` stroke='{{${m}}}'`;
  const xa = 0.4,
    xb = 4.6;
  const cut = (x) => 25.8 - x; // break line y = 25.8 − x
  const motor = (x, y) =>
    rect(x - 2.4, y - 0.65, 1.3, 1.3) + circle(x - 1.75, y, 0.5) + path(`M${n(x - 1.1)} ${n(y)}H${n(x - 0.85)}`);
  const valve2 = (x, y) =>
    path(
      P([
        [x - 0.85, y - 1.3],
        [x + 0.85, y - 1.3],
        [x, y],
      ]) +
        'Z' +
        P([
          [x - 0.85, y + 1.3],
          [x + 0.85, y + 1.3],
          [x, y],
        ]) +
        'Z',
    ) + motor(x, y);
  const pump = (x, y, up) =>
    circle(x, y, 1.8) +
    path(
      P(
        up
          ? [
              [x - 1.8, y],
              [x, y - 1.8],
              [x + 1.8, y],
            ]
          : [
              [x - 1.8, y],
              [x, y + 1.8],
              [x + 1.8, y],
            ],
      ) + 'Z',
      " fill='currentColor'",
    );
  let out = '';
  if (kind === 'beimisch') {
    if (!cooler) {
      // pump and three-way valve in the flow (left), bypass to the return
      out += path(`M${xa} 10V12.5M${xa} 16.1V18.6M${xa} 21.2V${n(cut(xa))}M1.7 19.9H${xb}`, col(fl));
      out += path(`M${xb} 10V${n(cut(xb))}`, col(rt));
      out += pump(xa, 14.3, true);
      out +=
        valve2(xa, 19.9) +
        path(
          P([
            [1.7, 19.05],
            [1.7, 20.75],
            [xa, 19.9],
          ]) + 'Z',
        );
    } else {
      // three-way valve in the flow (left) with bypass to the return, pump in the return (right)
      out += path(`M${xa} 10V17.4M${xa} 20V${n(cut(xa))}M1.7 18.7H${xb}`, col(fl));
      out += path(`M${xb} 10V12.5M${xb} 16.1V${n(cut(xb))}`, col(rt));
      out += pump(xb, 14.3, false);
      out +=
        valve2(xa, 18.7) +
        path(
          P([
            [1.7, 17.85],
            [1.7, 19.55],
            [xa, 18.7],
          ]) + 'Z',
        );
    }
  } else {
    out += path(`M${xa} 10V14.3M${xa} 16.9V${n(cut(xa))}`, col(fl));
    out += path(`M${xb} 10V${n(cut(xb))}`, col(rt));
    out += valve2(xa, 15.6);
  }
  return out + path('M0 25.8L5 20.8');
}
for (const cooler of [false, true]) {
  const box = rect(0, 0, 5, 10) + path(cooler ? 'M0 0L5 10M1.9 1.2H3.1' : 'M0 10L5 0M2.5 0.6V1.8M1.9 1.2H3.1');
  const name = cooler ? 'Luftkühler' : 'Lufterhitzer';
  def(cooler ? 'air/cooler.json' : 'air/heater.json', {
    id: cooler ? 'air.cooler' : 'air.heater',
    name,
    size: [5, 10],
    prefix: cooler ? 'KU' : 'ER',
    ports: inOut(5, 10),
    labelAnchor: [2.5, -1.5],
    props: ['Q', 't'],
    keywords: cooler
      ? ['Kühler', 'Kühlregister']
      : ['Erhitzer', 'Heizregister', 'Lufterwärmer', 'Nacherhitzer', 'Vorerhitzer'],
    variants: [
      { id: 'basis', name, svg: box },
      {
        id: 'beimisch',
        name: `${name} mit Beimischschaltung`,
        bounds: [-2.4, 0, 7.4, 26],
        keywords: ['Beimischschaltung', 'Hydraulik', 'Dreiwegeventil', 'Pumpe'],
        svg: box + hydraulics('beimisch', cooler),
      },
      {
        id: 'drossel',
        name: `${name} mit Drosselschaltung`,
        bounds: [-2.4, 0, 7.4, 26],
        keywords: ['Drosselschaltung', 'Hydraulik', 'Zweiwegeventil'],
        svg: box + hydraulics('drossel', cooler),
      },
    ],
  });
}

// --- Wärmerückgewinnung --------------------------------------------------------------------------------
const hrcPorts = (w) => [W('a.in', [0, 30]), E('a.out', [w, 30]), E('b.in', [w, 10]), W('b.out', [0, 10])];
const hrcFlow = [
  ['a.in', 'a.out'],
  ['b.in', 'b.out'],
];
{
  const S = 25,
    t = 2.5,
    e = 0.424 * S;
  const corner = (sx, sy) => {
    const X = (v) => (sx ? S - v : v),
      Y = (v) => (sy ? S - v : v);
    return P([
      [X(0), Y(t)],
      [X(t), Y(t)],
      [X(e), Y(e)],
    ]);
  };
  def('air/hrc-plate.json', {
    id: 'air.hrc.plate',
    name: 'WRG Plattenwärmeübertrager',
    size: [S, S],
    prefix: 'WRG',
    // Ducts end at the corner ticks: supply bottom (in left, out right), extract top (in right, out left).
    ports: [W('a.in', [0, S - t]), E('a.out', [S, S - t]), E('b.in', [S, t]), W('b.out', [0, t])],
    flow: hrcFlow,
    labelAnchor: [S / 2, -1.5],
    props: ['eta'],
    keywords: ['Wärmerückgewinnung', 'Wärmetauscher rekuperativ', 'Plattentauscher', 'Kreuzstrom', 'Gegenstrom', 'WRG'],
    svg:
      rect(0, 0, S, S) +
      path(
        P([
          [0, S / 2],
          [S / 2, 0],
          [S, S / 2],
          [S / 2, S],
        ]) + 'Z',
      ) +
      path(corner(0, 0) + corner(1, 0) + corner(0, 1) + corner(1, 1)),
  });
}
def('air/hrc-rotor.json', {
  id: 'air.hrc.rotor',
  name: 'WRG Rotor',
  size: [15, 40],
  prefix: 'WRG',
  ports: hrcPorts(15),
  flow: hrcFlow,
  labelAnchor: [7.5, -1.5],
  props: ['eta'],
  keywords: ['Wärmerückgewinnung', 'Wärmetauscher regenerativ', 'Rotationswärmeübertrager', 'Sorptionsrotor', 'WRG'],
  svg: rect(0, 0, 15, 40) + path('M0 2.6H15M0 37.4H15M-4 20H19'),
});
def('air/hrc-coil.json', {
  id: 'air.hrc.coil',
  name: 'KVS-WRG',
  size: [5, 10],
  prefix: 'KVS',
  ports: [...inOut(5, 10), N('p1', [0, 0], ['water.*']), N('p2', [5, 0], ['water.*'])],
  flow: [['in', 'out']],
  labelAnchor: [6, 9.5],
  labelAlign: 'start',
  props: ['eta'],
  keywords: ['Kreislaufverbundsystem', 'KVS-Register', 'WRG', 'Wärmerückgewinnung'],
  svg: rect(0, 0, 5, 10) + path('M0 0L5 10M5 0L0 10'),
});

// --- Befeuchter, Entfeuchter ---------------------------------------------------------------------------
const lamellas = path([6.75, 7.3, 7.85, 8.4, 8.95].map((x) => `M${x} 0V10`).join(''));
const nozzle = (y) => path(`M1.94 ${n(y - 0.3)}L1.24 ${n(y)}L1.94 ${n(y + 0.3)}`);
const steam = (y) =>
  path(`M2.3 ${n(y - 0.5)}L1.18 ${n(y)}L2.3 ${n(y + 0.5)}M2.55 ${n(y - 0.55)}A0.6 0.6 0 0 1 2.55 ${n(y + 0.55)}`);
def('air/humidifier.json', {
  id: 'air.humidifier',
  name: 'Befeuchter',
  size: [10, 10],
  prefix: 'BF',
  ports: inOut(10, 10),
  labelAnchor: [5, -1.5],
  props: ['Art', 'x'],
  keywords: ['Befeuchter', 'Luftwäscher', 'Düsenbefeuchter', 'Dampfbefeuchter'],
  variants: [
    {
      id: 'waescher',
      name: 'Luftwäscher (Düsen)',
      bounds: [0, 0, 10, 10.8],
      svg: rect(0, 0, 10, 10) + lamellas + path('M0 8H10M1.24 1.5V10.8') + nozzle(1.53) + nozzle(4) + nozzle(6.47),
    },
    {
      id: 'dampf',
      name: 'Dampfbefeuchter',
      svg: rect(0, 0, 10, 10) + lamellas + path('M1.18 1.5V8.2') + circle(1.18, 8.8, 0.6) + steam(1.53) + steam(6.47),
    },
  ],
});
def('air/dehumidifier.json', {
  id: 'air.dehumidifier',
  name: 'Entfeuchter (Sorption)',
  size: [10, 10],
  prefix: 'EF',
  ports: inOut(10, 10),
  labelAnchor: [5, -1.5],
  props: ['x'],
  keywords: ['Absorptions-Entfeuchter', 'Sorptionsentfeuchter', 'Entfeuchtung'],
  svg:
    rect(0, 0, 10, 10) +
    path('M0 2.75L2.75 0M7.25 0L10 2.75M0 7.25L2.75 10M7.25 10L10 7.25') +
    path('M4.1 0V10M5.8 0V10', " stroke-dasharray='1.4 0.9'"),
});

// --- Ventilator ----------------------------------------------------------------------------------------
const fan = circle(5, 5, 5) + path('M2.45 0.7V9.3L10 5Z');
def('air/fan.json', {
  id: 'air.fan',
  name: 'Ventilator',
  size: [10, 10],
  prefix: 'VE',
  ports: inOut(10, 10),
  labelAnchor: [5, -1.5],
  props: ['V', 'dp', 'P'],
  keywords: ['Lüfter', 'fan', 'Zuluftventilator', 'Abluftventilator'],
  text: { at: [5.2, 5], size: 2, align: 'middle', value: '' },
  variants: [
    { id: 'standard', name: 'Ventilator', svg: fan },
    {
      id: 'ec',
      name: 'EC-Ventilator',
      svg: fan,
      text: { at: [5.2, 5], size: 2, align: 'middle', value: 'EC' },
      keywords: ['EC-Motor'],
    },
  ],
});

// --- Volumenstromregler --------------------------------------------------------------------------------
const vsr =
  rect(0, 0, 7.5, 5) + path('M0 1.8H7.5M0 3.2H7.5M1.2 1.8A2.55 1.6 0 0 1 6.3 1.8M1.2 3.2A2.55 1.6 0 0 0 6.3 3.2');
for (const [file, id, name, hidden] of [
  ['air/vav.json', 'air.vav', 'Volumenstromregler', false],
  ['air/cav.json', 'air.cav', 'Volumenstromregler (konstant)', true],
]) {
  def(file, {
    id,
    name,
    ...(hidden ? { hidden: true } : {}),
    size: [7.5, 5],
    prefix: 'VR',
    ports: inOut(7.5, 5),
    labelAnchor: [3.75, -1.5],
    props: ['V'],
    keywords: ['VVS', 'KVS', 'VAV', 'CAV', 'Volumenstromregler'],
    svg: vsr,
  });
}

// --- Tropfenabscheider, Einbauteil ---------------------------------------------------------------------
def('air/droplet.json', {
  id: 'air.droplet',
  name: 'Tropfenabscheider',
  size: [5, 10],
  prefix: 'TA',
  ports: inOut(5, 10),
  labelAnchor: [2.5, -1.5],
  props: [],
  keywords: ['Tropfenabscheider', 'Abscheider'],
  svg: rect(0, 0, 5, 10) + path('M2.5 0V10', " stroke-dasharray='1.2 0.8'") + path('M0 8.4L2.5 10L5 8.4'),
});
def('air/part.json', {
  id: 'air.part',
  name: 'Einbauteil',
  size: [10, 10],
  prefix: 'EB',
  ports: inOut(10, 10),
  labelAnchor: [5, -1.5],
  props: [],
  keywords: ['Einbauteil', 'Leerteil', 'Kammer'],
  text: { at: [5, 5], size: 2, align: 'middle', value: '' },
  variants: [
    { id: 'einbau', name: 'Einbauteil', svg: rect(0, 0, 10, 10) },
    {
      id: 'leer',
      name: 'Leerteil',
      size: [5, 10],
      ports: inOut(5, 10),
      labelAnchor: [2.5, -1.5],
      text: { at: [2.5, 5], size: 1.5, align: 'middle', value: '' },
      svg: rect(0, 0, 5, 10),
    },
  ],
});

// --- Pfeile (Auslass, Einlass) -------------------------------------------------------------------------
function arrowOut(filled, triple) {
  if (!triple) return path('M0 2.5H11.25') + head([0, 2.5], [15, 2.5], 3.75, 1.25, filled).svg;
  let s = '';
  for (const tip of [
    [13.5, 2],
    [15, 10],
    [13.5, 18],
  ]) {
    const h = head([0, 10], tip, 3.4, 1.15, filled);
    s += path(P([[0, 10], h.base])) + h.svg;
  }
  return s;
}
def('air/arrow-out.json', {
  id: 'air.arrow.out',
  name: 'Luftauslass (Pfeil)',
  size: [15, 5],
  prefix: 'LA',
  ports: [W('in', [0, 2.5])],
  labelAnchor: [7.5, -1.5],
  props: ['V'],
  keywords: ['Pfeil Auslass', 'Auslass', 'Zuluft', 'Raum'],
  variants: [
    { id: 'einzel', name: 'Pfeil Auslass einzel', svg: arrowOut(false, false) },
    { id: 'einzel-voll', name: 'Pfeil Auslass einzel gefüllt', svg: arrowOut(true, false) },
    {
      id: 'drei',
      name: 'Pfeil Auslass dreifach',
      size: [15, 20],
      ports: [W('in', [0, 10])],
      labelAnchor: [7.5, -1.5],
      svg: arrowOut(false, true),
    },
    {
      id: 'drei-voll',
      name: 'Pfeil Auslass dreifach gefüllt',
      size: [15, 20],
      ports: [W('in', [0, 10])],
      labelAnchor: [7.5, -1.5],
      svg: arrowOut(true, true),
    },
  ],
});
const zig = path('M0 5H4.1L4.75 1.4L6 8.7L6.6 5H11.25');
def('air/arrow-in.json', {
  id: 'air.arrow.in',
  name: 'Lufteinlass (Pfeil)',
  size: [15, 10],
  prefix: 'LE',
  ports: [E('out', [15, 5])],
  labelAnchor: [7.5, -1.5],
  props: ['V'],
  keywords: ['Pfeil Einlass', 'Einlass', 'Abluft', 'Raum'],
  variants: [
    { id: 'offen', name: 'Pfeil Einlass', svg: zig + head([0, 5], [15, 5], 3.75, 1.85, false).svg },
    { id: 'voll', name: 'Pfeil Einlass gefüllt', svg: zig + head([0, 5], [15, 5], 3.75, 1.85, true).svg },
  ],
});

// --- MSR -----------------------------------------------------------------------------------------------
const ctrl = (file, d) => defs.push({ file, d: { category: 'control', norm: '', checked: false, ...d } });
const stemmed = (shape) =>
  (shape === 'circle' ? circle(2.5, 2.5, 1.75) : rect(0.75, 0.75, 3.5, 3.5)) + path('M2.5 4.25V7.5');
const sensorBase = {
  size: [5, 7.5],
  ports: [sig('sig', [5, 2.5], 'E')],
  obstacle: [0, 0, 5, 4.5],
  labelAnchor: [4.5, -0.5],
  labelAlign: 'start',
  props: [],
};
const letter = (v, size = 1.6) => ({ at: [2.5, 2.5], size, align: 'middle', value: v });
const sensorVariants = (shape, list) =>
  list.map(([id, name, value, prefix, size]) => ({ id, name, prefix, svg: stemmed(shape), text: letter(value, size) }));
ctrl('control/sensor.json', {
  id: 'control.sensor',
  name: 'Fühler',
  ...sensorBase,
  prefix: 'TT',
  text: letter('T'),
  keywords: ['Fühler', 'Sensor', 'Messfühler'],
  variants: sensorVariants('circle', [
    ['t', 'Temperaturfühler', 'T', 'TT'],
    ['rf', 'Feuchtefühler (relativ)', 'r.F.', 'MT', 1.2],
    ['x', 'Feuchtefühler (absolut)', 'X', 'MT'],
    ['p', 'Druckfühler', 'p', 'PT'],
    ['n', 'Drehzahlmesser', 'n', 'ST'],
    ['v', 'Luftgeschwindigkeitsfühler', 'V', 'FT'],
    ['q', 'Luftqualitätsfühler', 'Q', 'QT'],
  ]),
});
ctrl('control/switch.json', {
  id: 'control.switch',
  name: 'Wächter',
  ...sensorBase,
  prefix: 'TS',
  text: letter('T'),
  keywords: ['Wächter', 'Schalter', 'Grenzwertgeber'],
  variants: sensorVariants('square', [
    ['t', 'Thermostat', 'T', 'TS'],
    ['rf', 'Hygrostat', 'r.F.', 'MS', 1.2],
    ['p', 'Pressostat', 'p', 'PS'],
    ['n', 'Drehzahlwächter', 'n', 'SS'],
    ['sw', 'Strömungswächter', 'Sw', 'FS', 1.4],
  ]),
});
// Legacy sensor types (older files): same drawing, not offered in the palette.
for (const [file, id, name, value, prefix] of [
  ['control/sensor-t.json', 'control.sensor.t', 'Temperaturfühler', 'T', 'TT'],
  ['control/sensor-rh.json', 'control.sensor.rh', 'Feuchtefühler', 'r.F.', 'MT'],
  ['control/sensor-p.json', 'control.sensor.p', 'Druckfühler', 'p', 'PT'],
  ['control/sensor-co2.json', 'control.sensor.co2', 'CO₂-Fühler', 'CO₂', 'QT'],
  ['control/sensor-voc.json', 'control.sensor.voc', 'VOC-Fühler', 'VOC', 'QT'],
])
  ctrl(file, {
    id,
    name,
    hidden: true,
    ...sensorBase,
    prefix,
    keywords: ['Fühler'],
    text: letter(value, value.length > 2 ? 1.1 : 1.6),
    svg: stemmed('circle'),
  });
ctrl('control/sensor-room.json', {
  id: 'control.sensor.room',
  name: 'Raumfühler',
  size: [5, 5],
  prefix: 'TT',
  ports: [sig('sig', [5, 2.5], 'E')],
  labelAnchor: [5.5, 1],
  labelAlign: 'start',
  props: [],
  keywords: ['Raumtemperaturfühler', 'Raumthermostat', 'Luftqualität', 'CO₂'],
  text: { at: [2.5, 2.5], size: 1.8, align: 'middle', value: 'RT' },
  variants: [
    { id: 'rt', name: 'Raumtemperaturfühler', svg: circle(2.5, 2.5, 2.4) },
    {
      id: 'q',
      name: 'Luftqualitätsfühler (Raum)',
      prefix: 'QT',
      svg: circle(2.5, 2.5, 2.4),
      text: { at: [2.5, 2.5], size: 1.8, align: 'middle', value: 'Q' },
    },
    { id: 'thermostat', name: 'Raumthermostat', prefix: 'TS', svg: rect(0.25, 0.25, 4.5, 4.5) },
  ],
});
ctrl('control/sensor-outdoor.json', {
  id: 'control.sensor.outdoor',
  name: 'Aussentemperaturfühler',
  size: [7.5, 10],
  prefix: 'TT',
  ports: [sig('sig', [7.5, 5], 'E')],
  labelAnchor: [4.75, 1],
  props: [],
  keywords: ['Aussenfühler', 'AT', 'Witterung'],
  text: { at: [4.85, 5], size: 1.8, align: 'middle', value: 'AT' },
  svg: path('M2.5 0V10') + hatch(0, 0, 2.5, 10, 1.25) + circle(4.85, 5, 2.3),
});
ctrl('control/sensor-dp.json', {
  id: 'control.sensor.dp',
  name: 'Differenzdruckfühler',
  size: [10, 10],
  prefix: 'PDT',
  ports: [sig('sig', [5, 0], 'N')],
  obstacle: [0, 0, 10, 4.5],
  labelAnchor: [7, -0.5],
  labelAlign: 'start',
  props: [],
  keywords: ['Differenzdruck', 'Δp', 'Filterüberwachung'],
  text: { at: [5, 2.5], size: 1.4, align: 'middle', value: 'Δp' },
  variants: [
    { id: 'fuehler', name: 'Differenzdruckfühler', svg: circle(5, 2.5, 1.75) + path('M0 10V2.5H3.25M6.75 2.5H10V10') },
    {
      id: 'waechter',
      name: 'Differenzdruckwächter',
      prefix: 'PDS',
      svg: rect(3.25, 0.75, 3.5, 3.5) + path('M0 10V2.5H3.25M6.75 2.5H10V10'),
    },
  ],
});
ctrl('control/frost.json', {
  id: 'control.frost',
  name: 'Frostschutzthermostat',
  size: [2.5, 15],
  prefix: 'TSA',
  ports: [sig('sig', [2.5, 12.5], 'E')],
  labelAnchor: [3, 1],
  labelAlign: 'start',
  props: [],
  keywords: ['Frostschutz', 'FS', 'Frostwächter'],
  text: { at: [1.25, 13.75], size: 1.1, align: 'middle', value: 'FS' },
  svg: rect(0, 0, 2.5, 10) + path('M1.25 1V12.5') + rect(0, 12.5, 2.5, 2.5),
});
const motorBox = rect(0.75, 0.75, 3.5, 3.5) + circle(2.5, 2.5, 1.6) + text(2.5, 2.5, 1.5, 'M') + path('M2.5 4.25V7.5');
ctrl('control/actuator.json', {
  id: 'control.actuator',
  name: 'Antrieb',
  size: [5, 7.5],
  prefix: 'M',
  ports: [sig('sig', [5, 2.5], 'E')],
  labelAnchor: [4.5, -0.5],
  labelAlign: 'start',
  props: [],
  keywords: ['Motor', 'Stellantrieb', 'Klappenantrieb', 'Ventilantrieb'],
  text: { at: [5, 2.5], size: 1.4, align: 'start', value: '' },
  variants: [
    { id: 'motor', name: 'Motor', svg: motorBox },
    { id: 'auf-zu', name: 'Motor 1/0', svg: motorBox, text: { at: [5, 2.5], size: 1.4, align: 'start', value: '1/0' } },
    {
      id: 'stetig',
      name: 'Motor stetig',
      svg: motorBox,
      text: { at: [5, 2.5], size: 1.4, align: 'start', value: 'Stetig' },
    },
    { id: 'hand', name: 'Antrieb von Hand', prefix: 'HA', text: null, svg: path('M0.75 1H4.25M2.5 1V7.5') },
  ],
});
ctrl('control/vfd.json', {
  id: 'control.vfd',
  name: 'Frequenzumformer',
  size: [5, 7.5],
  prefix: 'FU',
  ports: [sig('sig', [5, 2.5], 'E')],
  labelAnchor: [4.5, -0.5],
  labelAlign: 'start',
  props: [],
  keywords: ['FU', 'Frequenzumrichter', 'Drehzahlregelung'],
  text: { at: [2.5, 2.5], size: 1.4, align: 'middle', value: 'FU' },
  svg: rect(0.75, 0.75, 3.5, 3.5) + path('M2.5 4.25V7.5'),
});
const dev = (inner) => rect(0, 0, 7.5, 5) + inner;
const set = head([-0.75, 5.5], [7.5, -0.75], 1.2, 0.45, true);
ctrl('control/device.json', {
  id: 'control.device',
  name: 'Regelgerät',
  size: [7.5, 5],
  prefix: 'RG',
  ports: [sig('si', [0, 2.5], 'W'), sig('so', [7.5, 2.5], 'E')],
  labelAnchor: [3.75, -1.5],
  props: [],
  keywords: ['Regler', 'Verstärker', 'Sollwertgeber', 'Schaltuhr', 'Wandler', 'MSR'],
  text: { at: [4.6, 2.5], size: 1.5, align: 'middle', value: '' },
  variants: [
    { id: 'regler', name: 'Regler', svg: dev(path('M0 0L2 2.5L0 5')) },
    { id: 'verstaerker', name: 'Verstärker', prefix: 'VS', text: null, svg: dev(path('M2.6 1.2V3.8L5.2 2.5Z')) },
    {
      id: 'sollwert',
      name: 'Sollwertgeber',
      prefix: 'SG',
      text: null,
      bounds: [-0.75, -0.75, 8.25, 6.25],
      svg: dev(path(P([[-0.75, 5.5], set.base])) + set.svg),
    },
    {
      id: 'uhr',
      name: 'Schaltuhr',
      prefix: 'SU',
      text: null,
      svg: dev(circle(3.75, 2.5, 1.6) + path('M3.75 1.3V2.5H4.95')),
    },
    {
      id: 'wandler',
      name: 'Wandler',
      prefix: 'WA',
      text: null,
      svg: dev(path('M0 5L7.5 0M5.3 4.2Q5.7 3.6 6.1 4.2Q6.5 4.8 6.9 4.2')),
    },
  ],
});

// --- Write ---------------------------------------------------------------------------------------------
function fmt(v, ind = '') {
  if (Array.isArray(v) && v.every((x) => typeof x !== 'object' || x === null)) return JSON.stringify(v);
  if (Array.isArray(v) && v.every((x) => Array.isArray(x))) return JSON.stringify(v);
  const next = ind + '  ';
  if (Array.isArray(v)) return `[\n${v.map((x) => next + fmt(x, next)).join(',\n')}\n${ind}]`;
  if (v && typeof v === 'object') {
    const e = Object.entries(v).filter(([, x]) => x !== undefined);
    const one = `{ ${e.map(([k, x]) => `${JSON.stringify(k)}: ${JSON.stringify(x)}`).join(', ')} }`;
    if (one.length < 110 && !e.some(([k]) => k === 'svg')) return one;
    return `{\n${e.map(([k, x]) => `${next}${JSON.stringify(k)}: ${fmt(x, next)}`).join(',\n')}\n${ind}}`;
  }
  return JSON.stringify(v);
}
for (const { file, d } of defs) {
  const out = { ...d };
  // The base drawing is the first variant's (previews, older code).
  if (out.variants && !out.svg) out.svg = out.variants[0].svg;
  const order = [
    'id',
    'name',
    'category',
    'norm',
    'checked',
    'hidden',
    'size',
    'prefix',
    'ports',
    'flow',
    'obstacle',
    'bounds',
    'labelAnchor',
    'labelAlign',
    'props',
    'keywords',
    'text',
    'svg',
    'variants',
  ];
  const o = {};
  for (const k of order) if (k in out) o[k] = out[k];
  for (const k of Object.keys(out)) if (!(k in o)) o[k] = out[k];
  await writeFile(join(DIR, file), fmt(o) + '\n');
}
console.log(`${defs.length} symbol files written`);
