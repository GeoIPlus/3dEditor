// ops (3D-17): ALIGN_JUNCTION (spec §10.8 r3; v0.2 C.9; D-287): close a node of three or more planes to one point.
// KEEP_PRIMARY_PLANE: the primary plane is fixed, the other listed planes may move; REFIT_SELECTED_PLANES: only the
// selected planes may move. Defining planes of the vertex that the payload does not list are fixed. The point comes from
// junction-point.js; each plane that moves gets the hard condition "contains the point" and keeps its other vertices
// (O1, D-110) - a local solve of the node's planes only, no whole-building fit. `maxDisplacementM` (optional) is a hard
// limit on every vertex of a moving plane. A conflict with Fixed constraints -> CONSTRAINT_CONFLICT listing the faces.
import { builders } from '../solve/index.js';
import { refuse } from './errors.js';
import { displacementCondition, facesUsing, idList } from './repair-topology.js';
import { junctionPoint } from './junction-point.js';

/** @typedef {import('./pipeline.js').OpContext} OpContext */
/** @typedef {import('./pipeline.js').OpResult} OpResult */
/** @typedef {import('../brep/types.js').BuildingModel} BuildingModel */
/** @typedef {import('../solve/conditions.js').Condition} Condition */

/**
 * @param {BuildingModel} draft
 * @param {any} payload contract `command-payload-align-junction`
 * @param {OpContext} ctx
 * @returns {OpResult}
 */
export function alignJunction(draft, payload, ctx) {
  const tol = ctx.tol;
  const bad = checkPayload(draft, payload);
  if (bad) return refuse('INVALID_PAYLOAD', bad.ids, bad.why);
  const v = draft.vertices[payload.vertexId];
  const listed = new Set(/** @type {string[]} */ (payload.faceIds));
  const movableSet = new Set(payload.mode === 'KEEP_PRIMARY_PLANE' ? [...listed].filter((f) => f !== payload.primaryFaceId) : payload.movableFaceIds);
  const fixed = new Set(v.definingFaceIds.filter((f) => !movableSet.has(f)));
  const jp = junctionPoint(draft, v.id, fixed, tol);
  if (!jp.ok) return refuse('UNDERCONSTRAINED_GEOMETRY', [v.id, ...v.definingFaceIds], 'the node planes do not fix one point (rank check, spec §10.8 r3)');
  if (jp.moving.length === 0) return { ok: true, warnings: [`node ${v.id} already within topologySnapTolM; nothing moved`] };

  const b = builders(draft);
  const tag = { id: v.id, kind: 'NODE_POINT', entityIds: [v.id, ...v.definingFaceIds] };
  /** @type {Condition[]} */
  const conditions = jp.moving.map((f) => b.pointOnPlane(tag, f, /** @type {any} */ (jp.point), tol.planarTolM));
  if (payload.maxDisplacementM !== undefined) {
    const vs = new Set(Object.values(draft.halfEdges).filter((h) => jp.moving.includes(h.faceId)).map((h) => h.startVertexId));
    for (const u of [...vs].sort()) {
      conditions.push(displacementCondition(draft, u, u, [draft.vertices[u].p], payload.maxDisplacementM, [u, ...facesUsing(draft, u)]));
    }
  }
  return { ok: true, movableFaceIds: jp.moving, conditions, targetVertexIds: [v.id], warnings: [`node ${v.id} closed by ${jp.rule}`] };
}

/** @param {BuildingModel} m @param {any} p @returns {{ ids: string[], why: string } | null} */
function checkPayload(m, p) {
  if (!p || typeof p.vertexId !== 'string' || !m.vertices[p.vertexId]) return { ids: p?.vertexId ? [p.vertexId] : [], why: 'unknown vertex' };
  const v = m.vertices[p.vertexId];
  if (!idList(p.faceIds) || p.faceIds.length < 3) return { ids: [], why: 'faceIds: three or more distinct faces' };
  const foreign = p.faceIds.filter((/** @type {string} */ f) => !v.definingFaceIds.includes(f));
  if (foreign.length > 0) return { ids: foreign, why: 'faceIds must be planes of the node' };
  if (p.mode === 'KEEP_PRIMARY_PLANE') {
    if (!p.faceIds.includes(p.primaryFaceId)) return { ids: [p.primaryFaceId ?? ''].filter(Boolean), why: 'primaryFaceId must be one of faceIds' };
  } else if (p.mode === 'REFIT_SELECTED_PLANES') {
    if (!idList(p.movableFaceIds) || !p.movableFaceIds.every((/** @type {string} */ f) => p.faceIds.includes(f))) return { ids: [], why: 'movableFaceIds must be among faceIds' };
  } else return { ids: [], why: 'mode' };
  if (p.maxDisplacementM !== undefined && !(typeof p.maxDisplacementM === 'number' && p.maxDisplacementM >= 0)) return { ids: [], why: 'maxDisplacementM' };
  return null;
}
