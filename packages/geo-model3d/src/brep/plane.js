// brep (3D-09): planes `normal · p + d = 0` with |normal| = 1 (spec §1.2, contract common `Plane`) and the derivation of
// a vertex from the planes of its incident faces (spec §4 rules 2, 3, 5; D-08).
import { cross, det3, dot, norm, solve3 } from './vec.js';

/** @typedef {import('./vec.js').P3} P3 */
/** @typedef {{ normal: P3, d: number }} Plane */

/** Signed distance of a point to a plane with a unit normal. @param {Plane} pl @param {P3} p */
export const signedDistance = (pl, p) => dot(pl.normal, p) + pl.d;

/**
 * True when the normal has unit length within `eps` (the contract cannot express it; the kernel checks it).
 * @param {Plane} pl @param {number} eps
 */
export const isUnitPlane = (pl, eps) => Math.abs(norm(pl.normal) - 1) <= eps;

/**
 * Plane through three points, normal by the right-hand rule (a -> b -> c counter-clockwise seen from the normal side).
 * @param {P3} a @param {P3} b @param {P3} c
 * @returns {Plane | null} null for collinear points
 */
export function planeFromPoints(a, b, c) {
  const n = cross([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]]);
  const len = norm(n);
  if (len === 0) return null;
  /** @type {P3} */
  const normal = [n[0] / len, n[1] / len, n[2] / len];
  return { normal, d: -dot(normal, a) };
}

/**
 * Gram determinant det(NᵀN) of the unit normals: by Cauchy-Binet the sum of the squared triple products of every three
 * normals. Scale-free measure of how well the planes fix a point (0 when they span fewer than three directions).
 * @param {Plane[]} planes
 */
export function normalGram(planes) {
  const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const { normal: n } of planes) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) A[i][j] += n[i] * n[j];
  return det3(A);
}

/**
 * @typedef {object} Derived
 * @property {P3} p the intersection point (three planes) or the least-squares point (four or more)
 * @property {number} residual largest |distance| of `p` to any of the planes
 * @property {number} gram `normalGram(planes)`
 */

/**
 * Derive a vertex from its defining planes (spec §4 rule 2). With exactly three planes the point solves N p = -d
 * directly; with four or more it is the least-squares point and `residual` says how far the node is from a single
 * point (spec §4 rule 5).
 * @param {Plane[]} planes in `definingFaceIds` order (determinism)
 * @param {number} rankEps threshold on `normalGram`; below it the planes do not fix a point. [A] The tolerance profile's
 *   `numericEpsilon` ("numeric predicates in the local frame", spec §2.3) is used by the callers.
 * @returns {Derived | null} null: fewer than three independent planes (spec §4 rule 3, explicit position)
 */
export function derivePoint(planes, rankEps) {
  if (planes.length < 3) return null;
  const gram = normalGram(planes);
  if (!(gram > rankEps)) return null;
  /** @type {P3 | null} */
  let p;
  if (planes.length === 3) {
    p = solve3(planes.map((pl) => [...pl.normal]), planes.map((pl) => -pl.d));
  } else {
    const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    const b = [0, 0, 0];
    for (const { normal: n, d } of planes) {
      for (let i = 0; i < 3; i++) {
        b[i] -= n[i] * d;
        for (let j = 0; j < 3; j++) A[i][j] += n[i] * n[j];
      }
    }
    p = solve3(A, b);
  }
  if (!p) return null;
  let residual = 0;
  for (const pl of planes) residual = Math.max(residual, Math.abs(signedDistance(pl, p)));
  return { p, residual, gram };
}
