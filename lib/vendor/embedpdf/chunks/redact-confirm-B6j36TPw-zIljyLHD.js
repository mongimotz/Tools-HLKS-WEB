import { u as f, U as b, d as m, ab as x, e, D as y } from "./wasm-url-asset-DgMkO6xQ.js";
import { u as g } from "./redaction-CBIabbjk.js";
function N() {
  const t = f(), r = b("redact-confirm"), a = g(), [o, s] = m(!1), [d, n] = m(null), c = x();
  if (!r.isOpen) return null;
  const u = a.getPendingCount(), i = a.estimateCollateral().count, p = async () => {
    s(!0), n(null);
    try {
      await a.applyAll(), r.close();
    } catch (l) {
      n(l instanceof Error ? l.message : String(l));
    } finally {
      s(!1);
    }
  };
  return /* @__PURE__ */ e(y, {
    labelledBy: c,
    onClose: () => {
      o || r.close();
    },
    className: "border-border bg-surface w-96 rounded-lg border p-4 shadow-xl",
    children: [
      /* @__PURE__ */ e("h2", {
        id: c,
        className: "text-fg text-base font-semibold",
        children: t("demo.redactConfirmTitle")
      }),
      /* @__PURE__ */ e("p", {
        className: "text-fg-muted mt-2 text-sm",
        children: t("demo.redactConfirmBody", { params: { count: u } })
      }),
      i > 0 ? /* @__PURE__ */ e("p", {
        className: "mt-2 text-sm font-medium text-red-600",
        children: t("demo.redactConfirmCollateral", { params: { count: i } })
      }) : null,
      d ? /* @__PURE__ */ e("p", {
        className: "mt-2 text-sm text-red-600",
        children: d
      }) : null,
      /* @__PURE__ */ e("div", {
        className: "mt-4 flex justify-end gap-2",
        children: [/* @__PURE__ */ e("button", {
          type: "button",
          disabled: o,
          onClick: r.close,
          className: "border-border text-fg hover:bg-hover rounded-md border px-3 py-1.5 text-sm",
          children: t("demo.cancel")
        }), /* @__PURE__ */ e("button", {
          type: "button",
          disabled: o,
          onClick: () => void p(),
          className: "rounded-md bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 disabled:opacity-60",
          children: t(o ? "demo.redactApplying" : "demo.redactApply")
        })]
      })
    ]
  });
}
export {
  N as RedactConfirmModal
};
//# sourceMappingURL=redact-confirm-B6j36TPw-zIljyLHD.js.map
