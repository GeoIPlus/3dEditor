// import (3D-10): least-squares plane of a surface (spec §6 rule 4, "SVD"): the plane through the centroid whose normal
// is the eigenvector of the smallest eigenvalue of the 3 x 3 scatter matrix (the same vector as the last right singular
// vector of the centred point matrix). The normal is oriented like the Newell normal of the outer ring, so it points
// out of the solid for CityJSON rings (counter-clockwise seen from outside).
import { dot, norm, scale, signedDistance, unsign0 } from '../brep/index.js';

/** @typedef {[number, number, number]} P3 */
/** @typedef {import('../brep/plane.js').Plane} Plane */

/**
 * Newell normal (not normalised; its length is twice the projected area) of a closed ring.
 * @param {P3[]} ring
 * @returns {P3}
 */
export function newell(ring) {
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    x += (a[1] - b[1]) * (a[2] + b[2]);
    y += (a[2] - b[2]) * (a[0] + b[0]);
    z += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return [x, y, z];
}

/**
 * Eigen decomposition of a symmetric 3 x 3 matrix by cyclic Jacobi rotations (deterministic, no transcendental input).
 * @param {number[][]} m symmetric, not modified
 * @returns {{ values: number[], vectors: P3[] }} vectors[k] belongs to values[k]
 */
export function symmetricEigen3(m) {
  const a = m.map((r) => [...r]);
  const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 50; sweep++) {
    const off = a[0][1] ** 2 + a[0][2] ** 2 + a[1][2] ** 2;
    if (off === 0) break;
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      if (a[p][q] === 0) continue;
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < 3; k++) {
        const akp = a[k][p], akq = a[k][q];
        a[k][p] = c * akp - s * akq;
        a[k][q] = s * akp + c * akq;
      }
      for (let k = 0; k < 3; k++) {
        const apk = a[p][k], aqk = a[q][k];
        a[p][k] = c * apk - s * aqk;
        a[q][k] = s * apk + c * aqk;
      }
      for (let k = 0; k < 3; k++) {
        const vkp = v[k][p], vkq = v[k][q];
        v[k][p] = c * vkp - s * vkq;
        v[k][q] = s * vkp + c * vkq;
      }
    }
  }
  return {
    values: [a[0][0], a[1][1], a[2][2]],
    vectors: [0, 1, 2].map((k) => /** @type {P3} */ ([v[0][k], v[1][k], v[2][k]])),
  };
}

/**
 * @typedef {object} PlaneFit
 * @property {Plane} plane unit normal, `normal · p + d = 0`
 * @property {number} maxDeviation largest |distance| of the points to the plane, metres
 */

/**
 * Least-squares plane of all ring points of a surface, oriented by the Newell normal of the outer ring.
 * @param {P3[]} points every vertex of the surface (outer and inner rings)
 * @param {P3[]} outer outer ring
 * @returns {PlaneFit | null} null when the points do not span a plane (fewer than 3, or collinear)
 */
export function fitPlane(points, outer) {
  if (points.length < 3) return null;
  const c = [0, 0, 0];
  for (const p of points) for (let i = 0; i < 3; i++) c[i] += p[i] / points.length;
  const s = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of points) {
    const d = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) s[i][j] += d[i] * d[j];
  }
  const { values, vectors } = symmetricEigen3(s);
  const order = [0, 1, 2].sort((x, y) => values[x] - values[y]);
  if (!(values[order[1]] > 0)) return null; // rank < 2: collinear or coincident points
  let n = vectors[order[0]];
  const nw = newell(outer);
  if (norm(nw) === 0) return null;
  if (dot(n, nw) < 0) n = scale(n, -1);
  n = /** @type {P3} */ (scale(n, 1 / norm(n)).map(unsign0));
  const plane = { normal: n, d: unsign0(-dot(n, /** @type {P3} */ (c))) };
  let maxDeviation = 0;
  for (const p of points) maxDeviation = Math.max(maxDeviation, Math.abs(signedDistance(plane, p)));
  return { plane, maxDeviation };
}
