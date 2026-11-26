// ops (3D-17): REMOVE_FACE (spec §10.8 r1; v0.3 §6): delete one face. Its half-edges go, their twins become open
// boundary edges (`twinId = null`), the face leaves its shell and roof component; vertices no ring uses any more are
// deleted; a vertex left with fewer than three independent planes keeps its position as EXPLICIT (spec §4 r3). The
// model becomes DRAFT_SOLID: the command schema requires `targetState: DRAFT_SOLID`; with VALID_SOLID the pipeline
// gate refuses (the open shell is a new error, spec §3 r4). Hard constraints on removed ids refuse (D-213 pattern).
import { derivePoint } from '../brep/index.js';
import { refuse } from './errors.js';
import { ringOf, ringStarts } from './repair-topology.js';

/** @typedef {import('./pipeline.js').OpContext} OpContext */
/** @typedef {import('./pipeline.js').OpResult} OpResult */
/** @typedef {import('../brep/types.js').BuildingModel} BuildingModel */

/**
 * @param {BuildingModel} draft
 * @param {any} payload contract `command-payload-remove-face`
 * @param {OpContext} ctx
 * @returns {OpResult}
 */
export function removeFace(draft, payload, ctx) {
  const faceId = payload?.faceId;
  if (typeof faceId !== 'string' || !draft.faces[faceId]) return refuse('INVALID_PAYLOAD', typeof faceId === 'string' ? [faceId] : [], 'unknown face');
  const removed = new Set([faceId]);
  const touched = new Set();
  for (const start of ringStarts(draft, faceId)) {
    for (const id of ringOf(draft, start)) {
      const he = draft.halfEdges[id];
      touched.add(he.startVertexId);
      if (he.twinId && draft.halfEdges[he.twinId]?.twinId === id) draft.halfEdges[he.twinId].twinId = null;
      removed.add(id);
    }
  }
  for (const id of removed) if (id !== faceId) delete draft.halfEdges[id];
  const face = draft.faces[faceId];
  delete draft.faces[faceId];
  for (const sh of Object.values(draft.shells)) sh.faceIds = sh.faceIds.filter((f) => f !== faceId);
  if (face.roofComponentId && draft.roofComponents[face.roofComponentId]) {
    const rc = draft.roofComponents[face.roofComponentId];
    rc.faceIds = rc.faceIds.filter((f) => f !== faceId);
    // [A] an empty roof component carries nothing; it is deleted with its last face
    if (rc.faceIds.length === 0) delete draft.roofComponents[rc.id];
  }
  for (const rc of Object.values(draft.roofComponents)) rc.faceIds = rc.faceIds.filter((f) => f !== faceId);

  const used = new Set(Object.values(draft.halfEdges).map((h) => h.startVertexId));
  for (const v of Object.values(draft.vertices)) if (v.definingFaceIds.includes(faceId)) touched.add(v.id);
  for (const vId of [...touched].sort()) {
    const v = draft.vertices[vId];
    if (!used.has(vId)) {
      delete draft.vertices[vId];
      removed.add(vId);
      continue;
    }
    v.definingFaceIds = v.definingFaceIds.filter((f) => f !== faceId);
    if (!derivePoint(v.definingFaceIds.map((f) => draft.faces[f].supportPlane), ctx.tol.numericEpsilon)) v.positionMode = 'EXPLICIT';
  }
  return { ok: true, removed };
}
