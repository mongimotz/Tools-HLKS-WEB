// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useState } from 'react';
import { useEditor } from './store.ts';
import { Icon } from './icons.tsx';
import { EXAMPLES } from '../io/examples.ts';
import { currentTheme, loadStyleFile, resetStyle, setMono, setPaperDark, toggleTheme } from '../io/style.ts';
import type { SheetShow } from '../model/types.ts';

const SOURCE_URL = 'https://github.com/mongimotz/Tools-HLKS-WEB';

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

export function Toolbar({ a, symbolTab }: { a: ToolbarActions; symbolTab: boolean }) {
  const st = useEditor();
  const [theme, setTheme] = useState(currentTheme);
  const show = st.doc.sheet.show;
  const setShow = (k: keyof SheetShow, v: boolean) =>
    st.change('Anzeige', (d) => void (d.sheet.show = { ...d.sheet.show, [k]: v }));
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
      <a className="brand" href="../" title="Zur Startseite" data-testid="home">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path
            d="M5.5 13c2.2-3 4.3-3 6.5 0s4.3 3 6.5 0"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
        <span>HLKS-Tools</span>
      </a>
      <span className="app-title">Prinzipschema</span>
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
      {!symbolTab && (
        <>
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
            <B
              icon="tidy"
              label="Aufräumen (nicht fixierte Elemente neu anordnen)"
              onClick={a.tidy}
              testid="btn-tidy"
            />
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
            <details className="menu" data-testid="view-menu">
              <summary className="tb" title="Anzeige" aria-label="Anzeige">
                <Icon name="eye" />
              </summary>
              <div className="menu-list" role="menu">
                <label className="menu-check">
                  <input
                    type="checkbox"
                    checked={show.ids}
                    data-testid="show-ids"
                    onChange={(e) => setShow('ids', e.target.checked)}
                  />{' '}
                  Kennzeichnungen (H)
                </label>
                <label className="menu-check">
                  <input
                    type="checkbox"
                    checked={show.media}
                    data-testid="show-media"
                    onChange={(e) => setShow('media', e.target.checked)}
                  />{' '}
                  Medien (AUL, ZUL …)
                </label>
                <label className="menu-check">
                  <input
                    type="checkbox"
                    checked={show.values}
                    data-testid="show-values"
                    onChange={(e) => setShow('values', e.target.checked)}
                  />{' '}
                  Werte
                </label>
                <hr />
                <label className="menu-check">
                  <input
                    type="checkbox"
                    checked={st.paperDark}
                    data-testid="paper-dark"
                    onChange={(e) => setPaperDark(e.target.checked)}
                  />{' '}
                  Dunkles Papier
                </label>
              </div>
            </details>
          </div>
        </>
      )}
      <div className="tb-group right">
        <B icon="help" label="Tastaturkürzel" onClick={a.help} keys="?" />
        <a
          className="tb"
          href={SOURCE_URL}
          target="_blank"
          rel="noopener"
          title="Quellcode (AGPL)"
          aria-label="Quellcode"
        >
          <Icon name="code" />
        </a>
        <button
          className="tb"
          title={theme === 'dark' ? 'Dunkel' : 'Hell'}
          aria-label={theme === 'dark' ? 'Dunkel, zu Hell wechseln' : 'Hell, zu Dunkel wechseln'}
          data-testid="theme"
          onClick={() => setTheme(toggleTheme())}
        >
          <Icon name={theme === 'dark' ? 'moon' : 'sun'} />
        </button>
      </div>
    </header>
  );
}
