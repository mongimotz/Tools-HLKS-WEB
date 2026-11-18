// SPDX-License-Identifier: AGPL-3.0-or-later
// Calculation steps of every process with the numbers inserted, for the PDF report. No DOM.
// Formulas: docs/hx-diagram-method.md. Plain text with characters of the PDF fonts (subscript digits, ·).

import { fmt } from '../../lib/core/format.js';
import { CP_AIR, CP_VAPOUR, CP_WATER, R0 } from './psychro.js';
import { T_FEED } from './calc.js';

const n = (v, d) => (v == null || !Number.isFinite(v) ? '–' : fmt(v, d));
const neg = (v, d) => (v < 0 ? `(${n(v, d)})` : n(v, d));

/** Lines of the mass flow: given at the inlet, or missing. */
function massLine(inlet) {
  if (!(inlet?.m > 0)) return ['m: V̇ fehlt, keine Leistung'];
  return [`m = ${n(inlet.m, 0)} kg/h trockene Luft (V̇ = ${n(inlet.flow, 0)} m³/h bei ρ = ${n(inlet.state.rho, 3)} kg/m³)`];
}

const powerLine = (sym, m, a, b, q) => `${sym} = m · (h₂ − h₁) / 3600 = ${n(m, 0)} · (${n(b.h, 1)} − ${neg(a.h, 1)}) / 3600 = ${n(q, 2)} kW`;

function waterLines(b, v) {
  if (v.waterFlow == null) return [];
  return [`m_W = |Q| · 3600 / (c_W · |t_VL − t_RL|) = ${n(Math.abs(v.q), 2)} · 3600 / (${n(CP_WATER, 2)} · ${n(Math.abs(b.vl - b.rl), 1)}) = ${n(v.waterFlow, 0)} kg/h`];
}

/**
 * Steps of one block: array of text lines (empty for points). `result` is the calculation result,
 * `label(id)` the point label.
 */
export function stepsOf(b, result, label) {
  const r = result.blocks.get(b.id);
  if (!r || b.type === 'point' || b.type === 'comfort' || r.issues.some((i) => i.severity === 'error')) return [];
  const v = r.values;
  const pin = result.points.get(b.from);
  const a = pin?.state;
  const out = result.points.get(b.id)?.state;
  const m = pin?.m;
  const L = [];
  const io = () => `${label(b.from)}: t₁ = ${n(a.t, 1)} °C, x₁ = ${n(a.x, 2)} g/kg, h₁ = ${n(a.h, 1)} kJ/kg → ${label(b.id)}: t₂ = ${n(out.t, 1)} °C, x₂ = ${n(out.x, 2)} g/kg, h₂ = ${n(out.h, 1)} kJ/kg`;
  switch (b.type) {
    case 'heater':
    case 'fan':
      L.push(`x bleibt gleich. ${io()}`);
      L.push(...massLine(pin));
      if (v.q != null) {
        L.push(powerLine('Q', m, a, out, v.q));
      }
      L.push(...waterLines(b, v));
      break;
    case 'cooler': {
      if (b.ts == null) L.push(`Oberfläche: t_O = (t_VL + t_RL) / 2 + 1 = (${n(b.vl, 1)} + ${n(b.rl, 1)}) / 2 + 1 = ${n(v.ts, 1)} °C`);
      else L.push(`Oberfläche: t_O = ${n(v.ts, 1)} °C`);
      if (v.wet) {
        L.push(`t_O liegt unter dem Taupunkt t_τ = ${n(a.td, 1)} °C: Entfeuchtung. Kühlerpunkt O auf der Sättigungslinie: x_O = ${n(v.coil.x, 2)} g/kg, h_O = ${n(v.coil.h, 1)} kJ/kg`);
        L.push(`Zustandsänderung auf der Geraden Eintritt → O. ${io()}`);
      } else {
        L.push(`t_O liegt nicht unter dem Taupunkt t_τ = ${n(a.td, 1)} °C: trockene Kühlung, x bleibt gleich. ${io()}`);
      }
      L.push(`Bypassfaktor BF = (h₂ − h_O) / (h₁ − h_O) = (${n(out.h, 1)} − ${neg(v.coil.h, 1)}) / (${n(a.h, 1)} − ${neg(v.coil.h, 1)}) = ${n(v.bf, 3)}`);
      L.push(...massLine(pin));
      if (v.q != null) {
        L.push(powerLine('Q_K', m, a, out, v.q));
        L.push(`sensibel Q_s = m · (c_L + c_D · x₂) · (t₂ − t₁) / 3600 = ${n(m, 0)} · ${n(CP_AIR + (CP_VAPOUR * out.x) / 1000, 3)} · ${neg(out.t - a.t, 1)} / 3600 = ${n(v.sensible, 2)} kW, latent Q_l = ${n(v.latent, 2)} kW, SHF = Q_s / Q_K = ${n(v.q ? v.sensible / v.q : null, 2)}`);
        if (v.water) L.push(`Kondensat: m · (x₁ − x₂) / 1000 = ${n(m, 0)} · ${n(a.x - out.x, 2)} / 1000 = ${n(-v.water, 2)} kg/h`);
      }
      L.push(...waterLines(b, v));
      break;
    }
    case 'steam':
      L.push(`Dampf: h_D = r₀ + c_D · t_D = ${n(R0, 0)} + ${n(CP_VAPOUR, 2)} · ${n(b.ts, 0)} = ${n(v.hd, 0)} kJ/kg; Δh = Δx · h_D`);
      L.push(io());
      L.push(...massLine(pin));
      if (v.water != null) {
        L.push(`Dampfmenge m_D = m · (x₂ − x₁) / 1000 = ${n(m, 0)} · ${n(out.x - a.x, 2)} / 1000 = ${n(v.water, 2)} kg/h`);
        L.push(powerLine('Q', m, a, out, v.q));
        L.push(`Dampferzeuger (Speisewasser ${n(T_FEED, 0)} °C): Q_DE = m_D · (h_D − c_W · ${n(T_FEED, 0)}) / 3600 = ${n(v.water, 2)} · (${n(v.hd, 0)} − ${n(CP_WATER * T_FEED, 1)}) / 3600 = ${n(v.generator, 2)} kW`);
      }
      break;
    case 'adiabatic':
      L.push(`Wasser mit der Feuchtkugeltemperatur t_f = ${n(a.tw, 1)} °C: Δh = Δx · h_W = Δx · ${n(v.hw, 1)} kJ/kg (fast h = konstant)`);
      L.push(`Sättigung auf dieser Zustandsänderung: x_s = ${n(v.xSat, 2)} g/kg; η = (x₂ − x₁) / (x_s − x₁) = ${n(out.x - a.x, 2)} / ${n(v.xSat - a.x, 2)} = ${n(v.eta, 1)} %`);
      L.push(io());
      L.push(...massLine(pin));
      if (v.water != null) L.push(`Wasser m · (x₂ − x₁) / 1000 = ${n(m, 0)} · ${n(out.x - a.x, 2)} / 1000 = ${n(v.water, 2)} kg/h`);
      break;
    case 'hrv': {
      const e = result.points.get(b.to)?.state;
      const f = result.points.get(`${b.id}.b`)?.state;
      L.push(`t₂ = t₁ + Φ_t · (t_AB − t₁) = ${n(a.t, 1)} + ${n(v.eta / 100, 3)} · (${n(e.t, 1)} − ${neg(a.t, 1)}) = ${n(out.t, 1)} °C`);
      if (b.mode === 'enthalpy') L.push(`x₂ = x₁ + Φ_x · (x_AB − x₁) = ${n(a.x, 2)} + ${n(v.etaX / 100, 3)} · (${n(e.x, 2)} − ${n(a.x, 2)}) = ${n(out.x, 2)} g/kg`);
      else L.push(`ohne Feuchteübertragung: x₂ = x₁ = ${n(out.x, 2)} g/kg`);
      if (v.limited) L.push(`Frostgrenze t_FO,min = ${n(b.tFrost, 1)} °C: wirksam Φ_t = ${n(v.eta, 1)} %`);
      L.push(...massLine(pin));
      L.push(`Fortluft: h_FO = h_AB − r · (h₂ − h₁), x_FO = x_AB − r · (x₂ − x₁) mit r = m_AU / m_AB = ${n(v.ratio, 3)} → ${label(`${b.id}.b`)}: t = ${n(f?.t, 1)} °C, x = ${n(f?.x, 2)} g/kg, h = ${n(f?.h, 1)} kJ/kg`);
      if (v.q != null) L.push(powerLine('Q_WRG', m, a, out, v.q));
      if (v.condensate) L.push(`Kondensat auf der Abluftseite: ${n(v.condensate, 2)} kg/h`);
      break;
    }
    case 'mix': {
      const ins = r.inputs.map((id) => result.points.get(id));
      const sh = v.shares.map((s) => s / 100);
      if (b.mode === 'flows') L.push(`Massenströme: ${ins.map((p) => `${p.label} ${n(p.m, 0)} kg/h`).join(', ')}; Anteile ${v.shares.map((s) => n(s, 1)).join(' | ')} %`);
      else L.push(`Massenanteile: ${ins.map((p, k) => `${p.label} ${n(v.shares[k], 1)} %`).join(', ')}`);
      L.push(`x_M = Σ (Anteil · x) = ${ins.map((p, k) => `${n(sh[k], 3)} · ${n(p.state.x, 2)}`).join(' + ')} = ${n(out.x, 2)} g/kg`);
      L.push(`h_M = Σ (Anteil · h) = ${ins.map((p, k) => `${n(sh[k], 3)} · ${neg(p.state.h, 1)}`).join(' + ')} = ${n(out.h, 1)} kJ/kg → t_M = ${n(out.t, 1)} °C`);
      const pm = result.points.get(b.id);
      if (pm?.m) L.push(`m_M = ${n(pm.m, 0)} kg/h, V̇_M = ${n(pm.flow, 0)} m³/h`);
      break;
    }
    case 'room':
      L.push(...massLine(pin));
      L.push(`Feuchte: Δx = m_W · 1000 / m = ${n(b.mw ?? 0, 2)} · 1000 / ${n(m, 0)} = ${n(v.dx, 3)} g/kg → x₂ = ${n(out.x, 2)} g/kg`);
      L.push(`Temperatur: Δt = Q_s · 3600 / (m · (c_L + c_D · x₂)) = ${n(v.sensible, 2)} · 3600 / (${n(m, 0)} · ${n(v.cp, 3)}) = ${n(v.dt, 2)} K → t₂ = ${n(out.t, 1)} °C, φ₂ = ${n(out.phi * 100, 0)} %`);
      L.push(`${powerLine('Q', m, a, out, v.q)}; latent Q_l = Q − Q_s = ${n(v.latent, 2)} kW`);
      if (v.ratio != null) L.push(`Randmassstab Δh/Δx = ${n(out.h - a.h, 2)} / ${n(v.dx / 1000, 5)} = ${n(v.ratio, 0)} kJ/kg`);
      break;
    case 'line': {
      const c = result.points.get(b.to)?.state;
      L.push(`Δh = ${n(c.h - a.h, 2)} kJ/kg, Δx = ${n(v.dx, 3)} g/kg${v.ratio != null ? `, Δh/Δx = ${n(v.ratio, 0)} kJ/kg` : ''}`);
      if (v.q != null) L.push(`Q = m · Δh / 3600 = ${n(m, 0)} · ${n(v.dh, 2)} / 3600 = ${n(v.q, 2)} kW`);
      break;
    }
  }
  return L;
}
