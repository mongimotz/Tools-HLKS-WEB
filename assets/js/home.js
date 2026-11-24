// SPDX-License-Identifier: AGPL-3.0-or-later
// Start page: one small network per discipline (Heizung, Lüftung, Klima, Sanitär) with one branch per tool,
// tiles for tools without a discipline, and one open button for any PDF (HLKS-Tools PDFs open in their tool,
// other PDFs in the PDF-Editor).

import { GROUPS, GENERAL, TOOLS } from '../../lib/core/registry.js';
import { readAnyFile, routeToTool, pickFile, takeHandoff, enableFileDrop } from '../../lib/core/files.js';
import { draftLabelFor, mountDossierDialog, DOSSIER_TOOL_ID } from '../../lib/core/dossier.js';
import { html, raw, icon, toast, bindThemeToggle, mountSourceLink } from '../../lib/core/ui.js';

// ---- geometry (px; home.css reads ROW, HEAD and NET from custom properties set below) -------------

const ROW = 72; // one tool row
const HEAD = 64; // section head: source symbol and discipline name
const NET = 136; // drawing width; tool names start right of it
const CX = 24; // source symbol centre, the networks hang below it
const CY = 32;
const R = 21;
const OUT = CY + R; // where the medium leaves the source symbol
const REVEAL = 0.85; // px per ms the medium advances when a tool is activated

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

const ring = () => `<circle class="src-ring" cx="${CX}" cy="${CY}" r="${R}"/>`;

// ---- Heizung: Tichelmann (reverse return), Vorlauf red, Rücklauf blue, thermostatic valve ---------

function heating(rows) {
  const ys = rows.map((_, i) => yRow(i));
  const last = ys.at(-1);
  const SUP = CX + 5.5; // supply riser (Vorlauf)
  const RET = CX - 5.5; // return riser back to the boiler (Rücklauf)
  const RAD = 64; // radiator left edge
  const RAD_W = 28;
  const COL = 108; // Tichelmann return collector
  const bottom = last + 25;

  const supMain = route([[SUP, CY], [SUP, last - 8, 5], [RAD, last - 8]]).d;
  const colPath = route([[RAD + RAD_W, ys[0] + 8], [COL, ys[0] + 8, 5], [COL, bottom, 7], [RET, bottom, 7], [RET, CY]]).d;
  let svg = `<path class="pipe" d="${supMain}"/><path class="pipe" d="${colPath}"/>`;

  rows.forEach((ready, i) => {
    const y = ys[i];
    const cls = `pipe${ready ? '' : ' is-placeholder'}`;
    if (i < rows.length - 1) svg += `<path class="${cls}" d="M${SUP} ${y - 8}H${RAD}"/>`;
    if (i > 0) svg += `<path class="${cls}" d="M${RAD + RAD_W} ${y + 8}H${COL}"/>`;
  });

  rows.forEach((ready, i) => {
    const y = ys[i];
    const vx = 47;
    const valve =
      `<g>` +
      `<path class="tvalve-body" d="M${vx - 5.5} ${y - 11.2}L${vx + 5.5} ${y - 4.8}V${y - 11.2}L${vx - 5.5} ${y - 4.8}Z"/>` +
      `<circle class="tvalve-seat" cx="${vx}" cy="${y - 8}" r="2"/>` +
      `<path class="tvalve-pin" d="M${vx} ${y - 10.8}V${y - 15}"/>` +
      `<rect class="tvalve-head" x="${vx - 4.2}" y="${y - 20.2}" width="8.4" height="5.2" rx="1.4"/>` +
      `</g>`;

    const ribW = 5.6;
    const ribs = [0, 1, 2, 3, 4].map((k) => `<rect x="${(RAD + k * ribW).toFixed(1)}" y="${y - 13}" width="${ribW}" height="26" rx="1.8"/>`).join('');

    if (!ready) {
      svg += `<g class="run is-placeholder">${valve}<g class="rad-frame">${ribs}</g></g>`;
      return;
    }

    const supFlow = route([[SUP, OUT], [SUP, y - 8, 5], [RAD + 2, y - 8]]);
    const retFlow = route([[RAD + RAD_W - 2, y + 8], [COL, y + 8, 5], [COL, bottom, 7], [RET, bottom, 7], [RET, OUT]]);
    const supReveal = Math.round(supFlow.len / REVEAL);
    const retReveal = Math.round(retFlow.len / (REVEAL * 1.15));
    const supLen = Math.ceil(supFlow.len) + 20;
    const retLen = Math.ceil(retFlow.len) + 20;
    const radId = `rad-warm-${i}`;
    const mSup = `h-sup-${i}`;
    const mRet = `h-ret-${i}`;
    const radiator =
      `<g><g class="rad-frame">${ribs}</g>` +
      `<clipPath id="${radId}"><rect class="rad-warm-mask-rect" x="${RAD - 1}" y="${y - 14}" width="${RAD_W + 2}" height="28"/></clipPath>` +
      `<g class="rad-warm" clip-path="url(#${radId})">${ribs}</g></g>`;
    const waves =
      `<g class="heat-wrap">` +
      `<path class="heat-wave" d="M${RAD + 6.5} ${y - 17}q-2 -3.2 0 -6.4t0 -6.4"/>` +
      `<path class="heat-wave" style="animation-delay:-0.3s" d="M${RAD + 14} ${y - 18}q-2 -3.2 0 -6.4t0 -6.4"/>` +
      `<path class="heat-wave" style="animation-delay:-0.6s" d="M${RAD + 21.5} ${y - 17}q-2 -3.2 0 -6.4t0 -6.4"/>` +
      `</g>`;

    svg +=
      `<g class="run" data-i="${i}" style="--len:${supLen};--reveal:${supReveal}ms">` +
      `<mask id="${mSup}" maskUnits="userSpaceOnUse" x="-20" y="-20" width="${NET + 40}" height="${bottom + 40}"><path class="reveal" d="${supFlow.d}"/></mask>` +
      `<mask id="${mRet}" maskUnits="userSpaceOnUse" x="-20" y="-20" width="${NET + 40}" height="${bottom + 40}"><path class="reveal" style="--len:${retLen};--reveal:${retReveal}ms;transition-delay:${supReveal + 120}ms" d="${retFlow.d}"/></mask>` +
      `<path class="flow-base-hot" stroke-width="2.4" d="${supFlow.d}" mask="url(#${mSup})"/>` +
      `<path class="flow flow-hot" d="${supFlow.d}" mask="url(#${mSup})"/>` +
      `<path class="flow-base-cold" stroke-width="2.2" d="${retFlow.d}" mask="url(#${mRet})"/>` +
      `<path class="flow flow-heat-ret" d="${retFlow.d}" mask="url(#${mRet})"/>` +
      `${valve}${radiator}${waves}</g>`;
  });

  const flameOuter =
    'M0 -13.5C4.5 -8.5 9.5 -4 9.5 3.5C9.5 9.2 5.2 12.8 0 12.8C-5.2 12.8 -9.5 9.2 -9.5 3.5C-9.5 -1 -6 -3.8 -4.4 -7.6C-2.8 -4 -1.4 -2.4 0.5 -1.4C2.1 -5.6 1.6 -9.6 0 -13.5Z';
  const flameInner = 'M0 12.5C-3 12.5 -4.4 10.3 -3.9 7.6C-3.4 5.2 -1.2 4 0 1.8C1.2 4 3.9 5.4 3.9 8C3.9 10.6 2.5 12.5 0 12.5Z';
  svg += `${ring()}<g transform="translate(${CX} ${CY}) scale(1.06)"><g class="js-flame"><path class="src flame-outer" d="${flameOuter}"/><path class="flame-core" d="${flameInner}"/></g></g>`;
  return { h: bottom + 8, svg };
}

// ---- Lüftung: 4-blade fan with inertia, curved sheet-metal duct, in-duct damper, flared diffuser --

function ventilation(rows) {
  const ys = rows.map((_, i) => yRow(i));
  const last = ys.at(-1);
  const END = 90; // diffuser throat
  const DAMPER = 59;

  // Main trunk curves smoothly into the last branch; upper branches use curved take-offs.
  const mainElbow = route([[CX, CY], [CX, last, 11], [END, last]]).d;
  let svg = `<path class="duct-wall" d="${mainElbow}"/>`;
  rows.forEach((ready, i) => {
    if (i === rows.length - 1) return;
    const y = ys[i];
    svg += `<path class="duct-wall${ready ? '' : ' is-placeholder'}" d="M${CX} ${y - 9}Q${CX} ${y} ${CX + 9} ${y}H${END}"/>`;
  });
  svg += `<path class="duct-in" d="${mainElbow}${ys.slice(0, -1).map((y) => `M${CX} ${y - 9}Q${CX} ${y} ${CX + 9} ${y}H${END}`).join('')}"/>`;
  svg += `<path class="duct-flange" d="M${CX - 10.5} ${OUT + 5}H${CX + 10.5}"/>`;

  rows.forEach((ready, i) => {
    const y = ys[i];
    const flange = `<path class="duct-flange${ready ? '' : ' is-placeholder'}" d="M${END - 3} ${y - 10}V${y + 10}"/>`;
    const damper =
      `<g>` +
      `<circle class="damper-boss" cx="${DAMPER}" cy="${y - 8}" r="1.35"/>` +
      `<circle class="damper-boss" cx="${DAMPER}" cy="${y + 8}" r="1.35"/>` +
      `<path class="damper-blade" d="M${DAMPER - 5.6} ${y}H${DAMPER + 5.6}"/>` +
      `<circle class="damper-pivot" cx="${DAMPER}" cy="${y}" r="1.8"/>` +
      `</g>`;
    const diffuser =
      `<g>` +
      `<path class="diffuser-body" d="M${END} ${y - 8}L${END + 5} ${y - 14.5}H${END + 10.5}V${y + 14.5}H${END + 5}L${END} ${y + 8}Z"/>` +
      `<path class="diffuser-blade" d="M${END + 6.2} ${y - 9}l3 -1.8M${END + 6.2} ${y - 3}l3 -0.7M${END + 6.2} ${y + 3}l3 0.7M${END + 6.2} ${y + 9}l3 1.8"/>` +
      `</g>`;

    if (!ready) {
      svg += `<g class="run is-placeholder">${flange}${damper}${diffuser}</g>`;
      return;
    }

    const streamA = route([[CX - 2.1, OUT], [CX - 2.1, y - 2.1, 10], [END, y - 2.1]]);
    const streamB = route([[CX + 2.1, OUT], [CX + 2.1, y + 2.1, 7], [END, y + 2.1]]);
    const len = Math.ceil(streamA.len) + 22;
    const rev = Math.round(streamA.len / REVEAL);
    const mId = `v-m-${i}`;
    const plumes =
      `<g class="plume-wrap">` +
      `<path class="air-plume p1" d="M${END + 13.5} ${y - 7}Q${END + 22} ${y - 11.5} ${END + 32} ${y - 12.5}"/>` +
      `<path class="air-plume p2" d="M${END + 13.5} ${y}Q${END + 23} ${y - 0.5} ${END + 34} ${y}"/>` +
      `<path class="air-plume p3" d="M${END + 13.5} ${y + 7}Q${END + 22} ${y + 11.5} ${END + 32} ${y + 12.5}"/>` +
      `</g>`;

    svg +=
      `<g class="run" data-i="${i}" style="--len:${len};--reveal:${rev}ms">` +
      `<mask id="${mId}" maskUnits="userSpaceOnUse" x="-10" y="-10" width="${NET + 30}" height="${last + 40}"><path class="reveal" d="${streamA.d}"/></mask>` +
      `<path class="flow flow-air-a" d="${streamA.d}" mask="url(#${mId})"/>` +
      `<path class="flow flow-air-b" d="${streamB.d}" mask="url(#${mId})"/>` +
      `${flange}${damper}${diffuser}${plumes}</g>`;
  });

  // Original 4-blade swept impeller; separate blades leave clear gaps around the fixed hub.
  const blade = 'M-1.5 -3L-5 -12C-6 -15 -4 -17 -1 -17H4C7 -17 8 -14 6 -11L3 -1.5Z';
  const rotor = [0, 90, 180, 270].map((a) => `<path class="src" transform="rotate(${a})" d="${blade}"/>`).join('');
  svg += `${ring()}<g transform="translate(${CX} ${CY}) scale(0.92)"><g class="js-fan">${rotor}</g><circle class="fan-hub" r="3"/></g>`;
  return { h: last + 18, svg };
}

// ---- Klima: crystallizing snowflake, chilled-water supply/return, fan-coil units (Umluftkühler) ---

function cooling(rows) {
  const ys = rows.map((_, i) => yRow(i));
  const last = ys.at(-1);
  const SUP = CX + 4.5;
  const RET = CX - 4.5;
  const BOX = 58;
  const BOX_W = 46;

  let svg = '';
  rows.forEach((ready, i) => {
    const y = ys[i];
    svg += `<path class="pipe${ready ? '' : ' is-placeholder'}" d="M${RET} ${y + 5.5}H${BOX}"/>`;
  });
  svg += `<path class="pipe" d="${route([[RET, CY], [RET, last + 5.5, 5], [BOX, last + 5.5]]).d}"/>`;

  svg += `<path class="pipe-halo" d="M${SUP} ${OUT}V${last - 5.5}"/>`;
  svg += `<path class="pipe" d="${route([[SUP, CY], [SUP, last - 5.5, 5], [BOX, last - 5.5]]).d}"/>`;
  rows.forEach((ready, i) => {
    if (i === rows.length - 1) return;
    const y = ys[i];
    svg += `<path class="pipe${ready ? '' : ' is-placeholder'}" d="M${SUP} ${y - 5.5}H${BOX}"/>`;
  });

  rows.forEach((ready, i) => {
    const y = ys[i];
    const fanX = BOX + 32;
    const fanY = y;
    const unit =
      `<g>` +
      `<rect class="fc-box" x="${BOX}" y="${y - 12.5}" width="${BOX_W}" height="25" rx="2.8"/>` +
      `<path class="fc-fin" d="M${BOX + 6} ${y - 8}V${y + 8}M${BOX + 11} ${y - 8}V${y + 8}M${BOX + 16} ${y - 8}V${y + 8}"/>` +
      `<circle class="fc-ring" cx="${fanX}" cy="${fanY}" r="8.2"/>` +
      `<g transform="translate(${fanX} ${fanY})"><g class="${ready ? 'js-fc-fan' : ''}" data-fc="${i}">` +
      `<path class="fc-blade" d="M0 -6V6M-6 0H6M-4.2 -4.2L4.2 4.2M-4.2 4.2L4.2 -4.2"/>` +
      `</g><circle class="fc-ring" r="2"/></g></g>`;

    if (!ready) {
      svg += `<g class="run is-placeholder">${unit}</g>`;
      return;
    }

    const sup = route([[SUP, OUT], [SUP, y - 5.5, 5], [BOX + 2, y - 5.5]]);
    const ret = route([[RET, OUT], [RET, y + 5.5, 5], [BOX + 2, y + 5.5]]);
    const supLen = Math.ceil(sup.len) + 20;
    const retLen = Math.ceil(ret.len) + 20;
    const rev = Math.round(sup.len / REVEAL);
    const mSup = `c-s-${i}`;
    const mRet = `c-r-${i}`;
    const plumes =
      `<g class="fc-plume-wrap">` +
      `<path class="fc-plume" d="M${BOX + BOX_W + 4} ${y - 6.5}Q${BOX + BOX_W + 14} ${y - 10} ${BOX + BOX_W + 25} ${y - 10.5}"/>` +
      `<path class="fc-plume d2" d="M${BOX + BOX_W + 4} ${y}H${BOX + BOX_W + 27}"/>` +
      `<path class="fc-plume d3" d="M${BOX + BOX_W + 4} ${y + 6.5}Q${BOX + BOX_W + 14} ${y + 10} ${BOX + BOX_W + 25} ${y + 10.5}"/>` +
      `</g>`;

    svg +=
      `<g class="run" data-i="${i}" style="--len:${supLen};--reveal:${rev}ms">` +
      `<mask id="${mSup}" maskUnits="userSpaceOnUse" x="-10" y="-10" width="${NET + 30}" height="${last + 40}"><path class="reveal" d="${sup.d}"/></mask>` +
      `<mask id="${mRet}" maskUnits="userSpaceOnUse" x="-10" y="-10" width="${NET + 30}" height="${last + 40}"><path class="reveal" style="--len:${retLen};transition-delay:${rev + 140}ms" d="${ret.d}"/></mask>` +
      `<path class="flow-base-cold" stroke-width="2.1" d="${sup.d}" mask="url(#${mSup})"/>` +
      `<path class="flow flow-chilled-sup" d="${sup.d}" mask="url(#${mSup})"/>` +
      `<path class="flow-base-cold-ret" stroke-width="1.9" d="${ret.d}" mask="url(#${mRet})"/>` +
      `<path class="flow flow-chilled-ret" d="${ret.d}" mask="url(#${mRet})"/>` +
      `${unit}${plumes}</g>`;
  });

  // Static snowflake crystallizing outward from centre to tips when active.
  let arms = '';
  for (let a = 0; a < 360; a += 60) {
    const t = (a * Math.PI) / 180;
    const p = (rad, s) => `${(rad * Math.sin(t) + s * Math.cos(t)).toFixed(2)} ${(-rad * Math.cos(t) + s * Math.sin(t)).toFixed(2)}`;
    const d = `M0 0L${p(13, 0)}M${p(7.8, 0)}L${p(11.4, -3.4)}M${p(7.8, 0)}L${p(11.4, 3.4)}`;
    arms += `<path class="flake-base" d="${d}"/><path class="flake-frost" d="${d}"/>`;
  }
  svg += `${ring()}<g transform="translate(${CX} ${CY})">${arms}<circle class="flake-core-dot" r="2"/></g>`;
  return { h: last + 32, svg };
}

// ---- Sanitär: manifold block with individual supply lines, sleek wall mixer tap -------------------

function plumbing(rows) {
  const ys = rows.map((_, i) => yRow(i));
  const n = rows.length;
  const xs = rows.map((_, i) => CX + 6.5 * ((n - 1) / 2 - i)); // first tap gets the rightmost line
  const BAR = OUT + 10;
  const TAP = 86;

  const minX = Math.min(...xs) - 5;
  const maxX = Math.max(...xs) + 5;
  let svg =
    `<path class="pipe" d="M${CX} ${CY}V${BAR - 3}"/>` +
    `<rect class="manifold-body" x="${minX}" y="${BAR - 3}" width="${maxX - minX}" height="6" rx="1.8"/>`;

  xs.forEach((x, i) => {
    const cls = rows[i] ? '' : ' is-placeholder';
    svg += `<path class="manifold-port${cls}" d="M${x} ${BAR + 3}V${BAR + 6.5}"/>`;
    svg += `<path class="pipe${cls}" d="${route([[x, BAR + 5], [x, ys[i], 10], [TAP, ys[i]]]).d}"/>`;
  });

  rows.forEach((ready, i) => {
    const y = ys[i];
    const tap =
      `<g>` +
      `<rect class="tap-rosette" x="${TAP}" y="${y - 7}" width="3.2" height="14" rx="1"/>` +
      `<path class="tap-spout" d="M${TAP + 3.2} ${y - 2}H${TAP + 17.5}C${TAP + 24.5} ${y - 2} ${TAP + 28.5} ${y + 2} ${TAP + 28.5} ${y + 8.5}V${y + 11.2}H${TAP + 24.7}V${y + 8.5}C${TAP + 24.7} ${y + 4.2} ${TAP + 22.5} ${y + 1.8} ${TAP + 17.5} ${y + 1.8}H${TAP + 3.2}Z"/>` +
      `<path class="tap-aerator" d="M${TAP + 24.2} ${y + 11.7}H${TAP + 29}"/>` +
      `<rect class="tap-cartridge" x="${TAP + 5.5}" y="${y - 6}" width="5.4" height="4" rx="1.2"/>` +
      `<path class="tap-lever" d="M${TAP + 8.2} ${y - 6.2}L${TAP + 19} ${y - 8}"/>` +
      `</g>`;

    if (!ready) {
      svg += `<g class="run is-placeholder">${tap}</g>`;
      return;
    }

    const flow = route([[CX, OUT], [CX, BAR], [xs[i], BAR], [xs[i], y, 10], [TAP + 2, y]]);
    const len = Math.ceil(flow.len) + 20;
    const rev = Math.round(flow.len / (REVEAL * 1.15));
    const mId = `p-m-${i}`;
    const sx = TAP + 26.6;
    const sy = y + 13.8;
    const stream =
      `<path class="water-stream-core" d="M${sx} ${sy}V${sy + 18.5}"/>` +
      `<g class="water-sheen-wrap"><path class="water-stream-sheen" d="M${sx - 0.3} ${sy + 1}V${sy + 17.5}"/></g>` +
      `<g class="splash-wrap"><g class="water-splash">` +
      `<path d="M${sx - 5.2} ${sy + 18.5}Q${sx - 2.8} ${sy + 15} ${sx - 1.4} ${sy + 18}"/>` +
      `<path d="M${sx + 5.2} ${sy + 18.5}Q${sx + 2.8} ${sy + 15} ${sx + 1.4} ${sy + 18}"/>` +
      `</g></g>`;

    svg +=
      `<g class="run" data-i="${i}" style="--len:${len};--reveal:${rev}ms">` +
      `<mask id="${mId}" maskUnits="userSpaceOnUse" x="-10" y="-10" width="${NET + 30}" height="${ys.at(-1) + 50}"><path class="reveal" d="${flow.d}"/></mask>` +
      `<path class="flow-base-cold" stroke-width="2.3" d="${flow.d}" mask="url(#${mId})"/>` +
      `<path class="flow flow-tap" d="${flow.d}" mask="url(#${mId})"/>` +
      `${tap}${stream}</g>`;
  });

  const dropPath = 'M0 -14.8C-2.6 -10.4 -11 -2.4 -11 3.6C-11 9.5 -6.3 13.8 0 13.8C6.3 13.8 11 9.5 11 3.6C11 -2.4 2.6 -10.4 0 -14.8Z';
  const hasReady = rows.some(Boolean);
  const wave = hasReady
    ? `<clipPath id="drop-clip"><path d="${dropPath}"/></clipPath>` +
      `<g class="drop-fill" clip-path="url(#drop-clip)">` +
      `<path class="js-drop-wave drop-wave" d="M-48 0Q-42 -2.8 -36 0T-24 0T-12 0T0 0T12 0T24 0T36 0T48 0V24H-48Z"/>` +
      `</g>`
    : '';
  svg +=
    `${ring()}<g transform="translate(${CX} ${CY})">${wave}` +
    `<path class="src" d="${dropPath}"/>` +
    `<path class="drop-reflection" d="M-6.5 3.6C-6.5 7 -4.4 9.5 -1.6 9.5"/>` +
    `</g>`;
  return { h: ys.at(-1) + 38, svg };
}

const DRAW = { heating, ventilation, cooling, plumbing };

// ---- page -------------------------------------------------------------------

function toolRow(t, i) {
  const ready = t.status === 'ready';
  const draft = ready ? draftLabelFor(t.id) : '';
  const body = html`
    <span class="tool-name">${t.name}</span>
    ${draft ? html`<span class="tool-meta">${icon('save', { size: 12 })}${draft}</span>` : ''}`;
  return ready
    ? html`<li class="tool is-ready" data-i="${i}"><a href="${t.path}">${body}</a></li>`
    : html`<li class="tool is-placeholder"><div aria-disabled="true">${body}</div></li>`;
}

function renderNetworks() {
  const host = document.getElementById('tools');
  host.style.cssText = `--row:${ROW}px;--head:${HEAD}px;--net:${NET}px`;
  host.innerHTML = GROUPS.map((g) => {
    const tools = TOOLS.filter((t) => t.group === g.id);
    const { h, svg } = DRAW[g.id](tools.map((t) => t.status === 'ready'));
    return String(html`
      <section class="discipline" data-group="${g.id}" aria-labelledby="group-${g.id}">
        ${raw(`<svg class="net" width="${NET}" height="${h}" viewBox="0 0 ${NET} ${h}" aria-hidden="true">${svg}</svg>`)}
        <h2 class="discipline-name" id="group-${g.id}">${g.name}</h2>
        <ol class="tools">${tools.map(toolRow)}</ol>
      </section>`);
  }).join('');
}

/**
 * Hover or keyboard focus on a ready tool runs its branch; nothing moves otherwise.
 * Mechanical inertia (fans, burner flame, water-drop wave) runs in a single rAF loop
 * that caches its DOM references once and stops completely when all parts settle.
 */
function bindFlow(host) {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const fanEl = host.querySelector('.js-fan');
  const flameEl = host.querySelector('.js-flame');
  const dropEl = host.querySelector('.js-drop-wave');
  const fcEls = new Map([...host.querySelectorAll('.js-fc-fan')].map((el) => [Number(el.dataset.fc), el]));

  const fan = { angle: 0, vel: 0, target: 0 };
  const fcState = new Map([...fcEls.keys()].map((idx) => [idx, { angle: 0, vel: 0, target: 0 }]));
  const flame = { level: 0, target: 0, t: 0 };
  const drop = { level: 0, target: 0, phase: 0 };

  if (dropEl) dropEl.style.transform = 'translate(0px, 16px)';

  let rafId = 0;
  let lastTs = 0;

  function tick(ts) {
    const dt = Math.min(0.05, lastTs ? (ts - lastTs) / 1000 : 0.016);
    lastTs = ts;
    let moving = false;

    if (fanEl) {
      const accel = fan.target > fan.vel ? 15 : 3.0;
      fan.vel += (fan.target - fan.vel) * Math.min(1, accel * dt);
      if (fan.vel < 0.02 && fan.target === 0) fan.vel = 0;
      if (fan.vel > 0) {
        fan.angle = (fan.angle + fan.vel * dt * 57.2958) % 360;
        fanEl.style.transform = `rotate(${fan.angle.toFixed(2)}deg)`;
        moving = true;
      }
    }

    for (const [idx, fc] of fcState) {
      const acc = fc.target > fc.vel ? 14 : 3.2;
      fc.vel += (fc.target - fc.vel) * Math.min(1, acc * dt);
      if (fc.vel < 0.02 && fc.target === 0) fc.vel = 0;
      if (fc.vel > 0) {
        fc.angle = (fc.angle + fc.vel * dt * 57.2958) % 360;
        fcEls.get(idx).style.transform = `rotate(${fc.angle.toFixed(2)}deg)`;
        moving = true;
      }
    }

    if (flameEl) {
      flame.level += (flame.target - flame.level) * Math.min(1, 7 * dt);
      if (flame.level < 0.01 && flame.target === 0) flame.level = 0;
      if (flame.level > 0) {
        flame.t += dt;
        const sy = 1 + flame.level * (0.045 * Math.sin(flame.t * 11.3) + 0.028 * Math.sin(flame.t * 19.7));
        const sx = 1 - flame.level * (0.03 * Math.sin(flame.t * 11.3 + 0.4));
        const skew = flame.level * (2.2 * Math.sin(flame.t * 7.1) + 1.3 * Math.cos(flame.t * 15.2));
        flameEl.style.transform = `skewX(${skew.toFixed(2)}deg) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`;
        moving = true;
      } else {
        flameEl.style.transform = '';
      }
    }

    if (dropEl) {
      drop.level += (drop.target - drop.level) * Math.min(1, 5.2 * dt);
      if (drop.level < 0.01 && drop.target === 0) drop.level = 0;
      if (drop.level > 0) {
        drop.phase = (drop.phase + dt * 28) % 24;
        const yOff = 15 - drop.level * 16.5;
        dropEl.style.transform = `translate(${(drop.phase - 12).toFixed(2)}px, ${yOff.toFixed(2)}px)`;
        moving = true;
      } else {
        dropEl.style.transform = 'translate(0px, 16px)';
      }
    }

    if (moving) {
      rafId = requestAnimationFrame(tick);
    } else {
      rafId = 0;
      lastTs = 0;
    }
  }

  function wake() {
    if (!rafId && !reducedMotion.matches) rafId = requestAnimationFrame(tick);
  }

  function stopAll() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
      lastTs = 0;
    }
    fan.vel = fan.target = 0;
    for (const fc of fcState.values()) fc.vel = fc.target = 0;
    flame.level = flame.target = 0;
    drop.level = drop.target = 0;
    if (flameEl) flameEl.style.transform = '';
    if (dropEl) dropEl.style.transform = 'translate(0px, 16px)';
  }

  for (const li of host.querySelectorAll('.tool.is-ready')) {
    const section = li.closest('.discipline');
    const group = section.dataset.group;
    const idx = Number(li.dataset.i);
    const branch = section.querySelector(`.run[data-i="${idx}"]`);
    const a = li.querySelector('a');
    let hover = false;
    let focus = false;
    const update = () => {
      const active = hover || focus;
      branch.classList.toggle('is-active', active);
      const on = !!section.querySelector('.run.is-active');
      section.classList.toggle('is-on', on);
      if (group === 'ventilation') fan.target = on ? 10.5 : 0;
      if (group === 'cooling') {
        const fc = fcState.get(idx);
        if (fc) fc.target = active ? 12 : 0;
      }
      if (group === 'heating') flame.target = on ? 1 : 0;
      if (group === 'plumbing') drop.target = on ? 1 : 0;
      wake();
    };
    a.addEventListener('pointerenter', () => ((hover = true), update()));
    a.addEventListener('pointerleave', () => ((hover = false), update()));
    a.addEventListener('focus', () => ((focus = a.matches(':focus-visible')), update()));
    a.addEventListener('blur', () => ((focus = false), update()));
    // back/forward cache: do not come back with a running branch
    addEventListener('pagehide', () => {
      hover = focus = false;
      branch.classList.remove('is-active');
      section.classList.remove('is-on');
      stopAll();
    });
  }
}

// ---- tools without a discipline: tiles at the end, centred, no title ------------------------

function renderGeneral() {
  const host = document.getElementById('general-tools');
  const tools = TOOLS.filter((t) => t.group === GENERAL);
  host.hidden = !tools.length;
  host.innerHTML = tools
    .map((t) => {
      const draft = t.status === 'ready' ? draftLabelFor(t.id) : '';
      const label = html`<span class="gtile-text"><span class="tool-name">${t.name}</span>${draft ? html`<span class="tool-meta">${icon('save', { size: 12 })}${draft}</span>` : ''}</span>`;
      return String(
        t.status === 'ready'
          ? html`<a class="gtile is-ready" href="${t.path}">${icon(t.icon ?? 'open', { size: 28 })}${label}</a>`
          : html`<div class="gtile is-placeholder" aria-disabled="true">${icon(t.icon ?? 'open', { size: 28 })}${label}</div>`,
      );
    })
    .join('');
}

let dossier;

async function openFile(file) {
  if (!file) return;
  try {
    const res = await readAnyFile(file);
    if (res.kind === 'envelope' && res.envelope.tool === DOSSIER_TOOL_ID) {
      dossier.openEnvelope(res.envelope);
      return;
    }
    await routeToTool(res);
  } catch (e) {
    toast(e.message, { kind: 'error', timeout: 8000 });
  }
}

function refreshHome() {
  renderNetworks();
  renderGeneral();
  bindFlow(document.getElementById('tools'));
  if (dossier) {
    const draftCount = dossier.draftCount();
    const dossierBtn = document.getElementById('open-dossier');
    dossierBtn.innerHTML = String(html`${icon('dossier')}<span>Dossier</span>${draftCount ? html`<span class="dossier-pill num">${draftCount}</span>` : ''}`);
  }
}

bindThemeToggle(document.getElementById('theme-toggle'));
mountSourceLink();
dossier = mountDossierDialog(document.getElementById('dossier-dialog'), { onChange: refreshHome });
refreshHome();
window.addEventListener('pageshow', refreshHome);
window.addEventListener('storage', refreshHome);
const dossierBtn = document.getElementById('open-dossier');
dossierBtn.addEventListener('click', () => dossier.open());
const openBtn = document.getElementById('open-file');
openBtn.innerHTML = String(html`${icon('open')}<span>Öffnen</span>`);
openBtn.addEventListener('click', async () => openFile(await pickFile()));
enableFileDrop(openFile);
const handoff = takeHandoff();
if (handoff?.tool === DOSSIER_TOOL_ID) dossier.openEnvelope(handoff);
