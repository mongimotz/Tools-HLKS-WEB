import { u as j, f as z, g as L, h as E, i as M, d as h, A as C, j as O, v as Q, k as w, T as B, e, I as m, l as y, S as D } from "./wasm-url-asset-DgMkO6xQ.js";
const $ = 300, q = (t, s) => t != null && t.text === s.text && !!t.regex == !!s.regex && !!t.matchCase == !!s.matchCase && !!t.wholeWord == !!s.wholeWord;
function v({ label: t, checked: s, onChange: r }) {
  return /* @__PURE__ */ e("label", {
    className: "text-fg-secondary flex cursor-pointer select-none items-center gap-2 text-xs font-medium",
    children: [/* @__PURE__ */ e("span", {
      className: "relative flex h-4 w-4 items-center justify-center",
      children: [/* @__PURE__ */ e("input", {
        type: "checkbox",
        checked: s,
        onChange: (n) => r(n.target.checked),
        className: "border-border bg-surface checked:border-accent checked:bg-accent rounded-xs peer h-4 w-4 shrink-0 appearance-none border transition-colors"
      }), /* @__PURE__ */ e("svg", {
        viewBox: "0 0 24 24",
        className: "text-on-accent pointer-events-none absolute h-3 w-3 opacity-0 peer-checked:opacity-100",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 3,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        children: /* @__PURE__ */ e("polyline", { points: "20 6 9 17 4 12" })
      })]
    }), t]
  });
}
function A(t) {
  return t ? /* @__PURE__ */ e(D, { children: [
    t.before,
    /* @__PURE__ */ e("span", {
      className: "text-accent font-semibold",
      children: t.match
    }),
    t.after
  ] }) : null;
}
function F({ hit: t, active: s, onClick: r }) {
  const n = C(null);
  return w(() => {
    s && n.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest"
    });
  }, [s]), /* @__PURE__ */ e("button", {
    ref: n,
    type: "button",
    onClick: r,
    className: `w-full rounded border p-2 text-left text-sm transition-colors ${s ? "border-accent bg-accent-light text-fg" : "border-border-subtle bg-surface text-fg-secondary hover:bg-hover"}`,
    children: /* @__PURE__ */ e("span", { children: A(t.snippet) })
  });
}
function V() {
  const t = j(), s = z(), { query: r, status: n, hitCount: f, activeHitIndex: S } = L(), N = E(), W = M(), [o, k] = h(() => r?.text ?? ""), [x, H] = h(() => r?.matchCase ?? !1), [b, P] = h(() => r?.wholeWord ?? !1), [u, R] = h(() => r?.regex ?? !1), p = C(null);
  O("search", p, { select: !0 });
  const g = {
    text: o,
    regex: u,
    matchCase: x,
    wholeWord: b
  }, d = o && u ? Q(g) : { ok: !0 };
  w(() => {
    if (!d.ok || q(r, g) || o === "" && r === null) return;
    const a = setTimeout(() => s.search(g), $);
    return () => clearTimeout(a);
  }, [
    o,
    x,
    b,
    u,
    r,
    d.ok,
    s
  ]);
  const I = B(() => {
    const a = /* @__PURE__ */ new Map();
    return N.forEach((c, l) => {
      const i = a.get(c.pageIndex);
      i ? i.push({
        hit: c,
        index: l
      }) : a.set(c.pageIndex, [{
        hit: c,
        index: l
      }]);
    }), [...a.entries()].sort((c, l) => c[0] - l[0]);
  }, [N]), T = n === "searching";
  return /* @__PURE__ */ e("div", {
    className: "flex min-h-0 flex-1 flex-col",
    children: [/* @__PURE__ */ e("div", {
      className: "p-3",
      children: [
        /* @__PURE__ */ e("div", {
          className: "relative",
          children: [
            /* @__PURE__ */ e("div", {
              className: "text-fg-muted pointer-events-none absolute inset-y-0 start-0 flex items-center ps-2.5",
              children: /* @__PURE__ */ e(m, {
                name: "search",
                size: 16
              })
            }),
            /* @__PURE__ */ e("input", {
              ref: p,
              type: "text",
              value: o,
              placeholder: t("demo.searchPlaceholder"),
              onChange: (a) => k(a.target.value),
              className: `bg-surface text-fg w-full rounded-md border py-1.5 pe-9 ps-8 text-sm outline-none focus:ring-1 ${d.ok ? "border-border focus:border-accent focus:ring-accent" : "border-red-400 focus:border-red-400 focus:ring-red-400"}`
            }),
            o && /* @__PURE__ */ e("button", {
              type: "button",
              onClick: () => {
                k(""), p.current?.focus();
              },
              className: "text-fg-muted hover:text-fg-secondary absolute inset-y-0 end-0 flex items-center pe-2.5",
              children: /* @__PURE__ */ e(m, {
                name: "x",
                size: 16
              })
            })
          ]
        }),
        !d.ok && /* @__PURE__ */ e("p", {
          className: "mt-1.5 text-xs text-red-500",
          children: d.message
        }),
        /* @__PURE__ */ e("div", {
          className: "mt-3 flex flex-col gap-2",
          children: [
            /* @__PURE__ */ e(v, {
              label: t("demo.searchCaseSensitive"),
              checked: x,
              onChange: H
            }),
            /* @__PURE__ */ e(v, {
              label: t("demo.searchWholeWord"),
              checked: b,
              onChange: P
            }),
            /* @__PURE__ */ e(v, {
              label: t("demo.searchRegex"),
              checked: u,
              onChange: R
            })
          ]
        }),
        /* @__PURE__ */ e("hr", { className: "border-border-subtle mb-2 mt-4" }),
        n !== "idle" && /* @__PURE__ */ e("div", {
          className: "flex h-8 items-center justify-between",
          children: [/* @__PURE__ */ e("div", {
            className: "text-fg-muted text-xs",
            children: f === 0 ? t(T ? "demo.searchSearching" : "demo.searchNoResults") : t("demo.searchResults", { params: { count: f } })
          }), f > 1 && /* @__PURE__ */ e("div", {
            className: "flex items-center",
            children: [/* @__PURE__ */ e("button", {
              type: "button",
              title: t("demo.searchPrevious"),
              className: y(!1),
              onClick: () => s.previousHit(),
              children: /* @__PURE__ */ e(m, {
                name: "chevronLeft",
                size: 20,
                className: "rtl:-scale-x-100"
              })
            }), /* @__PURE__ */ e("button", {
              type: "button",
              title: t("demo.searchNext"),
              className: y(!1),
              onClick: () => s.nextHit(),
              children: /* @__PURE__ */ e(m, {
                name: "chevronRight",
                size: 20,
                className: "rtl:-scale-x-100"
              })
            })]
          })]
        })
      ]
    }), /* @__PURE__ */ e("div", {
      className: "flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 pb-3",
      children: I.map(([a, c]) => /* @__PURE__ */ e("div", {
        className: "mt-2 first:mt-0",
        children: [/* @__PURE__ */ e("div", {
          className: "bg-surface/80 text-fg-muted py-2 text-xs backdrop-blur",
          children: t("demo.searchPage", { params: { page: a + 1 } })
        }), /* @__PURE__ */ e("div", {
          className: "flex flex-col gap-2",
          children: c.map(({ hit: l, index: i }) => /* @__PURE__ */ e(F, {
            hit: l,
            active: i === S,
            onClick: () => {
              s.goToHit(i), W();
            }
          }, i))
        })]
      }, a))
    })]
  });
}
export {
  V as SearchPanel
};
//# sourceMappingURL=search-panel-HfIhJm1M-oyd5qzLR.js.map
