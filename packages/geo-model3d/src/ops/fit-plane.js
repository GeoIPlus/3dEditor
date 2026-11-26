// ops (3D-71): FIT_PLANE as a command (spec §10.12 r4, §9 r4-r5; v0.3 §7 M-06). The plane fit of `cloud` (3D-22,
// D-130) runs on the points the service read for the payload `selection` (D-132); `index.js` hands it in as
// `ctx.planeFit` (the module DAG keeps `ops` <- `brep`, `solve`, `validate`). The result is applied:
// - MEASUREMENT: a new PLANE measurement, `coordinates = [[nx, ny, nz, d]]` in LOCAL (D-280), uncertainty
//   sigmaX = sigmaY = sigmaZ = fit RMSE so that its default soft weight is 1/σ² (D-281; v0.3 §7);
// - FACE_PLANE: the fit becomes the face's new `supportPlane` (outward sign kept), its derived vertices are
//   re-derived; no measurement is stored (D-282). Hard constraints are re-checked by the constraint step.
import { rederive } from '../brep/index.js';
import { contractError, refuse } from './errors.js';

/** @typedef {import('./pipeline.js').OpContext} OpContext */
/** @typedef {import('./pipeline.js').OpResult} OpResult */

/** Contract `command-payload-fit-plane` members. */
const MEMBERS = new Set(['selection', 'apply', 'faceId']);

/**
 * @param {any} payload
 * @returns {string | null} problem
 */
function payloadProblem(payload) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return 'payload';
  const extra = Object.keys(payload).filter((k) => !MEMBERS.has(k));
  if (extra.length > 0) return `unknown members ${extra.join(', ')}`;
  if (payload.apply !== 'MEASUREMENT' && payload.apply !== 'FACE_PLANE') return 'apply';
  if (payload.apply === 'FACE_PLANE' && typeof payload.faceId !== 'string') return 'FACE_PLANE needs faceId';
  if (payload.apply === 'MEASUREMENT' && payload.faceId !== undefined) return 'faceId is for FACE_PLANE only';
  return null;
}

/**
 * The fit's error (contract `error` from `cloud`) as an operation refusal; the face id is added for FACE_PLANE.
 * @param {any} error @param {string[]} entityIds
 * @returns {OpResult}
 */
function fitRefusal(error, entityIds) {
  const e = contractError(error.code, entityIds, error.message, error.details);
  return { ok: false, refusal: e };
}

/**
 * @param {import('../brep/types.js').BuildingModel} draft
 * @param {any} payload contract `command-payload-fit-plane`
 * @param {OpContext} ctx
 * @returns {OpResult}
 */
export function fitPlaneCommand(draft, payload, ctx) {
  const problem = payloadProblem(payload);
  if (problem) return refuse('INVALID_PAYLOAD', [], problem);
  const face = payload.apply === 'FACE_PLANE' ? draft.faces[payload.faceId] : undefined;
  if (payload.apply === 'FACE_PLANE' && !face) return refuse('INVALID_PAYLOAD', [String(payload.faceId)], 'unknown faceId');
  // the service gives the points with the command; without them the host is wrong, not the payload [A]
  if (!ctx.planeFit) return refuse('INTERNAL', [], 'FIT_PLANE without points from the service (3D-71)');
  const fit = /** @type {any} */ (ctx.planeFit(payload.selection));
  if (fit.error) return fitRefusal(fit.error, face ? [face.id] : []);
  const r = fit.result;

  if (face) {
    const n = face.supportPlane.normal;
    const s = n[0] * r.plane.normal[0] + n[1] * r.plane.normal[1] + n[2] * r.plane.normal[2] < 0 ? -1 : 1;
    face.supportPlane = { normal: r.plane.normal.map((/** @type {number} */ c) => s * c + 0), d: s * r.plane.d + 0 };
    rederive(draft, [face.id], ctx.tol);
    return { ok: true };
  }
  const id = ctx.ids('measurement');
  draft.measurements[id] = {
    id,
    geometry: { kind: 'PLANE', coordinates: [[...r.plane.normal, r.plane.d]] },
    sourceType: 'POINT_CLOUD',
    // the command names no dataset id (D-196: the descriptor is the port and its CRS) [A]
    sourceId: null,
    horizontalCrs: draft.frame.horizontalCrs,
    verticalCrs: draft.frame.verticalCrs,
    frame: 'LOCAL',
    uncertainty: { sigmaX: r.rmseM, sigmaY: r.rmseM, sigmaZ: r.rmseM, unit: 'm' },
    fit: { method: 'RANSAC_SVD', inliers: r.inlierCount, rmseM: r.rmseM },
    status: 'MEASURED',
    createdBy: ctx.actorId,
  };
  return { ok: true };
}
