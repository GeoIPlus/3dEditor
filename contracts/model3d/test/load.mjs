// Loads the model3d contract schemas, their examples and the spec tables they must match (3D-06).
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';

export const DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(DIR, '..', '..');
export const SPEC = readFileSync(join(ROOT, 'docs', 'specs', '3dqm-spec.md'), 'utf8');
export const ID_PATTERN = /^urn:geoiplus:schema:model3d-([a-z0-9]+(?:-[a-z0-9]+)*):v(\d+)$/;

/** @param {string} p */
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

/** @returns {Map<string, any>} schema name (file name without `.schema.json`) -> schema */
export function loadSchemas() {
  const out = new Map();
  for (const f of readdirSync(DIR).filter((n) => n.endsWith('.schema.json')).sort()) {
    out.set(f.replace(/\.schema\.json$/, ''), readJson(join(DIR, f)));
  }
  return out;
}

/** @param {string} name */
export function loadExamples(name) {
  return readJson(join(DIR, 'examples', `${name}.json`));
}

/** Ajv 2020-12 in strict mode with formats, every schema added (refs resolve by `$id`). */
export function createAjv() {
  const addFormats = /** @type {any} */ (addFormatsModule).default ?? addFormatsModule;
  const ajv = new Ajv2020({ strict: true, strictRequired: false, allErrors: true });
  addFormats(ajv);
  for (const s of loadSchemas().values()) ajv.addSchema(s);
  return ajv;
}

/** @param {string} heading start of a spec heading line, e.g. '### 2.3 ' */
export function specSection(heading) {
  const start = SPEC.indexOf(`\n${heading}`);
  if (start < 0) throw new Error(`spec heading not found: ${heading}`);
  const rest = SPEC.slice(start + 1);
  const next = rest.slice(1).search(/\n#{2,3} /);
  return next < 0 ? rest : rest.slice(0, next + 1);
}

/**
 * Rows of the first markdown table in `text`, cells trimmed, header and rule rows dropped.
 * @param {string} text
 * @returns {string[][]}
 */
export function tableRows(text) {
  const lines = text.split('\n').filter((/** @type {string} */ l) => l.startsWith('|'));
  return lines.slice(2).map((l) => l.slice(1, -1).split('|').map((c) => c.trim()));
}

/** @param {string} kind e.g. MOVE_VERTEX -> move-vertex */
export const kebab = (kind) => kind.toLowerCase().replace(/_/g, '-');
