// brep (3D-09): deterministic serialisation (K-11; spec §4 rule 10) and isolated copies. Canonical form: object keys
// sorted, arrays in order, -0 written as 0, numbers in JavaScript's shortest round-trip form (so `save -> load -> save`
// is byte-identical and every double survives unchanged). Non-finite numbers are refused.

/** @typedef {import('./types.js').BuildingModel} BuildingModel */

/**
 * @param {unknown} value
 * @param {string} path for the error message
 * @returns {unknown} a structure whose JSON.stringify output is canonical
 */
function canon(value, path) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`brep: non-finite number at ${path}`);
    return value === 0 ? 0 : value;
  }
  if (Array.isArray(value)) return value.map((v, i) => canon(v, `${path}[${i}]`));
  if (value !== null && typeof value === 'object') {
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const k of Object.keys(value).sort()) {
      const v = /** @type {Record<string, unknown>} */ (value)[k];
      if (v !== undefined) out[k] = canon(v, `${path}.${k}`);
    }
    return out;
  }
  return value;
}

/**
 * Canonical JSON text of any contract value (model, patch, lineage).
 * @param {unknown} value
 * @returns {string}
 */
export const canonicalJson = (value) => JSON.stringify(canon(value, '$'));

/**
 * Save: canonical JSON of a model.
 * @param {BuildingModel} model
 * @returns {string}
 */
export const saveModel = (model) => canonicalJson(model);

/**
 * Load: parse a saved model. Shape validation against the contract is the caller's (service) job (C1 rule 3).
 * @param {string} text
 * @returns {BuildingModel}
 */
export const loadModel = (text) => JSON.parse(text);

/**
 * Isolated deep copy (a transaction's draft; spec §3 rule 1 "build the candidate on an isolated copy").
 * @template T
 * @param {T} value
 * @returns {T}
 */
export const isolatedCopy = (value) => structuredClone(value);
