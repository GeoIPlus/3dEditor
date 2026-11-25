// 3D-08 spike (throwaway, server-only, P4): the plane solve proposed by ADR-S (3D-ADR-0005) for one movable plane with
// linear hard constraints (points that must lie on it), and vertex derivation from planes (D-08, spec §4 rule 2).
import { dot, lsqPoint, symEigen } from './linalg.js';

/** @typedef {import('./linalg.js').P3} P3 */
/** @typedef {{ normal: P3, d: number }} Plane */

/** Distance of a point to a plane with a unit normal. @param {Plane} pl @param {P3} p */
export const dist = (pl, p) => dot(pl.normal, p) + pl.d;

/**
 * Plane that contains every hard point exactly and is closest, in the least-squares sense, to the given old vertex
 * positions (proposed Q-17 objective: the face's other vertices stay where they were, measured as the squared distances
 * of their old positions to the new plane). Closed form: null space of the constraints, then a generalized eigenproblem.
 * @param {{ hard: P3[], old: P3[], oldPlane: Plane }} input
 * @returns {{ status: 'OK', plane: Plane, cost: number } | { status: 'CONFLICT' | 'UNDERCONSTRAINED' }}
 */
export function solvePlane({ hard, old, oldPlane }) {
  if (hard.length === 0) return { status: 'OK', plane: oldPlane, cost: 0 }; // nothing asks it to move
  if (old.length === 0) return { status: 'UNDERCONSTRAINED' }; // nothing to keep: the objective is empty
  // Centre the coordinates on the old vertices so that d is of the same scale as the normal.
  const c = /** @type {P3} */ ([0, 1, 2].map((i) => old.reduce((s, p) => s + p[i], 0) / old.length));
  /** @param {P3} p */
  const row = (p) => [p[0] - c[0], p[1] - c[1], p[2] - c[2], 1];
  const gram = (/** @type {number[][]} */ rows) => [0, 1, 2, 3].map((i) => [0, 1, 2, 3].map((j) => rows.reduce((s, r) => s + r[i] * r[j], 0)));
  const A = gram(hard.map(row));
  const M = gram(old.map(row));
  const ea = symEigen(A);
  const scale = Math.max(1, ea.values[3]);
  const N = ea.vectors.filter((_, i) => ea.values[i] <= 1e-12 * scale); // basis of { x : A x = 0 }
  if (N.length === 0) return { status: 'CONFLICT' };
  const k = N.length;
  // Reduced problem: minimise y'My y subject to y'By y = 1, with B selecting the normal part (|n| = 1).
  const My = N.map((a) => N.map((b) => dot(a, mul4(M, b))));
  const By = N.map((a) => N.map((b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  /** @type {number[]} */
  let y;
  let cost;
  if (k === 1) {
    if (By[0][0] < 1e-18) return { status: 'CONFLICT' };
    y = [1 / Math.sqrt(By[0][0])];
    cost = My[0][0] * y[0] * y[0];
  } else {
    const L = cholesky(By);
    if (!L) return { status: 'CONFLICT' };
    const Li = lowerInverse(L);
    const C = Li.map((r) => Li.map((s) => dot(r, My.map((mr) => dot(mr, s)))));
    const e = symEigen(C);
    if (e.values[1] - e.values[0] < 1e-9) return { status: 'UNDERCONSTRAINED' }; // objective does not fix the plane
    const u = e.vectors[0];
    y = N.map((_, i) => Li.reduce((s, r, j) => s + r[i] * u[j], 0)); // y = L^-T u
    cost = e.values[0];
  }
  const x = [0, 1, 2, 3].map((i) => N.reduce((s, v, j) => s + v[i] * y[j], 0));
  const len = Math.hypot(x[0], x[1], x[2]);
  let normal = /** @type {P3} */ ([x[0] / len, x[1] / len, x[2] / len]);
  let d = x[3] / len - dot(normal, c);
  if (dot(normal, oldPlane.normal) < 0) { normal = /** @type {P3} */ (normal.map((v) => -v)); d = -d; }
  return { status: 'OK', plane: { normal, d }, cost };
}

/** @param {number[][]} m @param {number[]} v */
const mul4 = (m, v) => m.map((r) => dot(r, v));

/** @param {number[][]} m SPD @returns {number[][] | null} lower L with m = L L' */
function cholesky(m) {
  const n = m.length;
  const L = m.map(() => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = m[i][j];
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      if (i === j) { if (s <= 1e-18) return null; L[i][i] = Math.sqrt(s); } else L[i][j] = s / L[j][j];
    }
  }
  return L;
}

/** @param {number[][]} L lower triangular @returns {number[][]} L^-1 */
function lowerInverse(L) {
  const n = L.length;
  const X = L.map(() => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    X[i][i] = 1 / L[i][i];
    for (let j = 0; j < i; j++) {
      let s = 0;
      for (let k = j; k < i; k++) s += L[i][k] * X[k][j];
      X[i][j] = -s / L[i][i];
    }
  }
  return X;
}

/**
 * Derive a vertex from its planes (spec §4 rule 2). Three or more independent planes: least-squares point and the
 * largest plane residual (a 4+ plane node with residual > topologySnapTolM is INCONSISTENT_JUNCTION, rule 5).
 * @param {Plane[]} planes
 * @returns {{ p: P3, residual: number } | null} null: fewer than three independent planes (rule 3, explicit position)
 */
export function derive(planes) {
  const r = lsqPoint(planes);
  if (!r) return null;
  let residual = 0;
  for (const pl of planes) residual = Math.max(residual, Math.abs(dist(pl, r.p)));
  return { p: r.p, residual };
}
