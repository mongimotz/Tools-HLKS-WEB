import { u as D, L as $, N as B, O as H, P as Y, E as _, Q as q, U as F, A as Q, d as u, k as L, V, W, X, e as t, S as Z, I as i, Y as G, Z as J } from "./wasm-url-asset-DgMkO6xQ.js";
const c = "all";
function ee() {
  const r = D(), a = $(), { standard: b, sidebar: m } = B(), l = H({ kind: m ?? ["stamps"] }), w = Y(), { activeToolId: k } = _(), { locale: I } = q(), U = F("stamps"), S = Q(null), [A, f] = u(null), [h, p] = u(null), [g, n] = u(null), [E, x] = u(c), y = U.props?.libraryId;
  L(() => {
    typeof y == "string" && x(y);
  }, [y]), L(() => {
    let e = !0;
    return p("loading"), V(a).then(() => W(a, X(I), b)).catch((s) => {
      console.error("[embedpdf] default stamps failed:", s), e && n(r("demo.stampsError"));
    }).finally(() => e && p(null)), () => {
      e = !1;
    };
  }, [a, I]), L(() => {
    k !== "stamp" && f(null);
  }, [k]);
  const j = (e) => {
    n(null), f(e.id), a.armAsset(e.id).catch((s) => {
      console.error("[embedpdf] arm stamp failed:", s), f(null), n(r("demo.stampsArmError"));
    });
  }, z = (e) => {
    n(null), p("importing"), a.importLibrary(e, { name: e.name.replace(/\.pdf$/i, "") }).then(({ library: s }) => x(s.id)).catch((s) => {
      console.error("[embedpdf] stamp library import failed:", s), n(r("demo.stampsImportError"));
    }).finally(() => p(null));
  }, O = async (e, s) => {
    const C = await a.exportLibrary(e).catch(() => null);
    if (!C) return;
    const T = new Blob([C], { type: "application/pdf" }), P = URL.createObjectURL(T), N = document.createElement("a");
    N.href = P, N.download = `${s || "stamps"}.pdf`, N.click(), URL.revokeObjectURL(P);
  }, o = l.length === 1 ? l[0].id : l.some((e) => e.id === E) ? E : c, d = o === c ? null : l.find((e) => e.id === o) ?? null, v = o === c ? w : w.filter((e) => e.libraryId === o), R = (e) => e === G;
  return /* @__PURE__ */ t("div", {
    className: "flex min-h-0 flex-1 flex-col",
    children: [
      l.length > 0 && /* @__PURE__ */ t("div", {
        className: "border-border-subtle flex items-center gap-1 border-b p-2",
        children: [l.length > 1 ? /* @__PURE__ */ t("select", {
          value: o,
          onChange: (e) => x(e.target.value),
          "aria-label": r("panels.stamps"),
          className: "border-border bg-surface text-fg min-w-0 flex-1 rounded border px-2 py-1.5 text-sm",
          children: [/* @__PURE__ */ t("option", {
            value: c,
            children: r("demo.stampsAll")
          }), l.map((e) => /* @__PURE__ */ t("option", {
            value: e.id,
            children: e.name
          }, e.id))]
        }) : /* @__PURE__ */ t("span", {
          className: "text-fg-muted min-w-0 flex-1 truncate px-1 text-xs font-semibold uppercase tracking-wide",
          children: l[0].name
        }), d && /* @__PURE__ */ t(Z, { children: [/* @__PURE__ */ t("button", {
          type: "button",
          onClick: () => O(d.id, d.name),
          title: r("demo.stampsExportLibrary"),
          className: "text-fg-muted hover:text-fg grid h-7 w-7 shrink-0 place-items-center rounded",
          children: /* @__PURE__ */ t(i, {
            name: "download",
            size: 14
          })
        }), !R(d.id) && /* @__PURE__ */ t("button", {
          type: "button",
          onClick: () => void a.deleteLibrary(d.id),
          title: r("demo.stampsRemoveLibrary"),
          className: "text-fg-muted hover:text-fg grid h-7 w-7 shrink-0 place-items-center rounded",
          children: /* @__PURE__ */ t(i, {
            name: "trash",
            size: 14
          })
        })] })]
      }),
      /* @__PURE__ */ t("div", {
        className: "min-h-0 flex-1 overflow-y-auto p-3",
        children: h === "loading" && v.length === 0 ? /* @__PURE__ */ t("div", {
          className: "flex flex-col items-center gap-3 px-4 py-10 text-center",
          children: [/* @__PURE__ */ t("div", { className: "border-border-subtle border-t-accent h-6 w-6 animate-spin rounded-full border-2" }), /* @__PURE__ */ t("p", {
            className: "text-fg-muted text-sm",
            children: r("demo.stampsLoading")
          })]
        }) : v.length === 0 ? /* @__PURE__ */ t("div", {
          className: "flex flex-col items-center gap-3 px-4 py-10 text-center",
          children: [/* @__PURE__ */ t(i, {
            name: "rubberStamp",
            size: 32,
            className: "text-fg-muted"
          }), /* @__PURE__ */ t("p", {
            className: "text-fg-muted text-sm",
            children: r("demo.stampsEmpty")
          })]
        }) : /* @__PURE__ */ t("ul", {
          className: "grid grid-cols-2 gap-3",
          children: v.map((e) => /* @__PURE__ */ t("li", {
            className: "group relative",
            children: [/* @__PURE__ */ t(K, {
              asset: e,
              armed: A === e.id,
              onArm: () => j(e)
            }), !R(e.libraryId) && /* @__PURE__ */ t("button", {
              type: "button",
              onClick: () => void a.deleteAsset(e.id),
              title: r("demo.stampsRemoveStamp"),
              className: "bg-surface border-border text-fg-muted hover:text-fg absolute end-1 top-1 grid h-5 w-5 place-items-center rounded-full border opacity-0 shadow-sm focus:opacity-100 group-hover:opacity-100",
              children: /* @__PURE__ */ t(i, {
                name: "x",
                size: 12
              })
            })]
          }, e.id))
        })
      }),
      (g || A) && /* @__PURE__ */ t("div", {
        className: `border-border-subtle shrink-0 border-t px-3 py-2 text-xs ${g ? "text-red-600" : "text-fg-muted"}`,
        children: g ?? r("demo.stampsArmedHint")
      }),
      /* @__PURE__ */ t("div", {
        className: "border-border-subtle shrink-0 border-t p-3",
        children: [/* @__PURE__ */ t("button", {
          type: "button",
          disabled: h != null,
          onClick: () => S.current?.click(),
          title: r("demo.stampsImportHint"),
          className: "border-border text-fg hover:bg-hover flex w-full items-center justify-center gap-2 rounded-md border px-3 py-1.5 text-sm disabled:opacity-40",
          children: [/* @__PURE__ */ t(i, {
            name: "rubberStampPlus",
            size: 16
          }), r(h === "importing" ? "demo.stampsImporting" : "demo.stampsImport")]
        }), /* @__PURE__ */ t("input", {
          ref: S,
          type: "file",
          accept: "application/pdf",
          className: "hidden",
          onChange: (e) => {
            const s = e.currentTarget.files?.[0];
            e.currentTarget.value = "", s && z(s);
          }
        })]
      })
    ]
  });
}
function K({ asset: r, armed: a, onArm: b }) {
  const m = J(r.id);
  return /* @__PURE__ */ t("button", {
    type: "button",
    onClick: b,
    title: r.label,
    "aria-pressed": a,
    className: `flex aspect-square w-full items-center justify-center rounded-md border p-2 ${a ? "border-accent bg-accent-light ring-accent ring-2" : "border-border-subtle hover:border-border hover:bg-hover"}`,
    children: m ? /* @__PURE__ */ t("img", {
      src: m,
      alt: r.label,
      className: "max-h-full max-w-full object-contain"
    }) : /* @__PURE__ */ t("span", {
      className: "text-fg truncate text-sm",
      children: r.label
    })
  });
}
export {
  ee as StampsPanel
};
//# sourceMappingURL=stamps-panel-CDO0FPyK-DLtO3MFU.js.map
