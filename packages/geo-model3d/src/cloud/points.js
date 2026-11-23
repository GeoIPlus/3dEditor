// cloud (3D-22): point arrays and the operator's selection. Points arrive as one Float64Array, x y z interleaved, in
// the LOCAL frame of the building, from the source double-precision data (spec §9 API and rule 7). The service reads
// them from the points port by the selection's bounding box; this filter applies the exact shape (D-3D22-3).

/** @typedef {[number, number, number]} P3 */
/**
 * Contract `PointSelection` (common.schema.json).
 * @typedef {{ kind: 'BOX', min: P3, max: P3 } | { kind: 'POLYGON', ringXY: [number, number][], zMin: number, zMax: number }} PointSelection
 */

/** @param {Float64Array} pts */
export const pointCount = (pts) => Math.floor(pts.length / 3);

/** @param {Float64Array} pts @param {number} i @returns {P3} */
export const pointAt = (pts, i) => [pts[3 * i], pts[3 * i + 1], pts[3 * i + 2]];

/**
 * A reason the selection cannot be used, or null. BOX needs min <= max on every axis; POLYGON zMin <= zMax.
 * @param {PointSelection} sel
 * @returns {string | null}
 */
export function selectionProblem(sel) {
  if (sel.kind === 'BOX') {
    return [0, 1, 2].every((k) => sel.min[k] <= sel.max[k]) ? null : 'BOX min exceeds max on an axis';
  }
  if (sel.kind === 'POLYGON') return sel.zMin <= sel.zMax ? null : 'POLYGON zMin exceeds zMax';
  return 'unknown selection kind';
}

/**
 * Even-odd test of a plan point against a ring (implicit closing segment). [A] A point exactly on the boundary
 * follows the crossing rule (half-open edges), as the sources do not say.
 * @param {[number, number][]} ring @param {number} x @param {number} y
 */
export function insideRing(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Points inside the selection, in input order. Box bounds are inclusive.
 * @param {Float64Array} pts @param {PointSelection} sel
 * @returns {Float64Array}
 */
export function selectPoints(pts, sel) {
  const n = pointCount(pts);
  const keep = new Float64Array(3 * n);
  let m = 0;
  for (let i = 0; i < n; i++) {
    const x = pts[3 * i];
    const y = pts[3 * i + 1];
    const z = pts[3 * i + 2];
    const ok = sel.kind === 'BOX'
      ? x >= sel.min[0] && x <= sel.max[0] && y >= sel.min[1] && y <= sel.max[1] && z >= sel.min[2] && z <= sel.max[2]
      : z >= sel.zMin && z <= sel.zMax && insideRing(sel.ringXY, x, y);
    if (ok) {
      keep[3 * m] = x;
      keep[3 * m + 1] = y;
      keep[3 * m + 2] = z;
      m++;
    }
  }
  return keep.slice(0, 3 * m);
}

/**
 * Error contract value for a selection or point array the kernel cannot use.
 * @param {string} message
 */
export const invalidPayload = (message) => ({ code: 'INVALID_PAYLOAD', httpStatus: 400, messageKey: 'model3d.error.invalidPayload', message });
