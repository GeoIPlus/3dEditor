// ops (3D-21): SET_CONSTRAINT and REMOVE_CONSTRAINT (spec §10.12 r2, r3; Fix / Unfix, E-07). A new constraint is read
// by the solve compiler before it is stored (spec §5: "3D-21 validates constraints when they are set"); a rejection is
// INVALID_PAYLOAD with the compiler's reason (D-3D21-1). A hard constraint the current model violates is refused
// CONSTRAINT_CONFLICT by the pipeline's constraint step (no plane is movable, so every condition is checked at the
// current geometry; spec §10.12 r3). REMOVE_CONSTRAINT of a FIXED_POINT is the explicit unlock (spec §5 r6, v0.2 C.11).
import { sameValue } from '../brep/index.js';
import { compileConstraints } from '../solve/index.js';
import { refuse } from './errors.js';

/** Fields of contract `ConstraintBody` (building-model.schema.json). */
const BODY_FIELDS = ['kind', 'entityIds', 'hard', 'target', 'weight', 'measurementId'];

/**
 * @param {import('../brep/types.js').BuildingModel} draft
 * @param {any} payload contract `command-payload-set-constraint`
 * @param {import('./pipeline.js').OpContext} ctx
 * @returns {import('./pipeline.js').OpResult}
 */
export function setConstraint(draft, payload, ctx) {
  const c = payload?.constraint;
  if (!c || typeof c !== 'object' || typeof c.kind !== 'string' || typeof c.hard !== 'boolean'
    || !Array.isArray(c.entityIds) || c.entityIds.length === 0 || !c.entityIds.every((/** @type {any} */ id) => typeof id === 'string')) {
    return refuse('INVALID_PAYLOAD', [], 'constraint needs kind, entityIds and hard');
  }
  const extra = Object.keys(c).filter((k) => !BODY_FIELDS.includes(k));
  if (extra.length > 0) return refuse('INVALID_PAYLOAD', [], `unknown constraint fields: ${extra.join(', ')}`);
  if (c.hard && c.weight !== undefined) return refuse('INVALID_PAYLOAD', [], 'a hard constraint has no weight');
  /** @type {Record<string, any>} */
  const body = {};
  for (const k of BODY_FIELDS) if (c[k] !== undefined) body[k] = structuredClone(c[k]);

  const duplicate = Object.values(draft.constraints).find((s) => sameValue(withoutId(s), body));
  if (duplicate) return refuse('INVALID_PAYLOAD', [duplicate.id], 'the same constraint is already set (D-3D21-4)');

  const id = ctx.ids('constraint');
  const candidate = /** @type {{ id: string, entityIds: string[] } & Record<string, any>} */ ({ id, ...body });
  const compiled = compileConstraints(draft, [candidate], ctx.tol);
  if (compiled.rejected.length > 0) {
    const ids = candidate.entityIds.filter((e) => !(e in draft.vertices || e in draft.faces || e in draft.halfEdges));
    return refuse('INVALID_PAYLOAD', ids, `constraint not readable: ${compiled.rejected[0].reason} (D-3D21-1)`);
  }
  draft.constraints[id] = candidate;
  return { ok: true };
}

/**
 * @param {import('../brep/types.js').BuildingModel} draft
 * @param {any} payload contract `command-payload-remove-constraint`
 * @returns {import('./pipeline.js').OpResult}
 */
export function removeConstraint(draft, payload) {
  const id = payload?.constraintId;
  if (typeof id !== 'string') return refuse('INVALID_PAYLOAD', [], 'constraintId');
  if (!(id in draft.constraints)) return refuse('INVALID_PAYLOAD', [id], 'unknown constraintId (D-3D21-3)');
  delete draft.constraints[id];
  return { ok: true };
}

/** @param {Record<string, any>} c */
function withoutId(c) {
  const { id: _id, ...rest } = c;
  return rest;
}
