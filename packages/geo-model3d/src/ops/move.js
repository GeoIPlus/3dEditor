// ops (3D-15): MOVE_VERTEX, MOVE_EDGE in plane terms (spec §10.4, restating v0.2 C.11; D-08). The target becomes hard
// point-on-plane conditions: on each movable plane a `solve` condition, on each fixed plane a check here (rule 2, rule
// 4: a fixed plane the target is not on -> CONSTRAINT_CONFLICT naming it). Unknowns are the movable planes only (rule
// 1); the model's hard constraints join the same solve (rule 3, GT-10); free degrees go to O1 (rule 5, D-110). No
// vertex position is written, except the explicit position of a vertex with fewer than three independent planes (§4
// r3, rule 6): it is set to the target and checked against its planes by validation after the solve.
import { builders } from '../solve/index.js';
import { derivePoint, dot } from '../brep/index.js';
import { refuse } from './errors.js';
import { isV3 } from './split-face.js';

/** @typedef {import('../brep/types.js').BuildingModel} BuildingModel */

/**
 * Movable set checks and the target conditions shared by both kinds.
 * @param {BuildingModel} draft @param {string[]} incident faces the movable set may name @param {string[]} onFaces
 * faces whose planes must contain the target points @param {number[][]} pts target points (local) @param {any} payload
 * @param {any} ctx @param {string} label
 */
function targetConditions(draft, incident, onFaces, pts, payload, ctx, label) {
  const movable = payload.movableFaceIds;
  if (!Array.isArray(movable) || movable.some((f) => typeof f !== 'string')) return refuse('INVALID_PAYLOAD', [], 'movableFaceIds');
  const notIncident = movable.filter((f) => !incident.includes(f));
  if (notIncident.length > 0) return refuse('INVALID_PAYLOAD', notIncident, 'movable faces must be incident (spec §10.4 r1)');
  const b = builders(draft);
  const conditions = [];
  /** @type {string[]} */
  const offFixed = [];
  for (const f of [...new Set(onFaces)].sort()) {
    for (const p of pts) {
      if (movable.includes(f)) conditions.push(b.pointOnPlane({ id: label, kind: label, entityIds: [f] }, f, /** @type {any} */ (p), ctx.tol.planarTolM));
      else {
        const pl = draft.faces[f].supportPlane;
        if (!(Math.abs(dot(pl.normal, /** @type {any} */ (p)) + pl.d) <= ctx.tol.planarTolM)) offFixed.push(f);
      }
    }
  }
  if (offFixed.length > 0) return refuse('CONSTRAINT_CONFLICT', [...new Set(offFixed)], 'target is not on a fixed plane (spec §10.4 r4)');
  return { ok: /** @type {true} */ (true), conditions, movable: [...new Set(movable)].sort() };
}

/**
 * Spec §10.4 r6: an explicit vertex (fewer than three independent planes, or imported and kept, D-70) whose planes do
 * not all move keeps or takes the target as its explicit position.
 * @param {BuildingModel} draft @param {string} vId @param {number[]} p @param {number} eps `numericEpsilon`
 */
function placeExplicit(draft, vId, p, eps) {
  const v = draft.vertices[vId];
  const planes = v.definingFaceIds.map((f) => draft.faces[f].supportPlane);
  if (!derivePoint(planes, eps)) v.p = /** @type {any} */ ([...p]);
}

/** @type {import('./registry.js').Operation['run']} */
export function moveVertex(draft, payload, ctx) {
  const v = draft.vertices[payload?.vertexId];
  if (!v) return refuse('INVALID_PAYLOAD', payload?.vertexId ? [payload.vertexId] : [], 'unknown vertexId');
  if (!isV3(payload.targetPoint)) return refuse('INVALID_PAYLOAD', [], 'targetPoint');
  const p = ctx.pointToLocal(payload.targetPoint, ctx.frame);
  // spec §10.4 r3 (GT-10): a hard FIXED_POINT on the moved vertex refuses a target off its point. Point-on-plane
  // conditions alone cannot see it: every plane through both points (a common line) satisfies them.
  const fixed = Object.values(draft.constraints).filter((c) => c.hard && c.kind === 'FIXED_POINT' && c.entityIds?.[0] === v.id
    && Math.hypot(...[0, 1, 2].map((i) => (Array.isArray(c.target) ? c.target : v.p)[i] - p[i])) > ctx.tol.planarTolM);
  if (fixed.length > 0) return refuse('CONSTRAINT_CONFLICT', [...fixed.map((c) => c.id).sort(), v.id], 'FIXED_POINT vertex would move (spec §10.4 r3)');
  const t = targetConditions(draft, v.definingFaceIds, v.definingFaceIds, [p], payload, ctx, 'MOVE_VERTEX:target');
  if (!t.ok) return t;
  placeExplicit(draft, v.id, p, ctx.tol.numericEpsilon);
  return { ok: true, movableFaceIds: t.movable, conditions: t.conditions, targetVertexIds: [v.id] };
}

/** @type {import('./registry.js').Operation['run']} */
export function moveEdge(draft, payload, ctx) {
  const h = draft.halfEdges[payload?.edgeId];
  if (!h) return refuse('INVALID_PAYLOAD', payload?.edgeId ? [payload.edgeId] : [], 'unknown edgeId');
  const line = payload.targetLine;
  if (!Array.isArray(line) || !isV3(line[0]) || !isV3(line[1])) return refuse('INVALID_PAYLOAD', [], 'targetLine');
  const pts = line.map((q) => ctx.pointToLocal(q, ctx.frame));
  if (Math.hypot(pts[0][0] - pts[1][0], pts[0][1] - pts[1][1], pts[0][2] - pts[1][2]) < ctx.tol.minEdgeLengthM) {
    return refuse('INVALID_GEOMETRY', [h.id], 'targetLine has (near) zero length');
  }
  const a = h.startVertexId, b = draft.halfEdges[h.nextId].startVertexId;
  const edgeFaces = [h.faceId, ...(h.twinId ? [draft.halfEdges[h.twinId].faceId] : [])];
  const incident = [...new Set([...draft.vertices[a].definingFaceIds, ...draft.vertices[b].definingFaceIds, ...edgeFaces])];
  const t = targetConditions(draft, incident, edgeFaces, pts, payload, ctx, 'MOVE_EDGE:target');
  if (!t.ok) return t;
  return { ok: true, movableFaceIds: t.movable, conditions: t.conditions, targetVertexIds: [a, b] };
}
