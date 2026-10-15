// SPDX-License-Identifier: AGPL-3.0-or-later
// Small DOM helpers shared by all tools: escaping templates, icons, toasts, dialogs, theme.

class Raw {
  constructor(s) {
    this.s = s;
  }
  toString() {
    return this.s;
  }
}

/** Mark a string as trusted HTML for the html`` template. */
export const raw = (s) => new Raw(String(s));

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function interp(v) {
  if (v == null || v === false) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(interp).join('');
  return esc(v);
}

/** Tagged template: interpolated values are escaped unless wrapped with raw() or produced by html``. */
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += interp(values[i]) + strings[i + 1];
  return raw(out);
}

// ---- icons ------------------------------------------------------------------

const ICONS = {
  catalog: '<path d="M8 4.5c-1.5-1-3.5-1.5-6-1v9c2.5-.5 4.5 0 6 1 1.5-1 3.5-1.5 6-1v-9c-2.5-.5-4.5 0-6 1z"/><path d="M8 4.5v9"/>',
  code: '<path d="M5.5 4.5 2 8l3.5 3.5M10.5 4.5 14 8l-3.5 3.5"/>',
  // PDF → DXF tool
  pdfToDxf: '<path d="M3.5 1.5h6l3 3v10h-9z"/><path d="M9.5 1.5v3h3"/><path d="m5.5 12 2-4 2 2 1.5-3"/>',
  fit: '<path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"/>',
  ruler: '<path d="m1.5 11 9.5-9.5 3.5 3.5L5 14.5z"/><path d="m4.5 8 1.5 1.5M6.5 6l1 1M8.5 4l1.5 1.5"/>',
  crop: '<path d="M4.5 1.5v10h10"/><path d="M1.5 4.5h10v10"/>',
  image: '<rect x="2" y="3" width="12" height="10" rx="1"/><path d="m2.5 11.5 3.5-3.5 3 3 2-2 2.5 2.5"/><circle cx="10.5" cy="6" r="1"/>',
  scan: '<path d="M2 5V2.5h2.5M11.5 2.5H14V5M14 11v2.5h-2.5M4.5 13.5H2V11"/><path d="M2 8h12"/>',
  back: '<path d="m10 3.5-4.5 4.5 4.5 4.5"/>',
  undo:'<path d="M6 4 3 7l3 3"/><path d="M3 7h7.5a3 3 0 0 1 0 6H8"/>',
  redo: '<path d="m10 4 3 3-3 3"/><path d="M13 7H5.5a3 3 0 0 0 0 6H8"/>',
  plus: '<path d="M8 3v10M3 8h10"/>',
  branch: '<path d="M4 2v12"/><path d="M4 7h4.5A2.5 2.5 0 0 1 11 9.5V14"/>',
  trash: '<path d="M3 4.5h10M6.5 4.5V3h3v1.5"/><path d="m4.5 4.5.7 8.5h5.6l.7-8.5"/>',
  copy: '<rect x="5.5" y="5.5" width="7.5" height="7.5" rx="1"/><path d="M10.5 5.5V3H3v7.5h2.5"/>',
  up: '<path d="M8 13V3M4 7l4-4 4 4"/>',
  down: '<path d="M8 3v10M4 9l4 4 4-4"/>',
  chevron: '<path d="m6 3.5 4.5 4.5L6 12.5"/>',
  open: '<path d="M2 4h4l1.5 1.5H14V13H2z"/>',
  save: '<path d="M8 2v8M5 7l3 3 3-3"/><path d="M3 13h10"/>',
  warning: '<path d="M8 2.2 14.5 13.5h-13z"/><path d="M8 6.5v3.2M8 11.6v.1"/>',
  error: '<circle cx="8" cy="8" r="6"/><path d="M8 4.8v3.8M8 10.9v.1"/>',
  info: '<circle cx="8" cy="8" r="6"/><path d="M8 7.2v4M8 5v.1"/>',
  check: '<path d="m3 8.5 3 3 7-7"/>',
  close: '<path d="m4 4 8 8M12 4l-8 8"/>',
  sun: '<circle cx="8" cy="8" r="3"/><path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1"/>',
  moon: '<path d="M13.2 9.6A5.6 5.6 0 0 1 6.4 2.8a5.6 5.6 0 1 0 6.8 6.8z"/>',
  reset: '<path d="M3 8a5 5 0 1 0 1.5-3.6"/><path d="M3 2.5v2.8h2.8"/>',
  jump: '<path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5"/>',
  more: '<circle cx="3.5" cy="8" r=".8" fill="currentColor"/><circle cx="8" cy="8" r=".8" fill="currentColor"/><circle cx="12.5" cy="8" r=".8" fill="currentColor"/>',
  home: '<path d="M2.5 7.5 8 3l5.5 4.5V13h-11z"/>',
  columns: '<rect x="2" y="3" width="12" height="10" rx="1"/><path d="M6.5 3v10M10.5 3v10"/>',
  pin: '<path d="M6 2.5h4M7 2.5v3.5L4.5 9h7L9 6V2.5M8 9v4.5"/>',
  search: '<circle cx="7" cy="7" r="4.5"/><path d="m10.5 10.5 3.5 3.5"/>',
  grip: '<g fill="currentColor" stroke="none"><circle cx="6" cy="4" r="1"/><circle cx="10" cy="4" r="1"/><circle cx="6" cy="8" r="1"/><circle cx="10" cy="8" r="1"/><circle cx="6" cy="12" r="1"/><circle cx="10" cy="12" r="1"/></g>',
  // sound path elements (silencer tool)
  source: '<path d="M2.5 6h2.5L8.5 3v10L5 10H2.5z"/><path d="M11 5.5a3.5 3.5 0 0 1 0 5M12.8 3.8a6 6 0 0 1 0 8.4"/>',
  component: '<rect x="2" y="4.5" width="12" height="7" rx="1"/><path d="m5.5 11.5 5-7"/>',
  silencer: '<rect x="2" y="3.5" width="12" height="9" rx="1"/><path d="M5.5 3.5v9M8 3.5v9M10.5 3.5v9"/>',
  receiver: '<circle cx="8" cy="4.5" r="2"/><path d="M4 14v-2.5a4 4 0 0 1 8 0V14"/>',
};

export function icon(name, { size = 16, label } = {}) {
  const a11y = label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true"';
  return raw(
    `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" ${a11y}>${ICONS[name] ?? ''}</svg>`,
  );
}

// ---- source link (AGPL-3.0, section 13) -------------------------------------

export const SOURCE_URL = 'https://github.com/mongimotz/Tools-HLKS-WEB';

/** One icon link to the source code in the app bar, before the theme button. Every page calls this once. */
export function mountSourceLink(parent = document.querySelector('.appbar-actions, .home-actions')) {
  if (document.getElementById('source-link') || !parent) return;
  const link = document.createElement('a');
  link.id = 'source-link';
  link.className = 'btn ghost icon-only no-print';
  link.href = SOURCE_URL;
  link.title = 'Quellcode (AGPL-3.0)';
  link.setAttribute('aria-label', 'Quellcode (AGPL-3.0)');
  link.innerHTML = String(icon('code'));
  const theme = parent.querySelector('#theme-toggle');
  if (theme) theme.before(link);
  else parent.prepend(link);
}

// ---- toasts -----------------------------------------------------------------

/**
 * Short status message. Optional action button (icon only), e.g. undo:
 * toast('Teilstrecke 3 gelöscht', { action: { icon: 'undo', label: 'Rückgängig', run: undo } })
 */
export function toast(message, { kind = 'info', timeout = 4500, action } = {}) {
  let region = document.getElementById('toast-region');
  if (!region) {
    region = document.createElement('div');
    region.id = 'toast-region';
    region.setAttribute('aria-live', 'polite');
    document.body.append(region);
  }
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  const kindIcon = kind === 'error' ? 'error' : kind === 'success' ? 'check' : kind === 'warning' ? 'warning' : 'info';
  el.innerHTML = `${icon(kindIcon)}<span>${esc(message)}</span>`;
  const remove = () => el.remove();
  if (action) {
    const b = document.createElement('button');
    b.className = 'toast-action';
    b.title = action.label;
    b.setAttribute('aria-label', action.label);
    b.innerHTML = String(icon(action.icon));
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      remove();
      action.run();
    });
    el.append(b);
  }
  region.append(el);
  el.addEventListener('click', remove);
  setTimeout(remove, timeout);
}

// ---- theme ------------------------------------------------------------------

const THEME_KEY = 'hlks-tools:theme';
const THEME_LABEL = { light: 'Farbschema: Hell', dark: 'Farbschema: Dunkel' };
const THEME_ICON = { light: 'sun', dark: 'moon' };

/** The stored choice, or null: then the page follows the system setting. */
function readTheme() {
  try {
    const theme = localStorage.getItem(THEME_KEY);
    return theme === 'light' || theme === 'dark' ? theme : null;
  } catch {
    return null;
  }
}

/** Wire a button that switches Hell ↔ Dunkel. Without a stored choice the system setting applies. The icon shows the current scheme. */
export function bindThemeToggle(button) {
  const systemDark = matchMedia('(prefers-color-scheme: dark)');
  let chosen = readTheme();
  if (chosen) document.documentElement.dataset.theme = chosen;
  else delete document.documentElement.dataset.theme;
  const current = () => chosen ?? (systemDark.matches ? 'dark' : 'light');
  const update = () => {
    const theme = current();
    button.innerHTML = String(icon(THEME_ICON[theme]));
    button.title = THEME_LABEL[theme];
    button.setAttribute('aria-label', THEME_LABEL[theme]);
  };
  update();
  systemDark.addEventListener('change', () => {
    if (!chosen) update();
  });
  button.addEventListener('click', () => {
    chosen = current() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = chosen;
    try {
      localStorage.setItem(THEME_KEY, chosen);
    } catch {
      /* ignore */
    }
    update();
  });
}
