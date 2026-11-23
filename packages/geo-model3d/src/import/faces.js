// import (3D-10): input surfaces -> raw faces on welded vertices with a fitted plane and a surface kind (spec §6
// rules 3, 4, 7). Rings keep the file vertex order; consecutive duplicates left by welding are removed. A surface whose
// outer ring keeps fewer than three vertices, or whose points do not span a plane, cannot become a face: it is listed in
// `dropped` and reported by the caller [A] (the spec has no rule for it).
import { fitPlane } from './fit.js';
import { classifySurface } from './semantics.js';

/** @typedef {[number, number, number]} P3 */
/** @typedef {import('./cityjson.js').InBody} InBody */
/** @typedef {import('../brep/plane.js').Plane} Plane */

/**
 * @typedef {object} RawFace
 * @property {number} body index into the bodies
 * @property {number} solid index of the solid in the body
 * @property {number} shell index of the shell in the solid (0 = outer)
 * @property {number[][]} rings representative file indices, outer ring first
 * @property {string | null} semanticType
 * @property {string} surfaceKind
 * @property {boolean} inferred
 * @property {string[]} refs source references (one per input surface; several after a coplanar merge)
 * @property {Plane} plane fitted plane, oriented outward
 * @property {number} maxDeviation metres
 */

/**
 * @param {number[]} ring file indices @param {Map<number, number>} repOf
 * @returns {number[]} representatives without consecutive (cyclic) duplicates
 */
export function weldRing(ring, repOf) {
  /** @type {number[]} */
  const out = [];
  for (const ix of ring) {
    const r = /** @type {number} */ (repOf.get(ix));
    if (out[out.length - 1] !== r) out.push(r);
  }
  while (out.length > 1 && out[0] === out[out.length - 1]) out.pop();
  return out;
}

/**
 * Fit the plane of rings of representative indices.
 * @param {number[][]} rings @param {Map<number, P3>} local
 * @returns {import('./fit.js').PlaneFit | null}
 */
export function fitRings(rings, local) {
  const pts = rings.flat().map((r) => /** @type {P3} */ (local.get(r)));
  return fitPlane(pts, rings[0].map((r) => /** @type {P3} */ (local.get(r))));
}

/**
 * @param {InBody[]} bodies
 * @param {Map<number, number>} repOf
 * @param {Map<number, P3>} local
 * @returns {{ faces: RawFace[], dropped: string[] }}
 */
export function rawFaces(bodies, repOf, local) {
  /** @type {RawFace[]} */
  const faces = [];
  /** @type {string[]} */
  const dropped = [];
  bodies.forEach((b, bi) => b.solids.forEach((so, si) => so.shells.forEach((sh, hi) => {
    for (const s of sh.surfaces) {
      const [outer, ...inner] = s.rings.map((r) => weldRing(r, repOf));
      if (outer.length < 3) { dropped.push(s.ref); continue; }
      inner.forEach((r, k) => { if (r.length < 3) dropped.push(`${s.ref}/${k + 1}`); });
      const rings = [outer, ...inner.filter((r) => r.length >= 3)];
      const fit = fitRings(rings, local);
      if (!fit) { dropped.push(s.ref); continue; }
      const { surfaceKind, inferred } = classifySurface(s.semanticType, fit.plane.normal);
      faces.push({
        body: bi, solid: si, shell: hi, rings, semanticType: s.semanticType, surfaceKind, inferred,
        refs: [s.ref], plane: fit.plane, maxDeviation: fit.maxDeviation,
      });
    }
  })));
  return { faces, dropped };
}
