// Modified by HLKS-Tools (scripts/vendor-embedpdf.mjs, patch swatches): colour swatches from globalThis.HLKS_ANNOT_SWATCHES when set
import { u as h, b as I, t as Z, C as V, E as G, c as v, F as H, m as M, G as q, e as t, I as p, H as J, R as X, d as y, k as C, s as Y, J as Q, A as P, K as U } from "./wasm-url-asset-DgMkO6xQ.js";
import { u as g } from "./labels-C6_i87Oj-BLIW8U_I.js";
const ee = {
  print: "annotationFlags.print",
  hidden: "annotationFlags.hidden",
  noView: "annotationFlags.noView",
  toggleNoView: "annotationFlags.toggleNoView",
  readOnly: "annotationFlags.readOnly",
  locked: "annotationFlags.locked",
  lockedContents: "annotationFlags.lockedContents",
  noZoom: "annotationFlags.noZoom",
  noRotate: "annotationFlags.noRotate",
  invisible: "annotationFlags.invisible"
};
function te({ label: e, hint: a, value: l, onToggle: o }) {
  const r = P(null);
  return C(() => {
    r.current && (r.current.indeterminate = l === null);
  }, [l]), /* @__PURE__ */ t("label", {
    className: "hover:bg-hover flex cursor-pointer items-start gap-2.5 rounded px-1.5 py-1.5",
    children: [/* @__PURE__ */ t("input", {
      ref: r,
      type: "checkbox",
      className: "accent-accent mt-0.5",
      checked: l === !0,
      onChange: () => o(l !== !0)
    }), /* @__PURE__ */ t("span", {
      className: "min-w-0",
      children: [/* @__PURE__ */ t("span", {
        className: "text-fg block text-sm leading-tight",
        children: e
      }), /* @__PURE__ */ t("span", {
        className: "text-fg-muted block text-xs leading-tight",
        children: a
      })]
    })]
  });
}
function ne() {
  const e = h(), a = g(), l = I(), { properties: o, values: r, mixed: c } = v(), s = o.filter((n) => n.control === "flag");
  if (!s.length) return null;
  const i = (n) => c.includes(n) ? null : r[n] === !0;
  return /* @__PURE__ */ t("section", {
    className: "border-border mt-2 border-t pt-4",
    children: [/* @__PURE__ */ t("p", {
      className: "text-fg-muted mb-2 text-[11px] font-semibold uppercase tracking-wide",
      children: e("annotationFlags.title")
    }), /* @__PURE__ */ t("div", {
      className: "flex flex-col",
      children: s.map((n) => /* @__PURE__ */ t(te, {
        label: a(n),
        hint: e(ee[n.key]),
        value: i(n.key),
        onToggle: (u) => void l.selection.update({ [n.key]: u })
      }, n.key))
    })]
  });
}
const le = globalThis.HLKS_ANNOT_SWATCHES ?? [
  "#000000",
  "#5f6368",
  "#e44234",
  "#ff8b00",
  "#ffd500",
  "#00cc66",
  "#00b8d9",
  "#4a90e2",
  "#9b51e0",
  "#f272c8",
  "#a0522d",
  "#ffffff"
], ae = [
  "helvetica",
  "helvetica-bold",
  "times-roman",
  "courier"
], oe = [
  8,
  9,
  10,
  11,
  12,
  14,
  16,
  18,
  24,
  36,
  48,
  72
], re = [
  {
    key: "solid",
    make: () => ({ kind: "solid" })
  },
  {
    key: "dashed-6-2",
    make: () => ({
      kind: "dashed",
      dash: [6, 2]
    })
  },
  {
    key: "dashed-3-3",
    make: () => ({
      kind: "dashed",
      dash: [3, 3]
    })
  },
  {
    key: "dashed-1-2",
    make: () => ({
      kind: "dashed",
      dash: [1, 2]
    })
  },
  {
    key: "cloudy-1",
    make: () => ({
      kind: "cloudy",
      intensity: 1
    })
  },
  {
    key: "cloudy-2",
    make: () => ({
      kind: "cloudy",
      intensity: 2
    })
  }
], se = (e) => e.kind === "cloudy" ? `cloudy-${e.intensity >= 2 ? 2 : 1}` : e.kind === "dashed" ? `dashed-${e.dash.join("-")}` : "solid", ie = (e) => {
  const a = e.cloudyIntensity;
  if (a) return {
    kind: "cloudy",
    intensity: a
  };
  const l = e.dashArray;
  return e.borderStyle === "dashed" ? {
    kind: "dashed",
    dash: l?.length ? l : [3, 3]
  } : { kind: "solid" };
}, ce = (e) => ({
  borderStyle: e.kind === "dashed" ? "dashed" : "solid",
  dashArray: e.kind === "dashed" ? e.dash : null,
  cloudyIntensity: e.kind === "cloudy" ? e.intensity : null
}), w = (e, a) => e.find((l) => l.value === a);
function m({ label: e, mixed: a, children: l }) {
  const o = h();
  return /* @__PURE__ */ t("section", {
    className: "mb-5",
    children: [/* @__PURE__ */ t("label", {
      className: "text-fg mb-2 block text-sm font-medium",
      children: [e, a && /* @__PURE__ */ t("span", {
        className: "text-fg-muted ms-1.5 text-xs font-normal",
        children: o("stylePanel.mixed")
      })]
    }), l]
  });
}
const N = (e) => e == null || e === "transparent" || /^#([0-9a-f]{8})$/i.test(e) && e.slice(-2).toLowerCase() === "00";
function E({ color: e, active: a, onSelect: l }) {
  const o = h(), r = N(e) ? {
    backgroundColor: "#fff",
    backgroundImage: "linear-gradient(45deg, transparent 40%, #ef4444 40%, #ef4444 60%, transparent 60%)",
    backgroundSize: "100% 100%"
  } : { backgroundColor: e };
  return /* @__PURE__ */ t("button", {
    type: "button",
    title: N(e) ? o("stylePanel.transparent") : e,
    onClick: () => l(e),
    className: `border-border-strong h-5 w-5 rounded-full border ${a ? "outline-accent outline outline-2 outline-offset-2" : ""}`,
    style: r
  });
}
function D({ value: e, onSelect: a, allowTransparent: l }) {
  const o = (r) => r.toLowerCase() === (e ?? "").toLowerCase();
  return /* @__PURE__ */ t("div", {
    className: "grid grid-cols-6 gap-x-1 gap-y-3",
    children: [le.map((r) => /* @__PURE__ */ t(E, {
      color: r,
      active: o(r),
      onSelect: a
    }, r)), l && /* @__PURE__ */ t(E, {
      color: "transparent",
      active: N(e ?? null),
      onSelect: a
    })]
  });
}
function T({ value: e, min: a, max: l, step: o, onChange: r }) {
  return /* @__PURE__ */ t("input", {
    type: "range",
    className: "accent-accent mb-1.5 h-1 w-full cursor-pointer",
    value: e,
    min: a,
    max: l,
    step: o,
    onChange: (c) => r(parseFloat(c.target.value))
  });
}
function $(e, a) {
  const l = P(null);
  return C(() => {
    const o = l.current;
    return e && o ? U(o, a) : void 0;
  }, [e, a]), l;
}
function L({ trigger: e, children: a }) {
  const [l, o] = y(!1);
  return /* @__PURE__ */ t("div", {
    ref: $(l, () => o(!1)),
    className: "relative w-full",
    children: [/* @__PURE__ */ t("button", {
      type: "button",
      onClick: () => o((r) => !r),
      className: "border-border bg-surface text-fg flex w-full items-center justify-between gap-2 rounded border px-3 py-1.5",
      children: [e, /* @__PURE__ */ t(p, {
        name: "chevronDown",
        size: 16,
        className: "text-fg-secondary shrink-0"
      })]
    }), l && /* @__PURE__ */ t("div", {
      className: "border-border bg-elevated absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded border p-1 shadow-lg",
      children: a(() => o(!1))
    })]
  });
}
function k({ selected: e, title: a, onClick: l, children: o }) {
  return /* @__PURE__ */ t("button", {
    type: "button",
    title: a,
    "aria-label": a,
    onClick: l,
    className: `hover:bg-hover flex w-full items-center rounded px-2 py-1.5 text-start text-sm ${e ? "bg-selected text-accent" : "text-fg"}`,
    children: o
  });
}
function O(e) {
  if (e.kind === "cloudy") {
    const a = e.intensity >= 2 ? 5 : 3, l = Math.ceil(80 / (a * 2)), o = 80 / l, r = a + 1, c = a * 2 + 2, s = [`M 0 ${r}`];
    for (let i = 0; i < l; i++) s.push(`A ${a} ${a} 0 0 1 ${o * (i + 1)} ${r}`);
    return /* @__PURE__ */ t("svg", {
      width: "80",
      height: c,
      viewBox: `0 0 80 ${c}`,
      children: /* @__PURE__ */ t("path", {
        d: s.join(" "),
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "1.5",
        strokeLinejoin: "round",
        strokeLinecap: "round"
      })
    });
  }
  return /* @__PURE__ */ t("svg", {
    width: "80",
    height: "8",
    viewBox: "0 0 80 8",
    children: /* @__PURE__ */ t("line", {
      x1: "0",
      y1: "4",
      x2: "80",
      y2: "4",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeDasharray: e.kind === "dashed" ? e.dash.join(" ") : void 0
    })
  });
}
function de({ value: e, styles: a, onChange: l }) {
  const o = g(), r = re.filter((c) => w(a, c.make().kind));
  return /* @__PURE__ */ t(L, {
    trigger: /* @__PURE__ */ t("span", {
      className: "text-fg-secondary",
      children: O(e)
    }),
    children: (c) => r.map((s) => {
      const i = s.make();
      return /* @__PURE__ */ t(k, {
        selected: se(e) === s.key,
        title: o(w(a, i.kind)),
        onClick: () => {
          l(i), c();
        },
        children: /* @__PURE__ */ t("span", {
          className: "text-fg-secondary",
          children: O(i)
        })
      }, s.key);
    })
  });
}
const ue = {
  square: /* @__PURE__ */ t("path", { d: "M68 -4 L76 -4 L76 4 L68 4 Z" }),
  circle: /* @__PURE__ */ t("circle", {
    cx: "72",
    cy: "0",
    r: "4"
  }),
  diamond: /* @__PURE__ */ t("path", { d: "M72 -5 L77 0 L72 5 L67 0 Z" }),
  "open-arrow": /* @__PURE__ */ t("path", {
    d: "M67 -5 L77 0 L67 5",
    fill: "none"
  }),
  "closed-arrow": /* @__PURE__ */ t("path", { d: "M67 -5 L77 0 L67 5 Z" }),
  "r-open-arrow": /* @__PURE__ */ t("path", {
    d: "M77 -5 L67 0 L77 5",
    fill: "none"
  }),
  "r-closed-arrow": /* @__PURE__ */ t("path", { d: "M77 -5 L67 0 L77 5 Z" }),
  butt: /* @__PURE__ */ t("path", {
    d: "M72 -5 L72 5",
    fill: "none"
  }),
  slash: /* @__PURE__ */ t("path", {
    d: "M67 -5 L77 5",
    fill: "none"
  })
}, fe = {
  square: 68,
  circle: 68,
  diamond: 67,
  "open-arrow": 76,
  "closed-arrow": 67,
  "r-open-arrow": 67,
  "r-closed-arrow": 67,
  butt: 72,
  slash: 72
};
function R({ name: e, side: a }) {
  const l = ue[e], o = fe[e] ?? 77;
  return /* @__PURE__ */ t("svg", {
    width: "80",
    height: "20",
    viewBox: "0 0 80 20",
    className: "text-fg",
    children: /* @__PURE__ */ t("g", {
      transform: a === "start" ? "rotate(180 40 10)" : void 0,
      children: [/* @__PURE__ */ t("line", {
        x1: "4",
        y1: "10",
        x2: o,
        y2: "10",
        stroke: "currentColor",
        strokeWidth: "1.5"
      }), l && /* @__PURE__ */ t("g", {
        transform: "translate(0, 10)",
        fill: "currentColor",
        stroke: "currentColor",
        strokeWidth: "1.5",
        children: l
      })]
    })
  });
}
function A({ side: e, value: a, options: l, onChange: o }) {
  const r = g();
  return /* @__PURE__ */ t(L, {
    trigger: /* @__PURE__ */ t(R, {
      name: a,
      side: e
    }),
    children: (c) => l.map((s) => /* @__PURE__ */ t(k, {
      selected: a === s.value,
      title: r(s),
      onClick: () => {
        o(s.value), c();
      },
      children: /* @__PURE__ */ t(R, {
        name: s.value,
        side: e
      })
    }, s.value))
  });
}
function me({ value: e, standard: a, onChange: l }) {
  const o = g(), r = Q(), c = [...a.filter((i) => ae.includes(i.value)).map((i) => ({
    value: i.value,
    label: o(i)
  })), ...r.map((i) => ({
    value: i.key,
    label: i.label
  }))], s = w(a, e);
  return /* @__PURE__ */ t(L, {
    trigger: /* @__PURE__ */ t("span", {
      className: "text-fg text-sm",
      children: c.find((i) => i.value === e)?.label ?? (s ? o(s) : e)
    }),
    children: (i) => c.map((n) => /* @__PURE__ */ t(k, {
      selected: n.value === e,
      onClick: () => {
        l(n.value), i();
      },
      children: n.label
    }, n.value))
  });
}
function he({ value: e, onChange: a }) {
  const [l, o] = y(!1), r = $(l, () => o(!1)), [c, s] = y(null), i = () => {
    if (c === null) return;
    const n = parseInt(c, 10);
    s(null), Number.isFinite(n) && n > 0 && n !== e && a(n);
  };
  return /* @__PURE__ */ t("div", {
    ref: r,
    className: "relative w-full",
    children: [
      /* @__PURE__ */ t("input", {
        type: "number",
        min: 1,
        value: c ?? e,
        onChange: (n) => s(n.target.value),
        onBlur: i,
        onKeyDown: (n) => {
          n.key === "Enter" ? (n.preventDefault(), i(), o(!1)) : n.key === "Escape" && (s(null), o(!1));
        },
        onClick: () => o(!0),
        className: "border-border bg-surface text-fg w-full rounded border px-2 py-1.5 pe-7 text-sm"
      }),
      /* @__PURE__ */ t("button", {
        type: "button",
        tabIndex: -1,
        onClick: () => o((n) => !n),
        className: "absolute inset-y-0 end-1 flex items-center",
        children: /* @__PURE__ */ t(p, {
          name: "chevronDown",
          size: 16,
          className: "text-fg-secondary"
        })
      }),
      l && /* @__PURE__ */ t("div", {
        className: "border-border bg-elevated absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded border p-1 shadow-lg",
        children: oe.map((n) => /* @__PURE__ */ t(k, {
          selected: n === e,
          onClick: () => {
            s(null), a(n), o(!1);
          },
          children: n
        }, n))
      })
    ]
  });
}
function ge({ value: e, options: a, name: l, onChange: o }) {
  const r = g();
  return /* @__PURE__ */ t("select", {
    value: e,
    "aria-label": l,
    onChange: (c) => o(c.target.value),
    className: "border-border bg-surface text-fg w-full rounded border px-3 py-1.5 text-sm",
    children: a.map((c) => /* @__PURE__ */ t("option", {
      value: c.value,
      children: r(c)
    }, c.value))
  });
}
function z({ active: e, title: a, onClick: l, keepFocus: o, children: r }) {
  return /* @__PURE__ */ t("button", {
    type: "button",
    title: a,
    onClick: l,
    onMouseDown: o ? (c) => c.preventDefault() : void 0,
    className: `flex h-9 w-9 items-center justify-center rounded border transition-colors ${e ? "border-accent bg-accent text-on-accent" : "border-border bg-surface text-fg hover:bg-hover"}`,
    children: r
  });
}
const be = (e) => e.key === "bold" || e.key === "italic" || e.key === "underline";
function pe({ specs: e, values: a, mixed: l, onToggle: o }) {
  const r = h(), c = g();
  return /* @__PURE__ */ t(m, {
    label: r("demo.formatLabel"),
    mixed: e.some((s) => l.includes(s.key)),
    children: /* @__PURE__ */ t("div", {
      className: "flex gap-2",
      children: e.map((s) => {
        const i = a[s.key] === !0 && !l.includes(s.key);
        return /* @__PURE__ */ t(z, {
          title: c(s),
          active: i,
          keepFocus: !0,
          onClick: () => o(s.key, !i),
          children: /* @__PURE__ */ t(p, {
            name: s.key,
            size: 18
          })
        }, s.key);
      })
    })
  });
}
function ye({ spec: e, values: a, mixed: l, onChange: o, onChangeEach: r }) {
  const c = h(), s = g(), i = a[e.key];
  switch (e.key) {
    case "color":
    case "fontColor":
      return /* @__PURE__ */ t(m, {
        label: s(e),
        mixed: l,
        children: /* @__PURE__ */ t(D, {
          value: i,
          onSelect: (n) => o({ [e.key]: n })
        })
      });
    case "interiorColor":
      return /* @__PURE__ */ t(m, {
        label: s(e),
        mixed: l,
        children: /* @__PURE__ */ t(D, {
          value: i,
          allowTransparent: !0,
          onSelect: (n) => o({ interiorColor: n === "transparent" ? null : n })
        })
      });
    case "opacity": {
      const n = i ?? 1;
      return /* @__PURE__ */ t(m, {
        label: s(e),
        mixed: l,
        children: [/* @__PURE__ */ t(T, {
          value: n,
          min: e.min,
          max: e.max,
          step: e.step,
          onChange: (u) => o({ opacity: u })
        }), /* @__PURE__ */ t("span", {
          className: "text-fg-muted text-xs",
          children: [Math.round(n * 100), "%"]
        })]
      });
    }
    case "strokeWidth": {
      const n = i ?? e.min;
      return /* @__PURE__ */ t(m, {
        label: s(e),
        mixed: l,
        children: [/* @__PURE__ */ t(T, {
          value: n,
          min: e.min,
          max: e.max,
          step: e.step,
          onChange: (u) => o({ strokeWidth: u })
        }), /* @__PURE__ */ t("span", {
          className: "text-fg-muted text-xs",
          children: `${n}px`
        })]
      });
    }
    case "fontSize":
      return /* @__PURE__ */ t(m, {
        label: s(e),
        mixed: l,
        children: /* @__PURE__ */ t(he, {
          value: i ?? 12,
          onChange: (n) => o({ fontSize: n })
        })
      });
    case "borderStyle":
      return /* @__PURE__ */ t(m, {
        label: s(e),
        mixed: l,
        children: /* @__PURE__ */ t(de, {
          value: ie(a),
          styles: e.options,
          onChange: (n) => o(ce(n))
        })
      });
    case "lineEndings": {
      const n = i ?? {
        start: "none",
        end: "none"
      };
      return /* @__PURE__ */ t(m, {
        label: s(e),
        mixed: l,
        children: /* @__PURE__ */ t("div", {
          className: "grid grid-cols-2 gap-3",
          children: [/* @__PURE__ */ t("div", { children: [/* @__PURE__ */ t("div", {
            className: "text-fg-muted mb-1.5 text-xs",
            children: c("stylePanel.lineStart")
          }), /* @__PURE__ */ t(A, {
            side: "start",
            value: n.start,
            options: e.options,
            onChange: (u) => r((f) => ({ lineEndings: {
              ...f.lineEndings,
              start: u
            } }))
          })] }), /* @__PURE__ */ t("div", { children: [/* @__PURE__ */ t("div", {
            className: "text-fg-muted mb-1.5 text-xs",
            children: c("stylePanel.lineEnd")
          }), /* @__PURE__ */ t(A, {
            side: "end",
            value: n.end,
            options: e.options,
            onChange: (u) => r((f) => ({ lineEndings: {
              ...f.lineEndings,
              end: u
            } }))
          })] })]
        })
      });
    }
    case "fontFamily":
      return /* @__PURE__ */ t(m, {
        label: s(e),
        mixed: l,
        children: /* @__PURE__ */ t(me, {
          value: i ?? "helvetica",
          standard: e.options,
          onChange: (n) => o({ fontFamily: n })
        })
      });
    case "textAlign": {
      const n = {
        left: "alignLeft",
        center: "alignCenter",
        right: "alignRight"
      };
      return /* @__PURE__ */ t(m, {
        label: s(e),
        mixed: l,
        children: /* @__PURE__ */ t("div", {
          className: "flex gap-2",
          children: e.options.map((u) => {
            const f = u.value;
            return /* @__PURE__ */ t(z, {
              title: s(u),
              active: i === f,
              onClick: () => o({ textAlign: f }),
              children: /* @__PURE__ */ t(p, {
                name: n[f],
                size: 18
              })
            }, f);
          })
        })
      });
    }
    case "bold":
    case "italic":
    case "underline":
      return null;
    case "blendMode":
      return /* @__PURE__ */ t(m, {
        label: s(e),
        mixed: l,
        children: /* @__PURE__ */ t(ge, {
          value: i ?? "normal",
          options: e.options,
          name: s(e),
          onChange: (n) => o({ blendMode: n })
        })
      });
    case "link":
      return null;
    default:
      return null;
  }
}
function ke() {
  const e = h();
  return /* @__PURE__ */ t("div", {
    className: "text-fg-muted flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center",
    children: [/* @__PURE__ */ t(p, {
      name: "palette",
      size: 40,
      className: "text-fg-disabled"
    }), /* @__PURE__ */ t("p", {
      className: "max-w-[180px] text-sm",
      children: e("stylePanel.empty")
    })]
  });
}
const xe = {
  bold: (e) => ({ weight: e ? 700 : 400 }),
  italic: (e) => ({ italic: e }),
  underline: (e) => ({ decoration: e ? ["underline"] : [] })
};
function Ce() {
  const e = h(), a = I(), l = Z(), o = V() ?? void 0, r = G((d) => d.activeToolId) ?? "pointer", c = v(), s = v(r), i = H(r), n = M((d) => d.selected), u = q(() => l.resolveCommand(`tool:${r}`, o)?.label ?? null, Object.is), f = c.properties.length > 0, { properties: B, values: F, mixed: S } = f ? c : s, x = B.filter((d) => d.control !== "flag" && d.control !== "text"), _ = (d) => f ? a.selection.update(d) : a.tools.updateDefaults(r, d), j = (d) => f ? a.selection.update((b) => d(b)) : a.tools.updateDefaults(r, d(i)), K = (d, b) => {
    if (f) return void a.text.toggleFormat(d);
    const W = i.richText?.body;
    a.tools.updateDefaults(r, { richText: { body: {
      ...W,
      ...xe[d](b)
    } } });
  };
  return x.length === 0 && n.length === 0 ? /* @__PURE__ */ t(ke, {}) : /* @__PURE__ */ t("div", {
    className: "flex-1 overflow-y-auto p-4",
    children: [
      /* @__PURE__ */ t("p", {
        className: "text-fg-muted mb-4 text-[11px] font-semibold uppercase tracking-wide",
        children: f ? e("stylePanel.selected", { params: { count: n.length } }) : u === null ? e("stylePanel.defaults") : e("stylePanel.toolDefaults", { params: { tool: u } })
      }),
      x.map((d) => d.key === "bold" ? /* @__PURE__ */ t(pe, {
        specs: x.filter((b) => be(b)),
        values: F,
        mixed: S,
        onToggle: K
      }, "format") : /* @__PURE__ */ t(ye, {
        spec: d,
        values: F,
        mixed: S.includes(d.key),
        onChange: _,
        onChangeEach: j
      }, d.key)),
      /* @__PURE__ */ t(ve, {}),
      /* @__PURE__ */ t(ne, {})
    ]
  });
}
function ve() {
  const e = h(), a = J(X), l = M((n) => n.selected), o = l.length === 1 && l[0].subtype === "redact" ? l[0] : null, [r, c] = y(null);
  if (C(() => c(null), [o?.ref && Y(o.ref)]), !a || !o || o.subtype !== "redact") return null;
  const s = r ?? o.overlayText ?? "", i = () => {
    r !== null && (a.updateLabel(o.ref, { overlayText: r.length > 0 ? r : null }), c(null));
  };
  return /* @__PURE__ */ t("div", {
    className: "border-border-subtle mt-4 border-t pt-4",
    children: [
      /* @__PURE__ */ t("p", {
        className: "text-fg-muted mb-2 text-[11px] font-semibold uppercase tracking-wide",
        children: e("demo.redactLabelTitle")
      }),
      /* @__PURE__ */ t("input", {
        type: "text",
        value: s,
        placeholder: e("demo.redactLabelPlaceholder"),
        onChange: (n) => c(n.target.value),
        onBlur: i,
        onKeyDown: (n) => n.key === "Enter" && i(),
        className: "border-border bg-surface text-fg w-full rounded-md border px-2 py-1.5 text-sm"
      }),
      /* @__PURE__ */ t("label", {
        className: "text-fg mt-2 flex items-center gap-2 text-sm",
        children: [/* @__PURE__ */ t("input", {
          type: "checkbox",
          checked: o.repeat,
          onChange: (n) => void a.updateLabel(o.ref, { repeat: n.target.checked })
        }), e("demo.redactLabelRepeat")]
      })
    ]
  });
}
export {
  Ce as AnnotationStylePanel
};
//# sourceMappingURL=annotation-style--rPIZsuP-Bdbm77md.js.map
