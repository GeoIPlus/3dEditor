// Box of the cloud world that contains a LOCAL box (3D-69): bounds of the mapped corners, grown first when the
// mapping bends straight lines (earth curvature of a local ENU frame, projection scale between two CRSs).
/** @typedef {[number, number, number]} P3 */

/**
 * Lower bound of the radius of curvature of every ellipsoid in the CRS table, metres: the smallest b^2/a there is
 * 6 334 577 m (EPSG:7051, checked 2026-11-24); rounded down, so the pad below is never too small.
 */
export const MIN_RADIUS_M = 6.3e6;

/**
 * Rigid mapping (translation plus rotation): the bounds of the eight mapped corners (the 3D-22 path). Otherwise the
 * local box is first grown on every side by d^2 / (2 * MIN_RADIUS_M), d = the largest horizontal distance of a corner
 * from the frame origin: the drop of the ellipsoid below the tangent plane over d, which bounds the bend.
 * @param {(l: P3) => P3} toCloud LOCAL -> cloud world
 * @param {boolean} rigid
 * @param {{ min: P3, max: P3 }} box local, min <= max
 * @returns {{ min: P3, max: P3 }} cloud world
 */
export function mappedBoxBounds(toCloud, rigid, box) {
  let { min, max } = box;
  if (!rigid) {
    const d = Math.max(...[min[0], max[0]].flatMap((x) => [min[1], max[1]].map((y) => Math.hypot(x, y))));
    const pad = (d * d) / (2 * MIN_RADIUS_M);
    min = [min[0] - pad, min[1] - pad, min[2] - pad];
    max = [max[0] + pad, max[1] + pad, max[2] + pad];
  }
  /** @type {P3[]} */
  const w = [];
  for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) w.push(toCloud([x, y, z]));
  const lo = /** @type {P3} */ ([0, 1, 2].map((k) => Math.min(...w.map((p) => p[k]))));
  const hi = /** @type {P3} */ ([0, 1, 2].map((k) => Math.max(...w.map((p) => p[k]))));
  return { min: lo, max: hi };
}
