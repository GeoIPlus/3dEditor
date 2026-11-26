// metrics (3D-116): signed volumes by the divergence theorem (D-3D116-1): sum over the rings of
// dot(r0 - c, newell(r - c)) / 6 with every point taken relative to `c`. No absolute value: an outer shell with a
// negative volume or a void shell with a positive one is an orientation fault, not a number to fix (D-3D116-2).
// Kept apart from validate/geometry.js `signedVolume`, which sums in model coordinates: here every sum runs in the
// body's local reference origin (and, for an overhang group, about a point of its closing plane, D-3D116-3).
import { dot, sub } from '../brep/index.js';
import { newell } from '../validate/polygon.js';

/** @typedef {import('./body.js').Body} Body */
/** @typedef {[number, number, number]} P3 */

/**
 * Signed volume enclosed by the faces (outward rings positive), every point taken relative to `c`.
 * @param {Body} body @param {Iterable<string>} faces @param {P3} [c] in the body's origin
 * @returns {number} m3
 */
export function signedVolume(body, faces, c = [0, 0, 0]) {
  let v = 0;
  for (const f of faces) for (const ring of body.rings(f)) {
    if (ring.length < 3) continue;
    const r = ring.map((p) => /** @type {P3} */ (sub(p, c)));
    v += dot(r[0], newell(r)) / 6;
  }
  return v;
}

/**
 * Total volume of the main body: each solid's outer shell (> 0) plus its void shells (< 0, inward rings).
 * @param {Body} body
 * @returns {number | null} m3; null when a shell has the wrong sign, the result is not finite or not > 0
 */
export function totalVolume(body) {
  if (!body.solidIds.length || body.missing) return null;
  let total = 0;
  for (const s of body.solidIds) {
    const so = body.model.solids[s];
    for (const sh of [so.outerShellId, ...(so.voidShellIds ?? [])]) {
      const v = signedVolume(body, body.model.shells[sh].faceIds);
      const outer = sh === so.outerShellId;
      if (!Number.isFinite(v) || (outer ? !(v > 0) : !(v < 0))) return null;
      total += v;
    }
  }
  return Number.isFinite(total) && total > 0 ? total : null;
}
