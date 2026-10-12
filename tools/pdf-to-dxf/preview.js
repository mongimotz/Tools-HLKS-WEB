// SPDX-License-Identifier: AGPL-3.0-or-later
// Preview of the PDF → DXF tool: one canvas for the drawing (Path2D per bucket of layer, colour and width),
// one on top for interaction (calibration points, area rectangle, snap marker). Zoom with the wheel or two
// fingers, pan by dragging. Large drawings move as a cached bitmap and are redrawn when the movement stops.

const SNAP_PX = 10; // snap radius on screen
const BIG = 60000; // segments above which moving uses the bitmap cache
const MIN_TEXT_PX = 3;

const cssVar = (el, name) => getComputedStyle(el).getPropertyValue(name).trim();
const rgbCss = (c) => `rgb(${c[0]} ${c[1]} ${c[2]})`;
const isNeutralInk = (c) => (c[0] < 40 && c[1] < 40 && c[2] < 40) || (c[0] > 235 && c[1] > 235 && c[2] > 235);

export class Preview {
  /**
   * @param {HTMLElement} host  element that holds the canvases (sized by CSS)
   * @param {{ onCalibrate?: Function, onArea?: Function, onMode?: Function }} handlers
   */
  constructor(host, handlers = {}) {
    this.host = host;
    this.handlers = handlers;
    this.base = document.createElement('canvas');
    this.over = document.createElement('canvas');
    this.base.className = 'pv-base';
    this.over.className = 'pv-over';
    this.over.setAttribute('aria-hidden', 'true');
    host.append(this.base, this.over);
    this.ctx = this.base.getContext('2d');
    this.octx = this.over.getContext('2d');
    this.data = null; // { width, height, buckets }
    this.paths = [];
    this.view = { z: 1, tx: 0, ty: 0 };
    this.mode = 'pan';
    this.off = { layers: new Set(), colors: new Set(), widths: new Set() };
    this.area = null;
    this.calib = []; // [[x, y], …] page points
    this.hover = null; // snapped point under the pointer
    this.drag = null; // area rectangle while dragging [x0, y0, x1, y1] page
    this.underlay = null;
    this.showUnderlay = false;
    this.cache = null;
    this.segments = 0;
    this.pointers = new Map();
    this.redrawTimer = 0;
    this.frame = 0;
    this.bind();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
  }

  // ---- data ----------------------------------------------------------------------------------

  /** New preview data { width, height, buckets }. Keeps the view when the page size is the same. */
  setData(data) {
    const same = this.data && Math.abs(this.data.width - data.width) < 0.5 && Math.abs(this.data.height - data.height) < 0.5;
    this.data = data;
    this.paths = data.buckets.map((b) => this.buildPaths(b));
    this.segments = data.buckets.reduce((n, b) => n + b.coords.length / 2, 0);
    if (!same) this.fit();
    else this.draw();
  }

  clear() {
    this.data = null;
    this.paths = [];
    this.underlay = null;
    this.calib = [];
    this.area = null;
    this.draw();
    this.drawOverlay();
  }

  buildPaths(b) {
    const stroke = new Path2D();
    const fill = new Path2D();
    let hasFill = false;
    const { coords, starts, closed } = b;
    for (let k = 0; k < starts.length; k++) {
      const s = starts[k];
      const e = k + 1 < starts.length ? starts[k + 1] : coords.length / 2;
      if (e - s < 2) continue;
      const target = b.fill[k] ? fill : stroke;
      if (b.fill[k]) hasFill = true;
      target.moveTo(coords[2 * s], coords[2 * s + 1]);
      for (let i = s + 1; i < e; i++) target.lineTo(coords[2 * i], coords[2 * i + 1]);
      if (closed[k]) target.closePath();
    }
    return { stroke, fill: hasFill ? fill : null };
  }

  setOff({ layers, colors, widths }) {
    this.off = { layers: new Set(layers), colors: new Set(colors), widths: new Set(widths) };
    this.draw();
  }

  isOff(b) {
    return this.off.layers.has(b.layer) || this.off.colors.has(b.hex) || (!b.textOnly && this.off.widths.has(b.lw));
  }

  setUnderlay(image) {
    this.underlay = image;
    this.draw();
  }

  setArea(rect) {
    this.area = rect;
    this.drawOverlay();
  }

  setCalibration(points) {
    this.calib = points ?? [];
    this.drawOverlay();
  }

  setMode(mode) {
    this.mode = mode;
    this.calib = mode === 'calibrate' ? [] : this.calib;
    this.hover = null;
    this.drag = null;
    this.host.dataset.mode = mode;
    this.drawOverlay();
    this.handlers.onMode?.(mode);
  }

  // ---- view ----------------------------------------------------------------------------------

  resize() {
    const r = this.host.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.dpr = dpr;
    const ow = this.cw;
    const oh = this.ch;
    this.cw = Math.max(1, r.width);
    this.ch = Math.max(1, r.height);
    // keep the drawing centred when the panels around it change size
    if (ow && oh) {
      this.view.tx += (this.cw - ow) / 2;
      this.view.ty += (this.ch - oh) / 2;
    }
    for (const c of [this.base, this.over]) {
      c.width = Math.round(this.cw * dpr);
      c.height = Math.round(this.ch * dpr);
      c.style.width = `${this.cw}px`;
      c.style.height = `${this.ch}px`;
    }
    // a view the user has not moved since the last fit stays fitted
    if (this.data && (!this.fitted || !this.userMoved)) this.fit();
    else {
      this.draw();
      this.drawOverlay();
    }
  }

  fit() {
    if (!this.data) {
      this.draw();
      return;
    }
    const m = 16;
    const { width: w, height: h } = this.data;
    const z = Math.max(1e-4, Math.min((this.cw - 2 * m) / w, (this.ch - 2 * m) / h));
    this.view = { z, tx: (this.cw - w * z) / 2, ty: (this.ch - h * z) / 2 };
    this.fitted = this.cw > 1;
    this.userMoved = false;
    this.draw();
    this.drawOverlay();
  }

  toPage(sx, sy) {
    const { z, tx, ty } = this.view;
    return [(sx - tx) / z, this.data.height - (sy - ty) / z];
  }

  toScreen(x, y) {
    const { z, tx, ty } = this.view;
    return [tx + x * z, ty + (this.data.height - y) * z];
  }

  zoomAt(sx, sy, factor) {
    const v = this.view;
    const z = Math.min(Math.max(v.z * factor, 1e-3), 400);
    const f = z / v.z;
    this.view = { z, tx: sx - (sx - v.tx) * f, ty: sy - (sy - v.ty) * f };
    this.moved();
  }

  panBy(dx, dy) {
    this.view.tx += dx;
    this.view.ty += dy;
    this.moved();
  }

  /** After a view change: big drawings move as a bitmap first, then redraw when still. */
  moved() {
    this.userMoved = true;
    if (this.segments > BIG && this.cache) {
      this.drawCached();
      clearTimeout(this.redrawTimer);
      this.redrawTimer = setTimeout(() => this.draw(), 140);
    } else this.requestDraw();
    this.drawOverlay();
  }

  requestDraw() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.draw();
    });
  }

  // ---- drawing -------------------------------------------------------------------------------

  colors() {
    const h = this.host;
    return {
      bg: cssVar(h, '--surface-sunken'),
      paper: cssVar(h, '--surface'),
      border: cssVar(h, '--border'),
      ink: cssVar(h, '--text-strong'),
      primary: cssVar(h, '--primary'),
      font: cssVar(h, '--font-sans') || 'sans-serif',
    };
  }

  draw() {
    const { ctx, dpr } = this;
    const col = this.colors();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = col.bg;
    ctx.fillRect(0, 0, this.base.width, this.base.height);
    if (!this.data) return;
    const { z, tx, ty } = this.view;
    const { width: W, height: H } = this.data;
    // paper
    ctx.setTransform(z * dpr, 0, 0, z * dpr, tx * dpr, ty * dpr);
    ctx.fillStyle = col.paper;
    ctx.fillRect(0, 0, W, H);
    ctx.lineWidth = 1 / (z * dpr);
    ctx.strokeStyle = col.border;
    ctx.strokeRect(0, 0, W, H);
    if (this.underlay && this.showUnderlay) {
      ctx.globalAlpha = 0.45;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.underlay, 0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    // geometry: page y up
    ctx.setTransform(z * dpr, 0, 0, -z * dpr, tx * dpr, (ty + H * z) * dpr);
    const hair = 1 / (z * dpr);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    this.data.buckets.forEach((b, i) => {
      if (this.isOff(b)) return;
      const color = isNeutralInk(b.rgb) ? col.ink : rgbCss(b.rgb);
      const p = this.paths[i];
      if (p.fill) {
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.25;
        ctx.fill(p.fill);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = color;
        ctx.lineWidth = hair;
        ctx.stroke(p.fill);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(hair, (b.lw / 100) * (72 / 25.4));
      ctx.stroke(p.stroke);
    });
    // text: upright, rotated about its start point
    for (const b of this.data.buckets) {
      if (this.isOff(b) || !b.texts.length) continue;
      ctx.fillStyle = isNeutralInk(b.rgb) ? col.ink : rgbCss(b.rgb);
      for (const t of b.texts) {
        const px = t.height * z;
        if (px < MIN_TEXT_PX) continue;
        const [sx, sy] = this.toScreen(t.x, t.y);
        if (sx < -2000 || sy < -2000 || sx > this.cw + 2000 || sy > this.ch + 2000) continue;
        ctx.setTransform(dpr, 0, 0, dpr, sx * dpr, sy * dpr);
        ctx.rotate((-t.rot * Math.PI) / 180);
        ctx.font = `${px}px ${col.font}`;
        ctx.fillText(t.str, 0, 0);
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // keep a bitmap for fast moves
    if (this.segments > BIG) {
      this.cache ??= document.createElement('canvas');
      this.cache.width = this.base.width;
      this.cache.height = this.base.height;
      this.cache.getContext('2d').drawImage(this.base, 0, 0);
      this.cacheView = { ...this.view };
    }
  }

  drawCached() {
    const { ctx, dpr } = this;
    const c = this.cacheView;
    const v = this.view;
    const f = v.z / c.z;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = this.colors().bg;
    ctx.fillRect(0, 0, this.base.width, this.base.height);
    ctx.setTransform(f, 0, 0, f, (v.tx - c.tx * f) * dpr, (v.ty - c.ty * f) * dpr);
    ctx.drawImage(this.cache, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  drawOverlay() {
    const { octx: ctx, dpr } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.over.width, this.over.height);
    if (!this.data) return;
    const col = this.colors();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.strokeStyle = col.primary;
    ctx.fillStyle = col.primary;
    ctx.lineWidth = 1.5;
    const rect = (r, dashed) => {
      const [x0, y0] = this.toScreen(r[0], r[3]);
      const [x1, y1] = this.toScreen(r[2], r[1]);
      ctx.setLineDash(dashed ? [6, 4] : []);
      ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
      ctx.setLineDash([]);
    };
    if (this.area) rect(this.area, true);
    if (this.drag) rect(this.drag, false);
    const pts = [...this.calib];
    if (this.mode === 'calibrate' && this.hover && pts.length < 2) pts.push(this.hover);
    if (pts.length === 2) {
      const [a, b] = pts.map((p) => this.toScreen(p[0], p[1]));
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
    }
    pts.forEach((p, i) => {
      const [sx, sy] = this.toScreen(p[0], p[1]);
      ctx.beginPath();
      ctx.arc(sx, sy, i < this.calib.length ? 4 : 6, 0, 2 * Math.PI);
      if (i < this.calib.length) ctx.fill();
      else ctx.stroke();
    });
  }

  // ---- snapping --------------------------------------------------------------------------------

  /** Nearest vertex within SNAP_PX of the screen point, else the point itself (page coordinates). */
  snap(sx, sy) {
    const [px, py] = this.toPage(sx, sy);
    const r = SNAP_PX / this.view.z;
    let best = null;
    let bestD = r * r;
    for (const b of this.data.buckets) {
      if (this.isOff(b)) continue;
      const c = b.coords;
      for (let i = 0; i < c.length; i += 2) {
        const dx = c[i] - px;
        if (dx > r || dx < -r) continue;
        const dy = c[i + 1] - py;
        const d = dx * dx + dy * dy;
        if (d <= bestD) {
          bestD = d;
          best = [c[i], c[i + 1]];
        }
      }
    }
    return best ?? [px, py];
  }

  // ---- input -----------------------------------------------------------------------------------

  bind() {
    const el = this.over;
    const local = (e) => {
      const r = el.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    el.addEventListener(
      'wheel',
      (e) => {
        if (!this.data) return;
        e.preventDefault();
        const [sx, sy] = local(e);
        const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
        this.zoomAt(sx, sy, Math.exp(-d * (e.ctrlKey ? 0.01 : 0.0015)));
      },
      { passive: false },
    );
    el.addEventListener('pointerdown', (e) => {
      if (!this.data) return;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* pointer already gone */
      }
      const p = local(e);
      this.pointers.set(e.pointerId, p);
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] };
        this.press = null;
        this.drag = null;
        return;
      }
      this.press = { x: p[0], y: p[1], lastX: p[0], lastY: p[1], moved: false, button: e.button };
      if (this.mode === 'area' && e.button === 0) {
        const q = this.toPage(p[0], p[1]);
        this.drag = [q[0], q[1], q[0], q[1]];
        this.dragStart = q;
      }
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.data) return;
      const p = local(e);
      if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, p);
      if (this.pinch && this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        this.panBy(mid[0] - this.pinch.mid[0], mid[1] - this.pinch.mid[1]);
        if (this.pinch.d > 0) this.zoomAt(mid[0], mid[1], d / this.pinch.d);
        this.pinch = { d, mid };
        return;
      }
      const pr = this.press;
      if (pr) {
        if (Math.hypot(p[0] - pr.x, p[1] - pr.y) > 4) pr.moved = true;
        if (this.drag && this.mode === 'area' && pr.button === 0) {
          const q = this.toPage(p[0], p[1]);
          this.drag = [Math.min(this.dragStart[0], q[0]), Math.min(this.dragStart[1], q[1]), Math.max(this.dragStart[0], q[0]), Math.max(this.dragStart[1], q[1])];
          this.drawOverlay();
        } else if (pr.moved) {
          this.panBy(p[0] - pr.lastX, p[1] - pr.lastY);
        }
        pr.lastX = p[0];
        pr.lastY = p[1];
        return;
      }
      if (this.mode === 'calibrate') {
        cancelAnimationFrame(this.hoverFrame);
        this.hoverFrame = requestAnimationFrame(() => {
          this.hover = this.snap(p[0], p[1]);
          this.drawOverlay();
        });
      }
    });
    const end = (e) => {
      this.pointers.delete(e.pointerId);
      if (this.pinch) {
        if (this.pointers.size < 2) this.pinch = null;
        return;
      }
      const pr = this.press;
      this.press = null;
      if (!pr || !this.data || e.type === 'pointercancel') {
        this.drag = null;
        return;
      }
      const p = local(e);
      if (this.mode === 'area' && this.drag) {
        const r = this.drag;
        this.drag = null;
        const big = (r[2] - r[0]) * this.view.z > 6 && (r[3] - r[1]) * this.view.z > 6;
        if (big) {
          this.area = r;
          this.handlers.onArea?.(r);
          this.setMode('pan');
        } else this.drawOverlay();
        return;
      }
      if (this.mode === 'calibrate' && !pr.moved && pr.button === 0) {
        this.calib.push(this.snap(p[0], p[1]));
        if (this.calib.length === 2) {
          this.hover = null;
          this.handlers.onCalibrate?.(this.calib[0], this.calib[1]);
        }
        this.drawOverlay();
      }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('pointerleave', () => {
      if (this.mode === 'calibrate' && this.hover) {
        this.hover = null;
        this.drawOverlay();
      }
    });
    // theme changes: redraw with the new colours
    new MutationObserver(() => {
      this.draw();
      this.drawOverlay();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      this.draw();
      this.drawOverlay();
    });
  }
}
