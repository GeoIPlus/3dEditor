// Heatmap request of the kernel service (3D-110; spec §9 r6, r8; v0.3 §7; D-135, D-196, D-197): not a command, it
// changes nothing. The version named by the request -> the points of its LOCAL `selection` through the building's
// point dataset `{ port, horizontalCrs }` -> kernel `deviationStats`. A dataset whose CRS cannot be mapped to the
// building's (another datum, D-197) is `422 INVALID_CRS` (errors.js, D-406).
import { deviationStats } from '@geoiplus/geo-model3d';
import { readLocalPoints } from './cloud-points.js';
import { errorReply } from './errors.js';

/**
 * @typedef {object} HeatmapDeps
 * @property {import('./ports/history.js').HistoryPort} history
 * @property {(projectId: string) => any} toleranceProfile
 * @property {(projectId: string, buildingId: string) => Promise<import('./cloud-points.js').PointsDataset | undefined>
 *   | import('./cloud-points.js').PointsDataset | undefined} [pointsDataset] the opened point dataset of a building (D-196)
 */

/**
 * @param {HeatmapDeps} deps @param {string} projectId @param {any} request contract `heatmap-request` (validated)
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<import('./commit.js').Reply>} body: contract `heatmap-result` or `error`; throws on port failures
 */
export async function heatmap(deps, projectId, request, options) {
  const { buildingId: b, modelVersion } = request;
  const model = await deps.history.readVersion(projectId, b, modelVersion);
  if (model === undefined) return errorReply('NOT_FOUND', [b], `unknown building or version ${modelVersion}`);
  const dataset = await deps.pointsDataset?.(projectId, b);
  if (!dataset) return errorReply('NOT_FOUND', [b], 'no point dataset opened for the building');
  const points = await readLocalPoints(dataset, model.frame, request.selection, options);
  const out = /** @type {any} */ (deviationStats(model, points, request, deps.toleranceProfile(projectId)));
  if (out.error) return { httpStatus: out.error.httpStatus, body: out.error };
  return { httpStatus: 200, body: out.result };
}
