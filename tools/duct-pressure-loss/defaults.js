// Default catalogues, input schema normalisation and the example project.
// Catalogue names are user-facing (German). Values are guide values ("Richtwerte").

export const TOOL_ID = 'duct-pressure-loss';
export const INPUT_VERSION = 2;

/** Nominal diameters of round ducts [mm]: Lindab SR circular duct, data sheet 17.11.002 (2024-05-30). */
export const ROUND_DIAMETERS = [
  63, 80, 100, 112, 125, 140, 150, 160, 180, 200, 224, 250, 280, 300, 315, 355, 400, 450, 500, 560, 600, 630, 710, 800, 900,
  1000, 1120, 1250, 1400, 1500, 1600,
];

/** Rectangular duct sizes are rounded to this step [mm]. */
export const RECT_STEP = 50;

export function defaultMaterials() {
  return [
    { id: 'smooth', name: 'Absolut glatt', roughness: 0 },
    { id: 'technically-smooth', name: 'Technisch glatt', roughness: 0.0016 },
    { id: 'plastic', name: 'Kunststoffrohr', roughness: 0.015 },
    { id: 'steel-welded', name: 'Stahlrohr längsgeschweisst', roughness: 0.05 },
    { id: 'galvanized', name: 'Kanal / Spiro verzinkt', roughness: 0.15 },
    { id: 'concrete', name: 'Beton (Luftschacht)', roughness: 1.0 },
    { id: 'flex', name: 'Flexibles Rohr', roughness: 1.7 },
  ];
}

/**
 * Fittings. ζ refers to the velocity of the section the fitting is entered in.
 * group: 'round' | 'rect' | 'any'. kind 'transition' is calculated from the neighbouring section.
 */
export function defaultFittings() {
  return [
    { id: 'bend90-round-r1', name: 'Bogen 90° rund, r/d = 1', group: 'round', kind: 'zeta', zeta: 0.3 },
    { id: 'bend90-round-r15', name: 'Bogen 90° rund, r/d = 1.5', group: 'round', kind: 'zeta', zeta: 0.2 },
    { id: 'bend45-round', name: 'Bogen 45° rund', group: 'round', kind: 'zeta', zeta: 0.15 },
    { id: 'bend90-segment', name: 'Segmentbogen 90°, 3-teilig', group: 'round', kind: 'zeta', zeta: 0.35 },
    { id: 'bend90-rect-r1', name: 'Bogen 90° eckig, r/b = 1', group: 'rect', kind: 'zeta', zeta: 0.22 },
    { id: 'bend90-rect-r05', name: 'Bogen 90° eckig, r/b = 0.5', group: 'rect', kind: 'zeta', zeta: 0.5 },
    { id: 'bend45-rect', name: 'Bogen 45° eckig', group: 'rect', kind: 'zeta', zeta: 0.13 },
    { id: 'elbow90-rect', name: 'Knie 90° eckig, ohne Leitbleche', group: 'rect', kind: 'zeta', zeta: 1.2 },
    { id: 'elbow90-rect-vanes', name: 'Knie 90° eckig, mit Leitblechen', group: 'rect', kind: 'zeta', zeta: 0.3 },
    { id: 'tee-straight', name: 'T-Stück, Durchgang', group: 'any', kind: 'zeta', zeta: 0.2 },
    { id: 'tee-branch', name: 'T-Stück, Abzweig 90°', group: 'any', kind: 'zeta', zeta: 1.0 },
    { id: 'branch45', name: 'Abzweig 45°', group: 'any', kind: 'zeta', zeta: 0.5 },
    { id: 'wye', name: 'Hosenstück', group: 'any', kind: 'zeta', zeta: 0.35 },
    { id: 'inlet-sharp', name: 'Einströmung scharfkantig', group: 'any', kind: 'zeta', zeta: 0.5 },
    { id: 'inlet-rounded', name: 'Einströmung abgerundet', group: 'any', kind: 'zeta', zeta: 0.05 },
    { id: 'outlet-free', name: 'Ausströmung in den Raum', group: 'any', kind: 'zeta', zeta: 1.0 },
    { id: 'damper-open', name: 'Absperrklappe offen', group: 'any', kind: 'zeta', zeta: 0.2 },
    { id: 'transition-sudden', name: 'Querschnittsänderung sprunghaft', group: 'any', kind: 'transition', factor: 1 },
    { id: 'transition-conical', name: 'Querschnittsänderung konisch', group: 'any', kind: 'transition', factor: 0.3 },
  ];
}

/** Components with a fixed pressure loss [Pa] (quick-add presets; use manufacturer data). */
export function defaultComponents() {
  return [
    { id: 'silencer', name: 'Schalldämpfer', dp: 30 },
    { id: 'fire-damper', name: 'Brandschutzklappe', dp: 15 },
    { id: 'vav', name: 'Volumenstromregler (min. Δp)', dp: 50 },
    { id: 'diffuser', name: 'Luftdurchlass', dp: 30 },
    { id: 'weather-louvre', name: 'Wetterschutzgitter', dp: 40 },
    { id: 'filter-epm1', name: 'Filter ePM1 (mittlere Verschmutzung)', dp: 150 },
    { id: 'heater', name: 'Lufterhitzer', dp: 50 },
    { id: 'cooler', name: 'Luftkühler (nass)', dp: 120 },
  ];
}

/** Maximum duct velocity by volume flow (from the original sheet, after SIA 382/1). */
export function defaultVelocityLimits() {
  return [
    { below: 1000, vmax: 3 },
    { below: 2000, vmax: 4 },
    { below: 4000, vmax: 5 },
    { below: 10000, vmax: 6 },
    { below: null, vmax: 7 },
  ];
}

export function defaultCatalogs() {
  return {
    materials: defaultMaterials(),
    fittings: defaultFittings(),
    components: defaultComponents(),
    velocityLimits: defaultVelocityLimits(),
  };
}

export function defaultSystem() {
  return {
    name: '',
    direction: 'supply',
    altitude: 540,
    temperature: 21,
    humidity: 50,
    availablePressure: null,
    safetyMargin: 0,
  };
}

export function defaultSettings() {
  return { maxAspectRatio: 4 };
}

// ---- sections -----------------------------------------------------------------

export function nextSectionId(sections) {
  let max = 0;
  for (const s of sections) {
    const m = /^s(\d+)$/.exec(s.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `s${max + 1}`;
}

export function newSection(sections, overrides = {}) {
  return normalizeSection({ id: nextSectionId(sections), shape: 'rect', material: 'galvanized', ...overrides });
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v) => (v == null ? '' : String(v));

export function normalizeSection(s = {}) {
  return {
    id: str(s.id),
    nr: str(s.nr),
    parent: s.parent ? str(s.parent) : null,
    shape: s.shape === 'round' ? 'round' : 'rect',
    width: num(s.width),
    height: num(s.height),
    diameter: num(s.diameter),
    material: str(s.material),
    flow: num(s.flow),
    length: num(s.length),
    fittings: Array.isArray(s.fittings)
      ? s.fittings.map((f) => ({ ref: str(f.ref), count: num(f.count) ?? 1, zeta: num(f.zeta) }))
      : [],
    zetaExtra: num(s.zetaExtra),
    components: Array.isArray(s.components) ? s.components.map((c) => ({ name: str(c.name), dp: num(c.dp) })) : [],
    temperature: num(s.temperature),
    note: str(s.note),
  };
}

/**
 * Bring any (older / partial) input object into the current schema. Idempotent.
 * Version 1 → 2: system.frictionMethod dropped (always Colebrook-White).
 */
export function normalizeInputs(raw = {}) {
  const sys = { ...defaultSystem(), ...(raw.system ?? {}) };
  const cat = raw.catalogs ?? {};
  const settings = { ...defaultSettings(), ...(raw.settings ?? {}) };
  const sections = (Array.isArray(raw.sections) ? raw.sections : []).map(normalizeSection);
  // Ids must be unique and non-empty.
  const seen = new Set();
  for (const s of sections) {
    if (!s.id || seen.has(s.id)) s.id = nextSectionId(sections);
    seen.add(s.id);
  }
  return {
    system: {
      name: str(sys.name),
      direction: sys.direction === 'extract' ? 'extract' : 'supply',
      altitude: num(sys.altitude) ?? 0,
      temperature: num(sys.temperature) ?? 20,
      humidity: num(sys.humidity) ?? 0,
      availablePressure: num(sys.availablePressure),
      safetyMargin: num(sys.safetyMargin) ?? 0,
    },
    sections,
    catalogs: {
      materials: (cat.materials ?? defaultMaterials()).map((m) => ({ id: str(m.id), name: str(m.name), roughness: num(m.roughness) ?? 0 })),
      fittings: (cat.fittings ?? defaultFittings()).map((f) =>
        f.kind === 'transition'
          ? { id: str(f.id), name: str(f.name), group: str(f.group) || 'any', kind: 'transition', factor: num(f.factor) ?? 1 }
          : { id: str(f.id), name: str(f.name), group: str(f.group) || 'any', kind: 'zeta', zeta: num(f.zeta) ?? 0 },
      ),
      components: (cat.components ?? defaultComponents()).map((c) => ({ id: str(c.id), name: str(c.name), dp: num(c.dp) ?? 0 })),
      velocityLimits: (cat.velocityLimits ?? defaultVelocityLimits()).map((v) => ({ below: num(v.below), vmax: num(v.vmax) })),
    },
    settings: { maxAspectRatio: num(settings.maxAspectRatio) },
  };
}

export function emptyInputs() {
  const inputs = normalizeInputs({ system: defaultSystem(), sections: [] });
  inputs.sections.push(newSection(inputs.sections, { nr: '1' }));
  return inputs;
}

/** A small branched supply-air system that shows the features. */
export function exampleInputs() {
  return normalizeInputs({
    system: { ...defaultSystem(), name: 'Zuluft Büro 1. OG', availablePressure: 350, safetyMargin: 10 },
    sections: [
      {
        id: 's1', nr: '1', parent: null, shape: 'rect', width: 800, height: 400, material: 'galvanized', flow: 6000, length: 10,
        fittings: [{ ref: 'bend90-rect-r1', count: 2 }], components: [{ name: 'Schalldämpfer', dp: 30 }],
        note: 'Ab Monoblock',
      },
      {
        id: 's6', nr: '1.1', parent: 's1', shape: 'rect', width: 500, height: 300, material: 'galvanized', flow: 2000, length: 15,
        fittings: [{ ref: 'tee-branch', count: 1 }, { ref: 'bend90-rect-r1', count: 2 }],
        components: [{ name: 'Brandschutzklappe', dp: 15 }, { name: 'Luftdurchlass', dp: 30 }],
        note: 'Korridor Süd',
      },
      {
        id: 's2', nr: '2', parent: 's1', shape: 'rect', width: 600, height: 400, material: 'galvanized', flow: 4000, length: 8,
        fittings: [{ ref: 'tee-straight', count: 1 }, { ref: 'transition-conical', count: 1 }],
      },
      {
        id: 's5', nr: '2.1', parent: 's2', shape: 'round', diameter: 400, material: 'galvanized', flow: 2000, length: 5,
        fittings: [{ ref: 'tee-branch', count: 1 }],
        components: [{ name: 'Volumenstromregler (min. Δp)', dp: 50 }, { name: 'Luftdurchlass', dp: 30 }],
        note: 'Grossraumbüro Nord',
      },
      {
        id: 's3', nr: '3', parent: 's2', shape: 'round', diameter: 400, material: 'galvanized', flow: 2000, length: 12,
        fittings: [{ ref: 'tee-straight', count: 1 }, { ref: 'bend90-round-r1', count: 2 }],
      },
      {
        id: 's4', nr: '4', parent: 's3', shape: 'round', diameter: 315, material: 'galvanized', flow: 1000, length: 6,
        fittings: [{ ref: 'bend90-round-r1', count: 1 }],
        components: [{ name: 'Volumenstromregler (min. Δp)', dp: 50 }, { name: 'Luftdurchlass', dp: 30 }],
        note: 'Sitzungszimmer',
      },
    ],
  });
}
