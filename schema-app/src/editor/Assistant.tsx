// SPDX-License-Identifier: AGPL-3.0-or-later
// Assistant tab: OpenRouter settings, task (free text or open notes), progress, result as preview to apply/discard.
import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { useEditor } from './store.ts';
import { Icon } from './icons.tsx';
import { clearKey, DEFAULT_MODEL, loadSettings, saveSettings, type AssistantSettings } from '../assistant/settings.ts';
import { listModels, type Usage } from '../assistant/client.ts';
import { diffSchemas, MAX_ROUNDS, runAssistant } from '../assistant/run.ts';
import { notesTask } from '../assistant/prompt.ts';

interface RunState {
  busy: boolean;
  round: number;
  task: string;
  result: { summary: string; ops: number; usage: Usage; status: 'ok' | 'nochange' | 'aborted' } | null;
  error: string | null;
  abort: AbortController | null;
}

/** Run state survives switching tabs. */
export const useAssistant = create<RunState>(() => ({
  busy: false,
  round: 0,
  task: '',
  result: null,
  error: null,
  abort: null,
}));

export async function startRun(task: string, settings: AssistantSettings) {
  const st = useEditor.getState();
  const abort = new AbortController();
  useAssistant.setState({ busy: true, round: 0, result: null, error: null, abort });
  st.setProposal(null);
  try {
    const r = await runAssistant({
      doc: st.doc,
      task,
      settings,
      signal: abort.signal,
      onRound: (round) => useAssistant.setState({ round }),
    });
    useAssistant.setState({
      result: { summary: r.summary, ops: r.ops.length, usage: r.usage, status: r.status },
    });
    if (r.status === 'ok')
      useEditor.getState().setProposal({ base: r.base, schema: r.schema, ...diffSchemas(r.base, r.schema) });
  } catch (e) {
    const err = e as Error;
    useAssistant.setState({ error: err.name === 'AbortError' ? 'Abgebrochen.' : err.message });
  } finally {
    useAssistant.setState({ busy: false, abort: null });
  }
}

function usageText(u: Usage): string {
  if (!u.prompt && !u.completion) return '';
  const tokens = `${u.prompt.toLocaleString('de-CH')} + ${u.completion.toLocaleString('de-CH')} Tokens`;
  return u.cost !== null ? `${tokens} | ${u.cost.toFixed(4)} USD` : tokens;
}

export function AssistantPanel() {
  const st = useEditor();
  const run = useAssistant();
  const [settings, setSettings] = useState(loadSettings);
  const [showSettings, setShowSettings] = useState(!settings.apiKey);
  const openNotes = st.doc.notes.filter((n) => n.status === 'open').length;
  const p = st.proposal;
  const ready = !!settings.apiKey && !run.busy;

  return (
    <section className="assistant">
      <div className="assistant-head">
        <h2>Assistent</h2>
        <button
          className="tb"
          title="Einstellungen"
          aria-label="Einstellungen"
          aria-expanded={showSettings}
          data-testid="assistant-settings"
          onClick={() => setShowSettings(!showSettings)}
        >
          <Icon name="gear" />
        </button>
      </div>
      {showSettings && (
        <SettingsForm
          value={settings}
          onSave={(s) => {
            saveSettings(s);
            setSettings(loadSettings());
            if (s.apiKey) setShowSettings(false);
          }}
          onClearKey={() => {
            clearKey();
            setSettings(loadSettings());
          }}
        />
      )}
      <label className="field">
        <span>Auftrag</span>
        <textarea
          rows={4}
          value={run.task}
          placeholder="z. B. Monoblock mit Rotor-WRG, ePM1-Filter, Erhitzer und Kühler"
          data-testid="assistant-task"
          onChange={(e) => useAssistant.setState({ task: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && ready && run.task.trim())
              void startRun(run.task.trim(), settings);
          }}
        />
      </label>
      <div className="row-buttons">
        <button
          className="primary"
          disabled={!ready || !run.task.trim() || !!p}
          data-testid="assistant-run"
          onClick={() => void startRun(run.task.trim(), settings)}
        >
          Ausführen
        </button>
        <button
          disabled={!ready || !openNotes || !!p}
          data-testid="assistant-notes"
          onClick={() => void startRun(notesTask(st.doc), settings)}
        >
          <Icon name="note" /> Anmerkungen abarbeiten ({openNotes})
        </button>
      </div>
      {run.busy && (
        <div className="assistant-status" role="status" data-testid="assistant-busy">
          <span className="spinner" aria-hidden="true" />
          Runde {run.round} von {MAX_ROUNDS}
          <button onClick={() => run.abort?.abort()} data-testid="assistant-cancel">
            Abbrechen
          </button>
        </div>
      )}
      {run.error && (
        <p className="assistant-error" role="alert" data-testid="assistant-error">
          {run.error}
        </p>
      )}
      {run.result && (
        <div className={`assistant-result ${run.result.status}`} data-testid="assistant-result">
          {run.result.summary && <p>{run.result.summary}</p>}
          <p className="sub">
            {run.result.ops} Operationen{usageText(run.result.usage) ? ` | ${usageText(run.result.usage)}` : ''}
          </p>
        </div>
      )}
      {p && (
        <div className="proposal" data-testid="proposal">
          <p className="sub">
            <span className="add">+{p.added.length}</span> <span className="change">~{p.changed.length}</span>{' '}
            <span className="remove">−{p.removed.length}</span>
          </p>
          <div className="row-buttons">
            <button
              className="primary"
              data-testid="proposal-apply"
              onClick={() => {
                if (st.applyProposal()) useAssistant.setState({ result: null, task: '' });
              }}
            >
              Übernehmen
            </button>
            <button data-testid="proposal-discard" onClick={() => st.setProposal(null)}>
              Verwerfen
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function SettingsForm({
  value,
  onSave,
  onClearKey,
}: {
  value: AssistantSettings;
  onSave: (s: AssistantSettings) => void;
  onClearKey: () => void;
}) {
  const [key, setKey] = useState('');
  const [model, setModel] = useState(value.model);
  const [models, setModels] = useState<string[]>([]);
  const loaded = useRef(false);
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    listModels()
      .then(setModels)
      .catch(() => setModels([]));
  }, []);
  return (
    <form
      className="assistant-settings"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ apiKey: key || value.apiKey, model });
        setKey('');
      }}
    >
      <label className="field">
        <span>OpenRouter API-Key</span>
        <input
          type="password"
          autoComplete="off"
          value={key}
          placeholder={value.apiKey ? '••••••••' : 'sk-or-…'}
          data-testid="assistant-key"
          onChange={(e) => setKey(e.target.value)}
        />
      </label>
      <label className="field">
        <span>Modell</span>
        <input
          list="assistant-models"
          value={model}
          placeholder={DEFAULT_MODEL}
          data-testid="assistant-model"
          onChange={(e) => setModel(e.target.value)}
        />
        <datalist id="assistant-models">
          {models.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      </label>
      <div className="row-buttons">
        <button type="submit" className="primary" data-testid="assistant-save">
          Speichern
        </button>
        {value.apiKey && (
          <button type="button" onClick={onClearKey} data-testid="assistant-clear-key">
            <Icon name="trash" /> Key löschen
          </button>
        )}
      </div>
    </form>
  );
}
