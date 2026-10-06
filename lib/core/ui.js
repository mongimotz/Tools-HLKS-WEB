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
  undo: '<path d="M6 4 3 7l3 3"/><path d="M3 7h7.5a3 3 0 0 1 0 6H8"/>',
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
  theme: '<circle cx="8" cy="8" r="5.5"/><path d="M8 2.5v11a5.5 5.5 0 0 0 0-11z" fill="currentColor"/>',
  more: '<circle cx="3.5" cy="8" r=".8" fill="currentColor"/><circle cx="8" cy="8" r=".8" fill="currentColor"/><circle cx="12.5" cy="8" r=".8" fill="currentColor"/>',
  home: '<path d="M2.5 7.5 8 3l5.5 4.5V13h-11z"/>',
};

export function icon(name, { size = 16, label } = {}) {
  const a11y = label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true"';
  return raw(
    `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" ${a11y}>${ICONS[name] ?? ''}</svg>`,
  );
}

// ---- toasts -----------------------------------------------------------------

export function toast(message, { kind = 'info', timeout = 4500 } = {}) {
  let region = document.getElementById('toast-region');
  if (!region) {
    region = document.createElement('div');
    region.id = 'toast-region';
    region.setAttribute('aria-live', 'polite');
    document.body.append(region);
  }
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.innerHTML = `${icon(kind === 'error' ? 'error' : kind === 'success' ? 'check' : kind === 'warning' ? 'warning' : 'info')}<span>${esc(message)}</span>`;
  region.append(el);
  const remove = () => el.remove();
  el.addEventListener('click', remove);
  setTimeout(remove, timeout);
}

// ---- confirm dialog ---------------------------------------------------------

export function confirmDialog({ title, message, confirmLabel = 'OK', cancelLabel = 'Abbrechen', danger = false }) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'dialog';
    dlg.innerHTML = String(html`
      <form method="dialog">
        <h2>${title}</h2>
        ${message ? html`<p>${message}</p>` : ''}
        <div class="dialog-actions">
          <button class="btn" value="cancel">${cancelLabel}</button>
          <button class="btn ${danger ? 'danger' : 'primary'}" value="ok" autofocus>${confirmLabel}</button>
        </div>
      </form>`);
    document.body.append(dlg);
    dlg.addEventListener('close', () => {
      resolve(dlg.returnValue === 'ok');
      dlg.remove();
    });
    dlg.showModal();
  });
}

// ---- theme ------------------------------------------------------------------

const THEME_KEY = 'hlks-tools:theme';
const THEME_ORDER = ['system', 'light', 'dark'];
const THEME_LABEL = { system: 'Farbschema: System', light: 'Farbschema: Hell', dark: 'Farbschema: Dunkel' };

function readTheme() {
  try {
    return localStorage.getItem(THEME_KEY) || 'system';
  } catch {
    return 'system';
  }
}

function applyTheme(theme) {
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

/** Wire a button that cycles System → Hell → Dunkel. */
export function bindThemeToggle(button) {
  let theme = readTheme();
  applyTheme(theme);
  const update = () => {
    button.title = THEME_LABEL[theme];
    button.setAttribute('aria-label', THEME_LABEL[theme]);
  };
  update();
  button.addEventListener('click', () => {
    theme = THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length];
    applyTheme(theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* ignore */
    }
    update();
    toast(THEME_LABEL[theme]);
  });
}
