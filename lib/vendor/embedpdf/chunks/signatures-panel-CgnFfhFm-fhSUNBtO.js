import { u as k, L as w, _ as j, $ as C, a0 as z, a1 as N, E as A, U as T, d as v, a2 as I, k as S, V as U, e as t, I as p, z as V, a3 as P, Z as $ } from "./wasm-url-asset-DgMkO6xQ.js";
const O = (n) => n.kind === "fqn" ? n.name : `#${n.objectNumber}`;
function M() {
  const n = k(), i = w(), c = j(), m = C(), l = z(), r = N((a) => a.target), b = N((a) => a.busy), { activeToolId: d } = A(), u = T("signature-maker"), [x, f] = v(null), [g, s] = v(null), [e, o] = v(null);
  I((a) => a.onInvalidationPredicted, (a) => o(c.getSignature(a.field)?.fieldName ?? O(a.field))), I((a) => a.onValidated, (a) => {
    a.verdicts.some((h) => h.summary === "invalid" && h.modifications.basis === "working-copy") || o(null);
  }), S(() => {
    U(i);
  }, [i]), S(() => {
    d !== "stamp" && f(null);
  }, [d]);
  const y = (a) => {
    if (s(null), r) {
      c.placeMark({ assetId: a.id }, { field: r }).catch((h) => {
        console.error("[embedpdf] placing the mark failed:", h), s(n("demo.signError"));
      });
      return;
    }
    f(a.id), i.armAsset(a.id).catch((h) => {
      console.error("[embedpdf] arm mark failed:", h), f(null), s(n("demo.stampsArmError"));
    });
  }, E = (m.libraries ?? "many") === "many" || l.length === 0, R = (m.kinds ?? ["signature", "initials"]).includes("initials");
  return /* @__PURE__ */ t("div", {
    className: "flex min-h-0 flex-1 flex-col",
    children: [
      /* @__PURE__ */ t("div", {
        className: "min-h-0 flex-1 overflow-y-auto p-3",
        children: [l.length === 0 ? /* @__PURE__ */ t("div", {
          className: "flex flex-col items-center gap-3 px-4 py-8 text-center",
          children: [/* @__PURE__ */ t(p, {
            name: "signature",
            size: 32,
            className: "text-fg-muted"
          }), /* @__PURE__ */ t("p", {
            className: "text-fg-muted text-sm",
            children: n("demo.signaturesEmpty")
          })]
        }) : /* @__PURE__ */ t("ul", {
          className: "flex flex-col gap-3",
          children: l.map((a) => /* @__PURE__ */ t(q, {
            row: a,
            armedId: x,
            wantsInitials: R,
            onPick: y,
            onAddInitials: () => u.open({
              exclusive: "modal",
              props: { libraryId: a.libraryId }
            })
          }, a.libraryId))
        }), /* @__PURE__ */ t(B, {})]
      }),
      e && /* @__PURE__ */ t("div", {
        className: "border-border-subtle shrink-0 border-t px-3 py-2 text-xs text-amber-700",
        children: n("demo.signaturesInvalidating", { params: { field: e } })
      }),
      (g || r || x) && /* @__PURE__ */ t("div", {
        className: `border-border-subtle shrink-0 border-t px-3 py-2 text-xs ${g ? "text-red-600" : "text-fg-muted"}`,
        children: g ?? n(r ? b ? "demo.signSigning" : "demo.signaturesTargetHint" : "demo.signaturesArmedHint")
      }),
      E ? /* @__PURE__ */ t("div", {
        className: "border-border-subtle shrink-0 border-t p-3",
        children: /* @__PURE__ */ t("button", {
          type: "button",
          onClick: () => u.open({ exclusive: "modal" }),
          className: "border-border text-fg hover:bg-hover flex w-full items-center justify-center gap-2 rounded-md border px-3 py-1.5 text-sm",
          children: [/* @__PURE__ */ t(p, {
            name: "plus",
            size: 16
          }), n("demo.signaturesNew")]
        })
      }) : null
    ]
  });
}
function q({ row: n, armedId: i, wantsInitials: c, onPick: m, onAddInitials: l }) {
  const r = k(), b = w(), [d, u] = v(null), x = async () => {
    const s = await b.exportLibrary(n.libraryId).catch(() => null);
    if (!s) return;
    const e = new Blob([s], { type: "application/pdf" }), o = URL.createObjectURL(e), y = document.createElement("a");
    y.href = o, y.download = `${n.name || "signature"}.pdf`, y.click(), URL.revokeObjectURL(o);
  }, f = () => {
    const s = d?.trim();
    u(null), s && s !== n.name && b.updateLibrary(n.libraryId, { name: s });
  }, g = "text-fg-muted hover:text-fg grid h-6 w-6 shrink-0 place-items-center rounded";
  return /* @__PURE__ */ t("li", {
    className: "border-border-subtle rounded-md border p-2",
    children: [/* @__PURE__ */ t("div", {
      className: "flex items-center gap-1",
      children: [
        d !== null ? /* @__PURE__ */ t("input", {
          autoFocus: !0,
          value: d,
          onChange: (s) => u(s.target.value),
          onBlur: f,
          onKeyDown: (s) => {
            s.key === "Enter" && f(), s.key === "Escape" && u(null);
          },
          className: "border-border bg-surface text-fg min-w-0 flex-1 rounded border px-1.5 py-0.5 text-sm"
        }) : /* @__PURE__ */ t("span", {
          className: "text-fg min-w-0 flex-1 truncate text-sm font-medium",
          children: n.name
        }),
        /* @__PURE__ */ t("button", {
          type: "button",
          onClick: () => u(n.name),
          title: r("demo.signaturesRename"),
          className: g,
          children: /* @__PURE__ */ t(p, {
            name: "pencilMarker",
            size: 13
          })
        }),
        /* @__PURE__ */ t("button", {
          type: "button",
          onClick: x,
          title: r("demo.signaturesExport"),
          className: g,
          children: /* @__PURE__ */ t(p, {
            name: "download",
            size: 13
          })
        }),
        /* @__PURE__ */ t("button", {
          type: "button",
          onClick: () => void b.deleteLibrary(n.libraryId),
          title: r("demo.signaturesRemove"),
          className: g,
          children: /* @__PURE__ */ t(p, {
            name: "trash",
            size: 13
          })
        })
      ]
    }), /* @__PURE__ */ t("div", {
      className: "mt-2 grid grid-cols-[2fr_1fr] gap-2",
      children: [n.signatures.map((s) => /* @__PURE__ */ t(L, {
        asset: s,
        label: r("demo.signatureLabel"),
        armed: i === s.id,
        onPick: () => m(s)
      }, s.id)), c ? n.initials ? /* @__PURE__ */ t(L, {
        asset: n.initials,
        label: r("demo.initialsLabel"),
        armed: i === n.initials.id,
        onPick: () => m(n.initials)
      }) : /* @__PURE__ */ t("button", {
        type: "button",
        onClick: l,
        title: r("demo.signaturesAddInitials"),
        className: "border-border-subtle text-fg-muted hover:bg-hover flex h-16 items-center justify-center rounded-md border border-dashed text-xs",
        children: /* @__PURE__ */ t(p, {
          name: "plus",
          size: 14
        })
      }) : null]
    })]
  });
}
function L({ asset: n, label: i, armed: c, onPick: m }) {
  const l = $(n.id);
  return /* @__PURE__ */ t("button", {
    type: "button",
    onClick: m,
    title: i,
    "aria-pressed": c,
    className: `flex h-16 items-center justify-center rounded-md border p-1 ${c ? "border-accent bg-accent-light ring-accent ring-2" : "border-border-subtle hover:border-border hover:bg-hover"}`,
    children: l ? /* @__PURE__ */ t("img", {
      src: l,
      alt: i,
      className: "max-h-full max-w-full object-contain"
    }) : /* @__PURE__ */ t("span", {
      className: "text-fg-muted text-xs",
      children: i
    })
  });
}
function B() {
  const n = k(), i = j(), c = V(P, (e) => e.getSnapshot()), m = N((e) => e.signatures), l = N((e) => e.target), [r, b] = v(!1), d = c?.signatures ?? [], u = (e) => m.find((o) => o.index === e.index)?.verdict ?? null, x = (e) => e ? e.summary === "valid" ? n("demo.verdictValid") : e.summary === "valid-untrusted" ? n("demo.verdictValidUntrusted") : e.summary === "indeterminate" ? n("demo.verdictIndeterminate") : e.modifications.basis === "working-copy" ? n("demo.verdictWillInvalidate") : n("demo.verdictInvalid") : n("demo.signaturesSigned"), f = (e) => !e || e.summary === "indeterminate" ? "text-fg-muted" : e.summary === "invalid" ? e.modifications.basis === "working-copy" ? "text-amber-600" : "text-red-600" : e.summary === "valid-untrusted" ? "text-amber-600" : "text-green-600", g = (e) => !!l && (l.kind === "fqn" ? l.name === e.fieldName : l.objectNumber === (e.field.kind === "objectNumber" ? e.field.objectNumber : -1)), s = () => {
    b(!0), i.validate().finally(() => b(!1));
  };
  return /* @__PURE__ */ t("div", {
    className: "mt-4",
    children: [/* @__PURE__ */ t("div", {
      className: "flex items-center justify-between",
      children: [/* @__PURE__ */ t("span", {
        className: "text-fg-muted text-xs font-semibold uppercase tracking-wide",
        children: n("demo.signaturesInDocument")
      }), d.some((e) => e.signed) ? /* @__PURE__ */ t("button", {
        type: "button",
        disabled: r,
        onClick: s,
        className: "text-accent text-xs hover:underline disabled:opacity-60",
        children: n(r ? "demo.signaturesValidating" : "demo.signaturesValidate")
      }) : null]
    }), d.length === 0 ? /* @__PURE__ */ t("p", {
      className: "text-fg-muted mt-1 text-xs",
      children: n("demo.signaturesNone")
    }) : /* @__PURE__ */ t("ul", {
      className: "mt-1 flex flex-col gap-1",
      children: d.map((e) => {
        const o = u(e);
        return /* @__PURE__ */ t("li", { children: /* @__PURE__ */ t("button", {
          type: "button",
          onClick: () => e.signed ? i.requestInspection(e.field) : i.setTarget(e.field),
          className: `hover:bg-hover flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-sm ${g(e) ? "bg-accent-light" : ""}`,
          children: [
            /* @__PURE__ */ t(p, {
              name: e.signed ? "check" : "signature",
              size: 14,
              className: e.signed ? "text-green-600" : "text-fg-muted"
            }),
            /* @__PURE__ */ t("span", {
              className: "text-fg min-w-0 flex-1 truncate",
              children: e.fieldName
            }),
            /* @__PURE__ */ t("span", {
              className: `shrink-0 text-end text-xs ${e.signed ? f(o) : "text-fg-muted"}`,
              children: e.signed ? x(o) : n("demo.signaturesUnsigned")
            })
          ]
        }) }, e.index);
      })
    })]
  });
}
export {
  M as SignaturesPanel
};
//# sourceMappingURL=signatures-panel-CgnFfhFm-fhSUNBtO.js.map
