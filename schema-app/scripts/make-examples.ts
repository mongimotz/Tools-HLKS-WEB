// SPDX-License-Identifier: AGPL-3.0-or-later
// Builds the generic example schemas in examples/ with the same operations the CLI and the assistant use.
// Usage: npx tsx scripts/make-examples.ts
import { writeFileSync } from 'node:fs';
import { emptySchema } from '../src/model/create.ts';
import { serialize } from '../src/model/serialize.ts';
import { applyOps, parseOps } from '../src/ops/ops.ts';
import { validate } from '../src/model/validate.ts';

const DATE = '2026-11-18';

const EXAMPLES: Record<string, { title: string; ops: unknown[] }> = {
  'zu-abluft-einfach': {
    title: 'Einfache Zu- und Abluftanlage',
    ops: [
      {
        op: 'add_chain',
        strand: 'supply',
        items: [
          { id: 'AF01', type: 'air.intake' },
          { id: 'KL01', type: 'air.damper.motor' },
          { id: 'FI01', type: 'air.filter', props: { Klasse: 'ePM10 50%' } },
          { id: 'ER01', type: 'air.heater' },
          { id: 'VE01', type: 'air.fan', props: { V: '1200 m³/h' } },
          { id: 'SD01', type: 'air.silencer' },
          { id: 'TT01', type: 'control.sensor.t' },
          { id: 'ZD01', type: 'air.terminal.supply' },
        ],
      },
      {
        op: 'add_chain',
        strand: 'extract',
        items: [
          { id: 'AD01', type: 'air.terminal.extract' },
          { id: 'SD02', type: 'air.silencer' },
          { id: 'FI02', type: 'air.filter', props: { Klasse: 'ePM10 50%' } },
          { id: 'VE02', type: 'air.fan', props: { V: '1200 m³/h' } },
          { id: 'KL02', type: 'air.damper.motor' },
          { id: 'FA01', type: 'air.outlet' },
        ],
      },
    ],
  },
  'monoblock-platten-wrg': {
    title: 'Monoblock mit Platten-WRG',
    ops: [
      { op: 'add_component', id: 'WRG01', type: 'air.hrc.plate', props: { eta: 'η 75 %' } },
      {
        op: 'add_chain',
        strand: 'supply',
        items: [
          { id: 'AF01', type: 'air.intake' },
          { id: 'KL01', type: 'air.damper.motor' },
          { id: 'FI01', type: 'air.filter', props: { Klasse: 'ePM1 55%' } },
          'WRG01.a',
          { id: 'ER01', type: 'air.heater' },
          { id: 'VE01', type: 'air.fan', props: { V: '4000 m³/h' } },
          { id: 'SD01', type: 'air.silencer' },
          { id: 'TT01', type: 'control.sensor.t' },
          { id: 'ZD01', type: 'air.terminal.supply' },
        ],
      },
      {
        op: 'add_chain',
        strand: 'extract',
        items: [
          { id: 'AD01', type: 'air.terminal.extract' },
          { id: 'SD02', type: 'air.silencer' },
          { id: 'FI02', type: 'air.filter', props: { Klasse: 'ePM10 50%' } },
          { id: 'VE02', type: 'air.fan', props: { V: '4000 m³/h' } },
          'WRG01.b',
          { id: 'KL02', type: 'air.damper.motor' },
          { id: 'FA01', type: 'air.outlet' },
        ],
      },
      {
        op: 'group',
        id: 'G1',
        label: 'Monoblock',
        members: ['KL01', 'FI01', 'WRG01', 'ER01', 'VE01', 'FI02', 'VE02', 'KL02'],
      },
    ],
  },
  'monoblock-rotor-erhitzer-kuehler': {
    title: 'Monoblock mit Rotor, Erhitzer und Kühler',
    ops: [
      { op: 'add_component', id: 'WRG01', type: 'air.hrc.rotor', props: { eta: 'η 80 %' } },
      {
        op: 'add_chain',
        strand: 'supply',
        items: [
          { id: 'AF01', type: 'air.intake' },
          { id: 'KL01', type: 'air.damper.motor' },
          { id: 'FI01', type: 'air.filter', props: { Klasse: 'ePM1 55%' } },
          'WRG01.a',
          { id: 'ER01', type: 'air.heater' },
          { id: 'KU01', type: 'air.cooler' },
          { id: 'TA01', type: 'air.droplet' },
          { id: 'VE01', type: 'air.fan', props: { V: '6000 m³/h' } },
          { id: 'TT01', type: 'control.sensor.t' },
          { id: 'MT01', type: 'control.sensor.rh' },
          { id: 'ZD01', type: 'air.terminal.supply' },
        ],
      },
      {
        op: 'add_chain',
        strand: 'extract',
        items: [
          { id: 'AD01', type: 'air.terminal.extract' },
          { id: 'QT01', type: 'control.sensor.co2' },
          { id: 'FI02', type: 'air.filter', props: { Klasse: 'ePM10 50%' } },
          { id: 'VE02', type: 'air.fan', props: { V: '6000 m³/h' } },
          'WRG01.b',
          { id: 'KL02', type: 'air.damper.motor' },
          { id: 'FA01', type: 'air.outlet' },
        ],
      },
      {
        op: 'group',
        id: 'G1',
        label: 'Monoblock',
        members: ['KL01', 'FI01', 'WRG01', 'ER01', 'KU01', 'TA01', 'VE01', 'FI02', 'VE02', 'KL02'],
      },
    ],
  },
  'kvs-system': {
    title: 'Zu- und Abluftgerät mit KVS-System',
    ops: [
      {
        op: 'add_chain',
        strand: 'supply',
        items: [
          { id: 'AF01', type: 'air.intake' },
          { id: 'KL01', type: 'air.damper.motor' },
          { id: 'FI01', type: 'air.filter', props: { Klasse: 'ePM1 55%' } },
          { id: 'KVS01', type: 'air.hrc.coil' },
          { id: 'ER01', type: 'air.heater' },
          { id: 'VE01', type: 'air.fan', props: { V: '3000 m³/h' } },
          { id: 'ZD01', type: 'air.terminal.supply' },
        ],
      },
      {
        op: 'add_chain',
        strand: 'extract',
        items: [
          { id: 'AD01', type: 'air.terminal.extract' },
          { id: 'FI02', type: 'air.filter', props: { Klasse: 'ePM10 50%' } },
          { id: 'VE02', type: 'air.fan', props: { V: '3000 m³/h' } },
          { id: 'KVS02', type: 'air.hrc.coil' },
          { id: 'KL02', type: 'air.damper.motor' },
          { id: 'FA01', type: 'air.outlet' },
        ],
      },
      { op: 'connect', from: 'KVS02.p1', to: 'KVS01.p2', medium: 'water.hrc' },
      { op: 'connect', from: 'KVS01.p1', to: 'KVS02.p2', medium: 'water.hrc' },
      { op: 'relayout_unpinned' },
      { op: 'group', id: 'G1', label: 'Zuluftgerät', members: ['KL01', 'FI01', 'KVS01', 'ER01', 'VE01'] },
      { op: 'group', id: 'G2', label: 'Abluftgerät', members: ['FI02', 'VE02', 'KVS02', 'KL02'] },
    ],
  },
  heizgruppe: {
    title: 'Heizgruppe mit Beimischung',
    ops: [
      { op: 'add_component', id: 'WE01', type: 'water.boiler', props: { Q: '120 kW', Art: 'Gas' } },
      {
        op: 'add_chain',
        strand: 'supply',
        medium: 'water.heat.flow',
        after: 'WE01.out',
        items: [
          { id: 'AV01', type: 'water.valve' },
          { id: 'MV01', type: 'water.valve.3way' },
          { id: 'UP01', type: 'water.pump', props: { V: '5.2 m³/h' } },
          { id: 'HK01', type: 'water.radiator', props: { Q: '120 kW' } },
        ],
      },
      {
        op: 'add_chain',
        strand: 'extract',
        medium: 'water.heat.return',
        after: 'HK01.out',
        items: [
          { id: 'SR01', type: 'water.valve.balancing' },
          { id: 'AV02', type: 'water.valve' },
        ],
      },
      { op: 'connect', id: 'L90', from: 'AV02.out', to: 'WE01.in', medium: 'water.heat.return' },
      { op: 'insert_into_connection', connection: 'L06', type: 'junction', id: 'J01', in: 'e', out: 'w' },
      { op: 'connect', from: 'J01.n', to: 'MV01.b', medium: 'water.heat.return' },
      { op: 'add_component', id: 'AG01', type: 'water.expansion' },
      { op: 'insert_into_connection', connection: 'L90', type: 'junction', id: 'J02', in: 'e', out: 'w' },
      { op: 'connect', from: 'J02.n', to: 'AG01.p', medium: 'water.heat.return' },
      { op: 'relayout_unpinned' },
    ],
  },
  'vvs-3-zonen': {
    title: 'Anlage mit VVS-Reglern für 3 Zonen',
    ops: [
      {
        op: 'add_chain',
        strand: 'supply',
        items: [
          { id: 'AF01', type: 'air.intake' },
          { id: 'KL01', type: 'air.damper.motor' },
          { id: 'FI01', type: 'air.filter', props: { Klasse: 'ePM1 55%' } },
          { id: 'ER01', type: 'air.heater' },
          { id: 'VE01', type: 'air.fan', props: { V: '2400 m³/h' } },
          { id: 'PT01', type: 'control.sensor.p' },
          { id: 'J1', type: 'junction', label: '' },
          { id: 'J2', type: 'junction', label: '' },
          { id: 'VR03', type: 'air.vav', props: { V: '800 m³/h' } },
          { id: 'ZD03', type: 'air.terminal.supply', label: 'Zone 3' },
        ],
        // junction ports: chain goes in at "w", out at "e"
      },
    ],
  },
};

// The chain helper uses "in"/"out"; junctions have n/e/s/w. Build the VVS example from plain ops instead.
EXAMPLES['vvs-3-zonen']!.ops = [
  {
    op: 'add_chain',
    strand: 'supply',
    items: [
      { id: 'AF01', type: 'air.intake' },
      { id: 'KL01', type: 'air.damper.motor' },
      { id: 'FI01', type: 'air.filter', props: { Klasse: 'ePM1 55%' } },
      { id: 'ER01', type: 'air.heater' },
      { id: 'VE01', type: 'air.fan', props: { V: '2400 m³/h' } },
      { id: 'PT01', type: 'control.sensor.p' },
      { id: 'SD01', type: 'air.silencer' },
    ],
  },
  { op: 'add_component', id: 'J1', type: 'junction', label: '' },
  { op: 'add_component', id: 'J2', type: 'junction', label: '' },
  { op: 'connect', from: 'SD01.out', to: 'J1.w', medium: 'air.supply' },
  { op: 'connect', from: 'J1.e', to: 'J2.w', medium: 'air.supply' },
  ...[1, 2, 3].flatMap((z) => [
    { op: 'add_component', id: `VR0${z}`, type: 'air.vav', props: { V: '800 m³/h' } },
    { op: 'add_component', id: `ZD0${z}`, type: 'air.terminal.supply', label: `ZD0${z}` },
    { op: 'add_component', id: `QT0${z}`, type: 'control.sensor.co2', label: `QT0${z}`, pos: [0, 0] },
    { op: 'connect', from: `VR0${z}.out`, to: `ZD0${z}.in`, medium: 'air.supply' },
  ]),
  { op: 'connect', from: 'J1.s', to: 'VR01.in', medium: 'air.supply' },
  { op: 'connect', from: 'J2.s', to: 'VR02.in', medium: 'air.supply' },
  { op: 'connect', from: 'J2.e', to: 'VR03.in', medium: 'air.supply' },
  ...[1, 2, 3].map((z) => ({ op: 'remove', id: `QT0${z}` })),
  { op: 'relayout_unpinned' },
];

for (const [name, ex] of Object.entries(EXAMPLES)) {
  const base = emptySchema(ex.title, DATE);
  base.meta.project = 'Beispiel';
  base.meta.author = 'HLKS-Tools';
  const r = applyOps(base, parseOps(ex.ops));
  const issues = validate(r.schema);
  writeFileSync(new URL(`../examples/${name}.schema`, import.meta.url), serialize(r.schema));
  console.log(
    `${name}: ${issues.filter((i) => i.severity === 'error').length} Fehler, ${issues.filter((i) => i.severity === 'warning').length} Warnungen${r.suggestion ? ` | ${r.suggestion}` : ''}`,
  );
  for (const i of issues) console.log(`   ${i.severity} ${i.message}`);
}
