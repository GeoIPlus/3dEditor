// Test helpers for export (3D-11): import a document, simulate an edit the way D-70 describes it (moved vertices and
// every vertex of a changed face become DERIVED), decode file integers to world coordinates (own code, v0.2 F.3).
import { importBuilding, exportBuilding } from '@geoiplus/geo-model3d';
import { PROFILE } from '../import/helpers.js';

export { PROFILE };

/** @param {any} cityjson @param {string} id @param {any} [profile] */
export function roundTrip(cityjson, id, profile = PROFILE) {
  const { model } = importBuilding({ cityjson, cityObjectId: id, toleranceProfile: profile, projectId: 'p' });
  return { model, ...exportBuilding({ model, cityjson, toleranceProfile: profile }) };
}

/** Model vertex id whose `sourceRef` lists file index `i`. @param {any} model @param {number} i */
export const vertexOfFile = (model, i) => {
  const v = Object.values(model.vertices).find((x) => /** @type {any} */ (x).sourceRef.split(',').map(Number).includes(i));
  if (!v) throw new Error(`no vertex for file index ${i}`);
  return /** @type {any} */ (v).id;
};

/**
 * Copy of the model with vertices moved by `d` (local metres); every vertex of a face touching them becomes DERIVED.
 * @param {any} model @param {string[]} ids @param {number[]} d
 */
export function moved(model, ids, d) {
  const m = structuredClone(model);
  const faces = new Set(Object.values(m.halfEdges).filter((h) => ids.includes(/** @type {any} */ (h).startVertexId)).map((h) => /** @type {any} */ (h).faceId));
  for (const h of Object.values(m.halfEdges)) if (faces.has(/** @type {any} */ (h).faceId)) m.vertices[/** @type {any} */ (h).startVertexId].positionMode = 'DERIVED';
  for (const id of ids) m.vertices[id].p = m.vertices[id].p.map((/** @type {number} */ c, /** @type {number} */ k) => c + d[k]);
  return m;
}

/** World coordinates of file vertex `i`. @param {any} doc @param {number} i @returns {number[]} */
export const world = (doc, i) => doc.vertices[i].map((/** @type {number} */ c, /** @type {number} */ k) => c * doc.transform.scale[k] + doc.transform.translate[k]);

/** Every vertex index of a boundaries value. @param {any} b @returns {number[]} */
export const indices = (b) => (typeof b === 'number' ? [b] : Array.isArray(b) ? b.flatMap(indices) : []);
