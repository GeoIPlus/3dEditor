// validate (3D-12): the three modes (spec §8 rule 1; v0.2 §16.2; v0.3 §8.2) as sets of checks.
// FAST_PREVIEW - local invariants of the affected elements, visual feedback only;
// COMMIT_VALIDATION - canonical invariants of the whole model, shell closure and orientation, self-intersection of the
//   affected volume, the full solid check (all face pairs, bodies of the building) when `fullSolid` is set;
// FINAL_VALIDATION - the full COMMIT_VALIDATION plus the external validator (validate.js awaits the port).
import { makeContext, affectedFaces } from './context.js';
import { structuralProblems, openBoundaries, nonManifoldEdges, nonManifoldVertices, openShells } from './structure.js';
import { degenerateEdges, faceChecks, shellOrientation, junctions } from './geometry.js';
import { selfIntersections } from './intersect.js';
import { solidOverlaps } from './overlap.js';

/** @typedef {import('./context.js').RawIssue} RawIssue */
/** @typedef {import('./context.js').Ctx} Ctx */
/** @typedef {import('./context.js').ValidateTolerances} ValidateTolerances */
/** @typedef {'FAST_PREVIEW' | 'COMMIT_VALIDATION' | 'FINAL_VALIDATION'} ValidationMode */

export const MODES = Object.freeze(['FAST_PREVIEW', 'COMMIT_VALIDATION', 'FINAL_VALIDATION']);
const TOL_FIELDS = ['numericEpsilon', 'topologySnapTolM', 'planarTolM', 'minEdgeLengthM', 'minFaceAreaM2'];

/** @param {any} tol @returns {ValidateTolerances} */
export function readTolerances(tol) {
  for (const k of TOL_FIELDS) {
    if (typeof tol?.[k] !== 'number' || !Number.isFinite(tol[k]) || tol[k] < 0) throw new TypeError(`tolerance ${k} missing or invalid`);
  }
  return tol;
}

/** Checks local to the faces of `ctx` (both modes). @param {Ctx} ctx @returns {RawIssue[]} */
const local = (ctx) => [
  ...openBoundaries(ctx), ...nonManifoldEdges(ctx), ...nonManifoldVertices(ctx),
  ...degenerateEdges(ctx), ...faceChecks(ctx), ...junctions(ctx),
];

/**
 * Run the kernel's own checks for a mode (synchronous; `ops` calls this inside the operation pipeline, spec §3 rule 1).
 * @param {import('../brep/types.js').BuildingModel} model
 * @param {object} opts
 * @param {ValidationMode} opts.mode
 * @param {ValidateTolerances} opts.tolerances
 * @param {string[]} [opts.affectedEntityIds] face / half-edge / vertex ids the operation touched; absent = whole model
 * @param {boolean} [opts.fullSolid] COMMIT_VALIDATION of a critical operation: the full solid check
 * @returns {RawIssue[]}
 */
export function runChecks(model, opts) {
  if (!MODES.includes(opts.mode)) throw new RangeError(`unknown validation mode ${opts.mode}`);
  const tol = readTolerances(opts.tolerances);
  const affected = opts.affectedEntityIds;
  if (opts.mode === 'FAST_PREVIEW') {
    const ctx = makeContext(model, tol, affected);
    return [...local(ctx), ...selfIntersections(ctx, { faces: true })];
  }
  const whole = makeContext(model, tol, undefined);
  const full = opts.mode === 'FINAL_VALIDATION' || opts.fullSolid === true || !affected;
  /** @type {Ctx} */
  const volume = full ? whole : { ...whole, faces: affectedFaces(model, whole.index, affected), all: false };
  const shells = openShells(whole);
  const open = new Set(shells.map((i) => i.entityIds[0]));
  return [
    ...structuralProblems(whole), ...local(whole), ...shells, ...shellOrientation(whole, open),
    ...selfIntersections(volume, { faces: true }), ...solidOverlaps(volume),
  ];
}
