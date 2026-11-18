// SPDX-License-Identifier: AGPL-3.0-or-later
// Templates for "new": a starting point, written to the file as plain components and connections.
import type { Schema } from './types.ts';
import { emptySchema } from './create.ts';

export const TEMPLATES: Record<string, (title?: string) => Schema> = {
  empty: (title) => emptySchema(title),
  'ahu-basic': (title) => {
    const s = emptySchema(title ?? 'Lüftungsanlage');
    const c = (id: string, type: string, pos: [number, number], props: Record<string, string> = {}) => ({
      id,
      type,
      label: id,
      props,
      pos,
      rot: 0 as const,
      flip: false,
      pinned: false,
    });
    s.components = [
      c('KL01', 'air.damper.motor', [80, 150]),
      c('FI01', 'air.filter', [100, 150], { Klasse: 'ePM1 55%' }),
      c('ER01', 'air.heater', [120, 150]),
      c('VE01', 'air.fan', [140, 150], { V: '3000 m³/h' }),
    ];
    s.connections = [
      { id: 'c1', from: ['KL01', 'out'], to: ['FI01', 'in'], medium: 'air.outdoor', waypoints: [], pinned: false },
      { id: 'c2', from: ['FI01', 'out'], to: ['ER01', 'in'], medium: 'air.outdoor', waypoints: [], pinned: false },
      { id: 'c3', from: ['ER01', 'out'], to: ['VE01', 'in'], medium: 'air.supply', waypoints: [], pinned: false },
    ];
    return s;
  },
};
