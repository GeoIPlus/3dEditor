// brep (3D-09): small 3D vector helpers. Pure, deterministic, allocation-light. Points are [x, y, z] in metres.

/** @typedef {[number, number, number]} P3 */

/** @param {ArrayLike<number>} a @param {ArrayLike<number>} b */
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** @param {P3} a @param {P3} b @returns {P3} */
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
/** @param {P3} a @param {P3} b @returns {P3} */
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
/** @param {P3} a @param {number} s @returns {P3} */
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
/** @param {P3} a @param {P3} b @returns {P3} */
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** @param {P3} a */
export const norm = (a) => Math.hypot(a[0], a[1], a[2]);
/** @param {P3} a @param {P3} b */
export const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Determinant of a 3x3 matrix given by rows. @param {number[][]} m */
export const det3 = (m) =>
  m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
  m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
  m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);

/**
 * Solve the 3x3 system A x = b by Cramer's rule.
 * @param {number[][]} A rows
 * @param {number[]} b
 * @returns {P3 | null} null when det(A) is exactly 0
 */
export function solve3(A, b) {
  const d = det3(A);
  if (d === 0) return null;
  /** @param {number} c */
  const col = (c) => A.map((row, i) => row.map((x, j) => (j === c ? b[i] : x)));
  return [det3(col(0)) / d, det3(col(1)) / d, det3(col(2)) / d];
}

/** Replace -0 by 0 so that serialisation is canonical (K-11). @param {number} x */
export const unsign0 = (x) => (x === 0 ? 0 : x);
