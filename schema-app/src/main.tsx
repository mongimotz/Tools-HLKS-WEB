// SPDX-License-Identifier: AGPL-3.0-or-later
import { createRoot } from 'react-dom/client';
import { App } from './editor/App.tsx';
import { useEditor } from './editor/store.ts';
import { initOwnSymbols } from './io/symbols.ts';
import { initStyle } from './io/style.ts';
import { makePdf } from './io/export.ts';
import type { Schema } from './model/types.ts';
import './editor/editor.css';

// Headless same-origin render bridge used by HLKS-Tools Project Dossier to build exact 1:1 vector PDFs.
if (new URLSearchParams(location.search).has('render-bridge')) {
  initOwnSymbols();
  initStyle();
  window.addEventListener('message', (e) => {
    const msg = e.data as { type?: string; id?: string; doc?: Schema; mono?: boolean } | null;
    if (msg?.type !== 'hlks-schema-render-pdf' || !msg.id || !msg.doc) return;
    void makePdf(msg.doc, { mono: msg.mono })
      .then((blob) => blob.arrayBuffer())
      .then((bytes) => {
        window.parent.postMessage({ type: 'hlks-schema-render-result', id: msg.id, bytes }, '*', [bytes]);
      })
      .catch((err) => {
        window.parent.postMessage(
          { type: 'hlks-schema-render-result', id: msg.id, error: (err as Error).message },
          '*',
        );
      });
  });
  window.parent.postMessage({ type: 'hlks-schema-bridge-ready' }, '*');
} else {
  createRoot(document.getElementById('root')!).render(<App />);
}

// Read-only access for the end-to-end tests and for debugging in the console.
(window as unknown as { __editor: typeof useEditor }).__editor = useEditor;

// Sheet mm → client pixels, and a port's client position (used by the end-to-end tests).
import { portPlace } from './model/geometry.ts';
import { renderSchema } from './render/render.ts';
(window as unknown as Record<string, unknown>).__screen = (x: number, y: number) => {
  const v = useEditor.getState().view!;
  const r = document.querySelector('[data-testid="canvas"]')!.getBoundingClientRect();
  return { x: r.left + (x - v.x) * v.zoom, y: r.top + (y - v.y) * v.zoom };
};
(window as unknown as Record<string, unknown>).__port = (cid: string, pid: string) => {
  const s = renderSchema(useEditor.getState().doc).placed;
  const at = portPlace(
    s.components.find((c) => c.id === cid)!,
    pid,
  )!.at;
  return (window as unknown as { __screen: (x: number, y: number) => { x: number; y: number } }).__screen(at[0], at[1]);
};

// Opens a FileSystemFileHandle as the live file (the end-to-end tests use files in the origin private file system).
import { openHandle, poll } from './io/session.ts';
(window as unknown as Record<string, unknown>).__openHandle = (h: FileSystemFileHandle) =>
  openHandle(h as never, false);
(window as unknown as Record<string, unknown>).__poll = poll;
