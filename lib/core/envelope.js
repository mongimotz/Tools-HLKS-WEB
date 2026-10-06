// JSON envelope shared by all tools. It is embedded in every exported PDF as data.json.
//
// {
//   format: "hlks-tools", envelopeVersion: 1,
//   tool: "<tool id>", version: <input schema version>, calcVersion: "<x.y.z>",
//   savedAt: "<ISO timestamp>",
//   project: { name, number, author, date },
//   inputs: { ...tool specific... },
//   snapshot: { ...key results at save time, informative only, never used as input... }
// }
//
// Only inputs are authoritative. Results are always recalculated after import.

export const FORMAT = 'hlks-tools';
export const ENVELOPE_VERSION = 1;

export class EnvelopeError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function emptyProject() {
  return { name: '', number: '', author: '', date: '' };
}

export function normalizeProject(p = {}) {
  const str = (v) => (v == null ? '' : String(v));
  return { name: str(p.name), number: str(p.number), author: str(p.author), date: str(p.date) };
}

export function createEnvelope({ tool, version, calcVersion, project, inputs, snapshot = null }) {
  return {
    format: FORMAT,
    envelopeVersion: ENVELOPE_VERSION,
    tool,
    version,
    calcVersion,
    savedAt: new Date().toISOString(),
    project: normalizeProject(project),
    inputs,
    snapshot,
  };
}

/** Parse and structurally validate an envelope (string or object). Throws EnvelopeError. */
export function parseEnvelope(input) {
  let env = input;
  if (typeof input === 'string') {
    try {
      env = JSON.parse(input);
    } catch {
      throw new EnvelopeError('invalid-json', 'Die Datei enthält kein gültiges JSON.');
    }
  }
  if (!env || typeof env !== 'object' || env.format !== FORMAT) {
    throw new EnvelopeError('wrong-format', 'Die Datei stammt nicht aus HLKS-Tools.');
  }
  if (typeof env.envelopeVersion !== 'number' || env.envelopeVersion > ENVELOPE_VERSION) {
    throw new EnvelopeError('envelope-too-new', 'Die Datei wurde mit einer neueren Version von HLKS-Tools erstellt.');
  }
  if (typeof env.tool !== 'string' || !env.tool) {
    throw new EnvelopeError('no-tool', 'In der Datei fehlt die Angabe, zu welchem Tool sie gehört.');
  }
  if (!env.inputs || typeof env.inputs !== 'object') {
    throw new EnvelopeError('no-inputs', 'Die Datei enthält keine Eingabedaten.');
  }
  return { ...env, project: normalizeProject(env.project) };
}

/**
 * Check an envelope against the running tool. Returns a list of German notes for the user.
 * Throws if the file cannot be opened by this tool version.
 */
export function checkCompatibility(env, { tool, version, calcVersion }) {
  if (env.tool !== tool) {
    throw new EnvelopeError('wrong-tool', 'Die Datei gehört zu einem anderen Tool.');
  }
  if (typeof env.version !== 'number' || env.version > version) {
    throw new EnvelopeError('version-too-new', 'Die Datei wurde mit einer neueren Version dieses Tools erstellt. Bitte Seite neu laden.');
  }
  const notes = [];
  if (env.calcVersion !== calcVersion) {
    notes.push(`Die Datei wurde mit Berechnungsversion ${env.calcVersion ?? '?'} erstellt, aktuell ist ${calcVersion}. Ergebnisse können abweichen.`);
  }
  return notes;
}
