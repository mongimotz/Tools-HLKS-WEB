// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect } from 'react';
import { useEditor } from './store.ts';
import { Icon } from './icons.tsx';
import { EXAMPLES } from '../io/examples.ts';
import { loadStyleFile, resetStyle, setMono } from '../io/style.ts';

export interface ToolbarActions {
  newDoc(): void;
  open(): void;
  save(): void;
  saveAs(): void;
  exportAs(kind: 'pdf' | 'svg' | 'png'): void;
  tidy(): void;
  fit(): void;
  zoom(k: number): void;
  help(): void;
  example(id: string): void;
  setAutosave(on: boolean): void;
}

function closeMenu(e: React.MouseEvent) {
  (e.currentTarget as HTMLElement).closest('details')?.removeAttribute('open');
}

function B({
  icon,
  label,
  onClick,
  disabled,
  testid,
  keys,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  testid?: string;
  keys?: string;
}) {
  return (
    <button
      className="tb"
      onClick={onClick}
      disabled={disabled}
      title={keys ? `${label} (${keys})` : label}
      aria-label={label}
      data-testid={testid}
    >
      <Icon name={icon} />
    </button>
  );
}

const MOD = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Strg+';

export function Toolbar({ a }: { a: ToolbarActions }) {
  const st = useEditor();
  // Open menus close on a click elsewhere or Escape.
  useEffect(() => {
    const close = (e: Event) => {
      document.querySelectorAll('details.menu[open]').forEach((d) => {
        if (e instanceof KeyboardEvent ? e.key === 'Escape' : !d.contains(e.target as Node)) d.removeAttribute('open');
      });
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, []);
  return (
    <header className="toolbar">
      <div className="brand">
        <svg viewBox="0 0 32 32" width="22" height="22" aria-hidden="true">
          <path d="M4 20h7m10 0h7" stroke="currentColor" strokeWidth="2.5" />
          <circle cx="16" cy="20" r="5" fill="none" stroke="currentColor" strokeWidth="2.5" />
          <path d="M4 9h24" stroke="var(--accent)" strokeWidth="2.5" />
        </svg>
        <span>Prinzipschema</span>
      </div>
      <div className="tb-group">
        <B icon="new" label="Neu" onClick={a.newDoc} testid="btn-new" />
        <B icon="open" label="Öffnen" onClick={a.open} keys={`${MOD}O`} testid="btn-open" />
        <B
          icon="save"
          label={st.handle ? 'Speichern (in die Datei)' : 'Speichern'}
          onClick={a.save}
          keys={`${MOD}S`}
          testid="btn-save"
        />
        <select
          className="tb-select"
          aria-label="Beispiel laden"
          data-testid="examples"
          value=""
          onChange={(e) => {
            if (e.target.value) a.example(e.target.value);
          }}
        >
          <option value="">Beispiel laden</option>
          {EXAMPLES.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </div>
      <div className="tb-group">
        <B
          icon="undo"
          label="Rückgängig"
          onClick={st.undo}
          disabled={!st.past.length || !!st.proposal}
          keys={`${MOD}Z`}
          testid="btn-undo"
        />
        <B
          icon="redo"
          label="Wiederholen"
          onClick={st.redo}
          disabled={!st.future.length || !!st.proposal}
          keys={`${MOD}Y`}
          testid="btn-redo"
        />
      </div>
      <div className="tb-group">
        <button
          className="tb"
          title="Anmerkung (N)"
          aria-label="Anmerkung"
          aria-pressed={st.tool === 'note'}
          data-testid="btn-note"
          onClick={() => st.setTool(st.tool === 'note' ? 'select' : 'note')}
        >
          <Icon name="note" />
        </button>
        <button
          className="tb"
          title="Assistent"
          aria-label="Assistent"
          aria-pressed={st.panel === 'assistant'}
          data-testid="btn-assistant"
          onClick={() => st.setPanel(st.panel === 'assistant' ? 'props' : 'assistant')}
        >
          <Icon name="spark" />
        </button>
        <B icon="tidy" label="Aufräumen (nicht fixierte Elemente neu anordnen)" onClick={a.tidy} testid="btn-tidy" />
        <details className="menu" data-testid="export-menu">
          <summary className="tb" title="Exportieren" aria-label="Exportieren">
            <Icon name="export" />
          </summary>
          <div className="menu-list" role="menu">
            <button role="menuitem" data-testid="export-pdf" onClick={(e) => (closeMenu(e), a.exportAs('pdf'))}>
              PDF (Vektor, {st.doc.sheet.size} 1:1)
            </button>
            <button role="menuitem" data-testid="export-svg" onClick={(e) => (closeMenu(e), a.exportAs('svg'))}>
              SVG
            </button>
            <button role="menuitem" data-testid="export-png" onClick={(e) => (closeMenu(e), a.exportAs('png'))}>
              PNG (300 dpi)
            </button>
            <hr />
            <label className="menu-check">
              <input
                type="checkbox"
                checked={st.mono}
                data-testid="export-mono"
                onChange={(e) => setMono(e.target.checked)}
              />{' '}
              Schwarzweiss
            </label>
            <button role="menuitem" data-testid="style-load" onClick={(e) => (closeMenu(e), void loadStyleFile())}>
              Stilvorlage laden …
            </button>
            {st.styleName && (
              <button role="menuitem" title={st.styleName} onClick={(e) => (closeMenu(e), resetStyle())}>
                Standardstil ({st.styleName} entfernen)
              </button>
            )}
          </div>
        </details>
      </div>
      <div className="tb-group">
        <B icon="minus" label="Verkleinern" onClick={() => a.zoom(1 / 1.25)} keys="-" />
        <B icon="fit" label="Blatt einpassen" onClick={a.fit} keys="0" />
        <B icon="plus" label="Vergrössern" onClick={() => a.zoom(1.25)} keys="+" />
      </div>
      <div className="file-name" title={st.fileName}>
        {st.fileName}
        {st.dirty && (
          <span className="dirty" aria-label="ungespeicherte Änderungen">
            {' '}
            ●
          </span>
        )}
      </div>
      <div className="tb-group right">
        <B icon="help" label="Tastaturkürzel" onClick={a.help} keys="?" />
      </div>
    </header>
  );
}
