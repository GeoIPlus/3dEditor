// ops (3D-17): half-edge edits shared by the repair operations (spec §10.5, §10.8): drop a half-edge from its ring,
// merge one vertex into another (weld), collapse the zero-length half-edges a weld leaves, and a hard displacement
// condition for the solver ("derived vertex within the maximum displacement", spec §10.5 r4-r5, §10.8 r3).
import { distance } from '../brep/index.js';
import { UNDEFINED_RESIDUAL } from '../solve/index.js';

/** @typedef {import('../brep/types.js').BuildingModel} BuildingModel */
/** @typedef {import('../brep/vec.js').P3} P3 */
/** @typedef {import('../solve/conditions.js').Condition} Condition */

/** End vertex of a half-edge. @param {BuildingModel} m @param {string} id */
export const endOf = (m, id) => m.halfEdges[m.halfEdges[id].nextId].startVertexId;

/**
 * Half-edge ids of one ring, in `nextId` order.
 * @param {BuildingModel} m @param {string} start
 * @returns {string[]}
 */
export function ringOf(m, start) {
  const out = [];
  let id = start;
  const limit = Object.keys(m.halfEdges).length;
  do {
    out.push(id);
    id = m.halfEdges[id].nextId;
  } while (id !== start && out.length <= limit);
  return out;
}

/** Every ring start of a face, outer first. @param {BuildingModel} m @param {string} faceId */
export const ringStarts = (m, faceId) => [m.faces[faceId].outerLoopId, ...m.faces[faceId].innerLoopIds];

/**
 * Remove a half-edge from its ring (prev -> next), clear its twin's link, delete it.
 * @param {BuildingModel} m mutated @param {string} id
 */
export function dropHalfEdge(m, id) {
  const he = m.halfEdges[id];
  const prev = m.halfEdges[he.prevId];
  const next = m.halfEdges[he.nextId];
  prev.nextId = next.id;
  next.prevId = prev.id;
  const f = m.faces[he.faceId];
  if (f.outerLoopId === id) f.outerLoopId = next.id;
  f.innerLoopIds = f.innerLoopIds.map((x) => (x === id ? next.id : x));
  const tw = he.twinId ? m.halfEdges[he.twinId] : undefined;
  if (tw && tw.twinId === id) tw.twinId = null;
  delete m.halfEdges[id];
}

/**
 * Weld: every half-edge that starts at `fromId` starts at `toId`; `toId` gets the union of both defining-face lists
 * (spec §10.5 r2); `fromId` is deleted. Zero-length half-edges are collapsed afterwards by `collapseDegenerate`.
 * @param {BuildingModel} m mutated @param {string} fromId @param {string} toId
 */
export function mergeVertex(m, fromId, toId) {
  for (const he of Object.values(m.halfEdges)) if (he.startVertexId === fromId) he.startVertexId = toId;
  const to = m.vertices[toId];
  for (const f of m.vertices[fromId].definingFaceIds) if (!to.definingFaceIds.includes(f)) to.definingFaceIds.push(f);
  delete m.vertices[fromId];
}

/**
 * Drop every half-edge whose start and end vertex are the same (in id order, deterministic).
 * @param {BuildingModel} m mutated
 * @returns {{ dropped: string[], shortFaces: string[] }} faces left with a ring of fewer than three half-edges
 */
export function collapseDegenerate(m) {
  const dropped = [];
  for (const id of Object.keys(m.halfEdges).sort()) {
    if (!m.halfEdges[id]) continue;
    if (m.halfEdges[id].nextId === id || endOf(m, id) === m.halfEdges[id].startVertexId) {
      dropped.push(id);
      dropHalfEdge(m, id);
    }
  }
  const faces = new Set(dropped.length > 0 ? Object.keys(m.faces) : []);
  const shortFaces = [...faces].filter((f) => m.faces[f] && ringStarts(m, f).some((s) => !m.halfEdges[s] || ringOf(m, s).length < 3));
  return { dropped, shortFaces };
}

/**
 * Hard condition: the vertex, as derived from the solved planes, stays within `maxM` of each reference point.
 * Residual `max(0, |p - ref| - maxM)` per reference: zero inside the limit, so it never pulls a feasible solution.
 * @param {BuildingModel} m @param {string} id condition id (reported in a conflict) @param {string} vertexId
 * @param {P3[]} refs @param {number} maxM @param {string[]} entityIds
 * @returns {Condition}
 */
export function displacementCondition(m, id, vertexId, refs, maxM, entityIds) {
  return {
    id, kind: 'MAX_DISPLACEMENT', entityIds, hard: true, weight: 0, tol: 0, linear: undefined,
    faces: [...m.vertices[vertexId].definingFaceIds].sort(),
    residual: (ctx) => {
      const p = ctx.vertex(vertexId);
      return p ? refs.map((r) => Math.max(0, distance(p, r) - maxM)) : refs.map(() => UNDEFINED_RESIDUAL);
    },
  };
}

/** Faces whose rings use a vertex. @param {BuildingModel} m @param {string} vertexId */
export const facesUsing = (m, vertexId) => [...new Set(Object.values(m.halfEdges).filter((h) => h.startVertexId === vertexId).map((h) => h.faceId))].sort();

/** True when `x` is a non-empty array of distinct strings. @param {unknown} x */
export const idList = (x) => Array.isArray(x) && x.length > 0 && x.every((s) => typeof s === 'string') && new Set(x).size === x.length;
