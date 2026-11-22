// SPDX-License-Identifier: AGPL-3.0-or-later
// Document tabs above the sheet: open schemas and own symbols. Middle click or × closes, + opens a new schema.
import { useEditor } from './store.ts';
import { closeTab, switchTab } from './tabs.ts';
import { Icon } from './icons.tsx';

export function TabBar({ onNew }: { onNew: () => void }) {
  const st = useEditor();
  return (
    <nav className="doc-tabs" aria-label="Offene Dokumente">
      <div role="tablist">
        {st.tabs.map((t, i) => (
          <div
            key={t.key}
            role="tab"
            tabIndex={0}
            aria-selected={t.key === st.active}
            className={`doc-tab${t.key === st.active ? ' active' : ''}${t.kind === 'symbol' ? ' symbol' : ''}`}
            title={`${t.title}${i < 9 ? ` (Alt+${i + 1})` : ''}`}
            data-testid={`doc-tab-${i}`}
            onClick={() => switchTab(t.key)}
            onAuxClick={(e) => e.button === 1 && closeTab(t.key)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') switchTab(t.key);
            }}
          >
            {t.kind === 'symbol' && <Icon name="pen" size={13} />}
            <span className="doc-tab-title">{t.title}</span>
            {(t.key === st.active ? st.dirty : t.dirty) && (
              <span className="dirty" aria-label="ungespeichert">
                ●
              </span>
            )}
            <button
              className="doc-tab-close"
              aria-label={`${t.title} schliessen`}
              title="Schliessen (Alt+W)"
              onClick={(e) => {
                e.stopPropagation();
                closeTab(t.key);
              }}
            >
              <Icon name="close" size={12} />
            </button>
          </div>
        ))}
      </div>
      <button
        className="tb small"
        title="Neues Schema (Alt+N)"
        aria-label="Neues Schema"
        data-testid="tab-new"
        onClick={onNew}
      >
        <Icon name="plus" size={14} />
      </button>
    </nav>
  );
}
