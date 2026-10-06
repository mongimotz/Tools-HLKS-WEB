// Start page: tool list drawn as a duct network, and one import field for any tool's PDF.

import { TOOLS, findTool, toolUrl } from '../../lib/core/registry.js';
import { readEnvelopeFromFile, pickFile, stashHandoff, enableFileDrop } from '../../lib/core/files.js';
import { html, icon, toast, bindThemeToggle } from '../../lib/core/ui.js';

function draftLabel(id) {
  try {
    const d = JSON.parse(localStorage.getItem(`hlks-tools:${id}:draft`) || 'null');
    if (!d) return '';
    return [d.project?.name, d.inputs?.system?.name].filter(Boolean).join(' – ');
  } catch {
    return '';
  }
}

function renderTools() {
  const list = document.getElementById('tools');
  list.innerHTML = String(html`${TOOLS.map((t) => {
    const ready = t.status === 'ready';
    const draft = ready ? draftLabel(t.id) : '';
    const body = html`
      <span class="duct" aria-hidden="true"><span class="air"></span></span>
      <span class="outlet" aria-hidden="true"></span>
      <span class="tool-text">
        <span class="tool-name">${t.name}</span>
        <span class="tool-summary">${t.summary}</span>
        ${ready ? (draft ? html`<span class="tool-meta">Weiterarbeiten: ${draft}</span>` : '') : html`<span class="tool-meta">In Planung</span>`}
      </span>`;
    return ready
      ? html`<li class="branch is-ready"><a href="${t.path}">${body}</a></li>`
      : html`<li class="branch is-planned"><div aria-disabled="true">${body}</div></li>`;
  })}`);
}

async function openFile(file) {
  if (!file) return;
  try {
    const env = await readEnvelopeFromFile(file);
    const tool = findTool(env.tool);
    if (!tool || tool.status !== 'ready') {
      toast('Die Datei gehört zu einem Werkzeug, das es hier (noch) nicht gibt.', { kind: 'error', timeout: 7000 });
      return;
    }
    if (!stashHandoff(env)) {
      toast('Der Browser blockiert die Übergabe an das Werkzeug (Speicher gesperrt). Datei dort direkt öffnen.', { kind: 'error', timeout: 8000 });
      return;
    }
    location.href = toolUrl(env.tool);
  } catch (e) {
    toast(e.message, { kind: 'error', timeout: 8000 });
  }
}

renderTools();
bindThemeToggle(document.getElementById('theme-toggle'));
document.getElementById('theme-toggle').innerHTML = String(icon('theme'));
const openBtn = document.getElementById('open-file');
openBtn.innerHTML = String(html`${icon('open')}<span>Datei wählen</span>`);
openBtn.addEventListener('click', async () => openFile(await pickFile()));
enableFileDrop(openFile);
