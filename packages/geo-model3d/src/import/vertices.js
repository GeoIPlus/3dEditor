// import (3D-10): file vertices -> local metric frame, then welding (spec §6 rules 2, 3, 16). Positions stay the file
// positions (D-70): a welded group takes the position of its smallest file index, nothing is averaged or snapped to a
// plane. The metric mapping comes from `crs` (3D-32), the rotation from `brep` (D-116).
import { createMetricFrame, boxCentre, decodeVertex } from '../crs/index.js';
import { localFrame, distance } from '../brep/index.js';

/** @typedef {[number, number, number]} P3 */
/** @typedef {import('../brep/frame.js').CoordinateFrame} CoordinateFrame */
/** @typedef {import('../crs/frame.js').MetricFrame} MetricFrame */

const IDENTITY = { scale: [1, 1, 1], translate: [0, 0, 0] };

/**
 * @typedef {object} ImportVertices
 * @property {CoordinateFrame} frame contract `CoordinateFrame` of the model
 * @property {MetricFrame} metric the `crs` mapping (export reuses the same origin)
 * @property {Map<number, number>} repOf file index -> file index of its welded group's representative
 * @property {Map<number, number[]>} members representative -> sorted file indices of its group
 * @property {Map<number, P3>} local representative -> local position, metres
 */

/**
 * @param {any} doc CityJSON document
 * @param {Set<number>} used file vertex indices referenced by the imported geometry
 * @param {number} snapTol `topologySnapTolM`
 * @returns {ImportVertices}
 */
export function importVertices(doc, used, snapTol) {
  const t = doc.transform ?? IDENTITY;
  const order = [...used].sort((a, b) => a - b);
  const world = order.map((i) => decodeVertex(doc.vertices[i], t));
  const metric = createMetricFrame(doc.metadata?.referenceSystem, boxCentre(world));
  /** @type {CoordinateFrame} */
  const frame = {
    horizontalCrs: metric.crs.horizontalCrs,
    // [A] D-93 keeps the vertical CRS; the CRS table resolves only the horizontal part, so it is not named here (TBD)
    verticalCrs: null,
    axisOrder: 'EAST_NORTH_UP',
    unit: 'm',
    originWorld: [...metric.originWorld],
    buildingAxisDeg: 0, // [A] no source picks a building axis at import; operations may set it later
  };
  const lf = localFrame(frame, metric);
  /** @type {Map<number, P3>} */
  const local = new Map();
  /** @type {Map<number, number>} */
  const repOf = new Map();
  /** @type {Map<number, number[]>} */
  const members = new Map();
  /** @type {Map<string, number[]>} grid cell -> representatives */
  const grid = new Map();
  const cell = snapTol > 0 ? snapTol : 1;
  /** @param {P3} p @returns {number[]} */
  const key = (p) => p.map((c) => Math.floor(c / cell));
  order.forEach((ix, k) => {
    const p = lf.toLocal(world[k]);
    const [cx, cy, cz] = key(p);
    let rep = -1;
    for (let dx = -1; dx <= 1 && rep < 0; dx++) for (let dy = -1; dy <= 1 && rep < 0; dy++) for (let dz = -1; dz <= 1 && rep < 0; dz++) {
      for (const r of grid.get(`${cx + dx},${cy + dy},${cz + dz}`) ?? []) {
        const q = /** @type {P3} */ (local.get(r));
        if (distance(p, q) <= snapTol && (rep < 0 || r < rep)) rep = r;
      }
    }
    if (rep < 0) {
      local.set(ix, p);
      members.set(ix, [ix]);
      repOf.set(ix, ix);
      const g = `${cx},${cy},${cz}`;
      grid.set(g, [...(grid.get(g) ?? []), ix]);
    } else {
      repOf.set(ix, rep);
      /** @type {number[]} */ (members.get(rep)).push(ix);
    }
  });
  return { frame, metric, repOf, members, local };
}
