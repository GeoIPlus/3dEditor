// Service glue for the cloud functions (3D-22): a LOCAL-frame `PointSelection` (D-132) -> world box of the dataset
// -> points port -> LOCAL points for `fitPlane` / `deviationStats`. The kernel then applies the exact shape.
// Frame: the building's `CoordinateFrame` with a projected CRS (translation + `buildingAxisDeg` rotation, spec §4);
// a cloud in another CRS is 3D-69 (D-126).
import { localToWorld, worldToLocal } from '@geoiplus/geo-model3d';

/** @typedef {import('./ports/points.js').PointsPort} PointsPort */
/** @typedef {import('./ports/points.js').WorldBox} WorldBox */
/** @typedef {[number, number, number]} V3 */
/** @typedef {{ kind: 'BOX', min: V3, max: V3 } | { kind: 'POLYGON', ringXY: [number, number][], zMin: number, zMax: number }} PointSelection */

/**
 * Local axis-aligned bounds of a selection.
 * @param {PointSelection} sel
 * @returns {{ min: V3, max: V3 }}
 */
export function localBounds(sel) {
  if (sel.kind === 'BOX') return { min: sel.min, max: sel.max };
  const xs = sel.ringXY.map((p) => p[0]);
  const ys = sel.ringXY.map((p) => p[1]);
  return { min: [Math.min(...xs), Math.min(...ys), sel.zMin], max: [Math.max(...xs), Math.max(...ys), sel.zMax] };
}

/**
 * World box covering the selection: the eight local corners mapped to world, then their bounds (the local frame is
 * rotated about Z, so the world box can be larger than the selection; the kernel filters exactly).
 * @param {import('@geoiplus/geo-model3d').CoordinateFrame} frame
 * @param {PointSelection} sel
 * @returns {WorldBox}
 */
export function worldBoxOf(frame, sel) {
  const { min, max } = localBounds(sel);
  /** @type {V3[]} */
  const corners = [];
  for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) corners.push([x, y, z]);
  const w = localToWorld(frame, corners);
  const lo = /** @type {V3} */ ([0, 1, 2].map((k) => Math.min(...w.map((p) => p[k]))));
  const hi = /** @type {V3} */ ([0, 1, 2].map((k) => Math.max(...w.map((p) => p[k]))));
  return { min: lo, max: hi };
}

/**
 * Points of the selection's world box, in the building's LOCAL frame.
 * @param {PointsPort} port @param {import('@geoiplus/geo-model3d').CoordinateFrame} frame @param {PointSelection} sel
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<Float64Array>}
 */
export async function readLocalPoints(port, frame, sel, options) {
  const world = await port.queryBox(worldBoxOf(frame, sel), options);
  /** @type {V3[]} */
  const list = [];
  for (let i = 0; i < world.length; i += 3) list.push([world[i], world[i + 1], world[i + 2]]);
  return Float64Array.from(worldToLocal(frame, list).flat());
}
