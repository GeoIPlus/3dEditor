// cloud (3D-22): faces as planar polygons for the heatmap. A point's distance to a face is its 3D distance to the face
// polygon (outer ring minus holes) on the face's support plane (D-3D22-6).
import { buildIndex, faceRings, signedDistance } from '../brep/index.js';
import { insideRing } from './points.js';

/** @typedef {import('../brep/types.js').BuildingModel} BuildingModel */
/** @typedef {import('./points.js').P3} P3 */
/**
 * @typedef {object} FacePolygon
 * @property {string} id
 * @property {{ normal: P3, d: number }} plane support plane (authoritative, spec §4 rule 1)
 * @property {P3[][]} rings vertex positions, outer ring first
 * @property {[number, number][][]} rings2 the rings projected by dropping `axis`
 * @property {0 | 1 | 2} axis coordinate with the largest normal component
 * @property {P3} lo bounding box of the rings
 * @property {P3} hi
 */

/** @param {P3} n @returns {0 | 1 | 2} */
function dominantAxis(n) {
  const a = n.map(Math.abs);
  return a[2] >= a[0] && a[2] >= a[1] ? 2 : a[1] >= a[0] ? 1 : 0;
}

/** @param {P3} p @param {0 | 1 | 2} axis @returns {[number, number]} */
const drop = (p, axis) => (axis === 2 ? [p[0], p[1]] : axis === 1 ? [p[0], p[2]] : [p[1], p[2]]);

/**
 * Polygons of all faces of the model, sorted by face id (fixed tie order).
 * @param {BuildingModel} model
 * @returns {FacePolygon[]}
 */
export function facePolygons(model) {
  const index = buildIndex(model);
  return Object.keys(model.faces).sort().map((id) => {
    const face = model.faces[id];
    const rings = faceRings(model, index, id).map((r) => r.map((v) => /** @type {P3} */ (model.vertices[v].p)));
    const axis = dominantAxis(face.supportPlane.normal);
    const all = rings.flat();
    const lo = /** @type {P3} */ ([0, 1, 2].map((k) => Math.min(...all.map((p) => p[k]))));
    const hi = /** @type {P3} */ ([0, 1, 2].map((k) => Math.max(...all.map((p) => p[k]))));
    return { id, plane: face.supportPlane, rings, rings2: rings.map((r) => r.map((p) => drop(p, axis))), axis, lo, hi };
  });
}

/**
 * Distance from p to the segment a-b.
 * @param {P3} p @param {P3} a @param {P3} b
 */
function segmentDistance(p, a, b) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const len2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / len2));
  return Math.hypot(ap[0] - t * ab[0], ap[1] - t * ab[1], ap[2] - t * ab[2]);
}

/**
 * True when p lies farther than `buffer` outside the face's bounding box (cheap rejection).
 * @param {FacePolygon} f @param {P3} p @param {number} buffer
 */
export const outsideBox = (f, p, buffer) =>
  p[0] < f.lo[0] - buffer || p[0] > f.hi[0] + buffer || p[1] < f.lo[1] - buffer || p[1] > f.hi[1] + buffer ||
  p[2] < f.lo[2] - buffer || p[2] > f.hi[2] + buffer;

/**
 * 3D distance from p to the face polygon: |plane distance| when the foot point is inside the outer ring and outside
 * every hole, else the distance to the nearest ring edge.
 * @param {FacePolygon} f @param {P3} p
 */
export function polygonDistance(f, p) {
  const s = signedDistance(f.plane, p);
  const n = f.plane.normal;
  const [u, v] = drop([p[0] - s * n[0], p[1] - s * n[1], p[2] - s * n[2]], f.axis);
  const [outer, ...holes] = f.rings2;
  if (insideRing(outer, u, v) && !holes.some((h) => insideRing(h, u, v))) return Math.abs(s);
  let best = Infinity;
  for (const ring of f.rings) {
    for (let i = 0; i < ring.length; i++) best = Math.min(best, segmentDistance(p, ring[i], ring[(i + 1) % ring.length]));
  }
  return best;
}
