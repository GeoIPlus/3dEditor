// cloud (3D-22): model-to-cloud deviation for the heatmap (F-48; v0.3 §7; spec §9 rule 6). A point counts when its
// distance to the nearest face polygon is <= `heatmapBufferM`; it belongs to that face; its value is the signed
// distance along that face's normal (D-3D22-6). The threshold comes with the request, no default (D-3D22-2).
import { signedDistance } from '../brep/index.js';
import { invalidPayload, pointAt, pointCount, selectPoints, selectionProblem } from './points.js';
import { facePolygons, outsideBox, polygonDistance } from './polygon.js';

/** @typedef {import('../brep/types.js').BuildingModel} BuildingModel */
/** @typedef {import('./points.js').PointSelection} PointSelection */
/**
 * Contract `heatmap-request` (the members the kernel reads).
 * @typedef {{ selection: PointSelection, thresholdM: number, faceIds?: string[] }} HeatmapRequest
 */
/** @typedef {{ faceId: string, pointCount: number, meanM?: number, rmseM?: number, maxAbsM?: number }} FaceValues */

/**
 * @param {number[]} values signed distances
 */
function stats(values) {
  let sum = 0;
  let sq = 0;
  let max = 0;
  for (const x of values) {
    sum += x;
    sq += x * x;
    max = Math.max(max, Math.abs(x));
  }
  return { mean: sum / values.length, rmse: Math.sqrt(sq / values.length), maxAbs: max };
}

/**
 * Heatmap of a model against cloud points.
 * @param {BuildingModel} model
 * @param {Float64Array} points x y z interleaved, LOCAL frame (from the points port)
 * @param {HeatmapRequest} request contract `heatmap-request`
 * @param {{ heatmapBufferM: number }} profile contract `tolerance-profile`
 * @returns {{ result: object } | { error: object }} contract `heatmap-result` or `error`
 */
export function deviationStats(model, points, request, profile) {
  if (!(points instanceof Float64Array) || points.length % 3 !== 0) {
    return { error: invalidPayload('points must be a Float64Array of x y z triples') };
  }
  const problem = selectionProblem(request.selection);
  if (problem) return { error: invalidPayload(problem) };
  if (!(request.thresholdM > 0)) return { error: invalidPayload('thresholdM must be > 0 (no default, D-3D22-2)') };
  const unknown = (request.faceIds ?? []).filter((id) => !model.faces[id]);
  if (unknown.length) return { error: { ...invalidPayload('unknown face ids'), entityIds: unknown } };

  const faces = facePolygons(model);
  const buffer = profile.heatmapBufferM;
  /** @type {Map<string, number[]>} */
  const byFace = new Map(faces.map((f) => [f.id, []]));
  const pts = selectPoints(points, request.selection);
  for (let i = 0, n = pointCount(pts); i < n; i++) {
    const p = pointAt(pts, i);
    let best = null;
    let bestDist = Infinity;
    for (const f of faces) {
      if (outsideBox(f, p, buffer)) continue;
      const dist = polygonDistance(f, p);
      if (dist < bestDist) {
        bestDist = dist;
        best = f;
      }
    }
    if (best && bestDist <= buffer) byFace.get(best.id)?.push(signedDistance(best.plane, p));
  }

  const reported = request.faceIds ?? faces.map((f) => f.id);
  /** @type {number[]} */
  const all = [];
  const faceValues = reported.map((faceId) => {
    const values = byFace.get(faceId) ?? [];
    all.push(...values);
    if (!values.length) return { faceId, pointCount: 0 };
    const s = stats(values);
    return { faceId, pointCount: values.length, meanM: s.mean, rmseM: s.rmse, maxAbsM: s.maxAbs };
  });
  // [A] An empty summary (no point in the buffer) reports zeros.
  const s = all.length ? stats(all) : { rmse: 0, maxAbs: 0 };
  const beyond = all.filter((x) => Math.abs(x) > request.thresholdM).length;
  return {
    result: {
      modelVersion: model.version,
      thresholdM: request.thresholdM,
      faces: faceValues,
      summary: { pointCount: all.length, rmseM: s.rmse, maxAbsM: s.maxAbs, shareBeyondThreshold: all.length ? beyond / all.length : 0 },
    },
  };
}
