// ops (3D-17): FIT_TO_SHARED_EDGE in plane terms (spec §10.5; restates v0.2 C.8; D-08, D-76). Two open boundary
// half-edges on faces A (leading, plane fixed) and B become one edge with a twin pair. Each copy on B is welded into the
// A copy it is closest to; the welded vertex is derived from the union of the planes of both copies (never the mean of
// the copies). B movable: its plane is solved by the pipeline with the hard condition "contains the A edge ends"
// (ON_PLANE, O1 for the rest, D-110). Each welded vertex must stay within `maxDisplacementM` of both copies (hard
// condition) -> otherwise CONSTRAINT_CONFLICT with the vertex ids; no unique pairing -> INVALID_TOPOLOGY (D-76).
import { builders } from '../solve/index.js';
import { derivePoint, distance, unsign0 } from '../brep/index.js';
import { refuse } from './errors.js';
import { endOf, mergeVertex, collapseDegenerate, displacementCondition, idList } from './repair-topology.js';

/** @typedef {import('./pipeline.js').OpContext} OpContext */
/** @typedef {import('./pipeline.js').OpResult} OpResult */
/** @typedef {import('../brep/types.js').BuildingModel} BuildingModel */
/** @typedef {import('../brep/vec.js').P3} P3 */

/**
 * @param {BuildingModel} draft
 * @param {any} payload contract `command-payload-fit-to-shared-edge`
 * @param {OpContext} ctx
 * @returns {OpResult}
 */
export function fitToSharedEdge(draft, payload, ctx) {
  const bad = checkPayload(draft, payload);
  if (bad) return refuse('INVALID_PAYLOAD', bad.ids, bad.why);
  const tol = ctx.tol;
  const [e0, e1] = payload.edgeIds;
  const aId = draft.halfEdges[e0].faceId === payload.leadingFaceId ? e0 : e1;
  const bId = aId === e0 ? e1 : e0;
  const a = [draft.halfEdges[aId].startVertexId, endOf(draft, aId)];
  const b = [draft.halfEdges[bId].startVertexId, endOf(draft, bId)];
  /** @type {Record<string, P3>} */
  const copies = Object.fromEntries([...a, ...b].map((v) => [v, /** @type {P3} */ ([...draft.vertices[v].p])]));

  // Pairing (spec §10.5 r2): each B copy with its closest A copy; a twin pair runs opposite, so b0 <-> a1, b1 <-> a0.
  const nearest = (/** @type {string} */ v) => (distance(copies[v], copies[a[0]]) <= distance(copies[v], copies[a[1]]) ? a[0] : a[1]);
  const pairs = [[b[0], nearest(b[0])], [b[1], nearest(b[1])]];
  if (pairs[0][1] !== a[1] || pairs[1][1] !== a[0] || a[0] === a[1]) {
    return refuse('INVALID_TOPOLOGY', [aId, bId], 'no unique pairing of the edge ends (spec §10.5 r5, D-76)');
  }

  /** @type {Record<string, string[]>} */
  const mapped = {};
  for (const [bv, av] of pairs) {
    if (bv === av) continue;
    mergeVertex(draft, bv, av);
    mapped[bv] = [av];
  }
  draft.halfEdges[aId].twinId = bId;
  draft.halfEdges[bId].twinId = aId;
  const { shortFaces } = collapseDegenerate(draft);
  if (shortFaces.length > 0) return refuse('INVALID_TOPOLOGY', [aId, bId, ...shortFaces], 'the weld leaves a face with fewer than three edges');

  // Welded vertices derived from their planes (spec §10.5 r3); with fewer than three independent planes the A copy is
  // kept explicit (spec §4 r3) [A].
  for (const [, av] of pairs) {
    const v = draft.vertices[av];
    const r = derivePoint(v.definingFaceIds.map((f) => draft.faces[f].supportPlane), tol.numericEpsilon);
    if (r) {
      v.p = /** @type {P3} */ (r.p.map(unsign0));
      v.positionMode = 'DERIVED';
    } else v.positionMode = 'EXPLICIT';
  }

  const bld = builders(draft);
  const movable = /** @type {string[]} */ (payload.movableFaceIds);
  const bFace = draft.halfEdges[bId].faceId;
  /** @type {import('../solve/conditions.js').Condition[]} */
  const conditions = [];
  if (movable.includes(bFace)) {
    // B contains the leading edge of A (spec §10.5 r4): the A ends lie on plane A by construction
    for (const [, av] of pairs) conditions.push(bld.pointOnPlane({ id: av, kind: 'ON_PLANE', entityIds: [av, bFace] }, bFace, copies[av], tol.planarTolM));
  }
  for (const [bv, av] of pairs) {
    if (bv === av) continue;
    conditions.push(displacementCondition(draft, av, av, [copies[av], copies[bv]], payload.maxDisplacementM, [av, bv]));
  }
  return { ok: true, mapped, movableFaceIds: movable, conditions, targetVertexIds: pairs.map((p) => p[1]) };
}

/**
 * @param {BuildingModel} m @param {any} p
 * @returns {{ ids: string[], why: string } | null}
 */
function checkPayload(m, p) {
  if (!p || !idList(p.edgeIds) || p.edgeIds.length !== 2) return { ids: [], why: 'edgeIds: two distinct half-edges' };
  for (const id of p.edgeIds) {
    const he = m.halfEdges[id];
    if (!he) return { ids: [id], why: 'unknown half-edge' };
    if (he.twinId !== null) return { ids: [id], why: 'not an open boundary edge (twinId must be null)' };
  }
  const faces = p.edgeIds.map((/** @type {string} */ id) => m.halfEdges[id].faceId);
  if (faces[0] === faces[1]) return { ids: p.edgeIds, why: 'both edges are on one face' };
  if (!faces.includes(p.leadingFaceId)) return { ids: [p.leadingFaceId], why: 'leadingFaceId is not the face of either edge' };
  if (!(typeof p.maxDisplacementM === 'number' && p.maxDisplacementM > 0 && Number.isFinite(p.maxDisplacementM))) {
    return { ids: [], why: 'maxDisplacementM is required, no default (D-76)' };
  }
  if (!Array.isArray(p.movableFaceIds) || !p.movableFaceIds.every((/** @type {string} */ f) => f in m.faces)) return { ids: [], why: 'movableFaceIds' };
  if (p.movableFaceIds.includes(p.leadingFaceId)) return { ids: [p.leadingFaceId], why: 'the leading plane is fixed (spec §10.5 r1)' };
  return null;
}
