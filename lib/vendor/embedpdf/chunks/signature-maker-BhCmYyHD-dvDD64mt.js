import { u as U, U as _, L as D, a as B, $, d, ab as j, e as r, I as G, D as K, A as E, k as O, ai as L, aj as W, ak as z, al as H } from "./wasm-url-asset-DgMkO6xQ.js";
const V = [
  { key: "allura", familyName: "Allura", label: "Allura" },
  { key: "great-vibes", familyName: "Great Vibes", label: "Great Vibes" },
  { key: "caveat", familyName: "Caveat", label: "Caveat" }
], Y = {
  allura: () => import("./allura-kQfqxOOE.js"),
  "great-vibes": () => import("./great-vibes-C8QWrE7r.js"),
  caveat: () => import("./caveat-pV6Lyl0p.js")
};
async function J(t) {
  const a = Y[t];
  if (!a) throw new Error(`@embedpdf/default-signature-fonts: no font "${t}"`);
  const { default: l } = await a();
  return X(l);
}
function X(t) {
  const a = atob(t), l = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) l[i] = a.charCodeAt(i);
  return l;
}
const q = V.map((t) => ({
  key: t.key,
  label: t.label,
  bytes: () => J(t.key)
})), Q = (t) => async () => {
  if (t.data) return new Uint8Array(t.data);
  if (!t.url) throw new Error(`[embedpdf] signature font "${t.key}" has no url or data`);
  const a = await fetch(t.url);
  if (!a.ok) throw new Error(`${t.url}: HTTP ${a.status}`);
  return new Uint8Array(await a.arrayBuffer());
}, Z = (t) => t ? t.map((a) => ({
  key: a.key,
  label: a.label,
  bytes: Q(a)
})) : q, F = /* @__PURE__ */ new WeakMap();
function ee(t, a) {
  if (!H(t)) return Promise.resolve();
  let l = F.get(t);
  l || F.set(t, l = /* @__PURE__ */ new Map());
  const i = l.get(a.key);
  if (i) return i;
  const o = a.bytes().then((u) => t.fonts.register({
    key: a.key,
    data: u
  })).then(() => {
  });
  return l.set(a.key, o), o.catch(() => l.delete(a.key)), o;
}
const k = {
  width: 360,
  height: 120
};
function P({ value: t, onChange: a, fonts: l, registerFont: i }) {
  const o = U(), [u, f] = d("draw"), [h, p] = d([]), [b, x] = d(""), [g, A] = d(l[0]?.key ?? ""), [T, N] = d(null), w = E(null), c = E(null);
  O(() => {
    const e = w.current;
    if (!e) return;
    const n = window.devicePixelRatio || 1;
    e.width = k.width * n, e.height = k.height * n;
    const s = e.getContext("2d");
    if (s) {
      s.setTransform(n, 0, 0, n, 0, 0), s.clearRect(0, 0, k.width, k.height), s.lineCap = "round", s.lineJoin = "round", s.lineWidth = 2.5, s.strokeStyle = getComputedStyle(e).color || "#000";
      for (const M of h)
        s.beginPath(), M.forEach((I, R) => R === 0 ? s.moveTo(I.x, I.y) : s.lineTo(I.x, I.y)), s.stroke();
    }
  }, [h, u]);
  const m = (e) => {
    const n = e.currentTarget.getBoundingClientRect();
    return {
      x: e.clientX - n.left,
      y: e.clientY - n.top
    };
  }, S = (e) => {
    p(e), a(e.length ? {
      kind: "ink",
      strokes: e,
      color: "#000000",
      strokeWidth: 2.5
    } : null);
  }, y = async (e, n) => {
    if (x(e), A(n), !e.trim()) {
      a(null);
      return;
    }
    await i(n), a({
      kind: "text",
      text: e.trim(),
      fontFamily: n,
      color: "#000000",
      fontSize: 36
    });
  }, C = (e) => {
    N(e.name), a(e.type === "application/pdf" ? {
      kind: "pdf",
      source: e,
      pageIndex: 0
    } : {
      kind: "image",
      source: e
    });
  }, v = (e) => `rounded px-2 py-1 text-xs font-medium ${u === e ? "bg-accent text-on-accent" : "text-fg-muted hover:bg-hover"}`;
  return /* @__PURE__ */ r("div", {
    className: "flex flex-col gap-2",
    children: [/* @__PURE__ */ r("div", {
      className: "flex items-center gap-1",
      children: [
        /* @__PURE__ */ r("button", {
          type: "button",
          className: v("draw"),
          onClick: () => f("draw"),
          children: o("demo.makerDraw")
        }),
        l.length > 0 ? /* @__PURE__ */ r("button", {
          type: "button",
          className: v("type"),
          onClick: () => {
            f("type"), i(g).catch((e) => console.error("[embedpdf] loading the signature font failed:", e));
          },
          children: o("demo.makerType")
        }) : null,
        /* @__PURE__ */ r("button", {
          type: "button",
          className: v("upload"),
          onClick: () => f("upload"),
          children: o("demo.makerUpload")
        }),
        /* @__PURE__ */ r("div", { className: "flex-1" }),
        t ? /* @__PURE__ */ r("button", {
          type: "button",
          onClick: () => {
            S([]), x(""), N(null), a(null);
          },
          className: "text-fg-muted hover:text-fg text-xs",
          children: o("demo.makerClear")
        }) : null
      ]
    }), u === "draw" ? /* @__PURE__ */ r("canvas", {
      ref: w,
      style: {
        width: k.width,
        height: k.height,
        touchAction: "none"
      },
      className: "border-border-subtle bg-surface text-fg rounded-md border",
      onPointerDown: (e) => {
        e.currentTarget.setPointerCapture(e.pointerId), c.current = [m(e)], p((n) => [...n, c.current]);
      },
      onPointerMove: (e) => {
        c.current && (c.current.push(m(e)), p((n) => [...n.slice(0, -1), [...c.current]]));
      },
      onPointerUp: () => {
        if (!c.current) return;
        const e = c.current;
        c.current = null, p((n) => {
          const s = [...n.slice(0, -1), e];
          return S(s), s;
        });
      }
    }) : u === "type" ? /* @__PURE__ */ r("div", {
      className: "flex flex-col gap-2",
      children: [/* @__PURE__ */ r("input", {
        value: b,
        placeholder: o("demo.makerTypePlaceholder"),
        onChange: (e) => void y(e.target.value, g),
        className: "border-border bg-surface text-fg w-full rounded border px-2 py-1.5 text-sm"
      }), /* @__PURE__ */ r("label", {
        className: "text-fg-muted flex items-center gap-2 text-xs",
        children: [o("demo.makerFont"), /* @__PURE__ */ r("select", {
          value: g,
          onChange: (e) => void y(b, e.target.value),
          className: "border-border bg-surface text-fg rounded border px-2 py-1 text-xs",
          children: l.map((e) => /* @__PURE__ */ r("option", {
            value: e.key,
            children: e.label
          }, e.key))
        })]
      })]
    }) : /* @__PURE__ */ r("label", {
      className: "border-border-subtle text-fg-muted hover:bg-hover flex h-24 cursor-pointer items-center justify-center rounded-md border border-dashed text-sm",
      children: [T ?? o("demo.makerUploadHint"), /* @__PURE__ */ r("input", {
        type: "file",
        accept: "image/png,image/jpeg,application/pdf",
        className: "hidden",
        onChange: (e) => {
          const n = e.currentTarget.files?.[0];
          e.currentTarget.value = "", n && C(n);
        }
      })]
    })]
  });
}
function ae() {
  const t = U(), a = _("signature-maker"), l = D(), i = B(), o = $(), [u, f] = d(""), [h, p] = d(null), [b, x] = d(null), [g, A] = d(!1), [T, N] = d(null), w = j(), c = a.props?.libraryId, m = c ? l.getLibrary(c) : null, S = (o.kinds ?? ["signature", "initials"]).includes("initials"), [y] = d(() => Z(o.fonts)), C = async (n) => {
    const s = y.find((M) => M.key === n);
    s && await ee(i.engine, s);
  };
  if (!a.isOpen) return null;
  const v = m ? b != null : u.trim().length > 0 && h != null, e = async () => {
    A(!0), N(null);
    try {
      if (m) await l.createAsset({
        libraryId: m.id,
        name: L,
        label: t("demo.initialsLabel"),
        mark: b
      });
      else {
        const { library: n } = await l.createLibrary(u.trim(), { kind: W }), s = n.id;
        await l.createAsset({
          libraryId: s,
          name: z,
          label: t("demo.signatureLabel"),
          mark: h
        }), b && await l.createAsset({
          libraryId: s,
          name: L,
          label: t("demo.initialsLabel"),
          mark: b
        });
      }
      f(""), p(null), x(null), a.close();
    } catch (n) {
      console.error("[embedpdf] saving the signature failed:", n), N(t("demo.makerError"));
    } finally {
      A(!1);
    }
  };
  return /* @__PURE__ */ r(K, {
    labelledBy: w,
    onClose: () => {
      g || a.close();
    },
    className: "border-border bg-surface w-[26rem] rounded-lg border p-4 shadow-xl",
    children: [
      /* @__PURE__ */ r("div", {
        className: "flex items-center justify-between",
        children: [/* @__PURE__ */ r("h2", {
          id: w,
          className: "text-fg text-base font-semibold",
          children: t(m ? "demo.signaturesAddInitials" : "demo.makerTitle")
        }), /* @__PURE__ */ r("button", {
          type: "button",
          onClick: a.close,
          className: "text-fg-muted hover:bg-hover grid h-7 w-7 place-items-center rounded-md",
          "aria-label": t("demo.cancel"),
          children: /* @__PURE__ */ r(G, {
            name: "x",
            size: 16
          })
        })]
      }),
      m ? null : /* @__PURE__ */ r("label", {
        className: "text-fg-muted mt-3 block text-xs",
        children: [t("demo.makerName"), /* @__PURE__ */ r("input", {
          value: u,
          placeholder: t("demo.makerNamePlaceholder"),
          onChange: (n) => f(n.target.value),
          className: "border-border bg-surface text-fg mt-1 w-full rounded border px-2 py-1.5 text-sm"
        })]
      }),
      m ? null : /* @__PURE__ */ r("div", {
        className: "mt-3",
        children: [/* @__PURE__ */ r("p", {
          className: "text-fg mb-1 text-xs font-semibold uppercase tracking-wide",
          children: t("demo.signatureLabel")
        }), /* @__PURE__ */ r(P, {
          value: h,
          onChange: p,
          fonts: y,
          registerFont: C
        })]
      }),
      S ? /* @__PURE__ */ r("div", {
        className: "mt-3",
        children: [/* @__PURE__ */ r("p", {
          className: "text-fg mb-1 text-xs font-semibold uppercase tracking-wide",
          children: [t("demo.initialsLabel"), m ? null : /* @__PURE__ */ r("span", {
            className: "text-fg-muted ms-1 font-normal normal-case tracking-normal",
            children: t("demo.makerOptional")
          })]
        }), /* @__PURE__ */ r(P, {
          value: b,
          onChange: x,
          fonts: y,
          registerFont: C
        })]
      }) : null,
      T ? /* @__PURE__ */ r("p", {
        className: "mt-2 text-sm text-red-600",
        children: T
      }) : null,
      /* @__PURE__ */ r("div", {
        className: "mt-4 flex justify-end gap-2",
        children: [/* @__PURE__ */ r("button", {
          type: "button",
          disabled: g,
          onClick: a.close,
          className: "border-border text-fg hover:bg-hover rounded-md border px-3 py-1.5 text-sm",
          children: t("demo.cancel")
        }), /* @__PURE__ */ r("button", {
          type: "button",
          disabled: g || !v,
          onClick: () => void e(),
          className: "bg-accent text-on-accent rounded-md px-3 py-1.5 text-sm disabled:opacity-60",
          children: t(g ? "demo.makerSaving" : "demo.makerSave")
        })]
      })
    ]
  });
}
export {
  ae as SignatureMakerModal
};
//# sourceMappingURL=signature-maker-BhCmYyHD-dvDD64mt.js.map
