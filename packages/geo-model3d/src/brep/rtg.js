// brep (3D-09): roof topology graph (RTG, K-03) as a read-only projection of the canonical B-Rep (spec §4 rule 8;
// v0.2 B.3, §15.1). It references canonical Face / HalfEdge / Vtx ids only and is recomputed, never mutated on its own.
// The RTG is internal to the kernel (no contract shape): import (3D-10), validate (3D-12) and ops read it.
import { buildIndex, endVertexId } from './halfedge.js';

/** @typedef {import('./types.js').BuildingModel} BuildingModel */

/**
 * @typedef {object} RoofEdge
 * @property {string} halfEdgeId the smaller id of the twin pair (or the only half-edge)
 * @property {string | null} twinId
 * @property {string[]} faceIds [face of halfEdgeId, face of twinId] (one entry without a twin)
 * @property {[string, string]} vertexIds start and end of `halfEdgeId`
 * @property {string} edgeRole as stored on `halfEdgeId` (contract EdgeRole)
 * @property {boolean} roofRoof true when both sides are roof faces
 */

/**
 * @typedef {object} RoofGraph
 * @property {string[]} faceIds roof faces, sorted
 * @property {RoofEdge[]} edges every edge with a roof face on at least one side, sorted by `halfEdgeId`
 * @property {Record<string, string[]>} adjacency roof face -> roof faces sharing an edge with it, sorted
 * @property {Record<string, string[]>} components roof component id -> its face ids (contract RoofComponent)
 */

/** [A] A roof face is a face with `surfaceKind` RoofSurface (CityJSON semantic surface; spec §6 import mapping). */
export const isRoofFace = (/** @type {{ surfaceKind: string }} */ f) => f.surfaceKind === 'RoofSurface';

/**
 * Project the roof topology graph from a model.
 * @param {BuildingModel} model
 * @param {import('./halfedge.js').TopologyIndex} [index]
 * @returns {RoofGraph}
 */
export function roofGraph(model, index = buildIndex(model)) {
  const roof = new Set(Object.values(model.faces).filter(isRoofFace).map((f) => f.id));
  /** @type {RoofEdge[]} */
  const edges = [];
  /** @type {Map<string, Set<string>>} */
  const adj = new Map([...roof].map((f) => [f, new Set()]));
  for (const he of Object.values(model.halfEdges)) {
    if (!index.loopOf.has(he.id)) continue;
    const tw = he.twinId ? model.halfEdges[he.twinId] : null;
    if (tw && tw.id < he.id) continue; // the pair is listed once, under its smaller id
    const faceIds = tw ? [he.faceId, tw.faceId] : [he.faceId];
    if (!faceIds.some((f) => roof.has(f))) continue;
    const roofRoof = faceIds.length === 2 && faceIds.every((f) => roof.has(f));
    if (roofRoof && faceIds[0] !== faceIds[1]) {
      adj.get(faceIds[0])?.add(faceIds[1]);
      adj.get(faceIds[1])?.add(faceIds[0]);
    }
    edges.push({
      halfEdgeId: he.id, twinId: tw ? tw.id : null, faceIds, vertexIds: [he.startVertexId, endVertexId(model, he.id)],
      edgeRole: he.edgeRole, roofRoof,
    });
  }
  edges.sort((a, b) => (a.halfEdgeId < b.halfEdgeId ? -1 : a.halfEdgeId > b.halfEdgeId ? 1 : 0));
  const faceIds = [...roof].sort();
  return {
    faceIds,
    edges,
    adjacency: Object.fromEntries(faceIds.map((f) => [f, [...(adj.get(f) ?? [])].sort()])),
    components: Object.fromEntries(Object.keys(model.roofComponents).sort().map((k) => [k, [...model.roofComponents[k].faceIds]])),
  };
}
