// ops (3D-14): plan (2D) helpers for roof templates and the envelope: rings, segments, plane heights. Plain arithmetic,
// tolerance passed by the caller (D-150: tolerance predicates, no robust-predicates library).

/** @typedef {[number, number]} P2 */
/** @typedef {import('../brep/plane.js').Plane} Plane */

/** Twice the signed area (counter-clockwise > 0). @param {P2[]} ring */
export function signedArea2(ring) {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s;
}

/**
 * Ring without a closing duplicate, with the requested orientation.
 * @param {P2[]} ring @param {boolean} ccw
 * @returns {{ ring: P2[], reversed: boolean }}
 */
export function orient(ring, ccw) {
  let r = ring.map((p) => /** @type {P2} */ ([p[0], p[1]]));
  if (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) r = r.slice(0, -1);
  const reversed = (signedArea2(r) > 0) !== ccw;
  return { ring: reversed ? r.reverse() : r, reversed };
}

/** @param {P2} a @param {P2} b */
export const sub2 = (a, b) => /** @type {P2} */ ([a[0] - b[0], a[1] - b[1]]);
/** @param {P2} a @param {P2} b */
export const dot2 = (a, b) => a[0] * b[0] + a[1] * b[1];
/** @param {P2} a @param {P2} b */
export const cross2 = (a, b) => a[0] * b[1] - a[1] * b[0];
/** @param {P2} a */
export const len2 = (a) => Math.hypot(a[0], a[1]);
/** @param {P2} a @returns {P2} */
export const unit2 = (a) => { const l = len2(a); return [a[0] / l, a[1] / l]; };

/**
 * Parameter of `p` on segment a-b when it lies on it within `eps` (metres), else null.
 * @param {P2} p @param {P2} a @param {P2} b @param {number} eps
 * @returns {number | null}
 */
export function onSegment(p, a, b, eps) {
  const ab = sub2(b, a), l = len2(ab);
  if (l === 0) return null;
  const ap = sub2(p, a);
  if (Math.abs(cross2(ab, ap)) / l > eps) return null;
  const t = dot2(ab, ap) / (l * l);
  return t * l >= -eps && (t - 1) * l <= eps ? t : null;
}

/**
 * Height of a non-vertical plane over (x, y), or null for a (near) vertical plane.
 * @param {Plane} pl @param {number} x @param {number} y @param {number} eps
 */
export function zAt(pl, x, y, eps) {
  const n = pl.normal;
  if (Math.abs(n[2]) <= eps) return null;
  return -(n[0] * x + n[1] * y + pl.d) / n[2];
}

/**
 * Point where two non-vertical planes and a third condition meet in plan: solves z1 = z2 and z1 = z3.
 * @param {Plane} p1 @param {Plane} p2 @param {Plane} p3
 * @returns {P2 | null} null when the plan lines are parallel
 */
export function meet3(p1, p2, p3) {
  const c = (/** @type {Plane} */ p) => [-p.normal[0] / p.normal[2], -p.normal[1] / p.normal[2], -p.d / p.normal[2]];
  const [a1, b1, c1] = c(p1), [a2, b2, c2] = c(p2), [a3, b3, c3] = c(p3);
  const A = [[a1 - a2, b1 - b2], [a1 - a3, b1 - b3]], r = [c2 - c1, c3 - c1];
  const det = A[0][0] * A[1][1] - A[0][1] * A[1][0];
  if (det === 0 || !Number.isFinite(det)) return null;
  return [(r[0] * A[1][1] - A[0][1] * r[1]) / det, (A[0][0] * r[1] - r[0] * A[1][0]) / det];
}

/**
 * Point of segment a-b where two non-vertical planes have equal height.
 * @param {Plane} p1 @param {Plane} p2 @param {P2} a @param {P2} b
 * @returns {{ p: P2, t: number } | null}
 */
export function equalHeightOnSegment(p1, p2, a, b) {
  const f = (/** @type {P2} */ q) => (zAt(p1, q[0], q[1], 0) ?? NaN) - (zAt(p2, q[0], q[1], 0) ?? NaN);
  const fa = f(a), fb = f(b);
  if (!(fa !== fb) || !Number.isFinite(fa) || !Number.isFinite(fb)) return null;
  const t = fa / (fa - fb);
  return { p: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])], t };
}

/**
 * Non-vertical plane through the line of segment a-b at height z, rising with `tan` towards the unit plan direction
 * `inward` (perpendicular to a-b). Unit normal pointing up.
 * @param {P2} a @param {number} z @param {P2} inward @param {number} tan
 * @returns {Plane}
 */
export function eavePlane(a, z, inward, tan) {
  // z' = z + tan * inward . (p - a)  <=>  -tan*ix*x - tan*iy*y + z' + (tan * inward . a - z) = 0
  const n = [-tan * inward[0], -tan * inward[1], 1];
  const l = Math.hypot(n[0], n[1], n[2]);
  return { normal: [n[0] / l, n[1] / l, n[2] / l], d: (tan * dot2(inward, a) - z) / l };
}
