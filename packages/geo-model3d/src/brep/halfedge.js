// brep (3D-09): half-edge traversal (K-09) and the structural rules of spec §4 rule 7 (v0.2 B.3): twin pairs, rings,
// holes; `twinId = null` only in drafts; in a finalised shell every undirected boundary pair has two opposite
// half-edges on two faces of the same shell. Problems are returned with an internal `kind`; mapping them to
// validation codes is the job of `validate` (3D-12), which owns the issue taxonomy.

/** @typedef {import('./types.js').BuildingModel} BuildingModel */

/**
 * @typedef {object} TopologyIndex
 * @property {Map<string, string[]>} outer face id -> half-edge ids of the outer ring, in `nextId` order
 * @property {Map<string, string[][]>} inner face id -> half-edge ids of each inner ring
 * @property {Map<string, string>} loopOf half-edge id -> face id whose ring contains it
 * @property {Map<string, Set<string>>} facesOfVertex vertex id -> faces whose rings use it
 * @property {Map<string, string>} shellOf face id -> shell id (first shell listing the face)
 * @property {TopologyProblem[]} problems link problems found while indexing
 */

/**
 * @typedef {object} TopologyProblem
 * @property {'LINK' | 'TWIN_ASYMMETRIC' | 'TWIN_NOT_OPPOSITE' | 'TWIN_MISSING' | 'TWIN_OTHER_SHELL' | 'SHELL_FACE' | 'VERTEX_FACE'} kind
 * @property {string[]} entityIds
 * @property {string} detail
 */

/** States in which a shell is finalised: no null twins (spec §4 rule 7). [A] Drafts are DRAFT_SURFACE, DRAFT_SOLID. */
export const FINALISED_STATES = new Set(['VALID_SOLID', 'APPROVED']);

/**
 * Walk one ring from its first half-edge.
 * @param {BuildingModel} model @param {string} faceId @param {string} start
 * @param {TopologyProblem[]} problems
 * @param {number} limit number of half-edges in the model (no ring is longer)
 * @returns {string[]} half-edge ids (empty when the ring is broken)
 */
function walk(model, faceId, start, problems, limit) {
  /** @type {string[]} */
  const ids = [];
  let id = start;
  for (let guard = 0; guard <= limit; guard++) {
    const he = model.halfEdges[id];
    const bad = (/** @type {string} */ detail) => { problems.push({ kind: 'LINK', entityIds: [faceId, id], detail }); return []; };
    if (!he) return bad(`half-edge ${id} does not exist`);
    if (he.faceId !== faceId) return bad(`half-edge ${id} names face ${he.faceId}`);
    if (!model.vertices[he.startVertexId]) return bad(`start vertex ${he.startVertexId} does not exist`);
    const next = model.halfEdges[he.nextId];
    if (!next) return bad(`next ${he.nextId} does not exist`);
    if (next.prevId !== id) return bad(`next.prevId of ${id} is ${next.prevId}`);
    ids.push(id);
    id = he.nextId;
    if (id === start) return ids;
  }
  problems.push({ kind: 'LINK', entityIds: [faceId, start], detail: `ring of ${start} does not close` });
  return [];
}

/**
 * Index the rings of every face (iteration in key order of the model's collections: deterministic for a given input).
 * @param {BuildingModel} model
 * @returns {TopologyIndex}
 */
export function buildIndex(model) {
  /** @type {TopologyProblem[]} */
  const problems = [];
  const outer = new Map();
  const inner = new Map();
  /** @type {Map<string, string>} */
  const loopOf = new Map();
  /** @type {Map<string, Set<string>>} */
  const facesOfVertex = new Map();
  /** @param {string} faceId @param {string[]} ring */
  const take = (faceId, ring) => {
    for (const h of ring) {
      if (loopOf.has(h)) problems.push({ kind: 'LINK', entityIds: [h], detail: `half-edge ${h} is in two rings` });
      loopOf.set(h, faceId);
      const v = model.halfEdges[h].startVertexId;
      let s = facesOfVertex.get(v);
      if (!s) facesOfVertex.set(v, (s = new Set()));
      s.add(faceId);
    }
  };
  const limit = Object.keys(model.halfEdges).length;
  for (const f of Object.values(model.faces)) {
    const o = walk(model, f.id, f.outerLoopId, problems, limit);
    const ins = f.innerLoopIds.map((h) => walk(model, f.id, h, problems, limit));
    outer.set(f.id, o);
    inner.set(f.id, ins);
    take(f.id, o);
    ins.forEach((r) => take(f.id, r));
  }
  for (const id of Object.keys(model.halfEdges)) {
    if (!loopOf.has(id)) problems.push({ kind: 'LINK', entityIds: [id], detail: `half-edge ${id} is in no ring` });
  }
  /** @type {Map<string, string>} */
  const shellOf = new Map();
  for (const sh of Object.values(model.shells)) for (const f of sh.faceIds) if (!shellOf.has(f)) shellOf.set(f, sh.id);
  return { outer, inner, loopOf, facesOfVertex, shellOf, problems };
}

/** End vertex of a half-edge (start of its next). @param {BuildingModel} model @param {string} heId */
export const endVertexId = (model, heId) => model.halfEdges[model.halfEdges[heId].nextId].startVertexId;

/**
 * Vertex ids of a face's rings, outer first.
 * @param {BuildingModel} model @param {TopologyIndex} index @param {string} faceId
 * @returns {string[][]}
 */
export function faceRings(model, index, faceId) {
  const rings = [index.outer.get(faceId) ?? [], ...(index.inner.get(faceId) ?? [])];
  return rings.map((r) => r.map((h) => model.halfEdges[h].startVertexId));
}

/**
 * Faces on the two sides of the edge of a half-edge.
 * @param {BuildingModel} model @param {string} heId
 * @returns {string[]} [face] or [face, twin face]
 */
export function edgeFaceIds(model, heId) {
  const he = model.halfEdges[heId];
  const twin = he.twinId ? model.halfEdges[he.twinId] : null;
  return twin ? [he.faceId, twin.faceId] : [he.faceId];
}

/**
 * Structural check of spec §4 rule 7 plus references between collections. Empty result = structurally sound.
 * @param {BuildingModel} model
 * @param {TopologyIndex} [index]
 * @returns {TopologyProblem[]}
 */
export function checkTopology(model, index = buildIndex(model)) {
  const problems = [...index.problems];
  const finalised = FINALISED_STATES.has(model.state);
  for (const he of Object.values(model.halfEdges)) {
    if (!index.loopOf.has(he.id)) continue;
    if (he.twinId === null) {
      if (finalised) problems.push({ kind: 'TWIN_MISSING', entityIds: [he.id, he.faceId], detail: `no twin in state ${model.state}` });
      continue;
    }
    const tw = model.halfEdges[he.twinId];
    if (!tw || tw.twinId !== he.id) {
      problems.push({ kind: 'TWIN_ASYMMETRIC', entityIds: [he.id, he.twinId], detail: `twin of ${he.twinId} is not ${he.id}` });
      continue;
    }
    if (!index.loopOf.has(tw.id)) continue;
    if (tw.startVertexId !== endVertexId(model, he.id) || he.startVertexId !== endVertexId(model, tw.id)) {
      problems.push({ kind: 'TWIN_NOT_OPPOSITE', entityIds: [he.id, tw.id], detail: 'twins do not run in opposite directions' });
    }
    if (finalised && he.id < tw.id && index.shellOf.get(he.faceId) !== index.shellOf.get(tw.faceId)) {
      problems.push({ kind: 'TWIN_OTHER_SHELL', entityIds: [he.id, tw.id], detail: 'twin faces are in different shells' });
    }
  }
  for (const sh of Object.values(model.shells)) {
    for (const f of sh.faceIds) if (!model.faces[f]) problems.push({ kind: 'SHELL_FACE', entityIds: [sh.id, f], detail: `face ${f} does not exist` });
  }
  if (finalised) {
    for (const f of Object.keys(model.faces)) {
      if (!index.shellOf.has(f)) problems.push({ kind: 'SHELL_FACE', entityIds: [f], detail: `face in no shell in state ${model.state}` });
    }
  }
  for (const v of Object.values(model.vertices)) {
    for (const f of v.definingFaceIds) {
      if (!model.faces[f]) problems.push({ kind: 'VERTEX_FACE', entityIds: [v.id, f], detail: `defining face ${f} does not exist` });
      else if (!index.facesOfVertex.get(v.id)?.has(f)) {
        problems.push({ kind: 'VERTEX_FACE', entityIds: [v.id, f], detail: `defining face ${f} does not use the vertex` });
      }
    }
  }
  return problems;
}
