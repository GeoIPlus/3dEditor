// ops (3D-16): pieces shared by ALIGN_RIDGE, ALIGN_EAVE and MATCH_ELEVATIONS - the payload `hardConstraintIds`
// (D-234) and POINT measurements as soft plane terms (D-233, D-215 layout). Planes are primary (D-08): every
// target is a condition on support planes, solved by the pipeline's constraint step.
import { signedDistance } from '../brep/index.js';
import { builders, compileConstraints } from '../solve/index.js';
import { refuse } from './errors.js';

/** @typedef {import('../solve/conditions.js').Condition} Condition */
/** @typedef {[number, number, number]} P3 */

/**
 * Payload `hardConstraintIds` (D-234): each id must be a model constraint; a constraint stored soft is held hard
 * for this command (the stored constraint is not changed). Hard model constraints are compiled by the pipeline anyway.
 * @param {any} draft @param {unknown} ids @param {any} tol
 * @returns {{ ok: true, conditions: Condition[] } | { ok: false, refusal: any }}
 */
export function heldHard(draft, ids, tol) {
  if (ids === undefined) return { ok: true, conditions: [] };
  if (!Array.isArray(ids)) return refuse('INVALID_PAYLOAD', [], 'hardConstraintIds');
  /** @type {Condition[]} */
  const conditions = [];
  for (const id of ids) {
    const c = draft.constraints[id];
    if (!c) return refuse('INVALID_PAYLOAD', [String(id)], 'unknown constraint in hardConstraintIds (D-234)');
    if (c.hard) continue;
    const compiled = compileConstraints(draft, [{ ...c, hard: true }], tol);
    if (compiled.rejected.length > 0) {
      return refuse('INVALID_PAYLOAD', [id], `constraint cannot be held hard: ${compiled.rejected[0].reason} (D-234)`);
    }
    conditions.push(...compiled.conditions);
  }
  return { ok: true, conditions };
}

/**
 * Faces named by a hard model constraint or by `hardConstraintIds` (D-231: such faces stay fixed).
 * @param {any} draft @param {string[]} [listed]
 * @returns {Set<string>}
 */
export function hardConstrainedFaces(draft, listed = []) {
  const held = new Set(listed);
  /** @type {Set<string>} */
  const out = new Set();
  for (const c of Object.values(draft.constraints)) {
    if (!c.hard && !held.has(c.id)) continue;
    for (const id of c.entityIds) if (draft.faces[id]) out.add(id);
  }
  return out;
}

/**
 * POINT measurements as soft terms on the nearest candidate plane, weight 1/σz² (D-233). Other kinds, a missing
 * or zero `sigmaZ` -> INVALID_MEASUREMENT (layout TBD, Q-28); unknown id -> INVALID_PAYLOAD (as REPLACE_ROOF).
 * @param {any} draft @param {unknown} ids @param {string[]} faceIds candidate planes
 * @param {(p: P3, frame: string) => P3} toLocal
 * @returns {{ ok: true, conditions: Condition[] } | { ok: false, refusal: any }}
 */
export function measurementTerms(draft, ids, faceIds, toLocal) {
  if (!Array.isArray(ids) || ids.length === 0) return refuse('INVALID_PAYLOAD', [], 'FIT_MEASUREMENTS needs measurementIds');
  const b = builders(draft);
  /** @type {Condition[]} */
  const conditions = [];
  for (const id of ids) {
    const m = draft.measurements[id];
    if (!m) return refuse('INVALID_PAYLOAD', [String(id)], 'unknown measurement');
    const q = m.geometry?.coordinates?.[0];
    if (m.geometry?.kind !== 'POINT' || m.geometry.coordinates.length !== 1 || !Array.isArray(q) || q.length !== 3 || !q.every(Number.isFinite)) {
      return refuse('INVALID_MEASUREMENT', [id], 'FIT_MEASUREMENTS takes POINT measurements [[x, y, z]] (D-215, D-233); other kinds TBD (Q-28)');
    }
    const sigma = m.uncertainty?.sigmaZ;
    if (typeof sigma !== 'number' || !(sigma > 0)) return refuse('INVALID_MEASUREMENT', [id], 'weight 1/sigmaZ^2 needs sigmaZ > 0 (D-233)');
    const p = toLocal(/** @type {P3} */ (q), m.frame);
    const near = [...faceIds].sort((a, c) => Math.abs(signedDistance(draft.faces[a].supportPlane, p)) - Math.abs(signedDistance(draft.faces[c].supportPlane, p)) || (a < c ? -1 : 1))[0];
    conditions.push(b.pointOnPlane({ id, kind: 'CLOSE_TO_MEASUREMENT', hard: false, weight: 1 / (sigma * sigma), entityIds: [id, near] }, near, p, 0));
  }
  return { ok: true, conditions };
}
