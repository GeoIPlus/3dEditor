// ops (3D-17): the point an ALIGN_JUNCTION node is closed to (spec §10.8 r3; D-3D17-4). Majority: the node planes
// that pass through the vertex's current position within `planarTolM` (spec §4 r4) [A: reading of "where most planes
// meet" - with four planes every three meet somewhere], when they contain every fixed plane, fix a point and meet within
// `topologySnapTolM` (D-152); only the other planes move. Otherwise the fallback: the point on the fixed planes closest
// in least squares (normal distance, general `n·p + d` form) to the movable planes; then every movable plane moves.
import { derivePoint, junctionSpread, signedDistance, dot } from '../brep/index.js';

/** @typedef {import('../brep/types.js').BuildingModel} BuildingModel */
/** @typedef {import('../brep/plane.js').Plane} Plane */
/** @typedef {import('../brep/vec.js').P3} P3 */

/**
 * @param {BuildingModel} m @param {string} vertexId @param {Set<string>} fixed node faces that must not move
 * @param {any} tol
 * @returns {{ ok: true, point: P3, moving: string[], rule: 'MAJORITY' | 'LEAST_SQUARES' } | { ok: false }}
 */
export function junctionPoint(m, vertexId, fixed, tol) {
  const v = m.vertices[vertexId];
  const ids = v.definingFaceIds;
  const plane = (/** @type {string} */ f) => m.faces[f].supportPlane;
  const agree = ids.filter((f) => Math.abs(signedDistance(plane(f), v.p)) <= tol.planarTolM);
  if (agree.length < ids.length && [...fixed].every((f) => agree.includes(f))) {
    const r = derivePoint(agree.map(plane), tol.numericEpsilon);
    if (r && junctionSpread(agree.map(plane), tol.numericEpsilon) <= tol.topologySnapTolM) {
      return { ok: true, point: r.p, moving: ids.filter((f) => !agree.includes(f)), rule: 'MAJORITY' };
    }
  }
  const movable = ids.filter((f) => !fixed.has(f));
  const p = constrainedLsq(ids.filter((f) => fixed.has(f)).map(plane), movable.map(plane), tol.numericEpsilon);
  return p ? { ok: true, point: p, moving: movable, rule: 'LEAST_SQUARES' } : { ok: false };
}

/**
 * min Σ (n_i·p + d_i)² over the movable planes subject to lying on the fixed planes (least squares among the fixed
 * ones when they are inconsistent). Null when the planes do not fix one point.
 * @param {Plane[]} fixedPlanes @param {Plane[]} movablePlanes @param {number} eps
 * @returns {P3 | null}
 */
export function constrainedLsq(fixedPlanes, movablePlanes, eps) {
  // orthonormal basis U of the fixed normals (Gram-Schmidt), its complement V
  /** @type {P3[]} */
  const U = [];
  for (const { normal } of fixedPlanes) {
    const w = /** @type {P3} */ ([...normal]);
    for (const u of U) { const c = dot(w, u); for (let i = 0; i < 3; i++) w[i] -= c * u[i]; }
    const l = Math.hypot(...w);
    if (l > Math.sqrt(eps)) U.push(/** @type {P3} */ (w.map((x) => x / l)));
  }
  /** @type {P3[]} */
  const V = [];
  for (const e of /** @type {P3[]} */ ([[1, 0, 0], [0, 1, 0], [0, 0, 1]])) {
    const w = /** @type {P3} */ ([...e]);
    for (const u of [...U, ...V]) { const c = dot(w, u); for (let i = 0; i < 3; i++) w[i] -= c * u[i]; }
    const l = Math.hypot(...w);
    if (l > 1e-6 && U.length + V.length < 3) V.push(/** @type {P3} */ (w.map((x) => x / l)));
  }
  const p0 = lsqIn(U, fixedPlanes, [0, 0, 0], eps);
  if (!p0) return null;
  if (V.length === 0) return p0;
  return lsqIn(V, movablePlanes, p0, eps);
}

/**
 * Least-squares point `base + B s` for the planes.
 * @param {P3[]} B @param {Plane[]} planes @param {P3} base @param {number} eps
 * @returns {P3 | null}
 */
function lsqIn(B, planes, base, eps) {
  const k = B.length;
  if (k === 0) return base;
  const A = B.map(() => new Array(k).fill(0));
  const rhs = new Array(k).fill(0);
  for (const pl of planes) {
    const row = B.map((b) => dot(pl.normal, b));
    const r = signedDistance(pl, base);
    for (let i = 0; i < k; i++) {
      rhs[i] -= row[i] * r;
      for (let j = 0; j < k; j++) A[i][j] += row[i] * row[j];
    }
  }
  const s = solveSmall(A, rhs, eps);
  if (!s) return null;
  return /** @type {P3} */ ([0, 1, 2].map((i) => base[i] + B.reduce((acc, b, j) => acc + b[i] * s[j], 0)));
}

/** Gaussian elimination with partial pivoting; null when singular. @param {number[][]} A @param {number[]} b @param {number} eps */
function solveSmall(A, b, eps) {
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (!(Math.abs(M[p][c]) > eps)) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let j = c; j <= n; j++) M[r][j] -= f * M[c][j];
    }
  }
  return M.map((r, i) => r[n] / r[i]);
}
