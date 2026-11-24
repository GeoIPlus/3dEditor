// ops (3D-16): MATCH_ELEVATIONS (spec §10.7 r3; v0.2 F-34) - an EQUAL_Z hard target (within `zAlignTolM`, D-170) on
// derived vertices, solved for the movable planes: the non-vertical roof faces that define the selected vertices;
// walls, ground and faces under a hard constraint stay fixed (D-3D16-1). Fixed / planarity conflict ->
// CONSTRAINT_CONFLICT through the constraint step. Vertices never move directly (D-08).
import { builders } from '../solve/index.js';
import { refuse } from './errors.js';
import { heldHard, hardConstrainedFaces } from './align-common.js';

/** @typedef {import('../solve/conditions.js').Condition} Condition */

/** @type {(draft: any, payload: any, ctx: import('./pipeline.js').OpContext) => import('./pipeline.js').OpResult} */
export function matchElevations(draft, payload, ctx) {
  const p = payload ?? {};
  const ids = p.vertexIds;
  if (!Array.isArray(ids) || ids.length < 2 || new Set(ids).size !== ids.length) return refuse('INVALID_PAYLOAD', [], 'vertexIds');
  for (const v of ids) if (!draft.vertices[v]) return refuse('INVALID_PAYLOAD', [String(v)], 'unknown vertex');
  const zs = ids.map((/** @type {string} */ v) => draft.vertices[v].p[2]);
  /** @type {number} */
  let z;
  if (typeof p.targetZ === 'number' && Number.isFinite(p.targetZ)) z = ctx.frame === 'WORLD' ? ctx.heightToLocal(p.targetZ) : p.targetZ;
  else if (p.targetZ === 'MIN') z = Math.min(...zs);
  else if (p.targetZ === 'MAX') z = Math.max(...zs);
  else if (p.targetZ === 'MEAN') z = zs.reduce((/** @type {number} */ a, /** @type {number} */ c) => a + c, 0) / zs.length;
  else return refuse('INVALID_PAYLOAD', [], 'targetZ');

  const tol = ctx.tol;
  const held = heldHard(draft, p.hardConstraintIds, tol);
  if (!held.ok) return held;
  const fixed = hardConstrainedFaces(draft, p.hardConstraintIds);
  /** @type {Set<string>} */
  const movable = new Set();
  for (const v of ids) {
    for (const f of draft.vertices[v].definingFaceIds) {
      const face = draft.faces[f];
      // non-vertical: |n_z| above the angular epsilon of D-170
      if (face.surfaceKind === 'RoofSurface' && Math.abs(face.supportPlane.normal[2]) > tol.numericEpsilon && !fixed.has(f)) movable.add(f);
    }
  }
  const b = builders(draft);
  // one condition per vertex, tagged with the vertex id (a conflict names the vertices, spec §5 r2)
  /** @type {Condition[]} */
  const conditions = [...held.conditions, ...ids.map((/** @type {string} */ v) => b.vertexZ({ id: v, kind: 'EQUAL_Z' }, v, z, tol.zAlignTolM))];
  return { ok: true, movableFaceIds: [...movable].sort(), conditions, targetVertexIds: [...ids] };
}
