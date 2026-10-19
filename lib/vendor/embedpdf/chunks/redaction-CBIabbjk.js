import { af as s, R as t, p as i, ag as o, ah as u, G as l } from "./wasm-url-asset-DgMkO6xQ.js";
const p = s(t, {
  read: (e) => ({
    pendingCount: e.getPendingCount(),
    applying: e.isApplying(),
    lastResult: e.getLastResult()
  }),
  empty: {
    pendingCount: 0,
    applying: !1,
    lastResult: null
  }
});
function g() {
  return i(t);
}
const r = o(p), c = Object.freeze([]);
function R(e) {
  const n = u();
  return l(
    (a) => a.tryCapability(t, n ?? void 0)?.listPending(void 0) ?? c
  );
}
export {
  r as a,
  R as b,
  g as u
};
//# sourceMappingURL=redaction-CBIabbjk.js.map
