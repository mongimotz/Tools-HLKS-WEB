// SPDX-License-Identifier: AGPL-3.0-or-later
// Open and save .schema files. Phase 3: file input and download (works in every browser).
// Phase 4 adds the File System Access API (direct save, live sync) on top.
import { parseText } from '../model/migrate.ts';
import { serialize } from '../model/serialize.ts';
import type { Schema } from '../model/types.ts';

export function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function saveAsDownload(doc: Schema, name: string) {
  download(name.endsWith('.schema') ? name : `${name}.schema`, serialize(doc), 'application/json');
}

export function pickFile(accept = '.schema,application/json'): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.dataset.testid = 'file-input';
    input.style.display = 'none';
    input.addEventListener('change', () => {
      resolve(input.files?.[0] ?? null);
      input.remove();
    });
    // No "cancel" handling: some browsers fire it before "change"; a cancelled pick simply never resolves.
    document.querySelectorAll('input[data-testid="file-input"]').forEach((el) => el.remove());
    document.body.append(input);
    input.click();
  });
}

export async function readSchemaFile(file: File): Promise<Schema> {
  return parseText(await file.text());
}

const DRAFT = 'hlks-schema:draft';
const DRAFTS = 'hlks-schema:drafts';

/** Browser draft of all open schema tabs (this device only). */
export function saveDrafts(list: { doc: Schema; fileName: string }[], active: number) {
  try {
    localStorage.setItem(
      DRAFTS,
      JSON.stringify({ active, tabs: list.map((t) => ({ fileName: t.fileName, text: serialize(t.doc) })) }),
    );
  } catch {
    /* storage full or blocked: no draft */
  }
}

export function loadDrafts(): { tabs: { doc: Schema; fileName: string }[]; active: number } | null {
  try {
    const raw = localStorage.getItem(DRAFTS);
    if (!raw) {
      const one = loadDraft();
      return one ? { tabs: [one], active: 0 } : null;
    }
    const d = JSON.parse(raw) as { active: number; tabs: { fileName: string; text: string }[] };
    const tabs: { doc: Schema; fileName: string }[] = [];
    for (const t of d.tabs) {
      try {
        tabs.push({ doc: parseText(t.text), fileName: t.fileName });
      } catch {
        /* a broken tab is skipped */
      }
    }
    return tabs.length ? { tabs, active: d.active } : null;
  } catch {
    return null;
  }
}

/** Browser draft (this device only), so a reload does not lose work. */
export function saveDraft(doc: Schema, fileName: string) {
  try {
    localStorage.setItem(DRAFT, JSON.stringify({ fileName, text: serialize(doc) }));
  } catch {
    /* storage full or blocked: no draft */
  }
}

export function loadDraft(): { doc: Schema; fileName: string } | null {
  try {
    const raw = localStorage.getItem(DRAFT);
    if (!raw) return null;
    const { fileName, text } = JSON.parse(raw) as { fileName: string; text: string };
    return { doc: parseText(text), fileName };
  } catch {
    return null;
  }
}
