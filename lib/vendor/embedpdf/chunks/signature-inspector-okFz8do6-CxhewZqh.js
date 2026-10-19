import { u as h, U as k, _ as y, a1 as v, d as N, H as L, k as T, e as t, I as U, ac as V, a4 as C } from "./wasm-url-asset-DgMkO6xQ.js";
const O = (e) => e ? e.summary === "valid" ? "demo.verdictValid" : e.summary === "valid-untrusted" ? "demo.verdictValidUntrusted" : e.summary === "invalid" ? e.modifications.basis === "working-copy" ? "demo.verdictWillInvalidate" : "demo.verdictInvalid" : "demo.verdictIndeterminate" : "demo.verdictIndeterminate", j = (e) => {
  const s = new Date(e);
  return Number.isNaN(s.getTime()) ? e : s.toLocaleString();
}, x = (e) => e === "valid" ? "text-green-600" : e === "invalid" ? "text-red-600" : e === "valid-untrusted" ? "text-amber-600" : "text-fg-muted";
function $() {
  const e = h(), s = k("signature-inspector"), a = y(), l = v((u) => u.status);
  v((u) => u.signatures);
  const [g, r] = N(!1), o = s.props?.field, i = o ? a.getSignature(o) : null, n = o ? a.getVerdict(o) : null, c = i?.widget ?? null, p = L(C), m = (c && p?.getWidget(c)?.rect) ?? null;
  if (T(() => {
    !s.isOpen || !i?.signed || a.listVerdicts() || (r(!0), a.validate().finally(() => r(!1)));
  }, [s.isOpen, i?.index]), !s.isOpen || !o || !i || l !== "ready") return null;
  const w = () => {
    r(!0), a.validate().finally(() => r(!1));
  }, I = n?.summary ?? null, f = n?.modifications.verdict ?? null, d = (u, R, S = "text-fg") => /* @__PURE__ */ t("div", {
    className: "flex items-baseline justify-between gap-3 text-xs",
    children: [/* @__PURE__ */ t("span", {
      className: "text-fg-muted",
      children: u
    }), /* @__PURE__ */ t("span", {
      className: `text-end ${S}`,
      children: R
    })]
  }), b = /* @__PURE__ */ t("div", {
    className: "border-border bg-elevated w-72 rounded-lg border p-3 text-sm shadow-xl",
    children: [
      /* @__PURE__ */ t("div", {
        className: "flex items-center justify-between",
        children: [/* @__PURE__ */ t("span", {
          className: "text-fg font-semibold",
          children: e("demo.inspectTitle")
        }), /* @__PURE__ */ t("button", {
          type: "button",
          onClick: s.close,
          className: "text-fg-muted hover:bg-hover grid h-6 w-6 place-items-center rounded",
          "aria-label": e("demo.cancel"),
          children: /* @__PURE__ */ t(U, {
            name: "x",
            size: 14
          })
        })]
      }),
      /* @__PURE__ */ t("p", {
        className: `mt-1 text-sm font-medium ${x(I)}`,
        children: e(g ? "demo.signaturesValidating" : O(n))
      }),
      /* @__PURE__ */ t("div", {
        className: "mt-2 flex flex-col gap-1",
        children: [
          d(e("demo.inspectSigner"), i.signer.name ?? "—"),
          i.signer.reason ? d(e("demo.inspectReason"), i.signer.reason) : null,
          i.signer.location ? d(e("demo.inspectLocation"), i.signer.location) : null,
          i.signer.signedAt ? d(e("demo.inspectTime"), j(i.signer.signedAt)) : null
        ]
      }),
      /* @__PURE__ */ t("div", {
        className: "border-border-subtle mt-2 flex flex-col gap-1 border-t pt-2",
        children: [
          d(e("demo.inspectIntegrity"), n?.integrity ?? "—", x(n?.integrity === "valid" ? "valid" : n?.integrity === "invalid" ? "invalid" : null)),
          d(e("demo.inspectCryptography"), n?.cryptography ?? "—"),
          d(e("demo.inspectTrust"), n?.trust ?? "—"),
          d(e("demo.inspectChanges"), f === "unchanged" ? n?.modifications.undone ? e("demo.verdictRestored") : e("demo.verdictUnchanged") : f === "permitted" ? e("demo.verdictPermitted") : f === "forbidden" ? e("demo.verdictForbidden") : "—", f === "forbidden" ? "text-red-600" : "text-fg"),
          n?.modifications.laterRevisions ? d(e("demo.inspectLaterRevisions"), String(n.modifications.laterRevisions)) : null
        ]
      }),
      /* @__PURE__ */ t("div", {
        className: "mt-3 flex justify-end gap-2",
        children: [/* @__PURE__ */ t("button", {
          type: "button",
          disabled: g,
          onClick: w,
          className: "border-border text-fg hover:bg-hover rounded-md border px-2 py-1 text-xs disabled:opacity-60",
          children: e("demo.signaturesValidate")
        }), /* @__PURE__ */ t(A, { field: o })]
      })
    ]
  });
  return c?.page && m ? /* @__PURE__ */ t(V, {
    anchor: {
      page: c.page,
      bounds: m
    },
    placement: "bottom",
    gap: 8,
    children: b
  }) : /* @__PURE__ */ t("div", {
    className: "absolute end-4 top-4 z-40",
    children: b
  });
}
function A({ field: e }) {
  const s = h(), a = y(), l = a.getSignature(e), [g, r] = N(!1);
  if (!l || l.revisionIndex === null) return null;
  const o = l.revisionIndex, i = async () => {
    r(!0);
    try {
      const n = await a.readRevision({ revisionIndex: o }), c = new Blob([n], { type: "application/pdf" }), p = URL.createObjectURL(c), m = document.createElement("a");
      m.href = p, m.download = `${l.fieldName}-signed.pdf`, m.click(), URL.revokeObjectURL(p);
    } catch (n) {
      console.error("[embedpdf] signed revision download failed:", n);
    } finally {
      r(!1);
    }
  };
  return /* @__PURE__ */ t("button", {
    type: "button",
    disabled: g,
    onClick: () => void i(),
    className: "border-border text-fg hover:bg-hover rounded-md border px-2 py-1 text-xs disabled:opacity-60",
    children: s("demo.inspectDownload")
  });
}
export {
  $ as SignatureInspector
};
//# sourceMappingURL=signature-inspector-okFz8do6-CxhewZqh.js.map
