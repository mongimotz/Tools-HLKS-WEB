import { u as w, U as S, _ as K, d as r, ab as F, Z as L, e, D as j } from "./wasm-url-asset-DgMkO6xQ.js";
function B() {
  const t = w(), l = S("signature-sign"), s = K(), [d, v] = r(""), [c, N] = r(""), [u, C] = r("approval"), [o, b] = r(null), [p, f] = r(null), x = F(), a = l.props?.field, i = l.props?.mark, h = L(i && "assetId" in i ? i.assetId : null);
  if (!l.isOpen || !a || !i) return null;
  const k = {
    ...d.trim() ? { reason: d.trim() } : {},
    ...c.trim() ? { location: c.trim() } : {}
  }, y = async (n) => {
    b(n), f(null);
    try {
      n === "sign" ? await s.sign({
        field: a,
        mark: i,
        signer: k,
        ...u !== "approval" && s.canCertify() ? { certify: { permission: Number(u.slice(-1)) } } : {}
      }) : await s.fillField(a, i), l.close();
    } catch (g) {
      f(g instanceof Error ? g.message : String(g));
    } finally {
      b(null);
    }
  }, m = "border-border bg-surface text-fg w-full rounded border px-2 py-1.5 text-sm";
  return /* @__PURE__ */ e(j, {
    labelledBy: x,
    onClose: () => {
      o == null && l.close();
    },
    className: "border-border bg-surface w-96 rounded-lg border p-4 shadow-xl",
    children: [
      /* @__PURE__ */ e("h2", {
        id: x,
        className: "text-fg text-base font-semibold",
        children: t("demo.signTitle")
      }),
      /* @__PURE__ */ e("div", {
        className: "border-border-subtle mt-3 flex h-24 items-center justify-center rounded-md border p-2",
        children: h ? /* @__PURE__ */ e("img", {
          src: h,
          alt: "",
          className: "max-h-full max-w-full object-contain"
        }) : /* @__PURE__ */ e("span", {
          className: "text-fg-muted text-sm",
          children: t("demo.signatureLabel")
        })
      }),
      /* @__PURE__ */ e("label", {
        className: "text-fg-muted mt-3 block text-xs",
        children: [t("demo.signReason"), /* @__PURE__ */ e("input", {
          value: d,
          onChange: (n) => v(n.target.value),
          className: m
        })]
      }),
      /* @__PURE__ */ e("label", {
        className: "text-fg-muted mt-2 block text-xs",
        children: [t("demo.signLocation"), /* @__PURE__ */ e("input", {
          value: c,
          onChange: (n) => N(n.target.value),
          className: m
        })]
      }),
      s.canCertify() ? /* @__PURE__ */ e("label", {
        className: "text-fg-muted mt-3 block text-xs",
        children: [t("demo.signKind"), /* @__PURE__ */ e("select", {
          value: u,
          onChange: (n) => C(n.target.value),
          className: m,
          children: [
            /* @__PURE__ */ e("option", {
              value: "approval",
              children: t("demo.signKindApproval")
            }),
            /* @__PURE__ */ e("option", {
              value: "certify-3",
              children: t("demo.signKindCertifyAnnotate")
            }),
            /* @__PURE__ */ e("option", {
              value: "certify-2",
              children: t("demo.signKindCertifyFill")
            }),
            /* @__PURE__ */ e("option", {
              value: "certify-1",
              children: t("demo.signKindCertifyLocked")
            })
          ]
        })]
      }) : null,
      p ? /* @__PURE__ */ e("p", {
        className: "mt-2 text-sm text-red-600",
        children: p
      }) : null,
      /* @__PURE__ */ e("div", {
        className: "mt-4 flex justify-end gap-2",
        children: [
          /* @__PURE__ */ e("button", {
            type: "button",
            disabled: o != null,
            onClick: l.close,
            className: "border-border text-fg hover:bg-hover rounded-md border px-3 py-1.5 text-sm",
            children: t("demo.cancel")
          }),
          s.canFill(a) ? /* @__PURE__ */ e("button", {
            type: "button",
            disabled: o != null,
            onClick: () => void y("fill"),
            className: "border-border text-fg hover:bg-hover rounded-md border px-3 py-1.5 text-sm disabled:opacity-60",
            children: t("demo.signFill")
          }) : null,
          s.canSign(a) ? /* @__PURE__ */ e("button", {
            type: "button",
            disabled: o != null,
            onClick: () => void y("sign"),
            className: "bg-accent text-on-accent rounded-md px-3 py-1.5 text-sm disabled:opacity-60",
            children: t(o === "sign" ? "demo.signSigning" : "demo.signButton")
          }) : null
        ]
      })
    ]
  });
}
export {
  B as SignDialog
};
//# sourceMappingURL=sign-dialog-GDqCoQhA-DNHZ4o1G.js.map
