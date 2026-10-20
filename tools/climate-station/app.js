// SPDX-License-Identifier: AGPL-3.0-or-later
// Page controller of the Klimastation tool: search, map, site, station ranking, notices, copy row.
// Place search and ranking run locally. Address search and height ask swisstopo (api3.geo.admin.ch).

import { TOOL_ID, normalizeInputs, toUrlParams, fromUrlParams, WEIGHT_LIMITS } from './defaults.js';
import { ACTIONS, SECTIONS, FIELDS, COLUMNS, SOURCES, STATUS, NOTICES, ATTRIBUTION, TITLE, coordsLabel, regionLabel } from './labels.js';
import { regionAt, rankStations, searchPlaces, parseCoordinates, copyRow, wgs84ToLv95, inBounds, DEFAULT_WEIGHTS } from './calc.js';
import { RegionMap } from './map.js';
import { DocumentStore } from '../../lib/core/store.js';
import { fmt, parseNum, toInputValue } from '../../lib/core/format.js';
import { html, icon, toast, bindThemeToggle, mountSourceLink } from '../../lib/core/ui.js';
import { createIssuePanel } from '../../lib/core/issues.js';

const DRAFT_KEY = `hlks-tools:${TOOL_ID}:draft`;
const API = 'https://api3.geo.admin.ch/rest/services';
const BORDER_KM = 5; // closer to another region: border notice
const OUTSIDE_KM = 15; // further from every region: outside Switzerland
const TOP = 3;
const $ = (sel, root = document) => root.querySelector(sel);

const app = {
  store: null,
  data: null, // { stations, regions, regionById, places, country, lakes }
  map: null,
  issues: null,
  height: { seq: 0, pending: false, failed: false },
  showAll: false,
  search: { results: [], active: -1, seq: 0, timer: 0, addressFailed: false },
  view: null, // last computed { region, ranking, pick }
};

const S = () => app.store.doc.inputs;

// ============================================================================
// Data
// ============================================================================

async function loadData() {
  const get = (name) => fetch(new URL(`./data/${name}`, import.meta.url)).then((r) => {
    if (!r.ok) throw new Error(name);
    return r.json();
  });
  const [st, rg, pl] = await Promise.all([get('stations.json'), get('regions.json'), get('places.json')]);
  const names = new Map(st.regions.map((r) => [r.id, r.name]));
  const regions = rg.regions.map((r) => ({ ...r, name: names.get(r.id) }));
  return {
    stations: st.stations,
    regions,
    regionById: new Map(regions.map((r) => [r.id, r])),
    country: rg.country,
    lakes: rg.lakes,
    places: pl.places,
  };
}

// ============================================================================
// State changes
// ============================================================================

function change(fn) {
  fn(S());
  app.store.doc.inputs = normalizeInputs(S());
  app.store.commit();
  render();
}

function setSite(site, { focus = true } = {}) {
  change((s) => {
    s.site = { ...site, height: null, heightSource: null };
    s.station = null;
  });
  fetchHeight();
  if (focus) focusSite();
}

function focusSite() {
  const s = S().site;
  if (!s || !app.view) return;
  app.map.show([s, ...app.view.ranking.slice(0, TOP).map((r) => r.station)]);
}

async function fetchHeight() {
  const site = S().site;
  const seq = ++app.height.seq;
  app.height.failed = false;
  if (!site || site.heightSource === 'manual') {
    app.height.pending = false;
    render();
    return;
  }
  app.height.pending = true;
  render();
  try {
    const url = `${API}/height?easting=${site.e}&northing=${site.n}&sr=2056`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(String(res.status));
    const h = Number((await res.json()).height);
    if (!Number.isFinite(h) || h <= -100) throw new Error('height');
    if (seq !== app.height.seq) return;
    const now = S().site;
    if (now && now.e === site.e && now.n === site.n && now.heightSource !== 'manual') {
      // Not an undo step of its own: the height belongs to the site that was just set.
      now.height = Math.round(h);
      now.heightSource = 'swisstopo';
      app.store.committed = JSON.stringify(app.store.doc);
      app.store.writeDraft(app.store.committed);
    }
  } catch {
    if (seq !== app.height.seq) return;
    app.height.failed = true;
  }
  app.height.pending = false;
  render();
}

// ============================================================================
// Rendering
// ============================================================================

function compute() {
  const s = S();
  if (!s.site) return { region: null, where: null, ranking: [], pick: null };
  const where = regionAt(app.data.regions, s.site.e, s.site.n);
  const region = where.distance / 1000 > OUTSIDE_KM ? null : where.id;
  const ranking = rankStations(app.data.stations, { e: s.site.e, n: s.site.n, height: s.site.height, region }, s.weights);
  const pick = ranking.find((r) => r.station.id === s.station) ?? ranking[0];
  return { region, where, ranking, pick };
}

function render() {
  app.view = compute();
  renderPanel();
  renderIssues();
  app.map.update({ site: S().site, region: app.view.region, ranking: app.view.ranking, chosen: app.view.pick?.station.id ?? null });
  $('[data-action="copy"]').disabled = !S().site;
  $('[data-action="undo"]').disabled = !app.store.canUndo;
  $('[data-action="redo"]').disabled = !app.store.canRedo;
  const params = toUrlParams(S()).toString();
  const next = `${location.pathname}${params ? `?${params}` : ''}${location.hash}`;
  if (next !== `${location.pathname}${location.search}${location.hash}`) history.replaceState(null, '', next);
}

const km = (v) => fmt(v, 1);
const signed = (v) => (v == null ? '–' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt(Math.abs(v), 0)}`);

function renderPanel() {
  const s = S();
  const site = s.site;
  const { region, ranking, pick } = app.view;
  const panel = $('#panel');
  const focused = document.activeElement?.id;
  const reg = app.data.regionById.get(region);
  const rows = app.showAll ? ranking : ranking.slice(0, TOP);
  const heightTag = site?.heightSource ? SOURCES[site.heightSource] : '';

  panel.innerHTML = String(html`
    <section class="block">
      <h2 class="block-title">${SECTIONS.site}</h2>
      ${site
        ? html`
          <div class="site-name">${site.label || '–'}</div>
          ${site.detail ? html`<div class="site-detail">${site.detail}</div>` : ''}
          <dl class="facts">
            <dt>LV95</dt>
            <dd class="num coords"><span>${fmt(site.e, 0)}</span><span>${fmt(site.n, 0)}</span>
              <a class="btn ghost small icon-only" href="https://map.geo.admin.ch/?lang=de&E=${site.e}&N=${site.n}&zoom=10&crosshair=marker" target="_blank" rel="noopener" title="${ACTIONS.mapLink}" aria-label="${ACTIONS.mapLink}">${icon('jump', { size: 14 })}</a></dd>
            <dt><label for="height">${FIELDS.height} <span class="unit">${FIELDS.heightUnit}</span></label></dt>
            <dd class="height">
              <input class="input num" id="height" inputmode="numeric" value="${toInputValue(site.height)}" />
              <span class="tag${site.heightSource === 'manual' ? ' is-manual' : ''}">${heightTag}</span>
              ${site.heightSource === 'manual' ? html`<button type="button" class="btn ghost small icon-only" data-action="height-reset" title="${ACTIONS.heightReset}" aria-label="${ACTIONS.heightReset}">${icon('reset', { size: 14 })}</button>` : ''}
            </dd>
            <dt>${FIELDS.region}</dt>
            <dd class="region">${regionLabel(reg)}</dd>
          </dl>`
        : html`<div class="site-empty">–</div>`}
    </section>

    <section class="block">
      <h2 class="block-title">${SECTIONS.station}</h2>
      ${site
        ? html`
          <div class="ranking-wrap">
            <table class="ranking">
              <colgroup><col class="c-pick"/><col class="c-name"/><col class="c-reg"/><col class="c-km"/><col class="c-dh"/><col class="c-score"/></colgroup>
              <thead><tr><th></th><th>${COLUMNS.station}</th><th>${COLUMNS.region}</th><th class="num">${COLUMNS.distance}</th><th class="num">${COLUMNS.dh}</th><th class="num">${COLUMNS.score}</th></tr></thead>
              <tbody>
                ${rows.map((r, i) => {
                  const chosen = r.station.id === pick?.station.id;
                  return html`<tr class="${chosen ? 'is-chosen' : ''}${i === TOP - 1 && app.showAll ? ' top-end' : ''}" data-station="${r.station.id}" tabindex="0" aria-selected="${chosen}">
                    <td class="pick">${chosen ? icon('check', { size: 14 }) : ''}</td>
                    <td class="name" title="${r.station.name} (${r.station.id}), ${fmt(r.station.height, 0)} m ü. M."><span>${r.station.name}</span> <span class="abbr">${r.station.id}</span></td>
                    <td class="reg${r.sameRegion ? '' : ' is-other'}">${r.station.region}</td>
                    <td class="num">${km(r.distance)}</td>
                    <td class="num">${signed(r.dh)}</td>
                    <td class="num">${km(r.score)}</td>
                  </tr>`;
                })}
              </tbody>
            </table>
          </div>
          <div class="block-foot">
            <button type="button" class="btn ghost small" data-action="toggle-all" aria-expanded="${app.showAll}">${icon('chevron', { size: 14 })}<span>${app.showAll ? ACTIONS.showTop : ACTIONS.showAll}</span></button>
            ${s.station && pick && pick !== ranking[0] ? html`<button type="button" class="btn ghost small icon-only" data-action="station-reset" title="${ACTIONS.stationReset}" aria-label="${ACTIONS.stationReset}">${icon('reset', { size: 14 })}</button>` : ''}
          </div>`
        : html`<div class="site-empty">–</div>`}
    </section>

    <details class="block weights" ${app.weightsOpen ? 'open' : ''}>
      <summary class="block-title">${icon('chevron', { size: 14 })}${SECTIONS.weights}</summary>
      <div class="weights-grid">
        <label class="field"><span class="field-label">${FIELDS.weightHeight} <span class="unit">${FIELDS.weightHeightUnit}</span></span>
          <input class="input num" id="w-height" inputmode="decimal" value="${toInputValue(s.weights.height)}" /></label>
        <label class="field"><span class="field-label">${FIELDS.weightRegion} <span class="unit">${FIELDS.weightRegionUnit}</span></span>
          <input class="input num" id="w-region" inputmode="decimal" value="${toInputValue(s.weights.region)}" /></label>
        <button type="button" class="btn ghost icon-only" data-action="weights-reset" title="${ACTIONS.weightsReset}" aria-label="${ACTIONS.weightsReset}"
          ${s.weights.height === DEFAULT_WEIGHTS.height && s.weights.region === DEFAULT_WEIGHTS.region ? 'disabled' : ''}>${icon('reset')}</button>
      </div>
    </details>`);
  if (focused) {
    const el = document.getElementById(focused);
    if (el && panel.contains(el)) el.focus({ preventScroll: true });
  }
}

function renderIssues() {
  const s = S();
  const items = [];
  if (s.site) {
    const { where, region, pick, ranking } = app.view;
    const focusHeight = () => $('#height')?.focus();
    if (app.height.pending) items.push({ id: 'height-pending', severity: 'info', text: NOTICES.heightPending });
    else if (app.height.failed && s.site.height == null) items.push({ id: 'height-failed', severity: 'warning', text: NOTICES.heightFailed, run: focusHeight });
    else if (s.site.height == null) items.push({ id: 'height-missing', severity: 'warning', text: NOTICES.heightMissing, run: focusHeight });
    if (region == null) items.push({ id: 'outside', severity: 'warning', text: NOTICES.outside });
    else if (!where.inside) items.push({ id: 'nearest', severity: 'info', text: NOTICES.nearest(region, where.distance / 1000) });
    if (region != null && where.inside && where.border / 1000 < BORDER_KM) {
      items.push({ id: 'border', severity: 'warning', text: NOTICES.border(regionLabel(app.data.regionById.get(where.neighbour)), where.border / 1000) });
    }
    if (s.station && pick && pick !== ranking[0]) {
      items.push({ id: 'manual', severity: 'info', text: NOTICES.manual(pick.station.name), action: { icon: 'reset', label: ACTIONS.stationReset, run: () => change((x) => (x.station = null)) } });
    }
  }
  app.issues.update(items);
}

// ============================================================================
// Search
// ============================================================================

const stripTags = (s) => String(s ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

function placeResult(p) {
  return {
    kind: 'place',
    title: p.name,
    meta: `${p.plz} ${p.municipality === p.name ? '' : `${p.municipality} `}${p.canton}`.replace(/\s+/g, ' '),
    site: { e: p.e, n: p.n, label: `${p.name} ${p.canton}`, detail: `${p.plz} ${p.name}${p.municipality === p.name ? '' : `, Gemeinde ${p.municipality}`}`, source: 'place' },
  };
}

function updateSearch() {
  const q = $('#search').value;
  const seq = ++app.search.seq;
  clearTimeout(app.search.timer);
  const results = [];
  const coords = parseCoordinates(q);
  if (coords) {
    const label = `${fmt(coords.e, 0)} / ${fmt(coords.n, 0)}`;
    results.push({ kind: 'coords', title: label, meta: coordsLabel(coords.system), site: { e: coords.e, n: coords.n, label, detail: coordsLabel(coords.system), source: 'coords' } });
  } else {
    for (const p of searchPlaces(app.data.places, q, 6)) results.push(placeResult(p));
  }
  app.search.results = results;
  app.search.active = results.length ? 0 : -1;
  app.search.loading = false;
  const letters = (q.match(/[a-zäöüéèàç]/gi) ?? []).length;
  if (!coords && letters >= 3) {
    app.search.loading = true;
    app.search.timer = setTimeout(() => searchAddresses(q, seq), 250);
  }
  renderSearch();
}

async function searchAddresses(q, seq) {
  let found = [];
  try {
    const url = `${API}/api/SearchServer?searchText=${encodeURIComponent(q)}&type=locations&origins=address,gazetteer&limit=6&sr=2056`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(String(res.status));
    const json = await res.json();
    found = (json.results ?? []).map((r) => {
      const a = r.attrs ?? {};
      const pos = a.y > 2e6 && a.x > 1e6 ? { e: a.y, n: a.x } : wgs84ToLv95(a.lat, a.lon);
      const label = stripTags(a.label);
      return { e: Math.round(pos.e), n: Math.round(pos.n), label };
    }).filter((r) => r.label && inBounds(r.e, r.n));
    app.search.addressFailed = false;
  } catch {
    app.search.addressFailed = true;
  }
  if (seq !== app.search.seq) return;
  const seen = new Set(app.search.results.map((r) => r.title));
  for (const f of found) {
    if (seen.has(f.label)) continue;
    app.search.results.push({ kind: 'address', title: f.label, meta: '', site: { e: f.e, n: f.n, label: f.label, detail: '', source: 'address' } });
  }
  if (app.search.active < 0 && app.search.results.length) app.search.active = 0;
  app.search.loading = false;
  renderSearch();
}

function renderSearch() {
  const input = $('#search');
  const list = $('#search-list');
  const { results, active, loading, addressFailed } = app.search;
  const open = document.activeElement === input && input.value.trim() !== '';
  const status = loading ? STATUS.searching : results.length ? '' : addressFailed ? STATUS.addressOffline : STATUS.noResult;
  list.innerHTML = String(html`
    ${results.map((r, i) => html`<li role="option" id="search-opt-${i}" class="search-opt${i === active ? ' is-active' : ''}" aria-selected="${i === active}" data-index="${i}">
      ${icon(r.kind === 'address' ? 'pin' : r.kind === 'coords' ? 'crop' : 'home', { size: 14 })}<span class="opt-title">${r.title}</span><span class="opt-meta">${r.meta}</span></li>`)}
    ${status ? html`<li class="search-status" role="presentation">${status}</li>` : ''}`);
  list.hidden = !open;
  input.setAttribute('aria-expanded', String(open));
  if (active >= 0) input.setAttribute('aria-activedescendant', `search-opt-${active}`);
  else input.removeAttribute('aria-activedescendant');
  list.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
}

function chooseResult(i) {
  const r = app.search.results[i];
  if (!r) return;
  const input = $('#search');
  input.value = r.site.label;
  app.search.results = [];
  app.search.seq++;
  input.blur();
  renderSearch();
  setSite(r.site);
}

function bindSearch() {
  const input = $('#search');
  const list = $('#search-list');
  $('#search-icon').innerHTML = String(icon('search'));
  input.placeholder = ACTIONS.search;
  input.setAttribute('aria-label', ACTIONS.search);
  input.addEventListener('input', updateSearch);
  input.addEventListener('focus', () => {
    if (input.value.trim()) {
      input.select();
      updateSearch();
    }
  });
  input.addEventListener('blur', () => setTimeout(renderSearch, 0));
  input.addEventListener('keydown', (e) => {
    const n = app.search.results.length;
    if (e.key === 'ArrowDown' && n) {
      e.preventDefault();
      app.search.active = (app.search.active + 1) % n;
      renderSearch();
    } else if (e.key === 'ArrowUp' && n) {
      e.preventDefault();
      app.search.active = (app.search.active - 1 + n) % n;
      renderSearch();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      chooseResult(Math.max(0, app.search.active));
    } else if (e.key === 'Escape') {
      e.preventDefault();
      input.value = '';
      updateSearch();
      input.blur();
    }
  });
  // pointerdown keeps the focus in the input until the choice is made
  list.addEventListener('pointerdown', (e) => e.preventDefault());
  list.addEventListener('click', (e) => {
    const li = e.target.closest('[data-index]');
    if (li) chooseResult(Number(li.dataset.index));
  });
}

// ============================================================================
// Actions
// ============================================================================

async function copyValues() {
  const s = S();
  if (!s.site) return;
  const text = copyRow({ site: s.site, region: app.view.region, pick: app.view.pick });
  try {
    await navigator.clipboard.writeText(text);
    toast(STATUS.copied, { kind: 'success', timeout: 2000 });
  } catch {
    toast(STATUS.copyFailed, { kind: 'error' });
  }
}

function undo() {
  if (app.store.undo()) afterHistory();
}

function redo() {
  if (app.store.redo()) afterHistory();
}

function afterHistory() {
  app.height.seq++;
  app.height.pending = false;
  app.height.failed = false;
  $('#search').value = S().site?.label ?? '';
  render();
  if (S().site && S().site.height == null && S().site.heightSource !== 'manual') fetchHeight();
}

function pickStation(id) {
  change((s) => (s.station = id === app.view.ranking[0]?.station.id ? null : id));
}

function bindActions() {
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-action]');
    if (!b || b.disabled) return;
    switch (b.dataset.action) {
      case 'undo': undo(); break;
      case 'redo': redo(); break;
      case 'copy': copyValues(); break;
      case 'fit': app.map.fit(); break;
      case 'zoom-in': app.map.zoom(1.5); break;
      case 'zoom-out': app.map.zoom(1 / 1.5); break;
      case 'toggle-all': app.showAll = !app.showAll; render(); break;
      case 'station-reset': change((s) => (s.station = null)); break;
      case 'weights-reset': change((s) => (s.weights = { ...DEFAULT_WEIGHTS })); break;
      case 'height-reset':
        change((s) => {
          s.site.height = null;
          s.site.heightSource = null;
        });
        fetchHeight();
        break;
    }
  });
  const panel = $('#panel');
  panel.addEventListener('click', (e) => {
    const row = e.target.closest('tr[data-station]');
    if (row) pickStation(row.dataset.station);
  });
  panel.addEventListener('keydown', (e) => {
    const row = e.target.closest('tr[data-station]');
    if (row && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      pickStation(row.dataset.station);
      panel.querySelector(`tr[data-station="${row.dataset.station}"]`)?.focus();
    }
  });
  panel.addEventListener('toggle', (e) => {
    if (e.target.matches('details.weights')) app.weightsOpen = e.target.open;
  }, true);
  panel.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'height') {
      const v = parseNum(t.value);
      if (v == null) {
        change((s) => {
          s.site.height = null;
          s.site.heightSource = null;
        });
        fetchHeight();
      } else if (Number.isFinite(v)) {
        app.height.seq++;
        app.height.pending = false;
        change((s) => {
          s.site.height = v;
          s.site.heightSource = 'manual';
        });
      } else t.setAttribute('aria-invalid', 'true');
    } else if (t.id === 'w-height' || t.id === 'w-region') {
      const key = t.id === 'w-height' ? 'height' : 'region';
      const v = parseNum(t.value);
      const [lo, hi] = WEIGHT_LIMITS[key];
      if (Number.isFinite(v) && v >= lo && v <= hi) change((s) => (s.weights[key] = v));
      else t.setAttribute('aria-invalid', 'true');
    }
  });
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('input')) e.target.blur();
  });
  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    const k = e.key.toLowerCase();
    const inText = e.target.matches?.('input, textarea');
    if (k === 'z' && !e.shiftKey && !inText) {
      e.preventDefault();
      undo();
    } else if ((k === 'y' || (k === 'z' && e.shiftKey)) && !inText) {
      e.preventDefault();
      redo();
    } else if (k === 'c' && !inText && !String(getSelection()) && S().site) {
      e.preventDefault();
      copyValues();
    }
  });
}

function setupChrome() {
  const set = (action, iconName, title, label) => {
    const b = $(`[data-action="${action}"]`);
    b.innerHTML = String(html`${icon(iconName)}${label ? html`<span class="btn-label">${label}</span>` : ''}`);
    b.title = title;
    b.setAttribute('aria-label', title);
  };
  set('undo', 'undo', ACTIONS.undo);
  set('redo', 'redo', ACTIONS.redo);
  set('copy', 'copy', `${ACTIONS.copy} (Strg+C)`, ACTIONS.copyLabel);
  const theme = document.createElement('button');
  theme.id = 'theme-toggle';
  theme.className = 'btn ghost icon-only';
  $('.appbar-actions').prepend(theme);
  bindThemeToggle(theme);
  mountSourceLink();
  $('#map-tools').innerHTML = String(html`
    <button type="button" class="btn icon-only" data-action="zoom-in" title="${ACTIONS.zoomIn}" aria-label="${ACTIONS.zoomIn}">${icon('plus')}</button>
    <button type="button" class="btn icon-only" data-action="zoom-out" title="${ACTIONS.zoomOut}" aria-label="${ACTIONS.zoomOut}">${icon('minus')}</button>
    <button type="button" class="btn icon-only" data-action="fit" title="${ACTIONS.fit}" aria-label="${ACTIONS.fit}">${icon('fit')}</button>`);
  $('#attribution').textContent = ATTRIBUTION;
  document.title = `${TITLE} – HLKS-Tools`;
}

// ============================================================================
// Start
// ============================================================================

function initialInputs() {
  const draft = normalizeInputs(DocumentStore.readDraft(DRAFT_KEY)?.inputs);
  return fromUrlParams(location.search, draft) ?? draft;
}

async function start() {
  setupChrome();
  app.issues = createIssuePanel($('#issues'), { emptyText: STATUS.empty, emptyIcon: 'info' });
  try {
    app.data = await loadData();
  } catch {
    app.issues.update([{ id: 'data', severity: 'error', text: STATUS.dataFailed }]);
    return;
  }
  app.store = new DocumentStore({ inputs: initialInputs() }, { draftKey: DRAFT_KEY });
  app.map = new RegionMap($('#map'), {
    onPick: (e, n) => {
      const label = `${fmt(e, 0)} / ${fmt(n, 0)}`;
      $('#search').value = '';
      setSite({ e, n, label, detail: SOURCES.map, source: 'map' }, { focus: false });
    },
    onStation: (id) => pickStation(id),
  });
  app.map.setData(app.data);
  bindSearch();
  bindActions();
  $('#search').value = S().site?.label ?? '';
  render();
  if (S().site) {
    if (S().site.height == null) fetchHeight();
    requestAnimationFrame(focusSite);
  }
}

start();
