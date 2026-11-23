// Public API of @geoiplus/geo-model3d (server-only, P4; spec §3, 3D-ADR-0002 C1). Inputs and outputs are
// `contracts/model3d/` shapes only (C1 rule 3); internal structures of the modules never leave the package.
// Every entry in package.json "exports" must import ./canary.js (3D-ADR-0001); check:arch enforces it.
// Names of the entries later rows add are fixed in the module card (README.md "Public API"), 3D-09.
import './canary.js';
import { canonicalJson as canon, localFrame } from './brep/index.js';

export { P4_CANARY } from './canary.js';
export { validateModel } from './validate/index.js';

/** @typedef {import('./brep/frame.js').CoordinateFrame} CoordinateFrame */
/** @typedef {[number, number, number]} V3 */

/**
 * World -> local coordinates of a building (spec §1.2, §4; M-02). Projected CRS (translation by `originWorld`, then
 * the `buildingAxisDeg` rotation); geographic CRSs go through the `crs` module (3D-32) at import.
 * @param {CoordinateFrame} frame contract `CoordinateFrame`
 * @param {V3[]} points contract `V3`, world
 * @returns {V3[]} local
 */
export function worldToLocal(frame, points) {
  const lf = localFrame(frame);
  return points.map((p) => lf.toLocal(p));
}

/**
 * Local -> world coordinates (inverse of `worldToLocal`).
 * @param {CoordinateFrame} frame
 * @param {V3[]} points local
 * @returns {V3[]} world
 */
export function localToWorld(frame, points) {
  const lf = localFrame(frame);
  return points.map((p) => lf.toWorld(p));
}

/**
 * Canonical JSON of a contract value (model, patch, journal entry): sorted keys, no -0; the service stores versions
 * in this form so that `save -> load -> save` is byte-identical (spec §4 rule 10; K-11).
 * @param {unknown} value
 * @returns {string}
 */
export const canonicalJson = (value) => canon(value);
