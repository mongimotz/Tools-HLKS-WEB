// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Schema } from './types.ts';

export function emptySchema(title = 'Neues Prinzipschema', date = new Date().toISOString().slice(0, 10)): Schema {
  return {
    format: 'hlks-schema',
    version: 1,
    meta: { title, project: '', author: '', date, revision: 'A' },
    sheet: {
      size: 'A3',
      orientation: 'landscape',
      grid: 2.5,
      titleBlock: 'default',
      legend: true,
      show: { ids: true, media: true, values: true },
    },
    style: 'default',
    components: [],
    connections: [],
    groups: [],
    texts: [],
    notes: [],
    symbols: [],
  };
}
