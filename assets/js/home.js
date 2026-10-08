// Start page: one small network per discipline (Heizung, Lüftung, Klima, Sanitär) with one branch per tool,
// and one open button for any tool's PDF.

import { GROUPS, TOOLS, findTool, toolUrl } from '../../lib/core/registry.js';
import { readEnvelopeFromFile, pickFile, stashHandoff, enableFileDrop } from '../../lib/core/files.js';
import { html, raw, icon, toast, bindThemeToggle } from '../../lib/core/ui.js';

// ---- geometry (px; home.css reads ROW, HEAD and NET from custom properties set below) -------------

const ROW = 72; // one tool row
const HEAD = 64; // section head: source symbol and discipline name
const NET = 136; // drawing width; tool names start right of it
const CX = 24; // source symbol centre, the networks hang below it
const CY = 32;
const R = 22;
const OUT = CY + R; // where the medium leaves the source symbol
const REVEAL = 1.1; // px per ms the medium advances when a tool is activated

const yRow = (i) => HEAD + i * ROW + ROW / 2;

/** Path through points [x, y, cornerRadius?]; corners with a radius (90° only) are rounded. */
function route(points) {
  const pts = points.filter((p, k) => k === 0 || p[0] !== points[k - 1][0] || p[1] !== points[k - 1][1]);
  let [px, py] = pts[0];
  let d = `M${px} ${py}`;
  let len = 0;
  for (let k = 1; k < pts.length; k++) {
    const [x, y, r = 0] = pts[k];
    const next = pts[k + 1];
    if (r && next) {
      const ax = x - Math.sign(x - px) * r;
      const ay = y - Math.sign(y - py) * r;
      const bx = x + Math.sign(next[0] - x) * r;
      const by = y + Math.sign(next[1] - y) * r;
      d += `L${ax} ${ay}Q${x} ${y} ${bx} ${by}`;
      len += Math.hypot(ax - px, ay - py) + (Math.PI / 2) * r;
      [px, py] = [bx, by];
    } else {
      d += `L${x} ${y}`;
      len += Math.hypot(x - px, y - py);
      [px, py] = [x, y];
    }
  }
  return { d, len };
}

/**
 * One tool's branch. Planned: only its parts (valve shut, terminal idle). Ready: also the medium, which
 * is revealed from the source when the tool is activated and then keeps moving.
 */
function run(group, i, ready, flow, kind, parts) {
  if (!ready) return `<g class="run is-planned">${parts}</g>`;
  const id = `reveal-${group}-${i}`;
  const style = `--len:${Math.ceil(flow.len) + 24};--reveal:${Math.round(flow.len / REVEAL)}ms`;
  return (
    `<g class="run" data-i="${i}" style="${style}">` +
    `<mask id="${id}" maskUnits="userSpaceOnUse" x="-50" y="-50" width="${NET + 100}" height="9999"><path class="reveal" d="${flow.d}"/></mask>` +
    `<path class="flow flow-${kind}" d="${flow.d}" mask="url(#${id})"/>${parts}</g>`
  );
}

const ring = () => `<circle class="src-ring" cx="${CX}" cy="${CY}" r="${R}"/>`;

// ---- Heizung: Tichelmann (reverse return), every radiator has the same circuit length ---------------

function heating(rows) {
  const ys = rows.map((_, i) => yRow(i));
  const last = ys.at(-1);
  const SUP = CX + 6; // supply riser
  const RET = CX - 6; // return back to the boiler
  const COL = 112; // return collector, runs in the same direction as the supply
  const RAD = 66; // radiator left edge
  const bottom = last + 26;
  let svg = `<path class="pipe" d="M${SUP} ${CY}V${last - 8}M${COL} ${ys[0] + 8}V${bottom}H${RET}V${CY}"/>`;
  rows.forEach((ready, i) => {
    const y = ys[i];
    svg += `<path class="pipe${ready ? '' : ' is-planned'}" d="M${SUP} ${y - 8}H${RAD}M${RAD + 24} ${y + 8}H${COL}"/>`;
  });
  rows.forEach((ready, i) => {
    const y = ys[i];
    const flow = route([[SUP, OUT], [SUP, y - 8], [RAD + 12, y - 8], [RAD + 12, y + 8], [COL, y + 8], [COL, bottom], [RET, bottom], [RET, OUT]]);
    const valve = `<path class="valve" d="M42 ${y - 13}L54 ${y - 3}V${y - 13}L42 ${y - 3}Z"/>`;
    const radiator = `<g class="term"><rect x="${RAD}" y="${y - 14}" width="24" height="28" rx="1.5"/><path d="M${RAD + 6} ${y - 9}V${y + 9}M${RAD + 12} ${y - 9}V${y + 9}M${RAD + 18} ${y - 9}V${y + 9}"/></g>`;
    svg += run('heating', i, ready, flow, 'water', valve + radiator);
  });
  const flame =
    'M0 -13C4 -8 9 -4 9 3.5C9 9 5 12.5 0 12.5C-5 12.5 -9 9 -9 3.5C-9 -1 -6 -3.5 -4.5 -7.5C-3 -4 -1.5 -2.5 0.5 -1.5C2 -5.5 1.5 -9.5 0 -13Z' +
    'M0 12.5C-2.8 12.5 -4.2 10.5 -3.8 8C-3.4 5.8 -1.2 4.6 0 2.5C1.2 4.6 3.8 6 3.8 8.4C3.8 10.8 2.4 12.5 0 12.5Z';
  svg += `${ring()}<g transform="translate(${CX} ${CY})"><path class="src flame" d="${flame}"/></g>`;
  return { h: bottom + 2, svg };
}

// ---- Lüftung: fan, main duct, one branch per tool with a damper and a supply diffuser ---------------

function ventilation(rows) {
  const ys = rows.map((_, i) => yRow(i));
  const last = ys.at(-1);
  const END = 106; // diffuser
  const DAMPER = 64;
  // Ducts are drawn as wide strokes (walls) with a narrower background stroke on top (inside),
  // so tees and the closed end join without extra geometry.
  let svg = `<path class="duct-wall" d="M${CX} ${CY}V${last + 10}"/>`;
  rows.forEach((ready, i) => (svg += `<path class="duct-wall${ready ? '' : ' is-planned'}" d="M${CX + 10} ${ys[i]}H${END}"/>`));
  svg += `<path class="duct-in" d="M${CX} ${CY}V${last + 8}${ys.map((y) => `M${CX} ${y}H${END}`).join('')}"/>`;
  rows.forEach((ready, i) => {
    const y = ys[i];
    const flow = route([[CX, OUT], [CX, y], [END, y]]);
    const damper = `<g class="damper"><path d="M${DAMPER} ${y - 13}V${y + 13}"/><circle cx="${DAMPER}" cy="${y}" r="2.5"/></g>`;
    const diffuser = `<g class="term"><rect x="${END}" y="${y - 18}" width="10" height="36" rx="1"/><path d="M${END + 3} ${y - 10}h4M${END + 3} ${y - 3.5}h4M${END + 3} ${y + 3.5}h4M${END + 3} ${y + 10}h4"/></g>`;
    const jets = ready ? `<path class="flow flow-air out" d="M${END + 15} ${y - 7}l14 -6M${END + 15} ${y}h16M${END + 15} ${y + 7}l14 6"/>` : '';
    svg += run('ventilation', i, ready, flow, 'air', damper + diffuser + jets);
  });
  // four swept blades: straight leading edge, curved trailing edge to the next blade's root
  const at = (r, k) => `${(r * Math.cos((k * Math.PI) / 2)).toFixed(2)} ${(r * Math.sin((k * Math.PI) / 2)).toFixed(2)}`;
  const rotor = `M${at(2.5, 0)}${[0, 1, 2, 3].map((k) => `L${at(15, k)}A9 9 0 0 1 ${at(2.5, k + 1)}`).join('')}Z`;
  svg += `${ring()}<g transform="translate(${CX} ${CY})"><path class="src spin fan" d="${rotor}"/></g>`;
  return { h: last + 12, svg };
}

// ---- Klima: split system, refrigerant line with Y branches (refnet) to wall units -------------------

function cooling(rows) {
  const ys = rows.map((_, i) => yRow(i));
  const last = ys.at(-1);
  const UNIT = 94;
  const Y = 18; // branch: 45° from the trunk
  let svg = `<path class="pipe" d="M${CX} ${CY}V${last - Y}"/>`;
  rows.forEach((ready, i) => (svg += `<path class="pipe${ready ? '' : ' is-planned'}" d="M${CX} ${ys[i] - Y}L${CX + Y} ${ys[i]}H${UNIT}"/>`));
  rows.forEach((ready, i) => {
    const y = ys[i];
    const flow = route([[CX, OUT], [CX, y - Y], [CX + Y, y], [UNIT, y]]);
    const unit = `<g class="term"><rect x="${UNIT}" y="${y - 9}" width="32" height="16" rx="3"/><path d="M${UNIT + 6} ${y + 2}H${UNIT + 26}"/></g><path class="flap" d="M${UNIT + 5} ${y + 7}H${UNIT + 27}"/>`;
    const air = ready ? `<path class="flow flow-air out" d="M${UNIT + 10} ${y + 15}l-2 13M${UNIT + 16} ${y + 15}v13M${UNIT + 22} ${y + 15}l2 13"/>` : '';
    svg += run('cooling', i, ready, flow, 'gas', unit + air);
  });
  let flake = '';
  for (let a = 0; a < 180; a += 60) {
    const t = (a * Math.PI) / 180;
    const p = (r, s) => `${(r * Math.sin(t) + s * Math.cos(t)).toFixed(2)} ${(-r * Math.cos(t) + s * Math.sin(t)).toFixed(2)}`;
    flake += `M${p(-14, 0)}L${p(14, 0)}`;
    for (const r of [8, -8]) flake += `M${p(r * 1.5, -4)}L${p(r, 0)}L${p(r * 1.5, 4)}`;
  }
  svg += `${ring()}<g transform="translate(${CX} ${CY})"><path class="src spin flake" d="${flake}"/></g>`;
  return { h: last + 30, svg };
}

// ---- Sanitär: manifold with one supply line per tap (Einzelzuleitungen) ----------------------------

function plumbing(rows) {
  const ys = rows.map((_, i) => yRow(i));
  const n = rows.length;
  const xs = rows.map((_, i) => CX + 6 * ((n - 1) / 2 - i)); // first tap gets the rightmost line
  const BAR = OUT + 8; // manifold
  const TAP = 98;
  let svg = `<path class="pipe" d="M${CX} ${CY}V${BAR}"/><path class="manifold" d="M${Math.min(...xs) - 3} ${BAR}H${Math.max(...xs) + 3}"/>`;
  rows.forEach((ready, i) => (svg += `<path class="pipe${ready ? '' : ' is-planned'}" d="${route([[xs[i], BAR], [xs[i], ys[i], 8], [TAP, ys[i]]]).d}"/>`));
  rows.forEach((ready, i) => {
    const y = ys[i];
    const flow = route([[CX, OUT], [CX, BAR], [xs[i], BAR], [xs[i], y, 8], [TAP, y]]);
    // wall-mounted single-lever tap: the lever lies flat (closed) and lifts to open
    const tap = `<g class="term"><path d="M${TAP} ${y - 9}V${y + 9}M${TAP} ${y}H${TAP + 20}Q${TAP + 27} ${y} ${TAP + 27} ${y + 7}V${y + 10}M${TAP + 16} ${y}V${y - 5}"/></g><path class="lever" d="M${TAP + 16} ${y - 6}H${TAP + 4}"/>`;
    const water = ready ? `<path class="flow flow-water out" d="M${TAP + 27} ${y + 14}V${y + 34}"/>` : '';
    svg += run('plumbing', i, ready, flow, 'water', tap + water);
  });
  const tapIcon = 'M-13 -11V-1M-13 -6H2Q8 -6 8 0V2M-4 -6V-12M-8.5 -12H0.5';
  const drop = 'M8 6C10 9 11.5 10.5 11.5 12.5A3.5 3.5 0 0 1 4.5 12.5C4.5 10.5 6 9 8 6Z';
  svg += `${ring()}<g transform="translate(${CX} ${CY})"><path class="src" d="${tapIcon}"/><path class="src drop" d="${drop}"/></g>`;
  return { h: ys.at(-1) + 34, svg };
}

const DRAW = { heating, ventilation, cooling, plumbing };

// ---- page -------------------------------------------------------------------

/** Name of the locally saved draft of a tool ("Projekt – Anlage"), or ''. */
function draftLabel(id) {
  try {
    const d = JSON.parse(localStorage.getItem(`hlks-tools:${id}:draft`) || 'null');
    if (!d) return '';
    return [d.project?.name, d.inputs?.system?.name].filter(Boolean).join(' – ');
  } catch {
    return '';
  }
}

function toolRow(t, i) {
  const ready = t.status === 'ready';
  const draft = ready ? draftLabel(t.id) : '';
  const body = html`
    <span class="tool-name">${t.name}</span>
    ${draft ? html`<span class="tool-meta">${icon('save', { size: 12 })}${draft}</span>` : ''}`;
  return ready
    ? html`<li class="tool is-ready" data-i="${i}"><a href="${t.path}">${body}</a></li>`
    : html`<li class="tool is-planned" title="In Planung"><div aria-disabled="true">${body}<span class="visually-hidden">In Planung</span></div></li>`;
}

function renderNetworks() {
  const host = document.getElementById('tools');
  host.style.cssText = `--row:${ROW}px;--head:${HEAD}px;--net:${NET}px`;
  host.innerHTML = GROUPS.map((g) => {
    const tools = TOOLS.filter((t) => t.group === g.id);
    const { h, svg } = DRAW[g.id](tools.map((t) => t.status === 'ready'));
    return String(html`
      <section class="discipline" aria-labelledby="group-${g.id}">
        ${raw(`<svg class="net" width="${NET}" height="${h}" viewBox="0 0 ${NET} ${h}" aria-hidden="true">${svg}</svg>`)}
        <h2 class="discipline-name" id="group-${g.id}">${g.name}</h2>
        <ol class="tools">${tools.map(toolRow)}</ol>
      </section>`);
  }).join('');
}

/** Hover or keyboard focus on a ready tool runs its branch; nothing moves otherwise. */
function bindFlow(host) {
  for (const li of host.querySelectorAll('.tool.is-ready')) {
    const section = li.closest('.discipline');
    const branch = section.querySelector(`.run[data-i="${li.dataset.i}"]`);
    const a = li.querySelector('a');
    let hover = false;
    let focus = false;
    const update = () => {
      branch.classList.toggle('is-active', hover || focus);
      section.classList.toggle('is-on', !!section.querySelector('.run.is-active'));
    };
    a.addEventListener('pointerenter', () => ((hover = true), update()));
    a.addEventListener('pointerleave', () => ((hover = false), update()));
    a.addEventListener('focus', () => ((focus = a.matches(':focus-visible')), update()));
    a.addEventListener('blur', () => ((focus = false), update()));
    // back/forward cache: do not come back with a running branch
    addEventListener('pagehide', () => ((hover = focus = false), update()));
  }
}

async function openFile(file) {
  if (!file) return;
  try {
    const env = await readEnvelopeFromFile(file);
    const tool = findTool(env.tool);
    if (!tool || tool.status !== 'ready') {
      toast('Unbekanntes Werkzeug', { kind: 'error', timeout: 7000 });
      return;
    }
    if (!stashHandoff(env)) {
      toast('Übergabe blockiert (Browser-Speicher gesperrt)', { kind: 'error', timeout: 8000 });
      return;
    }
    location.href = toolUrl(env.tool);
  } catch (e) {
    toast(e.message, { kind: 'error', timeout: 8000 });
  }
}

renderNetworks();
bindFlow(document.getElementById('tools'));
bindThemeToggle(document.getElementById('theme-toggle'));
const openBtn = document.getElementById('open-file');
openBtn.innerHTML = String(html`${icon('open')}<span>Öffnen</span>`);
openBtn.addEventListener('click', async () => openFile(await pickFile()));
enableFileDrop(openFile);
