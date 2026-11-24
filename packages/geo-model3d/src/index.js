// Public API of @geoiplus/geo-model3d (server-only, P4; spec §3, 3D-ADR-0002 C1). Inputs and outputs are
// `contracts/model3d/` shapes only (C1 rule 3); internal structures of the modules never leave the package.
// Every entry in package.json "exports" must import ./canary.js (3D-ADR-0001); check:arch enforces it.
// Names of the entries later rows add are fixed in the module card (README.md "Public API"), 3D-09.
import './canary.js';
import { canonicalJson as canon, localFrame } from './brep/index.js';
import { importCityObject } from './import/index.js';
import { createCrsMapping, createMetricFrame, mappedBoxBounds } from './crs/index.js';
import { exportModel } from './export/index.js';
import { runChecks, toIssues } from './validate/index.js';

export { P4_CANARY } from './canary.js';
export { validateModel } from './validate/index.js';
// Point cloud (3D-22, spec §9; names D-119): `fitPlane(points, selection, profile)`, `deviationStats(model, points,
// request, profile)`; points are a Float64Array, x y z interleaved, LOCAL frame. Both return `{ result }` or `{ error }`.
export { fitPlane, deviationStats } from './cloud/index.js';

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
 * Cloud world <-> building LOCAL (3D-69, D-196..D-198): `crs` maps the cloud's CRS to the building's and builds the
 * building's metric frame exactly as import does (3D-10); `brep` adds the `buildingAxisDeg` rotation (D-116). Composed
 * here because only the package entry may import both. `rigid`: same CRS and a projected building (the 3D-22 path).
 * @param {CoordinateFrame} frame @param {string} cloudCrs
 */
function cloudFrame(frame, cloudCrs) {
  const map = createCrsMapping(cloudCrs, frame.horizontalCrs);
  const metric = createMetricFrame(frame.horizontalCrs, frame.originWorld);
  const lf = localFrame(frame, metric);
  const rigid = map.identity && metric.crs.kind === 'PROJECTED';
  if (map.identity) return { rigid, toLocal: lf.toLocal, toCloud: lf.toWorld };
  return { rigid, toLocal: (/** @type {V3} */ p) => lf.toLocal(map.forward(p)), toCloud: (/** @type {V3} */ l) => map.inverse(lf.toWorld(l)) };
}

/**
 * Cloud world -> building LOCAL (3D-69): points in the cloud's own horizontal CRS (from the dataset descriptor,
 * D-196) are reprojected through geodetic coordinates on the shared datum into the building's local frame, built
 * as import builds it (projected: translation; geographic: local ENU). Same CRS: no reprojection. Heights unchanged
 * (D-93). Throws the `crs` error (`code` INVALID_CRS) for an unknown CRS, a datum mismatch (D-197) or a projected
 * CRS without a verified projection (D-198).
 * @param {CoordinateFrame} frame contract `CoordinateFrame`
 * @param {string} cloudCrs `EPSG:nnnn` or the CityJSON OGC URL
 * @param {V3[]} points cloud world, axis order of `cloudCrs`
 * @returns {V3[]} local
 */
export function cloudToLocal(frame, cloudCrs, points) {
  const cf = cloudFrame(frame, cloudCrs);
  return points.map((p) => cf.toLocal(p));
}

/**
 * Box of the cloud world (its CRS and axis order) that contains every point of a LOCAL box, for the points port's box
 * query (3D-69). Same CRS and a projected building: the bounds of the mapped corners, as before (3D-22); otherwise
 * grown by the earth-curvature bound of `crs/box.js`. The kernel then filters the exact selection (D-132).
 * @param {CoordinateFrame} frame
 * @param {string} cloudCrs
 * @param {{ min: V3, max: V3 }} box local
 * @returns {{ min: V3, max: V3 }}
 */
export function localBoxToCloud(frame, cloudCrs, box) {
  const cf = cloudFrame(frame, cloudCrs);
  return mappedBoxBounds(cf.toCloud, cf.rigid, box);
}

/**
 * Canonical JSON of a contract value (model, patch, journal entry): sorted keys, no -0; the service stores versions
 * in this form so that `save -> load -> save` is byte-identical (spec §4 rule 10; K-11).
 * @param {unknown} value
 * @returns {string}
 */
export const canonicalJson = (value) => canon(value);

/**
 * State and issues of an imported model from `validate` (spec §6 rule 10, §8 rule 8; D-157, 3D-75): the
 * COMMIT_VALIDATION checks of the whole model, synchronously - `runChecks` + `toIssues` are what `validateModel` runs
 * in that mode without the external port (D-183). No ERROR for VALID_SOLID -> VALID_SOLID; otherwise DRAFT_SOLID,
 * issues with the severities of the assigned state. Open shells = shells with SHELL_NOT_CLOSED.
 * @type {import('./import/index.js').AssessImport}
 */
function assessImport(model, tolerances) {
  const raw = runChecks(model, { mode: 'COMMIT_VALIDATION', tolerances: /** @type {any} */ (tolerances), fullSolid: true });
  const asValid = toIssues(raw, 'VALID_SOLID');
  const state = asValid.some((i) => i.severity === 'ERROR') ? 'DRAFT_SOLID' : 'VALID_SOLID';
  const issues = state === 'VALID_SOLID' ? asValid : toIssues(raw, state);
  const openShellIds = new Set(issues.filter((i) => i.code === 'SHELL_NOT_CLOSED').flatMap((i) => i.entityIds));
  return { state, issues, openShellIds };
}

/**
 * Import one CityJSON Building (with its BuildingPart / BuildingInstallation children) into the canonical model
 * (spec §6, I-01; 3D-10). Returns the model at version 0, the immutable baseline (an isolated copy, 3D-ADR-0003 S1)
 * and the contract `import-report`, whose `assignedState` and `issues` come from `validate` (3D-75). Refusals throw:
 * `ImportError` (`code` INVALID_PAYLOAD / NOT_FOUND / INVALID_GEOMETRY) or the `crs` error with `code` INVALID_CRS.
 * @param {import('./import/index.js').ImportInput} input
 * @returns {{ model: import('./brep/types.js').BuildingModel, baseline: import('./brep/types.js').BuildingModel,
 *   report: import('./import/index.js').ImportReport }} contract `building-model` x 2, `import-report`
 */
export const importBuilding = (input) => importCityObject(input, assessImport);

/**
 * Export one building to CityJSON (spec §7, F-66; 3D-11; name D-119). `cityjson` is the parsed document the model was
 * imported from (kept by the service, never written); the output holds this building only (D-192). Untouched
 * vertices keep their file integers (D-70); changed ones are rounded (D-123) onto the file grid. `findings` carry
 * PRECISION_LOSS for `validateModel` (D-151). Refusals throw `ExportError` (`code` INVALID_PAYLOAD / NOT_FOUND) or the
 * `crs` error (INVALID_CRS).
 * @param {import('./export/index.js').ExportInput} input
 * @returns {{ cityjson: any, findings: { code: string, entityIds: string[] }[] }}
 */
export const exportBuilding = (input) => exportModel(input);
