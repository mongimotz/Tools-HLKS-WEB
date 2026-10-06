// Number formatting and parsing (Swiss German conventions: 6’000.5).

const formatters = new Map();

function formatter(digits) {
  let f = formatters.get(digits);
  if (!f) {
    f = new Intl.NumberFormat('de-CH', { minimumFractionDigits: digits, maximumFractionDigits: digits });
    formatters.set(digits, f);
  }
  return f;
}

/** Format a number with fixed decimals. Returns `fallback` for null/NaN/Infinity. */
export function fmt(value, digits = 0, { unit = '', fallback = '–' } = {}) {
  if (value == null || !Number.isFinite(value)) return fallback;
  // Avoid "-0"
  const v = Math.abs(value) < 0.5 * 10 ** -digits ? 0 : value;
  const s = formatter(digits).format(v);
  return unit ? `${s} ${unit}` : s;
}

/** Format with a number of significant digits (for Re, λ, ν …). */
export function fmtSig(value, sig = 3, opts = {}) {
  if (value == null || !Number.isFinite(value) || value === 0) return fmt(value, 0, opts);
  const mag = Math.floor(Math.log10(Math.abs(value)));
  const digits = Math.max(0, sig - 1 - mag);
  return fmt(value, Math.min(digits, 12), opts);
}

/** Scientific notation parts: 1.52e-5 → { mantissa: '1.52', exponent: '−5' }. Null for 0/invalid. */
export function fmtExpParts(value, sig = 3) {
  if (value == null || !Number.isFinite(value) || value === 0) return null;
  const exp = Math.floor(Math.log10(Math.abs(value)));
  return { mantissa: fmt(value / 10 ** exp, sig - 1), exponent: String(exp).replace('-', '−') };
}

/**
 * Parse user input into a number. Accepts "6'000", "6’000", "1,5", "1.5", " 12 ".
 * Returns null for empty input and NaN for garbage.
 */
export function parseNum(input) {
  if (input == null) return null;
  if (typeof input === 'number') return Number.isFinite(input) ? input : NaN;
  const s = String(input).trim().replace(/[’'\s  ]/g, '').replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/** Number for an <input> value attribute (plain, no grouping, no trailing zeros). */
export function toInputValue(value) {
  if (value == null || !Number.isFinite(value)) return '';
  return String(Math.round(value * 1e9) / 1e9);
}

/** ISO date (YYYY-MM-DD) → "06.10.2026". */
export function fmtDate(iso) {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

export function todayIso() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
