// solve (3D-13): small dense linear algebra for the plane solver (3D-ADR-0005). Pure, deterministic, no allocation
// beyond the result. Matrices are arrays of rows; sizes are a few planes x 3-4 parameters.

/** @param {ArrayLike<number>} a @param {ArrayLike<number>} b */
export const dotN = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

/** @param {number[][]} m @param {number[]} v */
export const matVec = (m, v) => m.map((r) => dotN(r, v));

/** Gram matrix MᵀM of the rows of `m` (n columns). @param {number[][]} rows @param {number} n */
export function gram(rows, n) {
  const g = Array.from({ length: n }, () => new Array(n).fill(0));
  for (const r of rows) for (let i = 0; i < n; i++) if (r[i] !== 0) for (let j = 0; j < n; j++) g[i][j] += r[i] * r[j];
  return g;
}

/** Mᵀv for rows `m` with `n` columns. @param {number[][]} m @param {number[]} v @param {number} n */
export function matTVec(m, v, n) {
  const out = new Array(n).fill(0);
  for (let k = 0; k < m.length; k++) for (let i = 0; i < n; i++) out[i] += m[k][i] * v[k];
  return out;
}

/**
 * Eigen-decomposition of a symmetric matrix by cyclic Jacobi rotations (port of the 3D-08 spike, sizes up to ~40).
 * @param {number[][]} m symmetric, not modified
 * @returns {{ values: number[], vectors: number[][] }} ascending values; `vectors[k]` is the k-th unit eigenvector
 */
export function symEigen(m) {
  const n = m.length;
  const a = m.map((r) => r.slice());
  /** @type {number[][]} */
  const v = a.map((_, i) => a.map((__, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    let diag = 0;
    for (let p = 0; p < n; p++) {
      diag += a[p][p] * a[p][p];
      for (let q = p + 1; q < n; q++) off += a[p][q] * a[p][q];
    }
    if (off <= 1e-32 * Math.max(diag, 1e-300) || off < 1e-300) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-300) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k][p];
          const akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p][k];
          const aqk = a[q][k];
          a[p][k] = c * apk - s * aqk;
          a[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k][p];
          const vkq = v[k][q];
          v[k][p] = c * vkp - s * vkq;
          v[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }
  const order = a.map((_, i) => i).sort((i, j) => a[i][i] - a[j][j] || i - j);
  return { values: order.map((i) => a[i][i]), vectors: order.map((i) => v.map((row) => row[i])) };
}

/** @param {number[][]} m SPD @returns {number[][] | null} lower L with m = L Lᵀ, null when not positive definite */
export function cholesky(m) {
  const n = m.length;
  const L = m.map(() => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = m[i][j];
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      if (i === j) {
        if (!(s > 1e-18)) return null;
        L[i][i] = Math.sqrt(s);
      } else L[i][j] = s / L[j][j];
    }
  }
  return L;
}

/** @param {number[][]} L lower triangular, non-singular @returns {number[][]} L⁻¹ */
export function lowerInverse(L) {
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
 * Split of the parameter space by a (hard-constraint) Jacobian: the range part pseudo-inverts `H`, the null space is the
 * set of steps that keep the linearised hard constraints. Rank by eigenvalues of HᵀH relative to the largest one.
 * @param {number[][]} H rows = conditions, `n` columns
 * @param {number} n
 * @param {number} relTol eigenvalue threshold relative to max(1, largest eigenvalue)
 * @returns {{ range: { v: number[], value: number }[], nullBasis: number[][] }}
 */
export function splitRange(H, n, relTol) {
  if (H.length === 0) return { range: [], nullBasis: Array.from({ length: n }, (_, i) => unit(n, i)) };
  const e = symEigen(gram(H, n));
  const cut = relTol * Math.max(1, e.values[n - 1]);
  /** @type {{ v: number[], value: number }[]} */
  const range = [];
  /** @type {number[][]} */
  const nullBasis = [];
  e.values.forEach((value, i) => (value > cut ? range.push({ v: e.vectors[i], value }) : nullBasis.push(e.vectors[i])));
  return { range, nullBasis };
}

/** @param {number} n @param {number} i */
export const unit = (n, i) => Array.from({ length: n }, (_, j) => (j === i ? 1 : 0));

/**
 * Solve the symmetric positive (semi-)definite system A y = b by its eigen-decomposition; components along eigenvalues
 * at or below `floor` are dropped (minimum-norm solution).
 * @param {number[][]} A @param {number[]} b @param {number} floor
 */
export function solveSym(A, b, floor) {
  const e = symEigen(A);
  const y = new Array(b.length).fill(0);
  e.values.forEach((value, k) => {
    if (!(value > floor)) return;
    const c = dotN(e.vectors[k], b) / value;
    for (let i = 0; i < y.length; i++) y[i] += c * e.vectors[k][i];
  });
  return y;
}
