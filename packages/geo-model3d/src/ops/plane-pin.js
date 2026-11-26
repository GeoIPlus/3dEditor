// ops (3D-15): a face plane given by the operation (OFFSET_FACE, INSERT_ROOF_BREAK) is passed to `solve` as three hard
// point-on-plane conditions on that movable face (spec §10.1 r2: targets are constraints, not coordinate writes). Three
// non-collinear points fix the plane completely, so O1 has no degree of freedom left (D-110), and the model's own hard
// constraints are checked against the vertices they name as they were before the operation.
import { builders } from '../solve/index.js';
import { add, cross, norm, scale } from '../brep/index.js';

/** @typedef {import('../brep/plane.js').Plane} Plane */

/**
 * @param {import('../brep/types.js').BuildingModel} draft
 * @param {string} faceId
 * @param {Plane} plane unit normal
 * @param {string} label condition id (operation and role), used in conflict sets
 * @param {number} tol `planarTolM`
 */
export function pinPlane(draft, faceId, plane, label, tol) {
  const n = plane.normal;
  const p0 = scale(n, -plane.d);
  const helper = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const e1 = cross(n, /** @type {any} */ (helper));
  const u = scale(e1, 1 / norm(e1));
  const v = cross(n, u);
  const b = builders(draft);
  return [p0, add(p0, u), add(p0, v)].map((p) => b.pointOnPlane({ id: label, kind: label }, faceId, /** @type {any} */ (p), tol));
}

/** Unit length within `eps` (contract Plane: |normal| = 1, checked by the kernel). @param {any} pl @param {number} eps */
export const unitPlane = (pl, eps) => !!pl && Array.isArray(pl.normal) && pl.normal.length === 3 && pl.normal.every(Number.isFinite)
  && Number.isFinite(pl.d) && Math.abs(norm(pl.normal) - 1) <= eps;
