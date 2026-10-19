import { u as h, a as x, b as v, c as y, d as c, e as t, I as N } from "./wasm-url-asset-DgMkO6xQ.js";
function b({ active: o, title: e, onClick: l, children: r }) {
  return /* @__PURE__ */ t("button", {
    type: "button",
    title: e,
    onClick: l,
    className: `rounded border px-2.5 py-1 text-xs font-medium transition-colors ${o ? "border-accent bg-accent text-on-accent" : "border-border bg-surface text-fg hover:bg-hover"}`,
    children: r
  });
}
function w({ onClose: o }) {
  const e = h(), l = x(), r = v(), i = y().values.link ?? null, [a, d] = c(i?.kind === "goto" ? "page" : "uri"), [s, k] = c(i?.kind === "uri" ? i.uri : ""), [p, f] = c("1"), u = () => {
    if (a === "uri") {
      const g = s.trim();
      if (!g) return;
      r.selection.updateLink({
        kind: "uri",
        uri: g
      }), o();
      return;
    }
    const n = l.documents.getPage(Math.max(0, Number(p) - 1));
    n && (r.selection.updateLink({
      kind: "goto",
      destination: {
        kind: "fit",
        page: n.ref
      }
    }), o());
  }, m = "border-border bg-surface text-fg focus:border-accent w-full rounded border px-2.5 py-1.5 text-sm outline-none";
  return /* @__PURE__ */ t("div", {
    className: "border-border bg-surface w-64 rounded-lg border p-3 shadow-lg",
    children: [
      /* @__PURE__ */ t("div", {
        className: "mb-2 flex items-center justify-between",
        children: [/* @__PURE__ */ t("span", {
          className: "text-fg text-sm font-semibold",
          children: e("commands.annotate.link")
        }), /* @__PURE__ */ t("button", {
          type: "button",
          onClick: o,
          "aria-label": e("panel.close"),
          title: e("panel.close"),
          className: "text-fg-muted hover:bg-hover grid h-6 w-6 place-items-center rounded",
          children: /* @__PURE__ */ t(N, {
            name: "x",
            size: 14
          })
        })]
      }),
      /* @__PURE__ */ t("div", {
        className: "mb-2 flex gap-1.5",
        children: [/* @__PURE__ */ t(b, {
          title: e("linkEditor.toUrl"),
          active: a === "uri",
          onClick: () => d("uri"),
          children: e("linkEditor.url")
        }), /* @__PURE__ */ t(b, {
          title: e("linkEditor.toPage"),
          active: a === "page",
          onClick: () => d("page"),
          children: e("linkEditor.page")
        })]
      }),
      a === "uri" ? /* @__PURE__ */ t("input", {
        type: "url",
        className: m,
        placeholder: e("linkEditor.urlPlaceholder"),
        autoFocus: !0,
        value: s,
        onChange: (n) => k(n.target.value),
        onKeyDown: (n) => n.key === "Enter" && u()
      }) : /* @__PURE__ */ t("input", {
        type: "number",
        min: 1,
        className: m,
        placeholder: e("linkEditor.pagePlaceholder"),
        autoFocus: !0,
        value: p,
        onChange: (n) => f(n.target.value),
        onKeyDown: (n) => n.key === "Enter" && u()
      }),
      /* @__PURE__ */ t("button", {
        type: "button",
        className: "bg-accent text-on-accent mt-2.5 w-full rounded px-2 py-1.5 text-sm font-medium",
        onClick: u,
        children: i == null ? e("linkEditor.add") : e("linkEditor.update")
      })
    ]
  });
}
export {
  w as LinkEditorCard
};
//# sourceMappingURL=link-editor-SxM1nnJU-CNK_ym3a.js.map
