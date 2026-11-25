// 3D-08 spike (throwaway, server-only, P4): small dense linear algebra for the plane solve. Pure, deterministic.

/** @typedef {[number, number, number]} P3 */

/** @param {number[]} a @param {number[]} b */
export const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
/** @param {P3} a @param {P3} b @returns {P3} */
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
/** @param {P3} a @param {P3} b @returns {P3} */
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** @param {number[]} a */
export const norm = (a) => Math.sqrt(dot(a, a));

/**
 * Eigen-decomposition of a symmetric matrix by cyclic Jacobi rotations (n <= 4 here).
 * @param {number[][]} m symmetric, not modified
 * @returns {{ values: number[], vectors: number[][] }} ascending values; vectors[k] is the k-th unit eigenvector
 */
export function symEigen(m) {
  const n = m.length;
  const a = m.map((r) => r.slice());
  /** @type {number[][]} */
  const v = a.map((_, i) => a.map((__, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 64; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p][q] * a[p][q];
    if (off < 1e-30) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-300) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1); const s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k][p]; const akq = a[k][q];
          a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p][k]; const aqk = a[q][k];
          a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k][p]; const vkq = v[k][q];
          v[k][p] = c * vkp - s * vkq; v[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }
  const order = a.map((_, i) => i).sort((i, j) => a[i][i] - a[j][j]);
  return { values: order.map((i) => a[i][i]), vectors: order.map((i) => v.map((row) => row[i])) };
}

/**
 * Least-squares point of planes n·p + d = 0 (normal equations, 3x3 by Cramer's rule).
 * @param {{ normal: P3, d: number }[]} planes
 * @returns {{ p: P3, det: number } | null} null when the normals span fewer than 3 dimensions
 */
export function lsqPoint(planes) {
  const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; const b = [0, 0, 0];
  for (const { normal: n, d } of planes) {
    for (let i = 0; i < 3; i++) { b[i] -= n[i] * d; for (let j = 0; j < 3; j++) A[i][j] += n[i] * n[j]; }
  }
  const det = A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) - A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0])
    + A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);
  // Normals are unit vectors, so det is the squared volume spanned by them: scale-free rank test [A].
  if (Math.abs(det) < 1e-12) return null;
  /** @param {number} c */
  const col = (c) => A.map((row, i) => row.map((x, j) => (j === c ? b[i] : x)));
  /** @param {number[][]} M */
  const d3 = (M) => M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0])
    + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
  return { p: [d3(col(0)) / det, d3(col(1)) / det, d3(col(2)) / det], det };
}
