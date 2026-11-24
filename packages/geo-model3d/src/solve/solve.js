// solve (3D-13): the solve entry (spec §5 API). Unknowns are the movable `supportPlane`s only (spec §5 r7); stage 1 in
// closed form when every hard condition is a fixed point on one plane and no soft term exists, else stage 2 from the
// stage-1 start (3D-ADR-0005 A1). Every hard condition is re-checked at the result (spec §5 r4); a miss is a conflict,
// reduced to a minimal set of constraint ids by a deletion filter. Nothing is written to the model.
import { derivePoint } from '../brep/plane.js';
import { residualNorm } from './conditions.js';
import { solvePlaneO1 } from './stage1.js';
import { solveCoupled } from './stage2.js';

/** @typedef {import('./conditions.js').Condition} Condition */
/** @typedef {import('./conditions.js').EvalContext} EvalContext */
/** @typedef {import('./compile.js').SolveTolerances} SolveTolerances */
/** @typedef {import('../brep/types.js').BuildingModel} BuildingModel */
/** @typedef {import('../brep/plane.js').Plane} Plane */
/** @typedef {import('../brep/vec.js').P3} P3 */

/**
 * @typedef {object} SolveInput
 * @property {BuildingModel} model read only
 * @property {string[]} movableFaceIds the planes the operation declares movable; every other plane is fixed
 * @property {Condition[]} conditions the operation's targets plus compiled model constraints
 * @property {string[]} [targetVertexIds] vertices the operation targets; O1 keeps every other vertex of a movable face
 * @property {Record<string, number>} [keepWeights] O1 weight per face (MINIMIZE_DISPLACEMENT), default 1
 */

/**
 * @typedef {object} SolveResult
 * @property {'OK' | 'CONSTRAINT_CONFLICT' | 'UNDERCONSTRAINED_GEOMETRY'} status
 * @property {boolean} feasible the hard conditions can hold together
 * @property {Record<string, Plane>} planes solved movable planes; empty unless `status === 'OK'`
 * @property {string[]} conflictIds minimal conflicting constraint ids (deletion filter)
 * @property {string[]} entityIds entities of the conflict, or the faces with free degrees
 * @property {string[]} missingDegreesOfFreedom `"<faceId>:OFFSET|ROTATION"` (D-171)
 * @property {{ id: string, kind: string, hard: boolean, value: number, tol?: number }[]} residuals per constraint id
 *   (largest residual norm of its conditions; `tol` for hard ones)
 * @property {{ stage: 1 | 2, iterations: number, converged: boolean, cost: number }} solver
 */

/**
 * @param {SolveInput} input
 * @param {SolveTolerances} tol
 * @returns {SolveResult}
 */
export function solveConstraints(input, tol) {
  const { model, conditions } = input;
  const movable = [...new Set(input.movableFaceIds)].sort();
  for (const f of movable) if (!model.faces[f]) throw new Error(`solve: unknown movable face ${f}`);
  const context = contextFactory(model, new Set(movable), tol.numericEpsilon);
  const keep = keepPoints(model, movable, new Set(input.targetVertexIds ?? []));
  const weights = input.keepWeights ?? {};
  const run = (/** @type {Condition[]} */ conds, /** @type {boolean} */ forceStage2) =>
    attempt(model, movable, conds, keep, weights, context, tol.numericEpsilon, forceStage2);

  let r = run(conditions, false);
  if (!passes(conditions.filter((c) => c.hard), context(r.planes)) && r.solver.stage === 1) r = run(conditions, true);
  const hardOk = passes(conditions.filter((c) => c.hard), context(r.planes));
  const residuals = residualList(conditions, context(r.planes));
  if (!hardOk) {
    const conflictIds = deletionFilter(conditions, (ids) => {
      const sub = conditions.filter((c) => c.hard && ids.has(c.id));
      return passes(sub, context(run(sub, true).planes));
    });
    const entityIds = [...new Set(conditions.filter((c) => conflictIds.includes(c.id)).flatMap((c) => c.entityIds))].sort();
    return { status: 'CONSTRAINT_CONFLICT', feasible: false, planes: {}, conflictIds, entityIds, missingDegreesOfFreedom: [], residuals, solver: r.solver };
  }
  if (r.free.length > 0) {
    const entityIds = [...new Set(r.free.map((s) => s.slice(0, s.lastIndexOf(':'))))].sort();
    return { status: 'UNDERCONSTRAINED_GEOMETRY', feasible: true, planes: {}, conflictIds: [], entityIds, missingDegreesOfFreedom: r.free, residuals, solver: r.solver };
  }
  return { status: 'OK', feasible: true, planes: r.planes, conflictIds: [], entityIds: [], missingDegreesOfFreedom: [], residuals, solver: r.solver };
}

/**
 * One solve without diagnostics.
 * @param {BuildingModel} model @param {string[]} movable @param {Condition[]} conds @param {Record<string, P3[]>} keep
 * @param {Record<string, number>} weights @param {(planes: Record<string, Plane>) => EvalContext} context
 * @param {number} eps @param {boolean} forceStage2
 * @returns {{ planes: Record<string, Plane>, free: string[], solver: SolveResult['solver'] }}
 */
function attempt(model, movable, conds, keep, weights, context, eps, forceStage2) {
  const mov = new Set(movable);
  const stage1Only = !forceStage2 && conds.every((c) => c.hard && c.linear);
  /** @type {Record<string, Plane>} */
  const start = {};
  /** @type {string[]} */
  const free = [];
  let cost = 0;
  for (const f of movable) {
    const hard = conds.filter((c) => c.hard && c.linear && c.linear.faceId === f).map((c) => /** @type {P3} */ (c.linear?.point));
    const w = weights[f] ?? 1;
    const s = solvePlaneO1({ hard, keep: keep[f], weights: keep[f].map(() => w), oldPlane: model.faces[f].supportPlane, eps });
    start[f] = s.status === 'OK' ? s.plane : model.faces[f].supportPlane;
    if (s.status === 'OK') cost += w * s.cost;
    if (s.status === 'UNDERCONSTRAINED') for (const k of s.free) free.push(`${f}:${k}`);
  }
  if (stage1Only) return { planes: start, free, solver: { stage: 1, iterations: 1, converged: true, cost } };
  // Planes no condition reads stay exactly as they are (spec §5 r7: no hidden jumps).
  const touched = movable.filter((f) => conds.some((c) => c.faces.includes(f)));
  if (touched.length === 0) return { planes: start, free: [], solver: { stage: 2, iterations: 0, converged: true, cost: 0 } };
  const r = solveCoupled({
    movable: touched.map((f) => ({ faceId: f, plane: start[f], keep: keep[f], keepWeight: weights[f] ?? 1 })),
    conditions: conds.filter((c) => c.faces.some((f) => mov.has(f))),
    context: (planes) => context({ ...start, ...planes }),
    eps,
  });
  return { planes: { ...start, ...r.planes }, free: r.free, solver: { stage: 2, iterations: r.iterations, converged: r.converged, cost: r.cost } };
}

/**
 * Evaluation context over the model: movable planes from `planes`, fixed ones from the model; vertex positions derived
 * from their defining planes when one of them is movable, else the stored position (D-70). Cached per context.
 * @param {BuildingModel} model @param {Set<string>} movable @param {number} eps
 * @returns {(planes: Record<string, Plane>) => EvalContext}
 */
export function contextFactory(model, movable, eps) {
  return (planes) => {
    /** @type {Map<string, P3 | null>} */
    const cache = new Map();
    /** @param {string} f */
    const plane = (f) => planes[f] ?? model.faces[f].supportPlane;
    /** @param {string} id */
    const vertex = (id) => {
      if (cache.has(id)) return /** @type {P3 | null} */ (cache.get(id));
      const v = model.vertices[id];
      const p = v.definingFaceIds.some((f) => movable.has(f)) ? (derivePoint(v.definingFaceIds.map(plane), eps)?.p ?? null) : v.p;
      cache.set(id, p);
      return p;
    };
    return { plane, vertex };
  };
}

/**
 * O1 keep points: old positions of the vertices of each movable face that the operation does not target (D-110).
 * @param {BuildingModel} model @param {string[]} movable @param {Set<string>} targets
 * @returns {Record<string, P3[]>}
 */
function keepPoints(model, movable, targets) {
  /** @type {Record<string, Set<string>>} */
  const ring = Object.fromEntries(movable.map((f) => [f, new Set()]));
  for (const h of Object.values(model.halfEdges)) if (ring[h.faceId]) ring[h.faceId].add(h.startVertexId);
  return Object.fromEntries(movable.map((f) => [f, [...ring[f]].sort().filter((v) => !targets.has(v)).map((v) => model.vertices[v].p)]));
}

/** @param {Condition[]} hard @param {EvalContext} ctx */
const passes = (hard, ctx) => hard.every((c) => residualNorm(c.residual(ctx)) <= c.tol);

/** @param {Condition[]} conds @param {EvalContext} ctx */
function residualList(conds, ctx) {
  /** @type {Map<string, SolveResult['residuals'][number]>} */
  const by = new Map();
  for (const c of conds) {
    const v = residualNorm(c.residual(ctx));
    const e = by.get(c.id);
    if (!e) by.set(c.id, c.hard ? { id: c.id, kind: c.kind, hard: true, value: v, tol: c.tol } : { id: c.id, kind: c.kind, hard: false, value: v });
    else e.value = Math.max(e.value, v);
  }
  return [...by.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Deletion filter (3D-ADR-0005 A1): drop each hard constraint id in turn; keep it out when the rest still fails.
 * The ids left form a minimal infeasible set (each one is needed for the failure). One solve per id.
 * @param {Condition[]} conds @param {(ids: Set<string>) => boolean} feasible
 * @returns {string[]}
 */
export function deletionFilter(conds, feasible) {
  const ids = [...new Set(conds.filter((c) => c.hard).map((c) => c.id))].sort();
  const keepIds = new Set(ids);
  for (const id of ids) {
    keepIds.delete(id);
    if (feasible(keepIds)) keepIds.add(id);
  }
  return [...keepIds].sort();
}
