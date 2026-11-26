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
import { runPipeline, runHistory, HISTORY_KINDS } from './ops/index.js';

export { P4_CANARY } from './canary.js';
export { validateModel } from './validate/index.js';
// Point cloud (3D-22, spec §9; names D-119): `fitPlane(points, selection, profile)`, `deviationStats(model, points,
// request, profile)`; points are a Float64Array, x y z interleaved, LOCAL frame. Both return `{ result }` or `{ error }`.
export { fitPlane, deviationStats } from './cloud/index.js';

/** @typedef {import('./brep/frame.js').CoordinateFrame} CoordinateFrame */
/** @typedef {[number, number, number]} V3 */

/**
 * The building's local frame as import builds it (3D-81): `crs` gives the metric frame of `horizontalCrs` about
 * `originWorld` (projected: translation, axis swap when north-first; geographic: local ENU; 3D-32, 3D-10), `brep`
 * adds the `buildingAxisDeg` rotation (D-116). Equal to `cloudToLocal(frame, frame.horizontalCrs, ...)` (3D-69).
 * @param {CoordinateFrame} frame
 */
const buildingFrame = (frame) => localFrame(frame, createMetricFrame(frame.horizontalCrs, frame.originWorld));

/**
 * World -> local coordinates of a building (spec §1.2, §4; M-02), for every CRS import supports (3D-81). World points
 * are in `horizontalCrs` units and file axis order (e.g. lat, lon, h for EPSG:4937). Throws the `crs` error
 * (`code` INVALID_CRS) for a CRS import would refuse.
 * @param {CoordinateFrame} frame contract `CoordinateFrame`
 * @param {V3[]} points contract `V3`, world
 * @returns {V3[]} local
 */
export function worldToLocal(frame, points) {
  const lf = buildingFrame(frame);
  return points.map((p) => lf.toLocal(p));
}

/**
 * Local -> world coordinates (inverse of `worldToLocal`; world in the axis order of `horizontalCrs`).
 * @param {CoordinateFrame} frame
 * @param {V3[]} points local
 * @returns {V3[]} world
 */
export function localToWorld(frame, points) {
  const lf = buildingFrame(frame);
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

/**
 * Execute one command (spec §3, §10; 3D-14; name D-119): PREVIEW or COMMIT of any implemented `OperationKind` on the
 * given version. Pure and synchronous: the service checks authorisation and idempotency, stores versions, journal
 * and PREVIEW results (3D-23). Output: contract `command-result`; on COMMIT also the new model and the journal-entry
 * data. A refusal returns the input model object unchanged (spec §3 r2). Heights of a WORLD command and WORLD point
 * measurements are mapped through the building frame as import builds it (D-215, D-217). `UNDO`, `REDO`,
 * `RESTORE_BASELINE` (3D-18, spec §10.9) take `options.history`: the building's journal entries oldest first, the
 * baseline and the authenticated `actorId` (D-3D18-1..4).
 * @param {import('./brep/types.js').BuildingModel} model contract `building-model`, the current version
 * @param {any} command contract `command`
 * @param {Omit<import('./ops/pipeline.js').PipelineOptions, 'heightToLocal' | 'pointToLocal'>
 *   & { history?: import('./ops/history.js').HistoryInput }} options
 *   `toleranceProfile`, `clock`, optional `ids`, `previewId`, `previousIssues`, `history`
 * @returns {{ result: any, model: import('./brep/types.js').BuildingModel, journal?: any, modelLevel?: string[] }}
 */
export function executeCommand(model, command, options) {
  if (HISTORY_KINDS.has(command.operation)) return runHistory(model, command, options);
  /** @type {((p: V3) => V3) | null} */
  let toLocal = null;
  const local = (/** @type {V3} */ p) => {
    toLocal ??= localFrame(model.frame, createMetricFrame(model.frame.horizontalCrs, model.frame.originWorld)).toLocal;
    return toLocal(p);
  };
  const o = model.frame.originWorld;
  return runPipeline(model, command, {
    ...options,
    heightToLocal: (z) => local([o[0], o[1], z])[2],
    pointToLocal: (p, frame) => (frame === 'WORLD' ? local(p) : [p[0], p[1], p[2]]),
  });
}
