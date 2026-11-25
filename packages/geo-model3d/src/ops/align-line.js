// ops (3D-16): ALIGN_RIDGE and ALIGN_EAVE (spec §10.7 r1, r2; v0.2 C.7, F-19, F-20, D.3) in plane terms (D-08).
// The selected line is a hard target: both target points lie on every face that meets the edge. Movable planes are
// the adjacent roof faces (walls stay fixed, D-232); KEEP_PLANES moves nothing, so a target off the intersection
// of the fixed planes is CONSTRAINT_CONFLICT (GT-09). KEEP_EAVES / KEEP_RIDGE lock the opposite eave / unchanged
// ridge of each movable face as fixed points on that face's plane. Never one SVD plane through the target and fixed
// points (spec §10.7 r2): the constraint step solves planes under hard conditions and refuses on conflict.
import { edgeFaceIds } from '../brep/index.js';
import { builders } from '../solve/index.js';
import { refuse } from './errors.js';
import { heldHard, hardConstrainedFaces, measurementTerms } from './align-common.js';

/** @typedef {import('../solve/conditions.js').Condition} Condition */
/** @typedef {[number, number, number]} P3 */

/** Modes per kind (v0.2 C.7; v0.3 §6: KEEP_RIDGE only for ALIGN_EAVE). */
const MODES = {
  ALIGN_RIDGE: { role: 'RIDGE', lock: 'EAVE', modes: new Set(['KEEP_EAVES', 'KEEP_PLANES', 'FIT_MEASUREMENTS']), lockMode: 'KEEP_EAVES' },
  ALIGN_EAVE: { role: 'EAVE', lock: 'RIDGE', modes: new Set(['KEEP_RIDGE', 'KEEP_PLANES', 'FIT_MEASUREMENTS']), lockMode: 'KEEP_RIDGE' },
};

/** Half-edge ids of every loop of a face. @param {any} draft @param {string} faceId */
function faceHalfEdges(draft, faceId) {
  const f = draft.faces[faceId];
  /** @type {string[]} */
  const out = [];
  for (const start of [f.outerLoopId, ...f.innerLoopIds]) {
    let h = start;
    do { out.push(h); h = draft.halfEdges[h].nextId; } while (h !== start && out.length < 1e6);
  }
  return out;
}

/** @param {any} draft @param {string} heId @returns {[string, string]} */
const ends = (draft, heId) => [draft.halfEdges[heId].startVertexId, draft.halfEdges[draft.halfEdges[heId].nextId].startVertexId];

/** @param {unknown} l @returns {l is [P3, P3]} */
const isLine = (l) => Array.isArray(l) && l.length === 2 && l.every((p) => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite));

/**
 * @param {'ALIGN_RIDGE' | 'ALIGN_EAVE'} kind
 * @returns {(draft: any, payload: any, ctx: import('./pipeline.js').OpContext) => import('./pipeline.js').OpResult}
 */
export function alignLine(kind) {
  const spec = MODES[kind];
  return (draft, payload, ctx) => {
    const p = payload ?? {};
    if (!spec.modes.has(p.mode)) return refuse('INVALID_PAYLOAD', [], `INVALID_MODE: ${String(p.mode)} for ${kind} (v0.2 C.7; v0.3 §6)`);
    const he = draft.halfEdges[p.edgeId];
    if (!he) return refuse('INVALID_PAYLOAD', [String(p.edgeId)], 'unknown edge');
    if (he.edgeRole !== spec.role) return refuse('INVALID_PAYLOAD', [p.edgeId], `${kind} needs an edge with role ${spec.role}`);
    if (p.targetLine !== undefined && !isLine(p.targetLine)) return refuse('INVALID_PAYLOAD', [], 'targetLine');
    if (p.mode === spec.lockMode && p.targetLine === undefined) return refuse('INVALID_PAYLOAD', [], `${p.mode} needs targetLine`);
    const tol = ctx.tol;
    const held = heldHard(draft, p.hardConstraintIds, tol);
    if (!held.ok) return held;

    const faces = edgeFaceIds(draft, p.edgeId);
    const fixed = hardConstrainedFaces(draft, p.hardConstraintIds);
    const roofs = faces.filter((f) => draft.faces[f].surfaceKind === 'RoofSurface');
    const movable = p.mode === 'KEEP_PLANES' ? [] : roofs.filter((f) => !fixed.has(f)).sort();
    const b = builders(draft);
    /** @type {Condition[]} */
    const conditions = [...held.conditions];

    if (p.targetLine !== undefined) {
      const line = /** @type {[P3, P3]} */ (p.targetLine).map((q) => ctx.pointToLocal(q, ctx.frame));
      const t = { id: p.edgeId, kind: 'TARGET_LINE', entityIds: [p.edgeId, ...faces] };
      for (const f of faces) for (const q of line) conditions.push(b.pointOnPlane(t, f, q, tol.planarTolM));
    }
    if (p.mode === spec.lockMode) {
      // lock_opposite_eaves / lock_unchanged_ridge (v0.2 C.7): the lines with the lock role of each movable face keep
      // their current positions as fixed points on that face's plane
      for (const f of movable) {
        for (const h of faceHalfEdges(draft, f)) {
          if (draft.halfEdges[h].edgeRole !== spec.lock || h === p.edgeId || h === he.twinId) continue;
          const t = { id: h, kind: p.mode, entityIds: [h, f] };
          for (const v of ends(draft, h)) conditions.push(b.pointOnPlane(t, f, /** @type {P3} */ ([...draft.vertices[v].p]), tol.planarTolM));
        }
      }
    }
    if (p.mode === 'FIT_MEASUREMENTS') {
      const m = measurementTerms(draft, p.measurementIds, roofs, ctx.pointToLocal);
      if (!m.ok) return m;
      conditions.push(...m.conditions);
    }
    return { ok: true, movableFaceIds: movable, conditions, targetVertexIds: ends(draft, p.edgeId) };
  };
}

export const alignRidge = alignLine('ALIGN_RIDGE');
export const alignEave = alignLine('ALIGN_EAVE');
