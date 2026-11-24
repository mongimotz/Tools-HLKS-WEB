// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Schema } from './types.ts';

function sharedProjectDefaults(): { project: string; author: string; date: string } {
  if (typeof localStorage === 'undefined') return { project: '', author: '', date: '' };
  try {
    const ctx = JSON.parse(localStorage.getItem('hlks-tools:project') || 'null') as {
      name?: string;
      author?: string;
      date?: string;
    } | null;
    const author = localStorage.getItem('hlks-tools:author') || '';
    return {
      project: typeof ctx?.name === 'string' ? ctx.name : '',
      author: typeof ctx?.author === 'string' && ctx.author ? ctx.author : author,
      date: typeof ctx?.date === 'string' ? ctx.date : '',
    };
  } catch {
    return { project: '', author: '', date: '' };
  }
}

export function emptySchema(title = 'Neues Prinzipschema', date?: string): Schema {
  const shared = sharedProjectDefaults();
  const effectiveDate = date ?? (shared.date || new Date().toISOString().slice(0, 10));
  return {
    format: 'hlks-schema',
    version: 1,
    meta: { title, project: shared.project, author: shared.author, date: effectiveDate, revision: 'A' },
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
