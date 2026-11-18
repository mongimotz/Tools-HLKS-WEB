// SPDX-License-Identifier: AGPL-3.0-or-later
// Line icons, 20 × 20, stroke = currentColor.
import type { JSX } from 'react';

const P: Record<string, string> = {
  new: 'M5 2.5h7l3.5 3.5v11.5h-10.5zM12 2.5v3.5h3.5M10 9v6M7 12h6',
  open: 'M2.5 6v10.5h13l2-7h-13l-2 7M2.5 6V3.5h5l1.5 2h6v4',
  save: 'M3.5 3.5h10l3 3v10h-13zM6.5 3.5v4h6v-4M6.5 16.5v-5h7v5',
  undo: 'M7 5L3.5 8.5 7 12M3.5 8.5h8a4.5 4.5 0 010 9h-3',
  redo: 'M13 5l3.5 3.5L13 12M16.5 8.5h-8a4.5 4.5 0 000 9h3',
  tidy: 'M3 5h14M3 10h9M3 15h12M15 9l2 1-2 1',
  export: 'M10 3v10M6 9l4 4 4-4M3.5 13.5v3h13v-3',
  rotate: 'M15.5 9.5a5.5 5.5 0 11-2-4.3M15.5 3v3.5H12',
  flip: 'M10 2.5v15M8 5L3 15h5zM12 5l5 10h-5z',
  trash: 'M4 5.5h12M8 5.5V3.5h4v2M5.5 5.5l.8 11h7.4l.8-11',
  copy: 'M7 7h9.5v9.5H7zM13 7V3.5H3.5V13H7',
  group: 'M3 3h4M13 3h4M3 17h4M13 17h4M3 3v4M3 13v4M17 3v4M17 13v4M7 7h6v6H7z',
  fit: 'M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4',
  plus: 'M10 4v12M4 10h12',
  minus: 'M4 10h12',
  search: 'M8.5 3.5a5 5 0 110 10 5 5 0 010-10zM12.2 12.2l4.3 4.3',
  pin: 'M10 17.5v-5M6 12.5h8M7.5 12.5l.8-8h3.4l.8 8M6.5 4.5h7',
  help: 'M10 17.5a7.5 7.5 0 110-15 7.5 7.5 0 010 15zM7.8 7.8a2.3 2.3 0 114.1 1.4c-.9.8-1.9 1.3-1.9 2.6M10 14.2v.3',
  warn: 'M10 3l7.5 13.5h-15zM10 8.5v4M10 14.5v.3',
  note: 'M4 3.5h12v9.5h-6l-4 3.5v-3.5H4z',
  close: 'M5 5l10 10M15 5L5 15',
  check: 'M4 10.5l4 4 8-9',
  gear: 'M10 7a3 3 0 110 6 3 3 0 010-6zM10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4',
  spark:
    'M10 2.5l1.6 4.4 4.4 1.6-4.4 1.6L10 14.5l-1.6-4.4L4 8.5l4.4-1.6zM15.5 13l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z',
  chevron: 'M7.5 5l5 5-5 5',
};

export function Icon({
  name,
  title,
  size = 18,
}: {
  name: keyof typeof P | string;
  title?: string;
  size?: number;
}): JSX.Element {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title && <title>{title}</title>}
      <path d={P[name] ?? ''} />
    </svg>
  );
}
