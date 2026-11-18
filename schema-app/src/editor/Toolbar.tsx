// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEditor } from './store.ts';
import { Icon } from './icons.tsx';
import { EXAMPLES } from '../io/examples.ts';

export interface ToolbarActions {
  newDoc(): void;
  open(): void;
  save(): void;
  exportSvg(): void;
  tidy(): void;
  fit(): void;
  zoom(k: number): void;
  help(): void;
  example(id: string): void;
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
        <B icon="save" label="Speichern" onClick={a.save} keys={`${MOD}S`} testid="btn-save" />
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
          disabled={!st.past.length}
          keys={`${MOD}Z`}
          testid="btn-undo"
        />
        <B
          icon="redo"
          label="Wiederholen"
          onClick={st.redo}
          disabled={!st.future.length}
          keys={`${MOD}Y`}
          testid="btn-redo"
        />
      </div>
      <div className="tb-group">
        <B icon="tidy" label="Aufräumen (nicht fixierte Elemente neu anordnen)" onClick={a.tidy} testid="btn-tidy" />
        <B icon="export" label="Als SVG exportieren" onClick={a.exportSvg} testid="btn-export" />
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
