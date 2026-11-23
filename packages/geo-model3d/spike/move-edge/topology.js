// 3D-08 spike (throwaway, server-only, P4): read-only index over a canonical BuildingModel (contracts/model3d
// building-model): face rings by half-edge traversal, faces of each vertex. Built per request, as a stateless service
// would (the cost is part of the measured PREVIEW).

/** @typedef {import('./linalg.js').P3} P3 */

/**
 * @typedef {object} Index
 * @property {Map<string, string[]>} ring face id -> outer ring vertex ids (half-edge order)
 * @property {Map<string, string[][]>} holes face id -> inner ring vertex ids
 * @property {Map<string, Set<string>>} facesOfVertex vertex id -> ids of faces whose rings contain it
 */

/** @param {any} model @param {string} start @returns {string[]} vertex ids of the loop */
function loop(model, start) {
  /** @type {string[]} */
  const out = [];
  let he = model.halfEdges[start];
  for (let guard = 0; guard < 100000; guard++) {
    out.push(he.startVertexId);
    he = model.halfEdges[he.nextId];
    if (!he) throw new Error(`spike: broken loop at ${start}`);
    if (he.id === start) return out;
  }
  throw new Error(`spike: loop ${start} does not close`);
}

/** @param {any} model @returns {Index} */
export function buildIndex(model) {
  /** @type {Map<string, string[]>} */
  const ring = new Map();
  /** @type {Map<string, string[][]>} */
  const holes = new Map();
  /** @type {Map<string, Set<string>>} */
  const facesOfVertex = new Map();
  for (const f of Object.values(model.faces)) {
    const r = loop(model, f.outerLoopId);
    const h = f.innerLoopIds.map((/** @type {string} */ id) => loop(model, id));
    ring.set(f.id, r);
    holes.set(f.id, h);
    for (const v of [r, ...h].flat()) {
      let s = facesOfVertex.get(v);
      if (!s) facesOfVertex.set(v, (s = new Set()));
      s.add(f.id);
    }
  }
  return { ring, holes, facesOfVertex };
}

/**
 * Faces incident to an edge given by one of its half-edges (the half-edge's face and its twin's face).
 * @param {any} model @param {string} edgeId
 * @returns {{ faceIds: string[], a: string, b: string } | null}
 */
export function edgeFaces(model, edgeId) {
  const he = model.halfEdges[edgeId];
  if (!he) return null;
  const next = model.halfEdges[he.nextId];
  const twin = he.twinId ? model.halfEdges[he.twinId] : null;
  return { faceIds: twin ? [he.faceId, twin.faceId] : [he.faceId], a: he.startVertexId, b: next.startVertexId };
}
