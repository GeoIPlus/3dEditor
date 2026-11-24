// ops (3D-14): the constraint step of the pipeline (spec §3 r1, r5; spec §5): model constraints on entities the
// operation removed (D-3D14-2: hard -> CONSTRAINT_CONFLICT, soft -> dropped), then hard and soft constraints solved
// for the planes the operation declares movable (every other plane fixed, spec §10.1 r3) and re-checked at the result.
import { rederive } from '../brep/index.js';
import { compileConstraints, solveConstraints, toSolveError } from '../solve/index.js';
import { refuse } from './errors.js';

/** @typedef {import('../brep/types.js').BuildingModel} BuildingModel */
/** @typedef {import('../solve/conditions.js').Condition} Condition */

/**
 * @param {BuildingModel} draft mutated: dropped soft constraints, solved planes, re-derived vertices
 * @param {{ removed?: Set<string>, movableFaceIds?: string[], conditions?: Condition[], targetVertexIds?: string[] }} op
 * @param {any} tol contract `tolerance-profile`
 * @returns {{ ok: true, warnings: string[] } | { ok: false, refusal: import('./errors.js').ContractError }}
 */
export function constraintStep(draft, op, tol) {
  const removed = op.removed ?? new Set();
  const hardOnRemoved = [];
  for (const c of Object.values(draft.constraints).sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (!c.entityIds.some((/** @type {string} */ id) => removed.has(id))) continue;
    if (c.hard) hardOnRemoved.push(c.id);
    else delete draft.constraints[c.id];
  }
  if (hardOnRemoved.length > 0) {
    return refuse('CONSTRAINT_CONFLICT', hardOnRemoved, 'hard constraints on entities the operation removes (D-3D14-2)');
  }
  /** @type {string[]} */
  const warnings = [];
  const compiled = compileConstraints(draft, Object.values(draft.constraints), tol);
  for (const r of compiled.rejected) warnings.push(`constraint ${r.id} (${r.kind}) not applied: ${r.reason}`);
  const conditions = [...(op.conditions ?? []), ...compiled.conditions];
  const movable = op.movableFaceIds ?? [];
  if (conditions.length === 0 && movable.length === 0) return { ok: true, warnings };
  const res = solveConstraints({ model: draft, movableFaceIds: movable, conditions, targetVertexIds: op.targetVertexIds, keepWeights: compiled.keepWeights }, tol);
  if (res.status !== 'OK') return { ok: false, refusal: toSolveError(res) };
  for (const [f, plane] of Object.entries(res.planes)) draft.faces[f].supportPlane = plane;
  if (Object.keys(res.planes).length > 0) rederive(draft, Object.keys(res.planes), tol);
  return { ok: true, warnings };
}
