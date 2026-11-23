// validate (3D-12): planar polygon helpers in the local metric frame - Newell normals, areas, projection to 2D,
// tolerance-based segment and point predicates (D-3D12-3: no exact-predicate library; every test compares with a
// tolerance from the profile).
import { add, cross, dot, sub, norm, scale } from '../brep/index.js';

/** @typedef {[number, number, number]} P3 */
/** @typedef {[number, number]} P2 */

/**
 * Newell vector of a closed ring: direction = ring normal by the right-hand rule, length = 2 x area.
 * @param {P3[]} ring
 * @returns {P3}
 */
export function newell(ring) {
  /** @type {P3} */
  let n = [0, 0, 0];
  for (let i = 0; i < ring.length; i++) n = /** @type {P3} */ (add(n, cross(ring[i], ring[(i + 1) % ring.length])));
  return n;
}

/**
 * Area of a face: outer ring minus inner rings, measured in the plane of `normal`.
 * @param {P3[][]} rings outer first
 * @param {P3} normal unit
 * @returns {number} m2
 */
export function faceArea(rings, normal) {
  let a = 0;
  rings.forEach((r, i) => {
    const s = Math.abs(dot(newell(r), normal)) / 2;
    a += i === 0 ? s : -s;
  });
  return a;
}

/**
 * Orthonormal 2D basis of a plane (u, v, n right-handed): 2D orientation equals orientation seen from the side `n`
 * points to.
 * @param {P3} n unit normal
 * @returns {{ u: P3, v: P3 }}
 */
export function planeBasis(n) {
  /** @type {P3} */
  const helper = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u0 = cross(helper, n);
  const u = /** @type {P3} */ (scale(u0, 1 / norm(u0)));
  const v = /** @type {P3} */ (cross(n, u));
  return { u, v };
}

/**
 * @param {P3[]} pts @param {{ u: P3, v: P3 }} basis @param {P3} origin
 * @returns {P2[]}
 */
export const to2d = (pts, basis, origin) => pts.map((p) => {
  const d = sub(p, origin);
  return /** @type {P2} */ ([dot(d, basis.u), dot(d, basis.v)]);
});

/** @param {P2} a @param {P2} b @param {P2} c @returns {number} twice the signed area of abc */
export const orient2 = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

/** @param {P2} p @param {P2} a @param {P2} b @returns {number} distance of p to segment ab */
export function distToSegment2(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/**
 * Do segments ab and cd meet (cross or touch within `tol`)?
 * @param {P2} a @param {P2} b @param {P2} c @param {P2} d @param {number} tol metres
 * @returns {boolean}
 */
export function segmentsMeet(a, b, c, d, tol) {
  const d1 = orient2(c, d, a);
  const d2 = orient2(c, d, b);
  const d3 = orient2(a, b, c);
  const d4 = orient2(a, b, d);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  return distToSegment2(a, c, d) <= tol || distToSegment2(b, c, d) <= tol
    || distToSegment2(c, a, b) <= tol || distToSegment2(d, a, b) <= tol;
}

/**
 * Even-odd point-in-ring test.
 * @param {P2} p @param {P2[]} ring
 * @returns {boolean}
 */
export function inRing(p, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

/**
 * Is `p` strictly inside the polygon (outer minus holes), farther than `tol` from every boundary edge?
 * @param {P2} p @param {P2[][]} rings outer first @param {number} tol
 * @returns {boolean}
 */
export function strictlyInside(p, rings, tol) {
  for (const r of rings) {
    for (let i = 0; i < r.length; i++) if (distToSegment2(p, r[i], r[(i + 1) % r.length]) <= tol) return false;
  }
  if (!inRing(p, rings[0])) return false;
  return !rings.slice(1).some((h) => inRing(p, h));
}

/** @param {P3[]} pts @returns {{ min: P3, max: P3 }} */
export function bbox(pts) {
  /** @type {P3} */
  const min = [Infinity, Infinity, Infinity];
  /** @type {P3} */
  const max = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) {
    for (let k = 0; k < 3; k++) {
      if (p[k] < min[k]) min[k] = p[k];
      if (p[k] > max[k]) max[k] = p[k];
    }
  }
  return { min, max };
}

/** @param {{ min: P3, max: P3 }} a @param {{ min: P3, max: P3 }} b @param {number} tol @returns {boolean} */
export const boxesOverlap = (a, b, tol) => [0, 1, 2].every((k) => a.min[k] <= b.max[k] + tol && b.min[k] <= a.max[k] + tol);
