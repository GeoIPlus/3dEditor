// Service glue for the cloud functions (3D-22, 3D-69): a LOCAL-frame `PointSelection` (D-132) -> box of the cloud's
// world -> points port -> LOCAL points for `fitPlane` / `deviationStats`. The kernel then applies the exact shape.
// The cloud's horizontal CRS comes from the dataset descriptor, never from the file (D-165, D-196); the kernel
// reprojects when it differs from the building's CRS (same datum only, D-197).
import { cloudToLocal, localBoxToCloud } from '@geoiplus/geo-model3d';

/** @typedef {import('./ports/points.js').PointsPort} PointsPort */
/** @typedef {import('./ports/points.js').WorldBox} WorldBox */
/** @typedef {[number, number, number]} V3 */
/** @typedef {{ kind: 'BOX', min: V3, max: V3 } | { kind: 'POLYGON', ringXY: [number, number][], zMin: number, zMax: number }} PointSelection */
/**
 * One opened point dataset (D-196): the port and the dataset's horizontal CRS, set by the host from the CP 3DQM
 * extension `dataset` member (SC 3D-43) or from the CRS the user set when opening the dataset.
 * @typedef {{ port: PointsPort, horizontalCrs: string }} PointsDataset
 */

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
 * Box of the dataset's world covering the selection (the local frame is rotated about Z and, for another CRS or a
 * geographic building, bent; the box can be larger than the selection; the kernel filters exactly).
 * @param {import('@geoiplus/geo-model3d').CoordinateFrame} frame
 * @param {string} cloudCrs horizontal CRS of the dataset
 * @param {PointSelection} sel
 * @returns {WorldBox}
 */
export const worldBoxOf = (frame, cloudCrs, sel) => localBoxToCloud(frame, cloudCrs, localBounds(sel));

/**
 * Points of the selection's box, in the building's LOCAL frame.
 * @param {PointsDataset} dataset @param {import('@geoiplus/geo-model3d').CoordinateFrame} frame @param {PointSelection} sel
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<Float64Array>}
 */
export async function readLocalPoints(dataset, frame, sel, options) {
  const world = await dataset.port.queryBox(worldBoxOf(frame, dataset.horizontalCrs, sel), options);
  /** @type {V3[]} */
  const list = [];
  for (let i = 0; i < world.length; i += 3) list.push([world[i], world[i + 1], world[i + 2]]);
  return Float64Array.from(cloudToLocal(frame, dataset.horizontalCrs, list).flat());
}

/** @param {unknown} v */
const finite3 = (v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);

/**
 * Points a command needs from the cloud (3D-71): for `FIT_PLANE` the points of its payload `selection`, read through
 * the dataset's port and mapped to the building's LOCAL frame, for `executeCommand(model, command, { points })`;
 * `undefined` for every other operation. A selection without finite bounds reads nothing (empty array): the kernel
 * then refuses the payload (`INVALID_PAYLOAD`, D-132). Port and CRS failures reject (mapping: 3D-23).
 * @param {PointsDataset} dataset @param {{ frame: import('@geoiplus/geo-model3d').CoordinateFrame }} model
 * @param {{ operation: string, payload?: any }} command contract `command`
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<Float64Array | undefined>}
 */
export async function commandPoints(dataset, model, command, options) {
  if (command.operation !== 'FIT_PLANE') return undefined;
  const sel = command.payload?.selection;
  const box = sel?.kind === 'BOX' || sel?.kind === 'POLYGON' ? safeBounds(sel) : null;
  if (!box || !finite3(box.min) || !finite3(box.max)) return new Float64Array(0);
  return readLocalPoints(dataset, model.frame, sel, options);
}

/** @param {any} sel @returns {{ min: V3, max: V3 } | null} */
function safeBounds(sel) {
  if (sel.kind === 'POLYGON' && (!Array.isArray(sel.ringXY) || sel.ringXY.length < 3 || !sel.ringXY.every(Array.isArray))) return null;
  return localBounds(sel);
}
