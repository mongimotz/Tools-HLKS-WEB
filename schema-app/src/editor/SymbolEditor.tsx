// SPDX-License-Identifier: AGPL-3.0-or-later
// Symbol editor (own components) in its own tab: draw lines, rectangles, circles and texts on a 0.25 mm grid,
// set ports on the box edge and an editable text field, then save into this browser's library. A click on a
// palette symbol takes it over as the template.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dir, PortDef, Vec } from '../model/types.ts';
import { useEditor, type SymbolDraft } from './store.ts';
import { Icon } from './icons.tsx';
import { previewSvg } from './SymbolPreview.tsx';
import { deleteOwnSymbol, saveOwnSymbol } from '../io/symbols.ts';
import { sanitizeSvg } from '../symbols/sanitize.ts';

type Tool = 'select' | 'line' | 'rect' | 'circle' | 'text' | 'port' | 'field';

const TOOLS: { id: Tool; icon: string; label: string; key: string }[] = [
  { id: 'select', icon: 'cursor', label: 'Auswählen und verschieben', key: 'V' },
  { id: 'line', icon: 'line', label: 'Linie', key: 'L' },
  { id: 'rect', icon: 'square', label: 'Rechteck', key: 'R' },
  { id: 'circle', icon: 'circle', label: 'Kreis', key: 'C' },
  { id: 'text', icon: 'text', label: 'Fester Text', key: 'T' },
  { id: 'field', icon: 'textfield', label: 'Textfeld (im Schema bearbeitbar)', key: 'X' },
  { id: 'port', icon: 'port', label: 'Anschluss am Rand', key: 'P' },
];

const MEDIA_KINDS: { id: string; name: string; media: string[] }[] = [
  { id: 'air', name: 'Luft', media: ['air.*'] },
  { id: 'water', name: 'Wasser', media: ['water.*'] },
  { id: 'signal', name: 'Wirklinie', media: ['signal'] },
  { id: 'any', name: 'Alle', media: ['*'] },
];
const kindOf = (media: string[]) => MEDIA_KINDS.find((k) => k.media.join() === media.join())?.id ?? 'any';

const SNAP = 0.25;
const sn = (v: number) => Math.round(v / SNAP) * SNAP;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** Top-level elements of a drawing (each one selectable). */
function splitSvg(svg: string): string[] {
  const doc = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${svg}</svg>`, 'image/svg+xml');
  if (doc.querySelector('parsererror')) return svg ? [svg] : [];
  const ser = new XMLSerializer();
  return [...doc.documentElement.children].map((el) =>
    ser.serializeToString(el).replace(/ xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g, ''),
  );
}

/** Adds (dx, dy) to an element's leading translate(). */
function moveElement(el: string, dx: number, dy: number): string {
  const m = /^<(\w+)([^>]*?)\s(transform=(["'])translate\(([-\d.]+)[ ,]+([-\d.]+)\)\s*([^"']*)\4)/.exec(el);
  if (m) {
    const nx = r3(Number(m[5]) + dx),
      ny = r3(Number(m[6]) + dy);
    const rest = m[7] ? ` ${m[7]}` : '';
    return el.replace(m[3]!, `transform='translate(${nx} ${ny})${rest}'`);
  }
  return el.replace(/^<(\w+)/, `<$1 transform='translate(${r3(dx)} ${r3(dy)})'`);
}

function nextPortId(ports: PortDef[], dir: Dir): string {
  const ids = new Set(ports.map((p) => p.id));
  if (dir === 'W' && !ids.has('in')) return 'in';
  if (dir === 'E' && !ids.has('out')) return 'out';
  for (let k = 1; ; k++) if (!ids.has(`p${k}`)) return `p${k}`;
}

export function SymbolEditor() {
  const st = useEditor();
  const d = st.symbolDraft!;
  const [tool, setTool] = useState<Tool>('select');
  const [sel, setSel] = useState<{ kind: 'el' | 'port'; i: number } | null>(null);
  const [drag, setDrag] = useState<{ start: Vec; cur: Vec; moved: boolean } | null>(null);
  const [fill, setFill] = useState(false);
  const [dashed, setDashed] = useState(false);
  const [portKind, setPortKind] = useState('air');
  const past = useRef<SymbolDraft[]>([]);
  const future = useRef<SymbolDraft[]>([]);
  const svgRef = useRef<SVGSVGElement>(null);

  const els = useMemo(() => splitSvg(d.svg), [d.svg]);
  const [w, h] = d.size;
  const m = Math.max(w, h) * 0.35 + 4;
  const vb = { x: -m, y: -m, w: w + 2 * m, h: h + 2 * m };

  const update = useCallback(
    (next: SymbolDraft, record = true) => {
      if (record) {
        past.current.push(d);
        if (past.current.length > 100) past.current.shift();
        future.current = [];
      }
      useEditor.setState({ symbolDraft: next, dirty: true });
    },
    [d],
  );
  const setEls = (list: string[]) => update({ ...d, svg: list.join('') });

  const save = useCallback(() => {
    const id = saveOwnSymbol(d);
    useEditor.setState({ symbolDraft: { ...d, id, saved: true }, dirty: false });
    useEditor.getState().notify(`«${d.name}» in «Eigene Bauteile» gespeichert`);
  }, [d]);

  // Keys of the symbol editor (the schema shortcuts are off in this tab).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select')) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === 's') return (e.preventDefault(), save());
      if (mod && k === 'z' && !e.shiftKey) {
        e.preventDefault();
        const p = past.current.pop();
        if (p) {
          future.current.push(d);
          useEditor.setState({ symbolDraft: p, dirty: true });
        }
        return;
      }
      if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) {
        e.preventDefault();
        const f = future.current.pop();
        if (f) {
          past.current.push(d);
          useEditor.setState({ symbolDraft: f, dirty: true });
        }
        return;
      }
      if (mod) return;
      if ((k === 'delete' || k === 'backspace') && sel) {
        e.preventDefault();
        if (sel.kind === 'el') update({ ...d, svg: els.filter((_, i) => i !== sel.i).join('') });
        else update({ ...d, ports: d.ports.filter((_, i) => i !== sel.i) });
        setSel(null);
        return;
      }
      if (k === 'escape') return (setTool('select'), setSel(null));
      const t = TOOLS.find((x) => x.key.toLowerCase() === k);
      if (t) setTool(t.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [d, els, sel, save, update]);

  const toLocal = (e: React.PointerEvent): Vec => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return [sn(p.x), sn(p.y)];
  };

  const stroke = dashed ? " stroke-dasharray='1 0.6'" : '';
  const paint = fill ? " fill='currentColor'" : '';

  const onDown = (e: React.PointerEvent) => {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const p = toLocal(e);
    const t = e.target as Element;
    if (tool === 'select') {
      const pe = t.closest('[data-port]');
      const ee = t.closest('[data-el]');
      if (pe) setSel({ kind: 'port', i: Number(pe.getAttribute('data-port')) });
      else if (ee) {
        setSel({ kind: 'el', i: Number(ee.getAttribute('data-el')) });
        setDrag({ start: p, cur: p, moved: false });
      } else setSel(null);
      return;
    }
    if (tool === 'text') {
      const txt = prompt('Text');
      if (txt)
        setEls([
          ...els,
          `<text x='${p[0]}' y='${r3(p[1] + 0.7)}' font-size='2' text-anchor='middle' fill='currentColor' stroke='none'>${txt.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`,
        ]);
      return;
    }
    if (tool === 'field') {
      update({ ...d, text: { at: p, size: d.text?.size ?? 2, align: 'middle', value: d.text?.value ?? '' } });
      return;
    }
    if (tool === 'port') {
      // Nearest point on the box edge, on the 2.5 mm grid.
      const cands: { at: Vec; dir: Dir }[] = [
        { at: [0, p[1]], dir: 'W' },
        { at: [w, p[1]], dir: 'E' },
        { at: [p[0], 0], dir: 'N' },
        { at: [p[0], h], dir: 'S' },
      ];
      const best = cands
        .map((c) => {
          const at: Vec = [
            Math.min(w, Math.max(0, Math.round(c.at[0] / 2.5) * 2.5)),
            Math.min(h, Math.max(0, Math.round(c.at[1] / 2.5) * 2.5)),
          ];
          return { at, dir: c.dir, dist: Math.hypot(at[0] - p[0], at[1] - p[1]) };
        })
        .sort((a, b) => a.dist - b.dist)[0]!;
      if (d.ports.some((x) => x.at[0] === best.at[0] && x.at[1] === best.at[1])) return;
      const media = MEDIA_KINDS.find((k) => k.id === portKind)!.media;
      update({
        ...d,
        ports: [
          ...d.ports,
          {
            id: nextPortId(d.ports, best.dir),
            at: best.at,
            dir: best.dir,
            media,
            ...(portKind === 'signal' ? { optional: true } : {}),
          },
        ],
      });
      return;
    }
    setDrag({ start: p, cur: p, moved: false });
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const p = toLocal(e);
    if (p[0] !== drag.cur[0] || p[1] !== drag.cur[1]) setDrag({ ...drag, cur: p, moved: true });
  };

  const onUp = () => {
    if (!drag) return;
    setDrag(null);
    const [a, b] = [drag.start, drag.cur];
    if (!drag.moved) return;
    if (tool === 'select' && sel?.kind === 'el') {
      setEls(els.map((x, i) => (i === sel.i ? moveElement(x, b[0] - a[0], b[1] - a[1]) : x)));
      return;
    }
    const shape = drawShape(tool, a, b, stroke, paint);
    if (shape) setEls([...els, shape]);
  };

  const preview = drag && drag.moved && tool !== 'select' ? drawShape(tool, drag.start, drag.cur, stroke, paint) : null;

  const setSize = (i: 0 | 1, v: number) => {
    if (!Number.isFinite(v) || v < 2.5) return;
    const size: Vec = i === 0 ? [v, h] : [w, v];
    const ports = d.ports.map((p) => ({
      ...p,
      at: [
        p.dir === 'E' ? size[0] : Math.min(p.at[0], size[0]),
        p.dir === 'S' ? size[1] : Math.min(p.at[1], size[1]),
      ] as Vec,
    }));
    update({ ...d, size, ports });
  };

  const moveDx = drag && tool === 'select' && sel?.kind === 'el' && drag.moved ? drag.cur[0] - drag.start[0] : 0;
  const moveDy = drag && tool === 'select' && sel?.kind === 'el' && drag.moved ? drag.cur[1] - drag.start[1] : 0;

  return (
    <div className="symbol-editor" data-testid="symbol-editor">
      <div className="sym-stage">
        <div className="sym-tools" role="toolbar" aria-label="Zeichenwerkzeuge">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              className="tb"
              aria-pressed={tool === t.id}
              title={`${t.label} (${t.key})`}
              aria-label={t.label}
              onClick={() => setTool(t.id)}
            >
              <Icon name={t.icon} />
            </button>
          ))}
          <span className="sep" />
          <label className="menu-check" title="Neue Formen gefüllt">
            <input type="checkbox" checked={fill} onChange={(e) => setFill(e.target.checked)} /> Gefüllt
          </label>
          <label className="menu-check" title="Neue Formen gestrichelt">
            <input type="checkbox" checked={dashed} onChange={(e) => setDashed(e.target.checked)} /> Gestrichelt
          </label>
          {tool === 'port' && (
            <select
              className="tb-select"
              value={portKind}
              onChange={(e) => setPortKind(e.target.value)}
              aria-label="Medium des Anschlusses"
            >
              {MEDIA_KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <svg
          ref={svgRef}
          className={`sym-canvas tool-${tool}`}
          viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
          preserveAspectRatio="xMidYMid meet"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
        >
          <defs>
            <pattern id="sg-minor" width="0.5" height="0.5" patternUnits="userSpaceOnUse">
              <path d="M0.5 0V0.5H0" fill="none" className="sg-line" strokeWidth="0.02" />
            </pattern>
            <pattern id="sg-major" width="2.5" height="2.5" patternUnits="userSpaceOnUse">
              <rect width="2.5" height="2.5" fill="url(#sg-minor)" />
              <path d="M2.5 0V2.5H0" fill="none" className="sg-line" strokeWidth="0.06" />
            </pattern>
          </defs>
          <rect className="sg-paper" x={vb.x} y={vb.y} width={vb.w} height={vb.h} />
          <rect x={vb.x} y={vb.y} width={vb.w} height={vb.h} fill="url(#sg-major)" />
          <rect className="sg-box" x={0} y={0} width={w} height={h} />
          <g className="sg-drawing" fill="none" stroke="currentColor" strokeWidth={0.35}>
            {els.map((el, i) => (
              <g
                key={i}
                data-el={i}
                className={sel?.kind === 'el' && sel.i === i ? 'sel' : ''}
                transform={sel?.kind === 'el' && sel.i === i ? `translate(${moveDx} ${moveDy})` : undefined}
                dangerouslySetInnerHTML={{ __html: sanitizeSvg(el) }}
              />
            ))}
            {preview && <g className="sg-preview" dangerouslySetInnerHTML={{ __html: preview }} />}
          </g>
          {d.text && (
            <text
              className="sg-field"
              x={d.text.at[0]}
              y={d.text.at[1] + d.text.size * 0.35}
              fontSize={d.text.size}
              textAnchor={d.text.align ?? 'middle'}
            >
              {d.text.value || 'Text'}
            </text>
          )}
          {d.ports.map((p, i) => (
            <g key={i} data-port={i} className={`sg-port${sel?.kind === 'port' && sel.i === i ? ' sel' : ''}`}>
              <circle cx={p.at[0]} cy={p.at[1]} r={0.7} />
              <text x={p.at[0]} y={p.at[1] - 1.1} fontSize={1.3} textAnchor="middle">
                {p.id}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <aside className="props sym-props" aria-label="Bauteil">
        <div className="props-body">
          <section>
            <h2>Eigenes Bauteil</h2>
            <label className="field">
              <span>Name</span>
              <input
                value={d.name}
                data-testid="sym-name"
                onChange={(e) => update({ ...d, name: e.target.value }, false)}
              />
            </label>
            <div className="two">
              <label className="field">
                <span>Kürzel</span>
                <input
                  value={d.prefix}
                  onChange={(e) => update({ ...d, prefix: e.target.value.replace(/[^A-Za-z0-9]/g, '') }, false)}
                />
              </label>
              <label className="field">
                <span>Fachbereich</span>
                <select value={d.area} onChange={(e) => update({ ...d, area: e.target.value as SymbolDraft['area'] })}>
                  <option value="air">Lüftung</option>
                  <option value="heat">Heizung</option>
                  <option value="sanitary">Sanitär</option>
                  <option value="control">MSR</option>
                  <option value="common">Allgemein</option>
                </select>
              </label>
            </div>
            <div className="two">
              <label className="field">
                <span>Breite (mm)</span>
                <input
                  type="number"
                  step={2.5}
                  min={2.5}
                  value={w}
                  onChange={(e) => setSize(0, Number(e.target.value))}
                />
              </label>
              <label className="field">
                <span>Höhe (mm)</span>
                <input
                  type="number"
                  step={2.5}
                  min={2.5}
                  value={h}
                  onChange={(e) => setSize(1, Number(e.target.value))}
                />
              </label>
            </div>
            <label className="field">
              <span>Eigenschaften</span>
              <input
                value={d.props.join(', ')}
                placeholder="z. B. V, dp, P"
                onChange={(e) =>
                  update(
                    {
                      ...d,
                      props: e.target.value
                        .split(',')
                        .map((x) => x.trim())
                        .filter(Boolean),
                    },
                    false,
                  )
                }
              />
            </label>
          </section>
          <section>
            <h3>Textfeld</h3>
            <label className="check">
              <input
                type="checkbox"
                checked={!!d.text}
                onChange={(e) =>
                  update({
                    ...d,
                    text: e.target.checked ? { at: [w / 2, h / 2], size: 2, align: 'middle', value: '' } : null,
                  })
                }
              />{' '}
              Text im Symbol
            </label>
            {d.text && (
              <div className="two">
                <label className="field">
                  <span>Vorgabe</span>
                  <input
                    value={d.text.value}
                    onChange={(e) => update({ ...d, text: { ...d.text!, value: e.target.value } }, false)}
                  />
                </label>
                <label className="field">
                  <span>Grösse</span>
                  <select
                    value={d.text.size}
                    onChange={(e) => update({ ...d, text: { ...d.text!, size: Number(e.target.value) } })}
                  >
                    {[1.2, 1.5, 2, 2.5, 3.5].map((s) => (
                      <option key={s} value={s}>
                        {s} mm
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
          </section>
          <section>
            <h3>Anschlüsse</h3>
            {!d.ports.length && <p className="sub">Keine</p>}
            {d.ports.map((p, i) => (
              <div className={`port-row${sel?.kind === 'port' && sel.i === i ? ' sel' : ''}`} key={i}>
                <input
                  value={p.id}
                  aria-label="Anschluss-ID"
                  onChange={(e) =>
                    update(
                      {
                        ...d,
                        ports: d.ports.map((x, k) =>
                          k === i ? { ...x, id: e.target.value.replace(/[^\w.-]/g, '') } : x,
                        ),
                      },
                      false,
                    )
                  }
                />
                <select
                  value={kindOf(p.media)}
                  aria-label="Medium"
                  onChange={(e) =>
                    update({
                      ...d,
                      ports: d.ports.map((x, k) =>
                        k === i ? { ...x, media: MEDIA_KINDS.find((m) => m.id === e.target.value)!.media } : x,
                      ),
                    })
                  }
                >
                  {MEDIA_KINDS.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name}
                    </option>
                  ))}
                </select>
                <span className="sub">
                  {p.dir} {p.at[0]}/{p.at[1]}
                </span>
                <button
                  className="tb small"
                  aria-label="Anschluss entfernen"
                  onClick={() => update({ ...d, ports: d.ports.filter((_, k) => k !== i) })}
                >
                  <Icon name="trash" size={14} />
                </button>
              </div>
            ))}
          </section>
          <details className="svg-code">
            <summary>SVG-Code</summary>
            <SvgCode value={d.svg} onCommit={(v) => update({ ...d, svg: sanitizeSvg(v) })} />
          </details>
          <div className="row-buttons">
            <button className="primary" onClick={save} data-testid="sym-save">
              <Icon name="save" /> Speichern
            </button>
            {d.saved && d.id && (
              <button
                onClick={() => {
                  if (
                    !confirm(
                      `«${d.name}» aus «Eigene Bauteile» löschen? Schemas, die es verwenden, behalten ihre Kopie.`,
                    )
                  )
                    return;
                  deleteOwnSymbol(d.id);
                  useEditor.setState({ symbolDraft: { ...d, id: '', saved: false }, dirty: true });
                }}
              >
                <Icon name="trash" /> Löschen
              </button>
            )}
          </div>
          <div className="sym-sample" aria-hidden="true">
            <svg viewBox={`${-2} ${-2} ${w + 4} ${h + 4}`} width={64} height={64}>
              <g
                fill="none"
                stroke="currentColor"
                strokeWidth={0.35}
                dangerouslySetInnerHTML={{
                  __html: previewSvg({ ...dummy, svg: d.svg, size: d.size, text: d.text ?? undefined }),
                }}
              />
            </svg>
          </div>
        </div>
      </aside>
    </div>
  );
}

const dummy = {
  id: 'x',
  name: '',
  category: 'user',
  norm: '',
  checked: false,
  ports: [],
  labelAnchor: [0, 0] as Vec,
  props: [],
  prefix: 'X',
};

function drawShape(tool: Tool, a: Vec, b: Vec, stroke: string, paint: string): string | null {
  const x = Math.min(a[0], b[0]),
    y = Math.min(a[1], b[1]),
    w = Math.abs(a[0] - b[0]),
    h = Math.abs(a[1] - b[1]);
  if (tool === 'line') return w || h ? `<path d='M${a[0]} ${a[1]}L${b[0]} ${b[1]}'${stroke}/>` : null;
  if (tool === 'rect')
    return w && h ? `<rect x='${x}' y='${y}' width='${r3(w)}' height='${r3(h)}'${stroke}${paint}/>` : null;
  if (tool === 'circle') {
    const r = r3(Math.hypot(b[0] - a[0], b[1] - a[1]));
    return r ? `<circle cx='${a[0]}' cy='${a[1]}' r='${r}'${stroke}${paint}/>` : null;
  }
  return null;
}

function SvgCode({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value);
  const [last, setLast] = useState(value);
  if (value !== last) {
    setLast(value);
    setV(value);
  }
  return (
    <textarea
      rows={6}
      spellCheck={false}
      value={v}
      aria-label="SVG-Code der Zeichnung"
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onCommit(v)}
    />
  );
}
