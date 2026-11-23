// solve (3D-13): stage 1 of 3D-ADR-0005 - closed form for one movable plane whose hard conditions are points that must
// lie on it. Objective O1 (D-110): the plane holds the hard points exactly and is closest, in least squares, to the old
// positions of the face's other vertices ("keep" points). Null space of the hard conditions + generalized eigenproblem.
import { cholesky, dotN, gram, lowerInverse, matVec, symEigen } from './linalg.js';

/** @typedef {import('../brep/vec.js').P3} P3 */
/** @typedef {import('../brep/plane.js').Plane} Plane */
/** @typedef {'OFFSET' | 'ROTATION'} FreeKind */

/**
 * @typedef {{ status: 'OK', plane: Plane, cost: number }
 *   | { status: 'UNDERCONSTRAINED', free: FreeKind[] }
 *   | { status: 'CONFLICT' }} Stage1Result
 */

/**
 * Solve one plane (stage 1).
 * - No hard point: the plane stays as it is (nothing asks it to move; no hidden change, spec §5 r7).
 * - Hard points over-determine the plane: least-squares plane of the hard points; the caller's post-check (spec §5 r4)
 *   decides whether it is within tolerance (D-3D13-2).
 * - Free degrees left by the hard points and not fixed by O1: `UNDERCONSTRAINED`, one entry per free degree (D-3D13-3);
 *   the test is a gap <= `eps` between the two smallest generalized eigenvalues (D-3D13-4).
 * @param {{ hard: P3[], keep: P3[], weights?: number[], oldPlane: Plane, eps: number }} input
 * @returns {Stage1Result}
 */
export function solvePlaneO1({ hard, keep, weights, oldPlane, eps }) {
  if (hard.length === 0) return { status: 'OK', plane: oldPlane, cost: 0 };
  const all = keep.length > 0 ? keep : hard;
  /** @type {P3} */
  const c = /** @type {P3} */ ([0, 1, 2].map((i) => all.reduce((s, p) => s + p[i], 0) / all.length));
  /** @param {P3} p */
  const row = (p) => [p[0] - c[0], p[1] - c[1], p[2] - c[2], 1];
  const A = weightedGram(hard.map(row));
  const M = weightedGram(keep.map(row), weights);
  const ea = symEigen(A);
  const scale = Math.max(1, ea.values[3]);
  let N = ea.vectors.filter((_, i) => ea.values[i] <= 1e-12 * scale);
  if (N.length === 0) N = [ea.vectors[0]]; // over-determined: least-squares plane of the hard points
  const k = N.length;
  // Reduced problem: minimise yᵀ My y subject to yᵀ By y = 1 (By selects the normal part, |n| = 1).
  const My = N.map((a) => N.map((b) => dotN(a, matVec(M, b))));
  const By = N.map((a) => N.map((b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  if (keep.length === 0 && k > 1) {
    // No objective: every direction of N except the scale of the normal is free (|n| = 1 removes one rotation).
    const free = kinds4(N);
    free.splice(free.indexOf('ROTATION'), 1);
    return { status: 'UNDERCONSTRAINED', free };
  }
  if (k === 1) {
    if (!(By[0][0] > 1e-18)) return { status: 'CONFLICT' }; // only d is free: the hard points admit no plane
    return finish(N, [1 / Math.sqrt(By[0][0])], My[0][0] / By[0][0], c, oldPlane);
  }
  const L = cholesky(By);
  if (!L) {
    // A pure offset direction lies in the null space: the hard points leave d free; O1 decides it only with keep points.
    return { status: 'UNDERCONSTRAINED', free: ['OFFSET'] };
  }
  const Li = lowerInverse(L);
  const C = Li.map((r) => Li.map((s) => dotN(r, My.map((mr) => dotN(mr, s)))));
  const e = symEigen(C);
  const freeIdx = e.values.map((v, i) => i).filter((i) => i > 0 && e.values[i] - e.values[0] <= eps);
  if (freeIdx.length > 0) {
    return { status: 'UNDERCONSTRAINED', free: kinds4(freeIdx.map((i) => toX(N, Li, e.vectors[i]))) };
  }
  return finish(N, toY(N, Li, e.vectors[0]), e.values[0], c, oldPlane);
}

/** y = L⁻ᵀ u. @param {number[][]} N @param {number[][]} Li @param {number[]} u */
const toY = (N, Li, u) => N.map((_, i) => Li.reduce((s, r, j) => s + r[i] * u[j], 0));

/** Plane-parameter direction x = N y for y = L⁻ᵀ u. @param {number[][]} N @param {number[][]} Li @param {number[]} u */
const toX = (N, Li, u) => {
  const y = toY(N, Li, u);
  return [0, 1, 2, 3].map((i) => N.reduce((s, v, j) => s + v[i] * y[j], 0));
};

/**
 * Kinds of the free degrees spanned by `dirs` (D-3D13-3), independent of the basis: rotations = rank of the normal
 * part, offsets = the remaining rank. [A] rank threshold 1e-12 on the Gram eigenvalues of the unit directions.
 * @param {number[][]} dirs free directions in plane parameters
 * @param {number[]} normalIdx parameter indices that turn the normal
 * @param {number[]} offsetIdx parameter indices that move the offset
 * @param {boolean} [normalize] scale each direction to unit length first (false: already unit as a whole)
 * @returns {FreeKind[]}
 */
export function freeKinds(dirs, normalIdx, offsetIdx, normalize = true) {
  const unitDirs = !normalize ? dirs : dirs.map((x) => {
    const l = Math.hypot(...x);
    return l > 0 ? x.map((v) => v / l) : x;
  });
  /** @param {number[]} cols */
  const rank = (cols) =>
    unitDirs.length === 0 ? 0 : symEigen(gram(unitDirs.map((x) => cols.map((i) => x[i])), cols.length)).values.filter((v) => v > 1e-12).length;
  const rot = rank(normalIdx);
  const all = rank([...normalIdx, ...offsetIdx]);
  return [...new Array(rot).fill('ROTATION'), ...new Array(all - rot).fill('OFFSET')];
}

/** @param {number[][]} dirs 4-vectors (n, d) @returns {FreeKind[]} */
const kinds4 = (dirs) => freeKinds(dirs, [0, 1, 2], [3]);

/** @param {number[][]} rows @param {number[]} [w] */
function weightedGram(rows, w) {
  const g = [0, 1, 2, 3].map(() => [0, 0, 0, 0]);
  rows.forEach((r, k) => {
    const wk = w ? w[k] : 1;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) g[i][j] += wk * r[i] * r[j];
  });
  return g;
}

/**
 * @param {number[][]} N @param {number[]} y @param {number} cost @param {P3} c @param {Plane} oldPlane
 * @returns {Stage1Result}
 */
function finish(N, y, cost, c, oldPlane) {
  const x = [0, 1, 2, 3].map((i) => N.reduce((s, v, j) => s + v[i] * y[j], 0));
  const len = Math.hypot(x[0], x[1], x[2]);
  /** @type {P3} */
  let normal = [x[0] / len, x[1] / len, x[2] / len];
  let d = x[3] / len - dotN(normal, c);
  if (dotN(normal, oldPlane.normal) < 0) {
    normal = [-normal[0], -normal[1], -normal[2]];
    d = -d;
  }
  return { status: 'OK', plane: { normal: [normal[0] + 0, normal[1] + 0, normal[2] + 0], d: d + 0 }, cost: Math.max(0, cost) };
}
