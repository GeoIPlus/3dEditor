// validate (3D-12): the issue taxonomy - severity by target state (spec §8 rule 4; v0.3 §8.3; D-77) and scope per code
// (spec §8 rule 9). One table for every source of an issue: own detectors, findings of other modules and the external
// validator (D-3D12-4). The contract `validation-report` enforces the same severities for DRAFT_SOLID / VALID_SOLID.

/** @typedef {'INFO' | 'WARNING' | 'ERROR'} Severity */
/** @typedef {'GEOMETRY' | 'TOPOLOGY' | 'CONSTRAINT' | 'MEASUREMENT' | 'SEMANTICS' | 'EXPORT'} Scope */

/**
 * Code -> [severity in DRAFT_SOLID, severity in VALID_SOLID, scope]. Severities: spec §8 rule 4 [D] (D-77 for
 * SOLID_OVERLAP .. PRECISION_LOSS). Scopes: [A] the spec lists the six scopes (rule 9) but not the code -> scope map;
 * this map follows the nature of each check (Q-3D12-2).
 * @type {Readonly<Record<string, readonly [Severity, Severity, Scope]>>}
 */
export const CODE_TABLE = Object.freeze({
  OPEN_BOUNDARY: ['WARNING', 'ERROR', 'TOPOLOGY'],
  SHELL_NOT_CLOSED: ['WARNING', 'ERROR', 'TOPOLOGY'],
  NON_MANIFOLD_EDGE: ['WARNING', 'ERROR', 'TOPOLOGY'],
  NON_MANIFOLD_VERTEX: ['WARNING', 'ERROR', 'TOPOLOGY'],
  SELF_INTERSECTION: ['WARNING', 'ERROR', 'GEOMETRY'],
  SHELL_ORIENTATION: ['WARNING', 'ERROR', 'TOPOLOGY'],
  INCONSISTENT_RING_ORIENTATION: ['WARNING', 'ERROR', 'TOPOLOGY'],
  INCONSISTENT_JUNCTION: ['WARNING', 'ERROR', 'GEOMETRY'],
  NON_PLANAR_FACE: ['WARNING', 'ERROR', 'GEOMETRY'],
  DEGENERATE_EDGE: ['ERROR', 'ERROR', 'GEOMETRY'],
  DEGENERATE_FACE: ['ERROR', 'ERROR', 'GEOMETRY'],
  CONSTRAINT_CONFLICT: ['ERROR', 'ERROR', 'CONSTRAINT'],
  INVALID_CRS: ['ERROR', 'ERROR', 'GEOMETRY'],
  SEMANTIC_MAPPING_ERROR: ['WARNING', 'ERROR', 'SEMANTICS'],
  SOLID_OVERLAP: ['WARNING', 'ERROR', 'GEOMETRY'],
  UNDERCONSTRAINED_GEOMETRY: ['ERROR', 'ERROR', 'CONSTRAINT'],
  INVALID_MEASUREMENT: ['WARNING', 'WARNING', 'MEASUREMENT'],
  EXPORT_SCHEMA_ERROR: ['WARNING', 'ERROR', 'EXPORT'],
  PRECISION_LOSS: ['WARNING', 'WARNING', 'EXPORT'],
});

/** Every `ValidationCode` of the contract, in table order. */
export const CODES = Object.freeze(Object.keys(CODE_TABLE));

/**
 * Column of the severity table for a target state. The spec has two columns; [A] `DRAFT_SURFACE` reads the draft column
 * and `APPROVED` (= VALID_SOLID + review, v0.3 §8.1) the valid column (Q-3D12-1).
 * @param {string} state contract `ModelState`
 * @returns {0 | 1}
 */
export function column(state) {
  if (state === 'DRAFT_SOLID' || state === 'DRAFT_SURFACE') return 0;
  if (state === 'VALID_SOLID' || state === 'APPROVED') return 1;
  throw new RangeError(`unknown model state ${state}`);
}

/** @param {string} code @param {string} state @returns {Severity} */
export function severityOf(code, state) {
  const row = CODE_TABLE[code];
  if (!row) throw new RangeError(`unknown validation code ${code}`);
  return row[column(state)];
}

/** @param {string} code @returns {Scope} */
export function scopeOf(code) {
  const row = CODE_TABLE[code];
  if (!row) throw new RangeError(`unknown validation code ${code}`);
  return row[2];
}
