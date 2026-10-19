import { u as y, m as K, n as S, o as I, p as v, q, r as L, T as k, A, s as T, k as F, e as t, t as j, w, I as b, d as E } from "./wasm-url-asset-DgMkO6xQ.js";
const B = {
  text: {
    icon: "message",
    labelKey: "annotation.comment",
    label: "Comment"
  },
  highlight: {
    icon: "highlight",
    labelKey: "annotation.highlight",
    label: "Highlight"
  },
  underline: {
    icon: "underline",
    labelKey: "annotation.underline",
    label: "Underline"
  },
  squiggly: {
    icon: "squiggly",
    labelKey: "annotation.squiggly",
    label: "Squiggly"
  },
  strikeout: {
    icon: "strikethrough",
    labelKey: "annotation.strikeout",
    label: "Strikethrough"
  },
  square: {
    icon: "square",
    labelKey: "annotation.square",
    label: "Square"
  },
  circle: {
    icon: "circle",
    labelKey: "annotation.circle",
    label: "Circle"
  },
  line: {
    icon: "line",
    labelKey: "annotation.line",
    label: "Line"
  },
  polygon: {
    icon: "polygon",
    labelKey: "annotation.polygon",
    label: "Polygon"
  },
  polyline: {
    icon: "zigzag",
    labelKey: "annotation.polyline",
    label: "Polyline"
  },
  ink: {
    icon: "pencilMarker",
    labelKey: "annotation.ink",
    label: "Ink"
  },
  "free-text": {
    icon: "freeText",
    labelKey: "annotation.freeText",
    label: "Text"
  },
  stamp: {
    icon: "rubberStamp",
    labelKey: "annotation.stamp",
    label: "Stamp"
  },
  caret: {
    icon: "insertText",
    labelKey: "annotation.caret",
    label: "Caret"
  },
  redact: {
    icon: "redact",
    labelKey: "annotation.redact",
    label: "Redact"
  },
  "file-attachment": {
    icon: "paperclip",
    labelKey: "annotation.fileAttachment",
    label: "Attachment"
  }
}, H = {
  icon: "message",
  labelKey: "annotation.comment",
  label: "Comment"
}, M = (e) => B[e.subtype] ?? H, O = (e) => {
  const o = e, c = o.fontColor ?? o.color, m = o.interiorColor ?? void 0;
  return {
    ...c ? { primary: c } : {},
    ...m ? { secondary: m } : {}
  };
}, U = [
  "none",
  "accepted",
  "rejected",
  "cancelled",
  "completed"
], P = (e) => {
  if (!e) return "";
  const o = new Date(e);
  return Number.isNaN(o.getTime()) ? "" : o.toLocaleDateString(void 0, {
    month: "short",
    day: "numeric"
  });
};
function W() {
  const e = j();
  return w((o) => o.disabledCategories), !e.isCategoryDisabled("comments.writing");
}
function V() {
  const e = y(), o = W(), c = K((a) => a.status), m = S(), f = I(), l = v(q), i = v(L), d = K((a) => a.selected), u = k(() => d.map((a) => a.ref), [d]), s = A(null), r = A({}), h = k(() => {
    for (const a of u) {
      const n = m.getThread(a);
      if (n) return T(n.root.ref);
    }
    return null;
  }, [u, m]);
  F(() => {
    if (!h || !s.current) return;
    const a = r.current[h];
    if (!a) return;
    const n = s.current, p = a.offsetTop - n.clientHeight / 2 + a.clientHeight / 2 - n.offsetTop;
    n.scrollTo({
      top: p,
      behavior: "smooth"
    });
  }, [h]);
  const N = (a) => {
    l.selection.set([a.root.ref]), !(a.pageIndex < 0) && i?.reveal(a.pageIndex, {
      rect: a.root.rect,
      anchor: {
        x: "center",
        y: 0.35
      },
      behavior: "smooth"
    });
  }, g = k(() => {
    const a = /* @__PURE__ */ new Map();
    for (const n of f) {
      const p = a.get(n.pageIndex);
      p ? p.push(n) : a.set(n.pageIndex, [n]);
    }
    return [...a.entries()].sort((n, p) => n[0] - p[0]);
  }, [f]);
  return c === "loading" ? /* @__PURE__ */ t(x, {
    icon: "comment",
    text: e("demo.commentsLoading")
  }) : c === "forbidden" ? /* @__PURE__ */ t(x, {
    icon: "lock",
    text: e("demo.commentsForbidden")
  }) : c === "error" ? /* @__PURE__ */ t(x, {
    icon: "alertTriangle",
    text: e("demo.commentsError"),
    children: /* @__PURE__ */ t("button", {
      type: "button",
      onClick: () => void l.refresh(),
      className: "bg-accent text-on-accent rounded-md px-3 py-1.5 text-sm font-medium",
      children: e("demo.commentsRetry")
    })
  }) : f.length === 0 ? /* @__PURE__ */ t(x, {
    icon: "comment",
    text: e(o ? "demo.commentsEmpty" : "demo.commentsEmptyReadOnly")
  }) : /* @__PURE__ */ t("div", {
    ref: s,
    className: "min-h-0 flex-1 overflow-y-auto",
    children: /* @__PURE__ */ t("div", {
      className: "flex flex-col gap-5 p-3",
      children: g.map(([a, n]) => /* @__PURE__ */ t("div", {
        className: "flex flex-col gap-2",
        children: [/* @__PURE__ */ t("div", {
          className: "bg-surface sticky top-0 z-10",
          children: /* @__PURE__ */ t("div", {
            className: "border-border-subtle border-b pb-1.5",
            children: [/* @__PURE__ */ t("h3", {
              className: "text-fg text-sm font-semibold",
              children: e("demo.commentsPage", { params: { page: n[0].pageLabel } })
            }), /* @__PURE__ */ t("p", {
              className: "text-fg-muted text-xs",
              children: e(n.length === 1 ? "demo.commentCount" : "demo.commentCountPlural", { params: { count: String(n.length) } })
            })]
          })
        }), /* @__PURE__ */ t("ul", {
          className: "flex flex-col gap-2",
          children: n.map((p) => {
            const C = T(p.root.ref);
            return /* @__PURE__ */ t(_, {
              view: p,
              writing: o,
              selected: h === C,
              onSelect: () => N(p),
              cardRef: (z) => {
                r.current[C] = z;
              }
            }, C);
          })
        })]
      }, a))
    })
  });
}
function x({ icon: e, text: o, children: c }) {
  return /* @__PURE__ */ t("div", {
    className: "flex flex-col items-center gap-3 px-4 py-10 text-center",
    children: [
      /* @__PURE__ */ t(b, {
        name: e,
        size: 32,
        className: "text-fg-muted"
      }),
      /* @__PURE__ */ t("p", {
        className: "text-fg-muted text-sm",
        children: o
      }),
      c
    ]
  });
}
function _({ view: e, writing: o, selected: c, onSelect: m, cardRef: f }) {
  const l = y(), i = S(), [d, u] = E(""), s = e.root.ref, r = {
    canDeleteThread: o && i.canDeleteThread(s),
    canSetStatus: o && i.canSetStatus(s),
    canReply: o && i.canReply(s)
  }, h = M(e.root), N = e.review.mine?.state ?? "none", g = e.review.lastChange, a = () => {
    const n = d.trim();
    n && (u(""), i.reply(e.root.ref, n));
  };
  return /* @__PURE__ */ t("li", {
    ref: f,
    onClick: m,
    className: `bg-surface cursor-pointer rounded-lg border shadow-sm transition-all hover:shadow-md ${c ? "border-accent ring-accent/40 ring-2" : "border-border-subtle"}`,
    children: /* @__PURE__ */ t("div", {
      className: "flex flex-col gap-2 p-3",
      children: [
        /* @__PURE__ */ t("div", {
          className: "flex items-start gap-2.5",
          children: [
            /* @__PURE__ */ t("div", {
              className: "bg-hover mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full",
              title: l(h.labelKey, { fallback: h.label }),
              children: /* @__PURE__ */ t(b, {
                name: h.icon,
                size: 18,
                accent: O(e.root)
              })
            }),
            /* @__PURE__ */ t("div", {
              className: "min-w-0 flex-1",
              children: [/* @__PURE__ */ t("div", {
                className: "flex items-baseline gap-2",
                children: [/* @__PURE__ */ t("span", {
                  className: "text-fg truncate text-sm font-medium",
                  children: e.root.author ?? l("demo.commentsAnonymous")
                }), /* @__PURE__ */ t("span", {
                  className: "text-fg-muted ms-auto shrink-0 text-xs",
                  children: P(e.root.modifiedAt ?? e.root.createdAt)
                })]
              }), g && /* @__PURE__ */ t("span", {
                className: "bg-accent-light text-accent mt-1 inline-block rounded px-1.5 py-0.5 text-[11px] font-medium",
                children: [R(l, g.state), g.by ? ` — ${g.by}` : ""]
              })]
            }),
            r.canDeleteThread && /* @__PURE__ */ t("button", {
              type: "button",
              onClick: (n) => {
                n.stopPropagation(), i.deleteThread(e.root.ref);
              },
              className: "text-fg-muted hover:text-fg grid h-6 w-6 shrink-0 place-items-center rounded",
              title: l("demo.commentsDeleteThread"),
              children: /* @__PURE__ */ t(b, {
                name: "trash",
                size: 14
              })
            })
          ]
        }),
        /* @__PURE__ */ t(D, {
          annotationRef: e.root.ref,
          text: e.root.contents ?? "",
          deletable: !1,
          writing: o
        }),
        e.replies.length > 0 && /* @__PURE__ */ t("div", {
          className: "border-border-subtle flex flex-col gap-2 border-t pt-2",
          children: e.replies.map((n) => /* @__PURE__ */ t($, {
            dto: n,
            writing: o
          }, T(n.ref)))
        }),
        (r.canSetStatus || r.canReply) && /* @__PURE__ */ t("div", {
          className: "border-border-subtle flex flex-col gap-1.5 border-t pt-2",
          children: [r.canSetStatus && /* @__PURE__ */ t("label", {
            className: "text-fg-muted flex items-center gap-2 text-xs",
            onClick: (n) => n.stopPropagation(),
            children: [l("demo.commentsStatus"), /* @__PURE__ */ t("select", {
              value: N,
              onChange: (n) => void i.setStatus(e.root.ref, n.target.value),
              className: "border-border bg-surface text-fg flex-1 rounded-md border px-1.5 py-1 text-xs outline-none",
              children: U.map((n) => /* @__PURE__ */ t("option", {
                value: n,
                children: R(l, n)
              }, n))
            })]
          }), r.canReply && /* @__PURE__ */ t("div", {
            className: "flex items-center gap-1.5",
            onClick: (n) => n.stopPropagation(),
            children: [/* @__PURE__ */ t("input", {
              type: "text",
              value: d,
              placeholder: e.root.contents || e.replies.length ? l("demo.commentsReplyPlaceholder") : l("demo.commentsAddPlaceholder"),
              onChange: (n) => u(n.target.value),
              onKeyDown: (n) => n.key === "Enter" && a(),
              className: "border-border bg-surface text-fg focus:border-accent w-full min-w-0 flex-1 rounded-md border px-2 py-1 text-sm outline-none"
            }), /* @__PURE__ */ t("button", {
              type: "button",
              onClick: a,
              disabled: !d.trim(),
              className: "text-accent disabled:text-fg-muted grid h-7 w-7 shrink-0 place-items-center rounded-md",
              title: l("demo.commentsReply"),
              children: /* @__PURE__ */ t(b, {
                name: "arrowForwardUp",
                size: 16
              })
            })]
          })]
        })
      ]
    })
  });
}
function $({ dto: e, writing: o }) {
  const c = y();
  return /* @__PURE__ */ t("div", {
    className: "border-border-subtle ms-1 border-s-2 ps-2",
    children: [/* @__PURE__ */ t("div", {
      className: "flex items-baseline gap-2",
      children: [/* @__PURE__ */ t("span", {
        className: "text-fg-secondary text-xs font-medium",
        children: e.author ?? c("demo.commentsAnonymous")
      }), /* @__PURE__ */ t("span", {
        className: "text-fg-muted text-[11px]",
        children: P(e.modifiedAt ?? e.createdAt)
      })]
    }), /* @__PURE__ */ t(D, {
      annotationRef: e.ref,
      text: e.contents ?? "",
      deletable: !0,
      writing: o
    })]
  });
}
function D({ annotationRef: e, text: o, deletable: c, writing: m }) {
  const f = y(), l = S(), i = {
    canEditText: m && l.canSetText(e),
    canDelete: m && l.canDelete(e)
  }, [d, u] = E(null);
  if (d !== null) {
    const s = () => {
      const r = d.trim();
      u(null), r && r !== o && l.setText(e, r);
    };
    return /* @__PURE__ */ t("textarea", {
      value: d,
      autoFocus: !0,
      rows: 2,
      onClick: (r) => r.stopPropagation(),
      onChange: (r) => u(r.target.value),
      onBlur: s,
      onKeyDown: (r) => {
        r.key === "Enter" && !r.shiftKey && (r.preventDefault(), s()), r.key === "Escape" && u(null);
      },
      className: "border-accent bg-surface text-fg w-full resize-none rounded-md border px-2 py-1 text-sm outline-none"
    });
  }
  return !o && !i.canEditText && !c ? null : /* @__PURE__ */ t("div", {
    className: "group/body flex items-start gap-1",
    children: [
      /* @__PURE__ */ t("p", {
        className: "text-fg min-w-0 flex-1 whitespace-pre-wrap text-sm",
        children: o
      }),
      i.canEditText && /* @__PURE__ */ t("button", {
        type: "button",
        onClick: (s) => {
          s.stopPropagation(), u(o);
        },
        className: "text-fg-muted hover:text-fg grid h-5 w-5 shrink-0 place-items-center rounded opacity-0 group-hover/body:opacity-100",
        title: f("demo.commentsEdit"),
        children: /* @__PURE__ */ t(b, {
          name: "pencilMarker",
          size: 12
        })
      }),
      c && i.canDelete && /* @__PURE__ */ t("button", {
        type: "button",
        onClick: (s) => {
          s.stopPropagation(), l.delete(e);
        },
        className: "text-fg-muted hover:text-fg grid h-5 w-5 shrink-0 place-items-center rounded opacity-0 group-hover/body:opacity-100",
        title: f("demo.commentsDelete"),
        children: /* @__PURE__ */ t(b, {
          name: "trash",
          size: 12
        })
      })
    ]
  });
}
function R(e, o) {
  switch (o) {
    case "none":
      return e("demo.commentsStatusNone");
    case "accepted":
      return e("demo.commentsStatusAccepted");
    case "rejected":
      return e("demo.commentsStatusRejected");
    case "cancelled":
      return e("demo.commentsStatusCancelled");
    case "completed":
      return e("demo.commentsStatusCompleted");
    default:
      return o;
  }
}
export {
  V as CommentsPanel
};
//# sourceMappingURL=comments-panel-MUVgLCBI-DBS5mm5h.js.map
