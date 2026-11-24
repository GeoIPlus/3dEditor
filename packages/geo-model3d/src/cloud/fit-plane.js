// cloud (3D-22): robust plane fit (M-06; v0.3 §7; spec §9 rules 1-3). RANSAC on point triples, then an SVD
// least-squares refinement on the consensus set. Parameters (D-130, Q-24): inlier distance = `planarTolM` along the
// normal; iterations adaptive for 99.9 % confidence, at most 1000; fixed seed, so the result is deterministic.
// The selected points are put in a canonical order first, so the result does not depend on the input order (3D-80).
import { planeFromPoints, unsign0 } from '../brep/index.js';
import { symmetricEigen3 } from './eigen.js';
import { canonicalOrder, invalidPayload, pointAt, pointCount, selectPoints, selectionProblem } from './points.js';
import { mulberry32, randomIndex } from './rng.js';

/** @typedef {import('./points.js').PointSelection} PointSelection */
/** @typedef {import('./points.js').P3} P3 */
/** @typedef {{ normal: P3, d: number }} Plane */
/**
 * Contract `plane-fit-result`.
 * @typedef {{ plane: Plane, pointCount: number, inlierCount: number, inlierRatio: number, rmseM: number, frame: 'LOCAL' }} PlaneFitResult
 */
/** @typedef {{ planarTolM: number, planeFitMinPoints: number, planeFitMinInlierRatio: number }} FitTolerances */

/** RANSAC settings of D-130. The seed value itself carries no meaning; it only has to be fixed. */
export const RANSAC = Object.freeze({ confidence: 0.999, maxIterations: 1000, seed: 0x3d22 });

/** @param {number} pc @param {number} [inlierRatio] */
const refusal = (pc, inlierRatio) => ({
  code: 'INVALID_MEASUREMENT',
  httpStatus: 422,
  messageKey: 'model3d.error.planeFit',
  details: inlierRatio === undefined ? { pointCount: pc } : { pointCount: pc, inlierRatio },
});

/**
 * Iterations needed so that one all-inlier sample is drawn with `confidence`, for inlier share w.
 * @param {number} w
 */
function requiredIterations(w) {
  if (w >= 1) return 1;
  const p = w * w * w;
  if (p <= 0) return Infinity;
  return Math.ceil(Math.log(1 - RANSAC.confidence) / Math.log(1 - p));
}

/**
 * Indices of the points within `tol` of the plane.
 * @param {Float64Array} pts @param {Plane} pl @param {number} tol
 */
function consensus(pts, pl, tol) {
  const [a, b, c] = pl.normal;
  /** @type {number[]} */
  const ids = [];
  for (let i = 0, n = pointCount(pts); i < n; i++) {
    if (Math.abs(a * pts[3 * i] + b * pts[3 * i + 1] + c * pts[3 * i + 2] + pl.d) <= tol) ids.push(i);
  }
  return ids;
}

/**
 * Best consensus set of RANSAC on point triples.
 * @param {Float64Array} pts @param {number} tol
 * @returns {number[]}
 */
export function ransacInliers(pts, tol) {
  const n = pointCount(pts);
  const rnd = mulberry32(RANSAC.seed);
  /** @type {number[]} */
  let best = [];
  let needed = /** @type {number} */ (RANSAC.maxIterations);
  for (let it = 0; it < Math.min(needed, RANSAC.maxIterations); it++) {
    const i = randomIndex(rnd, n);
    let j = randomIndex(rnd, n - 1);
    if (j >= i) j++;
    let k = randomIndex(rnd, n - 2);
    if (k >= Math.min(i, j)) k++;
    if (k >= Math.max(i, j)) k++;
    const pl = planeFromPoints(pointAt(pts, i), pointAt(pts, j), pointAt(pts, k));
    if (!pl) continue;
    const ids = consensus(pts, pl, tol);
    if (ids.length > best.length) {
      best = ids;
      needed = requiredIterations(ids.length / n);
    }
  }
  return best;
}

/**
 * [A] Sign convention of a fitted plane (the sources give none): normal with z > 0; for a vertical plane y > 0, then x > 0.
 * @param {P3} n
 * @returns {P3}
 */
function orient(n) {
  const flip = n[2] < 0 || (n[2] === 0 && (n[1] < 0 || (n[1] === 0 && n[0] < 0)));
  return flip ? [unsign0(-n[0]), unsign0(-n[1]), unsign0(-n[2])] : [unsign0(n[0]), unsign0(n[1]), unsign0(n[2])];
}

/**
 * Least-squares plane through the points `ids` (centroid + smallest principal direction) and its RMSE.
 * @param {Float64Array} pts @param {number[]} ids
 * @returns {{ plane: Plane, rmseM: number }}
 */
export function leastSquaresPlane(pts, ids) {
  const c = [0, 0, 0];
  for (const i of ids) for (let k = 0; k < 3; k++) c[k] += pts[3 * i + k];
  for (let k = 0; k < 3; k++) c[k] /= ids.length;
  const s = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const i of ids) {
    const d = [pts[3 * i] - c[0], pts[3 * i + 1] - c[1], pts[3 * i + 2] - c[2]];
    for (let r = 0; r < 3; r++) for (let q = r; q < 3; q++) s[r][q] += d[r] * d[q];
  }
  s[1][0] = s[0][1];
  s[2][0] = s[0][2];
  s[2][1] = s[1][2];
  const { vectors } = symmetricEigen3(/** @type {any} */ (s));
  const normal = orient(vectors[0]);
  const d = unsign0(-(normal[0] * c[0] + normal[1] * c[1] + normal[2] * c[2]));
  let sq = 0;
  for (const i of ids) {
    const r = normal[0] * pts[3 * i] + normal[1] * pts[3 * i + 1] + normal[2] * pts[3 * i + 2] + d;
    sq += r * r;
  }
  return { plane: { normal, d }, rmseM: Math.sqrt(sq / ids.length) };
}

/**
 * Robust plane fit on the selected points (spec §9 rules 1-2). The result depends on the set of points only, not on
 * their order (3D-80). Refusal: fewer than `planeFitMinPoints` points, or
 * inlier ratio below `planeFitMinInlierRatio` -> `INVALID_MEASUREMENT` with the numbers.
 * @param {Float64Array} points x y z interleaved, LOCAL frame (from the points port)
 * @param {PointSelection} selection contract `PointSelection`
 * @param {FitTolerances} profile contract `tolerance-profile`
 * @returns {{ result: PlaneFitResult } | { error: object }}
 */
export function fitPlane(points, selection, profile) {
  if (!(points instanceof Float64Array) || points.length % 3 !== 0) {
    return { error: invalidPayload('points must be a Float64Array of x y z triples') };
  }
  const problem = selectionProblem(selection);
  if (problem) return { error: invalidPayload(problem) };
  const pts = canonicalOrder(selectPoints(points, selection));
  const n = pointCount(pts);
  if (n < Math.max(3, profile.planeFitMinPoints)) return { error: refusal(n) };
  const ids = ransacInliers(pts, profile.planarTolM);
  const inlierRatio = ids.length / n;
  if (ids.length < 3 || inlierRatio < profile.planeFitMinInlierRatio) return { error: refusal(n, inlierRatio) };
  const { plane, rmseM } = leastSquaresPlane(pts, ids);
  return { result: { plane, pointCount: n, inlierCount: ids.length, inlierRatio, rmseM, frame: 'LOCAL' } };
}
