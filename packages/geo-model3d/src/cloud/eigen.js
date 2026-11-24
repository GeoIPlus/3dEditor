// cloud (3D-22): eigen decomposition of a symmetric 3x3 matrix by cyclic Jacobi rotations. The least-squares plane of
// centred points is the right singular vector of the smallest singular value of the point matrix, i.e. the eigenvector
// of the smallest eigenvalue of its scatter matrix (the "SVD refinement" of v0.3 §7, spec §9 rule 1).

/** @typedef {[number, number, number]} P3 */
/** @typedef {[[number, number, number], [number, number, number], [number, number, number]]} M3 */

const MAX_SWEEPS = 50;

/**
 * @param {M3} m symmetric; not modified
 * @returns {{ values: P3, vectors: [P3, P3, P3] }} eigenvalues ascending, unit eigenvectors in the same order
 */
export function symmetricEigen3(m) {
  /** @type {number[][]} */
  const a = m.map((r) => r.slice());
  /** @type {number[][]} */
  const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < MAX_SWEEPS; sweep++) {
    const off = a[0][1] * a[0][1] + a[0][2] * a[0][2] + a[1][2] * a[1][2];
    const diag = a[0][0] * a[0][0] + a[1][1] * a[1][1] + a[2][2] * a[2][2];
    if (off === 0 || off <= diag * 1e-30) break;
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) rotate(a, v, p, q);
  }
  const order = [0, 1, 2].sort((i, j) => a[i][i] - a[j][j] || i - j);
  return {
    values: /** @type {P3} */ (order.map((i) => a[i][i])),
    vectors: /** @type {[P3, P3, P3]} */ (order.map((i) => /** @type {P3} */ ([v[0][i], v[1][i], v[2][i]]))),
  };
}

/**
 * One Jacobi rotation that zeroes a[p][q] (Golub and Van Loan, Algorithm 8.5.1, symmetric Schur).
 * @param {number[][]} a @param {number[][]} v @param {number} p @param {number} q
 */
function rotate(a, v, p, q) {
  if (a[p][q] === 0) return;
  const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
  const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
  const c = 1 / Math.sqrt(t * t + 1);
  const s = t * c;
  for (let k = 0; k < 3; k++) {
    const akp = a[k][p];
    const akq = a[k][q];
    a[k][p] = c * akp - s * akq;
    a[k][q] = s * akp + c * akq;
  }
  for (let k = 0; k < 3; k++) {
    const apk = a[p][k];
    const aqk = a[q][k];
    a[p][k] = c * apk - s * aqk;
    a[q][k] = s * apk + c * aqk;
  }
  for (let k = 0; k < 3; k++) {
    const vkp = v[k][p];
    const vkq = v[k][q];
    v[k][p] = c * vkp - s * vkq;
    v[k][q] = s * vkp + c * vkq;
  }
}
