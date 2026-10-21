// SPDX-License-Identifier: AGPL-3.0-or-later
// Map of the Klimastation tool: own SVG in LV95 (regions, borders, lakes, rivers, stations, site), no tiles.
// Wheel or two fingers zoom about the pointer, dragging pans, a click sets the site, a click on a station picks it.

import { esc } from '../../lib/core/ui.js';

const E0 = 2480000;
const N0 = 1300000;
const toX = (e) => (e - E0) / 1000;
const toY = (n) => (N0 - n) / 1000;
const fromXY = (x, y) => ({ e: E0 + x * 1000, n: N0 - y * 1000 });
const NS = 'http://www.w3.org/2000/svg';
const MAX_SCALE = 30; // px per km; the source map has about 3.4 px per km
const CLICK_SLOP = 5; // px

function pathOf(lines, closed = true) {
  return lines.map((line) => `M${line.map(([e, n]) => `${toX(e).toFixed(2)} ${toY(n).toFixed(2)}`).join('L')}${closed ? 'Z' : ''}`).join('');
}

export class RegionMap {
  /** @param {HTMLElement} host  @param {{ onPick(e, n), onStation(id) }} handlers */
  constructor(host, { onPick, onStation }) {
    this.host = host;
    this.onPick = onPick;
    this.onStation = onStation;
    this.view = { s: 1, tx: 0, ty: 0 };
    this.state = { site: null, region: null, ranking: [], chosen: null };
    this.svg = document.createElementNS(NS, 'svg');
    this.svg.setAttribute('class', 'map-svg');
    this.svg.setAttribute('role', 'application');
    this.svg.setAttribute('aria-label', 'Karte der Klimaregionen');
    this.svg.innerHTML = '<g class="world"><g class="regions"></g><path class="active-region"/><path class="river"/><path class="lake"/><path class="border"/><path class="outline"/></g><g class="overlay"></g>';
    host.append(this.svg);
    this.world = this.svg.querySelector('.world');
    this.overlay = this.svg.querySelector('.overlay');
    this.pointers = new Map();
    this.frame = 0;
    this.bind();
    new ResizeObserver(() => {
      const had = this.size;
      this.size = { w: host.clientWidth, h: host.clientHeight };
      if (!had && this.pendingShow) this.show(this.pendingShow);
      else if (!had || this.fitted) this.fit();
      else this.draw();
      this.pendingShow = null;
    }).observe(host);
  }

  /** Region rings for the fills; outline, borders, lakes and rivers as drawn lines (data/regions.json). */
  setData({ regions, outline, borders, lakes, rivers, stations }) {
    this.regions = regions;
    this.stations = stations;
    this.world.querySelector('.regions').innerHTML = regions
      .map((r) => `<path class="region" data-region="${r.id}" d="${pathOf(r.rings)}"/>`)
      .join('');
    const set = (cls, d) => this.world.querySelector(`.${cls}`).setAttribute('d', d);
    set('river', pathOf(rivers, false));
    set('lake', pathOf(lakes));
    set('border', pathOf(borders, false));
    set('outline', pathOf(outline));
    const xs = outline.flat().map(([e]) => toX(e));
    const ys = outline.flat().map(([, n]) => toY(n));
    this.extent = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    for (const p of this.world.querySelectorAll('path')) p.setAttribute('vector-effect', 'non-scaling-stroke');
    this.fit();
  }

  /** site { e, n } | null, region id, ranking (best first), chosen station id. */
  update(state) {
    this.state = state;
    const active = this.regions?.find((r) => r.id === state.region);
    this.world.querySelector('.active-region').setAttribute('d', active ? pathOf(active.rings) : '');
    this.draw();
  }

  // ---- view ---------------------------------------------------------------

  fitBox(x0, y0, x1, y1, pad = 24) {
    if (!this.size?.w || !this.size?.h) return;
    const { w, h } = this.size;
    const s = Math.min(MAX_SCALE, (w - 2 * pad) / Math.max(x1 - x0, 1e-3), (h - 2 * pad) / Math.max(y1 - y0, 1e-3));
    this.view = { s, tx: w / 2 - ((x0 + x1) / 2) * s, ty: h / 2 - ((y0 + y1) / 2) * s };
    this.draw();
  }

  fit() {
    if (!this.extent) return;
    const { x0, y0, x1, y1 } = this.extent;
    this.fitBox(x0, y0, x1, y1, 12);
    this.fitted = true;
  }

  /** Bring the site and the given stations into view (zoom in, never beyond the whole country). */
  show(points) {
    if (!points.length || !this.extent) return;
    if (!this.size?.w) {
      this.pendingShow = points; // shown once the map has its size
      return;
    }
    const xs = points.map((p) => toX(p.e));
    const ys = points.map((p) => toY(p.n));
    const pad = 20; // km around the points
    this.fitBox(Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad, 32);
    const { x0, y0, x1, y1 } = this.extent;
    const all = Math.min((this.size.w - 24) / (x1 - x0), (this.size.h - 24) / (y1 - y0));
    if (this.view.s < all) this.fit();
    else this.fitted = false;
  }

  zoom(factor, cx = this.size.w / 2, cy = this.size.h / 2) {
    const { s, tx, ty } = this.view;
    const ns = Math.min(MAX_SCALE, Math.max(this.minScale(), s * factor));
    const k = ns / s;
    this.view = { s: ns, tx: cx - (cx - tx) * k, ty: cy - (cy - ty) * k };
    this.fitted = false;
    this.draw();
  }

  pan(dx, dy) {
    this.view.tx += dx;
    this.view.ty += dy;
    this.fitted = false;
    this.draw();
  }

  minScale() {
    if (!this.extent || !this.size) return 0.1;
    const { x0, y0, x1, y1 } = this.extent;
    return 0.6 * Math.min(this.size.w / (x1 - x0), this.size.h / (y1 - y0));
  }

  toWorld(px, py) {
    const { s, tx, ty } = this.view;
    return fromXY((px - tx) / s, (py - ty) / s);
  }

  toScreen(e, n) {
    const { s, tx, ty } = this.view;
    return [toX(e) * s + tx, toY(n) * s + ty];
  }

  // ---- drawing --------------------------------------------------------------

  draw() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.render();
    });
  }

  render() {
    const { s, tx, ty } = this.view;
    this.world.setAttribute('transform', `matrix(${s} 0 0 ${s} ${tx} ${ty})`);
    if (!this.stations) return;
    const { site, ranking, chosen } = this.state;
    const top = new Map(ranking.slice(0, 3).map((r, i) => [r.station.id, i]));
    const parts = [];
    for (const r of this.regions) {
      const [x, y] = this.toScreen(...r.label);
      parts.push(`<text class="region-no${r.id === this.state.region ? ' is-active' : ''}" x="${x.toFixed(1)}" y="${y.toFixed(1)}">${r.id}</text>`);
    }
    if (site) {
      const [sx, sy] = this.toScreen(site.e, site.n);
      for (const r of ranking.slice(0, 3)) {
        const [x, y] = this.toScreen(r.station.e, r.station.n);
        const cls = r.station.id === chosen ? 'link is-chosen' : 'link';
        parts.push(`<line class="${cls}" x1="${sx.toFixed(1)}" y1="${sy.toFixed(1)}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`);
      }
      if (chosen && !top.has(chosen)) {
        const st = this.stations.find((x) => x.id === chosen);
        if (st) {
          const [x, y] = this.toScreen(st.e, st.n);
          parts.push(`<line class="link is-chosen" x1="${sx.toFixed(1)}" y1="${sy.toFixed(1)}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`);
        }
      }
    }
    for (const st of this.stations) {
      const [x, y] = this.toScreen(st.e, st.n);
      const cls = ['station', top.has(st.id) && 'is-top', st.id === chosen && 'is-chosen'].filter(Boolean).join(' ');
      parts.push(
        `<g class="${cls}" data-station="${st.id}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})">` +
          `<title>${esc(`${st.name} (${st.id}), ${st.height} m ü. M., Region ${st.region}`)}</title>` +
          `<circle class="hit" r="10"/><circle class="dot" r="${st.id === chosen ? 5.5 : 4}"/>` +
          `<text x="7" y="-6">${st.id}</text></g>`,
      );
    }
    if (site) {
      const [x, y] = this.toScreen(site.e, site.n);
      parts.push(`<g class="site" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><circle class="site-ring" r="10"/><circle class="site-dot" r="4.5"/></g>`);
    }
    this.overlay.innerHTML = parts.join('');
  }

  // ---- input ----------------------------------------------------------------

  bind() {
    const svg = this.svg;
    svg.tabIndex = 0;
    const local = (ev) => {
      const r = svg.getBoundingClientRect();
      return [ev.clientX - r.left, ev.clientY - r.top];
    };
    let down = null; // { x, y, moved, station }
    let pinch = null; // { d, cx, cy }
    svg.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0) return;
      svg.setPointerCapture(ev.pointerId);
      const [x, y] = local(ev);
      this.pointers.set(ev.pointerId, [x, y]);
      if (this.pointers.size === 1) {
        down = { x, y, lx: x, ly: y, moved: false, station: ev.target.closest('[data-station]')?.dataset.station ?? null };
      } else if (this.pointers.size === 2) {
        const [[ax, ay], [bx, by]] = [...this.pointers.values()];
        pinch = { d: Math.hypot(ax - bx, ay - by), cx: (ax + bx) / 2, cy: (ay + by) / 2 };
        down = null;
      }
    });
    svg.addEventListener('pointermove', (ev) => {
      if (!this.pointers.has(ev.pointerId)) return;
      const [x, y] = local(ev);
      this.pointers.set(ev.pointerId, [x, y]);
      if (pinch && this.pointers.size === 2) {
        const [[ax, ay], [bx, by]] = [...this.pointers.values()];
        const d = Math.hypot(ax - bx, ay - by);
        const cx = (ax + bx) / 2;
        const cy = (ay + by) / 2;
        this.pan(cx - pinch.cx, cy - pinch.cy);
        if (pinch.d > 0) this.zoom(d / pinch.d, cx, cy);
        pinch = { d, cx, cy };
      } else if (down) {
        if (!down.moved && Math.hypot(x - down.x, y - down.y) > CLICK_SLOP) {
          down.moved = true;
          svg.classList.add('is-panning');
        }
        if (down.moved) this.pan(x - down.lx, y - down.ly);
        down.lx = x;
        down.ly = y;
      }
    });
    const end = (ev) => {
      if (!this.pointers.has(ev.pointerId)) return;
      this.pointers.delete(ev.pointerId);
      if (this.pointers.size < 2) pinch = null;
      svg.classList.remove('is-panning');
      if (ev.type === 'pointerup' && down && !down.moved) {
        if (down.station) this.onStation(down.station);
        else {
          const { e, n } = this.toWorld(down.x, down.y);
          this.onPick(Math.round(e), Math.round(n));
        }
      }
      down = null;
    };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);
    svg.addEventListener(
      'wheel',
      (ev) => {
        ev.preventDefault();
        const [x, y] = local(ev);
        this.zoom(Math.exp(-ev.deltaY * (ev.deltaMode === 1 ? 0.05 : 0.0015)), x, y);
      },
      { passive: false },
    );
    svg.addEventListener('keydown', (ev) => {
      const step = 60;
      const keys = {
        ArrowLeft: () => this.pan(step, 0),
        ArrowRight: () => this.pan(-step, 0),
        ArrowUp: () => this.pan(0, step),
        ArrowDown: () => this.pan(0, -step),
        '+': () => this.zoom(1.4),
        '=': () => this.zoom(1.4),
        '-': () => this.zoom(1 / 1.4),
        0: () => this.fit(),
      };
      const run = keys[ev.key];
      if (run && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
        ev.preventDefault();
        run();
      }
    });
  }
}
