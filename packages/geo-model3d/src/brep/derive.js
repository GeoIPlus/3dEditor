// brep (3D-09): vertices derived from planes (D-08; spec §4 rules 2-5; D-70). The shared invariant helper of every op
// row (spec §4 Accept 2) and the INCONSISTENT_JUNCTION test (spec §4 rule 5) live here.
import { derivePoint, signedDistance } from './plane.js';
import { unsign0 } from './vec.js';

/** @typedef {import('./types.js').BuildingModel} BuildingModel */
/** @typedef {import('./types.js').CoreTolerances} CoreTolerances */
/** @typedef {import('./types.js').Vtx} Vtx */
/** @typedef {import('./plane.js').Plane} Plane */

/**
 * @typedef {object} PlaneViolation
 * @property {string} vertexId
 * @property {string} faceId
 * @property {number} distance |signed distance| of the vertex to the face plane, metres
 * @property {'DERIVED' | 'EXPLICIT'} positionMode
 * @property {boolean} importedKept true for an EXPLICIT vertex whose planes would fix it: an imported vertex kept at its
 *   file position (spec §4 rule 3a, D-70); validation reports those as NON_PLANAR_FACE instead of the core invariant
 */

/** @param {BuildingModel} model @param {Vtx} v @returns {Plane[]} */
const planesOf = (model, v) => v.definingFaceIds.map((f) => model.faces[f].supportPlane);

/**
 * Vertex-to-plane invariant (spec §4 rule 4): every vertex within `planarTolM` of each of its defining planes.
 * Used by every op row's tests after each committed operation (spec §4 Accept 2).
 * @param {BuildingModel} model
 * @param {CoreTolerances} tol
 * @returns {PlaneViolation[]} empty when the invariant holds
 */
export function vertexPlaneViolations(model, tol) {
  /** @type {PlaneViolation[]} */
  const out = [];
  for (const v of Object.values(model.vertices)) {
    /** @type {boolean | undefined} */
    let fixable;
    for (const f of v.definingFaceIds) {
      const distance = Math.abs(signedDistance(model.faces[f].supportPlane, v.p));
      if (!(distance <= tol.planarTolM)) {
        if (fixable === undefined) fixable = derivePoint(planesOf(model, v), tol.numericEpsilon) !== null;
        out.push({ vertexId: v.id, faceId: f, distance, positionMode: v.positionMode, importedKept: v.positionMode === 'EXPLICIT' && fixable });
      }
    }
  }
  return out;
}

/**
 * @typedef {object} Junction
 * @property {'INCONSISTENT_JUNCTION'} code validation code (contract validation-report `ValidationCode`)
 * @property {string[]} entityIds the vertex, then its defining faces
 * @property {number} residual metres
 */

/**
 * Nodes of four or more planes that do not meet in one point within `topologySnapTolM` (spec §4 rule 5). The residual
 * is the largest distance of the planes' least-squares point to any of them [A: the spec does not define the measure;
 * the same as 3D-08's spike].
 * @param {BuildingModel} model
 * @param {CoreTolerances} tol
 * @param {Iterable<string>} [vertexIds] default: every vertex
 * @returns {Junction[]}
 */
export function inconsistentJunctions(model, tol, vertexIds = Object.keys(model.vertices)) {
  /** @type {Junction[]} */
  const out = [];
  for (const id of vertexIds) {
    const v = model.vertices[id];
    if (v.definingFaceIds.length < 4) continue;
    const r = derivePoint(planesOf(model, v), tol.numericEpsilon);
    if (r && r.residual > tol.topologySnapTolM) out.push({ code: 'INCONSISTENT_JUNCTION', entityIds: [v.id, ...v.definingFaceIds], residual: r.residual });
  }
  return out;
}

/**
 * @typedef {object} RederiveResult
 * @property {string[]} changed vertex ids whose `p` or `positionMode` changed
 * @property {PlaneViolation[]} offPlane explicit vertices (fewer than three independent planes) not on their planes
 * @property {Junction[]} junctions inconsistent 4+ plane nodes among the re-derived vertices
 */

/**
 * Re-derive every vertex that has one of `faceIds` among its defining faces, in place on a draft (a transaction's
 * isolated copy, never a committed model). Spec §4: three or more independent planes -> derived position,
 * `positionMode` DERIVED (this is also how an imported EXPLICIT vertex becomes derived when an operation first changes
 * one of its faces, rule 3a / D-70); fewer -> explicit position kept, checked against its planes (rule 3).
 * @param {BuildingModel} draft mutated
 * @param {Iterable<string>} faceIds faces whose `supportPlane` the operation changed
 * @param {CoreTolerances} tol
 * @returns {RederiveResult}
 */
export function rederive(draft, faceIds, tol) {
  const touched = new Set(faceIds);
  /** @type {RederiveResult} */
  const res = { changed: [], offPlane: [], junctions: [] };
  for (const v of Object.values(draft.vertices)) {
    if (!v.definingFaceIds.some((f) => touched.has(f))) continue;
    const planes = planesOf(draft, v);
    const r = derivePoint(planes, tol.numericEpsilon);
    if (r) {
      /** @type {[number, number, number]} */
      const p = [unsign0(r.p[0]), unsign0(r.p[1]), unsign0(r.p[2])];
      if (p[0] !== v.p[0] || p[1] !== v.p[1] || p[2] !== v.p[2] || v.positionMode !== 'DERIVED') res.changed.push(v.id);
      v.p = p;
      v.positionMode = 'DERIVED';
      if (planes.length >= 4 && r.residual > tol.topologySnapTolM) {
        res.junctions.push({ code: 'INCONSISTENT_JUNCTION', entityIds: [v.id, ...v.definingFaceIds], residual: r.residual });
      }
    } else {
      if (v.positionMode !== 'EXPLICIT') { v.positionMode = 'EXPLICIT'; res.changed.push(v.id); }
      v.definingFaceIds.forEach((f, i) => {
        const distance = Math.abs(signedDistance(planes[i], v.p));
        if (!(distance <= tol.planarTolM)) res.offPlane.push({ vertexId: v.id, faceId: f, distance, positionMode: 'EXPLICIT', importedKept: false });
      });
    }
  }
  return res;
}
