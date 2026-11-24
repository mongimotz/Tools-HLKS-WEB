// SPDX-License-Identifier: AGPL-3.0-or-later
// Project Dossier: collects active browser drafts across tools plus added PDF/JSON/.schema files,
// builds one combined PDF with cover/TOC and embedded data.json, and reopens saved dossiers.
// Heavy modules (lib/core/pdf.js, tool report.js) are loaded lazily on demand.

import { findTool, toolUrl } from './registry.js';
import { createEnvelope, normalizeProject } from './envelope.js';
import { readAnyFile, saveFile, safeFileName, stashHandoff, openInPdfEditor, fsaSupported } from './files.js';
import { readProjectContext, saveProjectContext } from './project-info.js';
import { fmt, fmtDate, todayIso } from './format.js';
import { html, raw, icon, toast } from './ui.js';

export const DOSSIER_TOOL_ID = 'dossier';
export const DOSSIER_VERSION = 1;

const CALC_TOOLS = ['duct-sizing', 'duct-pressure-loss', 'silencer', 'hx-diagram'];

function readJson(key) {
  try {
    const s = localStorage.getItem(key);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

/** Concise draft label shown under each tool on the start page (supports all tools, incl. general tiles). */
export function draftLabelFor(toolId) {
  if (toolId === 'schema') {
    const drafts = readJson('hlks-schema:drafts');
    const tabs = Array.isArray(drafts?.tabs) ? drafts.tabs : [];
    const active = tabs[drafts?.active ?? 0] ?? tabs[0];
    if (active?.text) {
      try {
        const doc = JSON.parse(active.text);
        if (doc?.components?.length || doc?.connections?.length || doc?.texts?.length || doc?.meta?.project) {
          return [doc.meta?.project, doc.meta?.title || active.fileName?.replace(/\.schema$/i, '')].filter(Boolean).join(' – ');
        }
      } catch {
        /* ignore */
      }
    }
    const single = readJson('hlks-schema:draft');
    if (single?.text) {
      try {
        const doc = JSON.parse(single.text);
        if (doc?.components?.length || doc?.meta?.project) {
          return [doc.meta?.project, doc.meta?.title].filter(Boolean).join(' – ');
        }
      } catch {
        /* ignore */
      }
    }
    return '';
  }

  const d = readJson(`hlks-tools:${toolId}:draft`);
  if (!d) return '';
  if (toolId === 'climate-station') return d.inputs?.site?.label || '';

  const projectName = d.project?.name || '';
  const calcs = d.inputs?.calculations;
  if (Array.isArray(calcs) && calcs.length) {
    const first = calcs[0]?.system?.name || calcs[0]?.name || '';
    const sub = calcs.length > 1 ? `${calcs.length} Berechnungen` : first;
    return [projectName, sub].filter(Boolean).join(' – ');
  }
  const paths = d.inputs?.paths;
  if (Array.isArray(paths) && paths.length) {
    const sub = paths.length > 1 ? `${paths.length} Wege` : paths[0]?.name || '';
    return [projectName, sub].filter(Boolean).join(' – ');
  }
  return projectName;
}

/** Collect all meaningful live drafts from localStorage across the suite. */
export function collectDraftItems() {
  const items = [];
  let seq = 1;

  for (const toolId of CALC_TOOLS) {
    const d = readJson(`hlks-tools:${toolId}:draft`);
    if (!d?.inputs) continue;
    const tool = findTool(toolId);
    const project = normalizeProject(d.project);
    const count = Array.isArray(d.inputs.calculations)
      ? d.inputs.calculations.length
      : Array.isArray(d.inputs.paths)
        ? d.inputs.paths.length
        : 1;
    const unit = toolId === 'silencer' ? (count === 1 ? 'Weg' : 'Wege') : count === 1 ? 'Berechnung' : 'Berechnungen';
    const firstTitle =
      d.inputs.calculations?.[0]?.system?.name ||
      d.inputs.calculations?.[0]?.name ||
      d.inputs.paths?.[0]?.name ||
      '';
    items.push({
      id: `draft-${seq++}`,
      source: 'draft',
      toolId,
      toolName: tool?.name ?? toolId,
      title: project.name || firstTitle || tool?.name || toolId,
      summary: `${count} ${unit}`,
      project,
      checked: true,
      payload: { doc: { project, inputs: d.inputs } },
    });
  }

  const cst = readJson('hlks-tools:climate-station:draft');
  if (cst?.inputs?.site) {
    items.push({
      id: `draft-${seq++}`,
      source: 'draft',
      toolId: 'climate-station',
      toolName: findTool('climate-station')?.name ?? 'Klimastation',
      title: cst.inputs.site.label || 'Standort',
      summary: cst.inputs.site.height != null ? `${fmt(cst.inputs.site.height, 0)} m ü. M.` : 'SIA 2028',
      project: null,
      checked: true,
      payload: { inputs: cst.inputs },
    });
  }

  const schemaDrafts = readJson('hlks-schema:drafts');
  const rawTabs = Array.isArray(schemaDrafts?.tabs)
    ? schemaDrafts.tabs
    : readJson('hlks-schema:draft')
      ? [readJson('hlks-schema:draft')]
      : [];
  for (const t of rawTabs) {
    if (!t?.text) continue;
    try {
      const schemaDoc = JSON.parse(t.text);
      if (!schemaDoc || schemaDoc.format !== 'hlks-schema') continue;
      if (!(schemaDoc.components?.length || schemaDoc.connections?.length || schemaDoc.texts?.length)) continue;
      const name = (t.fileName || 'prinzipschema.schema').replace(/\.schema$/i, '');
      const title = schemaDoc.meta?.title && schemaDoc.meta.title !== 'Neues Prinzipschema' ? schemaDoc.meta.title : name;
      items.push({
        id: `draft-${seq++}`,
        source: 'draft',
        toolId: 'schema',
        toolName: findTool('schema')?.name ?? 'Prinzipschema',
        title,
        summary: `${schemaDoc.sheet?.size ?? 'A3'} ${schemaDoc.sheet?.orientation === 'portrait' ? 'hoch' : 'quer'}`,
        project: {
          name: schemaDoc.meta?.project || '',
          number: '',
          author: schemaDoc.meta?.author || '',
          date: schemaDoc.meta?.date || '',
        },
        checked: true,
        payload: { schema: schemaDoc, fileName: t.fileName || `${title}.schema` },
      });
    } catch {
      /* skip invalid draft tab */
    }
  }

  return items;
}

/** Render a Prinzipschema document to its genuine 1:1 vector PDF via a hidden same-origin iframe to schema/. */
function renderSchemaPdfViaIframe(schemaDoc) {
  return new Promise((resolve, reject) => {
    const base = toolUrl('schema');
    if (!base) return reject(new Error('Prinzipschema nicht verfügbar'));
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;border:0;opacity:0;pointer-events:none';
    const url = new URL(base);
    url.searchParams.set('render-bridge', '1');
    const reqId = `dossier-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let done = false;
    const finish = (fn, val) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      iframe.remove();
      fn(val);
    };
    const timer = setTimeout(() => finish(reject, new Error('Prinzipschema-Export Zeitüberschreitung')), 20_000);
    const onMessage = (e) => {
      if (e.source !== iframe.contentWindow) return;
      const msg = e.data;
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'hlks-schema-bridge-ready') {
        iframe.contentWindow.postMessage({ type: 'hlks-schema-render-pdf', id: reqId, doc: schemaDoc }, '*');
      } else if (msg.type === 'hlks-schema-render-result' && msg.id === reqId) {
        if (msg.error) finish(reject, new Error(msg.error));
        else finish(resolve, new Uint8Array(msg.bytes));
      }
    };
    window.addEventListener('message', onMessage);
    iframe.src = url.href;
    document.body.append(iframe);
  });
}

/** Build a 1-page A4 portrait summary sheet for Klimastation (no copyrighted SIA climate values). */
async function renderClimateStationPdf(inputs, project) {
  const [{ buildPdf, standardDecorate, A4_PORTRAIT, INK }, { regionAt, rankStations }] = await Promise.all([
    import('./pdf.js'),
    import('../../tools/climate-station/calc.js'),
  ]);
  const get = (f) => fetch(new URL(`../../tools/climate-station/data/${f}`, import.meta.url)).then((r) => r.json());
  const [st, rg] = await Promise.all([get('stations.json'), get('regions.json')]);
  const names = new Map(st.regions.map((r) => [r.id, r.name]));
  const regions = rg.regions.map((r) => ({ ...r, name: names.get(r.id) }));
  const site = inputs.site;
  const where = regionAt(regions, site.e, site.n);
  const regionId = where.distance / 1000 > 15 ? null : where.id;
  const regionName = regionId != null ? `${regionId} – ${names.get(regionId) ?? ''}` : 'ausserhalb';
  const ranking = rankStations(st.stations, { e: site.e, n: site.n, height: site.height, region: regionId }, inputs.weights);
  const pick = ranking.find((r) => r.station.id === inputs.station) ?? ranking[0];

  const env = createEnvelope({
    tool: 'climate-station',
    version: 1,
    calcVersion: '1.0.0',
    project,
    inputs,
    snapshot: pick ? { station: pick.station.id, name: pick.station.name, region: regionId } : null,
  });

  const render = (w) => {
    w.y += 8;
    w.text('Klimastation (SIA 2028)', w.left, w.y + 14, { size: 17, bold: true, color: INK.strong });
    w.y += 30;
    w.keyValues(
      [
        ['Projekt', project.name || '–'],
        ['Projekt-Nr.', project.number || '–'],
        ['Bearbeiter', project.author || '–'],
        ['Datum', fmtDate(project.date) || '–'],
      ],
      { columns: 4 },
    );
    w.heading('Standort');
    w.keyValues(
      [
        ['Bezeichnung', site.label || '–'],
        ['Koordinaten LV95', `${fmt(site.e, 0)} / ${fmt(site.n, 0)}`],
        ['Höhe', site.height != null ? `${fmt(site.height, 0)} m ü. M.` : '–'],
        ['Klimaregion', regionName],
      ],
      { columns: 2, rowHeight: 28 },
    );
    if (pick) {
      w.heading('Gewählte Station');
      w.keyValues(
        [
          ['Station', `${pick.station.name} (${pick.station.id})`],
          ['Höhe Station', `${fmt(pick.station.height, 0)} m ü. M.`],
          ['Distanz', `${fmt(pick.distance, 1)} km`],
          ['Höhendifferenz', pick.dh != null ? `${pick.dh > 0 ? '+' : ''}${fmt(pick.dh, 0)} m` : '–'],
        ],
        { columns: 4 },
      );
      w.heading('Rangliste (Top 5)');
      w.table({
        columns: [
          { label: 'Rang', width: 34, align: 'right' },
          { label: 'Station', width: 170 },
          { label: 'Kürzel', width: 48 },
          { label: 'Region', width: 48, align: 'right' },
          { label: 'Höhe', unit: 'm ü. M.', width: 60, align: 'right' },
          { label: 'Distanz', unit: 'km', width: 55, align: 'right' },
          { label: 'Δh', unit: 'm', width: 45, align: 'right' },
          { label: 'Kennzahl', unit: 'km', width: 55, align: 'right' },
        ],
        rows: ranking.slice(0, 5).map((r, i) => [
          String(i + 1),
          { text: r.station.name, bold: r.station.id === pick.station.id },
          r.station.id,
          String(r.station.region),
          fmt(r.station.height, 0),
          fmt(r.distance, 1),
          r.dh != null ? `${r.dh > 0 ? '+' : ''}${fmt(r.dh, 0)}` : '–',
          fmt(r.score, 1),
        ]),
      });
    }
  };

  const bytes = await buildPdf({
    envelope: env,
    title: project.name ? `Klimastation – ${project.name}` : 'Klimastation',
    subject: 'HLKS-Tools: Klimastation',
    author: project.author,
    pageSize: A4_PORTRAIT,
    render,
    decorate: standardDecorate({ toolName: 'Klimastation', project, calcVersion: '1.0.0' }),
  });
  return { pdfBytes: bytes, envelope: env };
}

/** Render any dossier item into `{ pdfBytes, envelope? }` on demand. */
export async function renderDossierEntry(item, dossierProject) {
  if (item.payload?.pdfBytes) {
    return { pdfBytes: item.payload.pdfBytes, envelope: item.payload.envelope ?? null };
  }
  const mergedProject = {
    name: item.payload?.doc?.project?.name || dossierProject.name || '',
    number: item.payload?.doc?.project?.number || dossierProject.number || '',
    author: item.payload?.doc?.project?.author || dossierProject.author || '',
    date: item.payload?.doc?.project?.date || dossierProject.date || todayIso(),
  };

  switch (item.toolId) {
    case 'duct-pressure-loss': {
      const [{ computeProject, snapshotProjectOf, CALC_VERSION }, { normalizeInputs, TOOL_ID, INPUT_VERSION }, { buildReport }] = await Promise.all([
        import('../../tools/duct-pressure-loss/calc.js'),
        import('../../tools/duct-pressure-loss/defaults.js'),
        import('../../tools/duct-pressure-loss/report.js'),
      ]);
      const inputs = normalizeInputs(item.payload.doc.inputs);
      const result = computeProject(inputs);
      const env = createEnvelope({ tool: TOOL_ID, version: INPUT_VERSION, calcVersion: CALC_VERSION, project: mergedProject, inputs, snapshot: snapshotProjectOf(result) });
      const pdfBytes = await buildReport({ project: mergedProject, inputs }, result, env);
      return { pdfBytes, envelope: env };
    }
    case 'duct-sizing': {
      const [{ computeProject, snapshotProjectOf, CALC_VERSION }, { normalizeInputs, TOOL_ID, INPUT_VERSION }, { buildReport }] = await Promise.all([
        import('../../tools/duct-sizing/calc.js'),
        import('../../tools/duct-sizing/defaults.js'),
        import('../../tools/duct-sizing/report.js'),
      ]);
      const inputs = normalizeInputs(item.payload.doc.inputs);
      const result = computeProject(inputs);
      const env = createEnvelope({ tool: TOOL_ID, version: INPUT_VERSION, calcVersion: CALC_VERSION, project: mergedProject, inputs, snapshot: snapshotProjectOf(result) });
      const pdfBytes = await buildReport({ project: mergedProject, inputs }, result, env);
      return { pdfBytes, envelope: env };
    }
    case 'silencer': {
      const [{ compute, snapshotOf, CALC_VERSION }, { normalizeInputs, TOOL_ID, INPUT_VERSION }, { buildReport }] = await Promise.all([
        import('../../tools/silencer/calc.js'),
        import('../../tools/silencer/defaults.js'),
        import('../../tools/silencer/report.js'),
      ]);
      const inputs = normalizeInputs(item.payload.doc.inputs);
      const result = compute(inputs);
      const env = createEnvelope({ tool: TOOL_ID, version: INPUT_VERSION, calcVersion: CALC_VERSION, project: mergedProject, inputs, snapshot: snapshotOf(result) });
      const pdfBytes = await buildReport({ project: mergedProject, inputs }, result, env);
      return { pdfBytes, envelope: env };
    }
    case 'hx-diagram': {
      const [{ computeProject, snapshotProjectOf, CALC_VERSION }, { normalizeInputs, TOOL_ID, INPUT_VERSION }, { buildReport }] = await Promise.all([
        import('../../tools/hx-diagram/calc.js'),
        import('../../tools/hx-diagram/defaults.js'),
        import('../../tools/hx-diagram/report.js'),
      ]);
      const inputs = normalizeInputs(item.payload.doc.inputs);
      const result = computeProject(inputs);
      const env = createEnvelope({ tool: TOOL_ID, version: INPUT_VERSION, calcVersion: CALC_VERSION, project: mergedProject, inputs, snapshot: snapshotProjectOf(result) });
      const pdfBytes = await buildReport({ project: mergedProject, inputs }, result, env);
      return { pdfBytes, envelope: env };
    }
    case 'climate-station': {
      return renderClimateStationPdf(item.payload.inputs, mergedProject);
    }
    case 'schema': {
      const schemaDoc = item.payload.schema;
      const pdfBytes = await renderSchemaPdfViaIframe(schemaDoc);
      const env = createEnvelope({
        tool: 'schema',
        version: schemaDoc.version ?? 1,
        calcVersion: '1.0.0',
        project: {
          name: schemaDoc.meta?.project || mergedProject.name,
          number: mergedProject.number,
          author: schemaDoc.meta?.author || mergedProject.author,
          date: schemaDoc.meta?.date || mergedProject.date,
        },
        inputs: schemaDoc,
        snapshot: { fileName: item.payload.fileName || `${item.title}.schema` },
      });
      return { pdfBytes, envelope: env };
    }
    default:
      throw new Error(`Werkzeug nicht unterstützt: ${item.toolId}`);
  }
}

/** Convert an added File (.pdf, .json, .schema) into one or more dossier items. */
async function fileToDossierItems(file, seqRef) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const res = await readAnyFile(file);
  if (res.kind === 'foreign-pdf') {
    return [
      {
        id: `file-${seqRef.n++}`,
        source: 'file',
        toolId: 'pdf',
        toolName: 'PDF',
        title: file.name.replace(/\.pdf$/i, ''),
        summary: `${Math.max(1, Math.round(bytes.length / 1024))} kB`,
        project: null,
        checked: true,
        payload: { pdfBytes: bytes, fileName: file.name },
      },
    ];
  }
  const env = res.envelope;
  if (env.tool === DOSSIER_TOOL_ID) {
    return itemsFromDossierEnvelope(env, seqRef);
  }
  if (env.tool === 'schema') {
    const schemaDoc = env.inputs;
    const isPdfFile = /\.pdf$/i.test(file.name);
    return [
      {
        id: `file-${seqRef.n++}`,
        source: 'file',
        toolId: 'schema',
        toolName: findTool('schema')?.name ?? 'Prinzipschema',
        title: schemaDoc?.meta?.title || file.name.replace(/\.(schema|pdf)$/i, ''),
        summary: `${schemaDoc?.sheet?.size ?? 'A3'} ${schemaDoc?.sheet?.orientation === 'portrait' ? 'hoch' : 'quer'}`,
        project: env.project,
        checked: true,
        payload: { schema: schemaDoc, fileName: env.snapshot?.fileName || file.name, ...(isPdfFile ? { pdfBytes: bytes, envelope: env } : {}) },
      },
    ];
  }
  const tool = findTool(env.tool);
  const isPdfFile = /\.pdf$/i.test(file.name);
  return [
    {
      id: `file-${seqRef.n++}`,
      source: 'file',
      toolId: env.tool,
      toolName: tool?.name ?? env.tool,
      title: env.project?.name || file.name.replace(/\.(pdf|json)$/i, ''),
      summary: isPdfFile ? 'PDF + Daten' : 'JSON',
      project: env.project,
      checked: true,
      payload: {
        doc: { project: env.project, inputs: env.inputs },
        ...(isPdfFile ? { pdfBytes: bytes, envelope: env } : {}),
      },
    },
  ];
}

function itemsFromDossierEnvelope(env, seqRef) {
  const list = Array.isArray(env.inputs?.items) ? env.inputs.items : [];
  return list
    .filter((x) => x && x.envelope)
    .map((x) => {
      const sub = x.envelope;
      const tool = findTool(sub.tool);
      return {
        id: `dossier-${seqRef.n++}`,
        source: 'dossier',
        toolId: sub.tool,
        toolName: x.toolName || tool?.name || sub.tool,
        title: x.title || sub.project?.name || tool?.name || sub.tool,
        summary: x.summary || '',
        project: sub.project,
        checked: true,
        payload: sub.tool === 'schema'
          ? { schema: sub.inputs, fileName: sub.snapshot?.fileName || `${x.title || 'prinzipschema'}.schema` }
          : sub.tool === 'climate-station'
            ? { inputs: sub.inputs }
            : { doc: { project: sub.project, inputs: sub.inputs } },
      };
    });
}

/** Propagate Dossier project metadata into the global project context and all live browser drafts. */
export function syncProjectToDrafts(project) {
  saveProjectContext(project);
}

/** Mount the Project Dossier modal dialog on the start page. */
export function mountDossierDialog(dialog, { onChange } = {}) {
  const seqRef = { n: 1 };
  const state = {
    project: { ...readProjectContext(), date: readProjectContext().date || todayIso() },
    includeCover: true,
    items: [],
    busy: false,
    handle: null,
  };

  function defaultProjectFromItems(items) {
    const ctx = readProjectContext();
    const first = items.find((i) => i.project?.name && i.project.name !== 'Beispiel')?.project;
    return {
      name: ctx.name || first?.name || '',
      number: ctx.number || first?.number || '',
      author: ctx.author || first?.author || '',
      date: ctx.date || todayIso(),
    };
  }

  function loadDrafts() {
    state.items = collectDraftItems();
    state.project = defaultProjectFromItems(state.items);
    state.handle = null;
    render();
  }

  function openEnvelope(env) {
    state.items = itemsFromDossierEnvelope(env, seqRef);
    state.project = { ...normalizeProject(env.project), date: env.project?.date || todayIso() };
    state.includeCover = env.inputs?.includeCover !== false;
    state.handle = null;
    render();
    if (!dialog.open) dialog.showModal();
  }

  function open() {
    loadDrafts();
    if (!dialog.open) dialog.showModal();
  }

  function close() {
    if (dialog.open) dialog.close();
  }

  function move(index, delta) {
    const to = index + delta;
    if (to < 0 || to >= state.items.length) return;
    const [item] = state.items.splice(index, 1);
    state.items.splice(to, 0, item);
    render();
  }

  function openItemInTool(item) {
    const tool = findTool(item.toolId);
    if (!tool || tool.status !== 'ready') return;
    if (item.source === 'draft') {
      location.href = toolUrl(item.toolId);
      return;
    }
    const env =
      item.payload?.envelope ??
      (item.toolId === 'schema'
        ? createEnvelope({
            tool: 'schema',
            version: item.payload.schema?.version ?? 1,
            calcVersion: '1.0.0',
            project: state.project,
            inputs: item.payload.schema,
            snapshot: { fileName: item.payload.fileName },
          })
        : item.payload?.doc
          ? createEnvelope({
              tool: item.toolId,
              version: 1,
              calcVersion: '1.0.0',
              project: item.payload.doc.project,
              inputs: item.payload.doc.inputs,
            })
          : null);
    if (env && stashHandoff(env)) location.href = toolUrl(item.toolId);
    else location.href = toolUrl(item.toolId);
  }

  async function addFiles(fileList) {
    const files = [...(fileList ?? [])];
    if (!files.length) return;
    let added = 0;
    for (const f of files) {
      try {
        const next = await fileToDossierItems(f, seqRef);
        state.items.push(...next);
        added += next.length;
      } catch (e) {
        toast(`${f.name}: ${e.message}`, { kind: 'error', timeout: 7000 });
      }
    }
    if (!state.project.name) {
      const p = state.items.find((i) => i.project?.name && i.project.name !== 'Beispiel')?.project;
      if (p) state.project = { ...state.project, name: p.name, number: state.project.number || p.number, author: state.project.author || p.author };
    }
    if (added) toast(`${added} ${added === 1 ? 'Dokument' : 'Dokumente'} hinzugefügt`, { kind: 'success', timeout: 2500 });
    render();
  }

  async function compileDossier() {
    const selected = state.items.filter((i) => i.checked);
    if (!selected.length) {
      toast('Mindestens ein Dokument wählen', { kind: 'warning' });
      return null;
    }
    state.busy = true;
    render();
    try {
      saveProjectContext(state.project);
      const { buildDossierPdf } = await import('./pdf.js');
      const entries = [];
      const manifestItems = [];
      for (const item of selected) {
        const { pdfBytes, envelope } = await renderDossierEntry(item, state.project);
        entries.push({
          toolId: item.toolId,
          toolName: item.toolName,
          title: item.title,
          summary: item.summary,
          pdfBytes,
          envelope,
        });
        manifestItems.push({
          toolId: item.toolId,
          toolName: item.toolName,
          title: item.title,
          summary: item.summary,
          envelope: envelope ?? null,
        });
      }
      const dossierEnvelope = createEnvelope({
        tool: DOSSIER_TOOL_ID,
        version: DOSSIER_VERSION,
        calcVersion: '1.0.0',
        project: state.project,
        inputs: { includeCover: state.includeCover, items: manifestItems },
        snapshot: { count: entries.length },
      });
      const bytes = await buildDossierPdf({
        project: { ...state.project, date: fmtDate(state.project.date) || state.project.date },
        entries,
        includeCover: state.includeCover,
        envelope: dossierEnvelope,
      });
      const filename = safeFileName(['Projekt-Dossier', state.project.name, state.project.date || todayIso()], 'pdf');
      return { bytes, filename };
    } catch (e) {
      console.error(e);
      toast(`Dossier-Fehler: ${e.message}`, { kind: 'error', timeout: 8000 });
      return null;
    } finally {
      state.busy = false;
      render();
    }
  }

  async function exportDossier(forcePicker = false) {
    const built = await compileDossier();
    if (!built) return;
    const saved = await saveFile({
      data: built.bytes,
      filename: built.filename,
      mime: 'application/pdf',
      handle: state.handle,
      forcePicker,
      description: 'HLKS Projekt-Dossier (PDF)',
      accept: { 'application/pdf': ['.pdf'] },
    });
    if (!saved) return;
    state.handle = saved.handle;
    toast(`${saved.name} gespeichert`, { kind: 'success' });
    render();
  }

  async function sendToPdfEditor() {
    const built = await compileDossier();
    if (!built) return;
    if (!(await openInPdfEditor(built.bytes, built.filename))) {
      toast('Übergabe blockiert (Browser-Speicher gesperrt)', { kind: 'error', timeout: 7000 });
    }
  }

  function render() {
    const selectedCount = state.items.filter((i) => i.checked).length;
    dialog.innerHTML = String(html`
      <div class="dossier-head">
        <h2>${icon('dossier', { size: 18 })}<span>Projekt-Dossier</span></h2>
        <button type="button" class="btn ghost icon-only" data-dossier="close" title="Schliessen" aria-label="Schliessen">${icon('close')}</button>
      </div>

      <div class="dossier-meta">
        <label class="field"><span class="field-label">Projekt</span><input class="input" data-meta="name" value="${state.project.name}" autocomplete="off" /></label>
        <label class="field"><span class="field-label">Projekt-Nr.</span><input class="input" data-meta="number" value="${state.project.number}" autocomplete="off" /></label>
        <label class="field"><span class="field-label">Bearbeiter</span><input class="input" data-meta="author" value="${state.project.author}" autocomplete="off" /></label>
        <label class="field"><span class="field-label">Datum</span><input class="input" type="date" data-meta="date" value="${state.project.date}" /></label>
      </div>

      <div class="dossier-bar">
        <button type="button" class="btn small" data-dossier="add">${icon('plus', { size: 14 })}<span>Datei</span></button>
        <button type="button" class="btn ghost small" data-dossier="refresh" title="Entwürfe neu laden">${icon('reset', { size: 14 })}<span>Entwürfe</span></button>
        <label class="dossier-check"><input type="checkbox" data-dossier="cover" ${raw(state.includeCover ? 'checked' : '')} /><span>Deckblatt</span></label>
        <span class="dossier-count num muted">${selectedCount} / ${state.items.length}</span>
      </div>

      <div class="dossier-list-wrap">
        ${state.items.length
          ? html`<ul class="dossier-list">
              ${state.items.map(
                (item, idx) => html`<li class="dossier-item${item.checked ? '' : ' is-off'}" data-index="${idx}">
                  <input type="checkbox" data-dossier="toggle" data-index="${idx}" ${raw(item.checked ? 'checked' : '')} aria-label="${item.title}" />
                  <span class="dossier-badge">${item.toolName}</span>
                  <span class="dossier-title" title="${item.title}">${item.title}</span>
                  <span class="dossier-summary num muted">${item.summary}</span>
                  <span class="dossier-row-actions">
                    <button type="button" class="btn ghost small icon-only" data-dossier="up" data-index="${idx}" title="Nach oben" aria-label="Nach oben" ${raw(idx === 0 ? 'disabled' : '')}>${icon('up', { size: 14 })}</button>
                    <button type="button" class="btn ghost small icon-only" data-dossier="down" data-index="${idx}" title="Nach unten" aria-label="Nach unten" ${raw(idx === state.items.length - 1 ? 'disabled' : '')}>${icon('down', { size: 14 })}</button>
                    ${item.toolId !== 'pdf'
                      ? html`<button type="button" class="btn ghost small icon-only" data-dossier="open-tool" data-index="${idx}" title="Im Werkzeug öffnen" aria-label="Im Werkzeug öffnen">${icon('jump', { size: 14 })}</button>`
                      : ''}
                    <button type="button" class="btn ghost small icon-only" data-dossier="remove" data-index="${idx}" title="Entfernen" aria-label="Entfernen">${icon('trash', { size: 14 })}</button>
                  </span>
                </li>`,
              )}
            </ul>`
          : html`<div class="dossier-empty muted">–</div>`}
      </div>

      <div class="dossier-foot">
        <button type="button" class="btn ghost" data-dossier="pdf-editor" ${raw(!selectedCount || state.busy ? 'disabled' : '')}>${icon('pdfEdit')}<span>PDF-Editor</span></button>
        <span class="dossier-spacer"></span>
        ${fsaSupported && state.handle
          ? html`<button type="button" class="btn ghost icon-only" data-dossier="save-as" title="Speichern unter" aria-label="Speichern unter" ${raw(state.busy ? 'disabled' : '')}>${icon('saveAs')}</button>`
          : ''}
        <button type="button" class="btn primary" data-dossier="export" ${raw(!selectedCount || state.busy ? 'disabled' : '')}>${icon('save')}<span>${state.busy ? 'Erstelle…' : 'PDF'}</span></button>
      </div>
    `);
  }

  dialog.addEventListener('input', (e) => {
    const key = e.target.dataset?.meta;
    if (!key) return;
    state.project[key] = e.target.value;
    syncProjectToDrafts(state.project);
    for (const item of state.items) {
      if (item.source === 'draft' && item.payload?.doc?.project) {
        item.payload.doc.project[key] = e.target.value;
        if (key === 'name' && e.target.value) item.title = e.target.value;
      } else if (item.source === 'draft' && item.payload?.schema?.meta) {
        if (key === 'name') item.payload.schema.meta.project = e.target.value;
        else if (key === 'author') item.payload.schema.meta.author = e.target.value;
        else if (key === 'date') item.payload.schema.meta.date = e.target.value;
      }
    }
    onChange?.();
  });
  dialog.addEventListener('change', (e) => {
    const key = e.target.dataset?.meta;
    if (key) {
      syncProjectToDrafts(state.project);
      onChange?.();
      return;
    }
    if (e.target.dataset?.dossier === 'cover') {
      state.includeCover = e.target.checked;
      return;
    }
    if (e.target.dataset?.dossier === 'toggle') {
      const idx = Number(e.target.dataset.index);
      if (state.items[idx]) state.items[idx].checked = e.target.checked;
      render();
    }
  });
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) {
      close();
      return;
    }
    const btn = e.target.closest('[data-dossier]');
    if (!btn || btn.disabled) return;
    const idx = Number(btn.dataset.index);
    switch (btn.dataset.dossier) {
      case 'close': close(); break;
      case 'refresh': loadDrafts(); break;
      case 'add': {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.accept = '.pdf,.json,.schema,application/pdf,application/json';
        input.addEventListener('change', () => addFiles(input.files), { once: true });
        input.click();
        break;
      }
      case 'up': move(idx, -1); break;
      case 'down': move(idx, 1); break;
      case 'remove':
        state.items.splice(idx, 1);
        render();
        break;
      case 'open-tool':
        if (state.items[idx]) openItemInTool(state.items[idx]);
        break;
      case 'export': exportDossier(false); break;
      case 'save-as': exportDossier(true); break;
      case 'pdf-editor': sendToPdfEditor(); break;
    }
  });
  dialog.addEventListener('dragover', (e) => {
    if ([...(e.dataTransfer?.types ?? [])].includes('Files')) e.preventDefault();
  });
  dialog.addEventListener('drop', (e) => {
    if (![...(e.dataTransfer?.types ?? [])].includes('Files')) return;
    e.preventDefault();
    e.stopPropagation();
    addFiles(e.dataTransfer.files);
  });

  return { open, close, openEnvelope, draftCount: () => collectDraftItems().length };
}
