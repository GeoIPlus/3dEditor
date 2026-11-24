// Point cloud <-> building LOCAL frame when the cloud has its own horizontal CRS (3D-69, D-164, D-3D69-1..3).
// Root file of the package (may import every module, tools/check-arch DAG): composes `crs` (CRS mapping and the
// building's metric frame, as import builds it, 3D-10) with `brep` (the `buildingAxisDeg` rotation, D-116).
import { createCrsMapping, createMetricFrame } from './crs/index.js';
import { localFrame } from './brep/index.js';

/** @typedef {[number, number, number]} V3 */
/** @typedef {import('./brep/frame.js').CoordinateFrame} CoordinateFrame */

/**
 * Converter between the cloud's world (its CRS, its axis order) and the building's LOCAL frame. The building side is
 * exactly the import mapping: `createMetricFrame(horizontalCrs, originWorld)` (translation for a projected CRS, local
 * ENU for a geographic one) plus the rotation. Same horizontal CRS -> no reprojection (`identity` true).
 * @param {CoordinateFrame} frame contract `CoordinateFrame` of the building
 * @param {string} cloudCrs horizontal CRS of the cloud from the dataset descriptor (D-3D69-1), `EPSG:nnnn` or OGC URL
 * @returns {{ identity: boolean, toLocal: (p: V3) => V3, toCloud: (l: V3) => V3 }}
 * @throws {import('./crs/registry.js').CrsError} INVALID_CRS: unknown CRS, datum mismatch, no verified projection
 */
export function createCloudFrame(frame, cloudCrs) {
  const map = createCrsMapping(cloudCrs, frame.horizontalCrs);
  const lf = localFrame(frame, createMetricFrame(frame.horizontalCrs, frame.originWorld));
  if (map.identity) return { identity: true, toLocal: lf.toLocal, toCloud: lf.toWorld };
  return { identity: false, toLocal: (p) => lf.toLocal(map.forward(p)), toCloud: (l) => map.inverse(lf.toWorld(l)) };
}
