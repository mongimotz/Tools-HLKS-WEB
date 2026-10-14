// SPDX-License-Identifier: AGPL-3.0-or-later
// Section numbers define both the displayed order and connections toward the fan.

export function numberParts(nr) {
  const text = String(nr ?? '').trim();
  if (!/^[1-9]\d*(?:\.[1-9]\d*)*$/.test(text)) return null;
  const parts = text.split('.').map(Number);
  return parts.every(Number.isSafeInteger) ? parts : null;
}

export function compareSections(a, b) {
  const left = numberParts(a.nr);
  const right = numberParts(b.nr);
  if (!left || !right) return left ? -1 : right ? 1 : 0;
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    if (left[i] !== right[i]) return left[i] - right[i];
  }
  return left.length - right.length;
}

export function sortedSections(sections) {
  return [...sections].sort(compareSections);
}

/** Main sections follow the previous main number; dotted sections branch from their exact prefix. */
export function resolveNumberedTree(sections) {
  const sorted = sortedSections(sections);
  const groups = new Map();
  const issues = [];
  const invalid = new Set();
  const problem = (s, code, params = {}) => {
    issues.push({ sectionId: s.id, severity: 'error', code, ...params });
    invalid.add(s.id);
  };
  for (const s of sorted) {
    const parts = numberParts(s.nr);
    if (!parts) {
      problem(s, String(s.nr ?? '').trim() ? 'number-invalid' : 'number-missing');
      continue;
    }
    const key = parts.join('.');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  for (const group of groups.values()) {
    if (group.length > 1) for (const s of group) problem(s, 'number-duplicate');
  }

  const parent = new Map();
  let previousMain = null;
  for (const s of sorted) {
    const parts = numberParts(s.nr);
    let parentNumber = null;
    if (parts?.length === 1) {
      parentNumber = previousMain;
      previousMain = parts.join('.');
    } else if (parts) {
      parentNumber = parts.slice(0, -1).join('.');
    }
    let parentId = null;
    if (!invalid.has(s.id) && parentNumber) {
      const candidates = groups.get(parentNumber) ?? [];
      if (candidates.length === 1) parentId = candidates[0].id;
      else problem(s, candidates.length ? 'number-parent-ambiguous' : 'number-parent-missing', { parentNumber });
    }
    parent.set(s.id, parentId);
  }

  const children = new Map(sorted.map((s) => [s.id, []]));
  for (const s of sorted) {
    const p = parent.get(s.id);
    if (p !== null) children.get(p).push(s.id);
  }
  const order = [];
  const depth = new Map();
  const visit = (id, d) => {
    order.push(id);
    depth.set(id, d);
    for (const child of children.get(id)) {
      if (invalid.has(id)) invalid.add(child);
      visit(child, d + 1);
    }
  };
  for (const s of sorted) if (parent.get(s.id) === null) visit(s.id, 0);
  return { parent, children, order, depth, issues, invalid };
}
