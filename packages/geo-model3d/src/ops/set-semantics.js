// ops (3D-21): SET_SEMANTICS (spec §10.12 r1; v0.3 §6 F-50): the surface type of the selected faces; no geometry
// changes. A face that leaves RoofSurface leaves its roof component, and an emptied component is deleted; a face that
// becomes RoofSurface joins no component (grouping TBD for a later row) (D-227). Unknown face ids (D-228) and a
// command that changes nothing (D-229) -> INVALID_PAYLOAD.
import { refuse } from './errors.js';

/** Contract `SurfaceKind` (common.schema.json). */
export const SURFACE_KINDS = new Set(['RoofSurface', 'WallSurface', 'GroundSurface', 'ClosureSurface',
  'OuterCeilingSurface', 'OuterFloorSurface', 'Window', 'Door', 'Unclassified']);

/**
 * @param {import('../brep/types.js').BuildingModel} draft
 * @param {any} payload contract `command-payload-set-semantics`
 * @returns {import('./pipeline.js').OpResult}
 */
export function setSemantics(draft, payload) {
  const faceIds = payload?.faceIds;
  if (!Array.isArray(faceIds) || faceIds.length === 0 || !faceIds.every((f) => typeof f === 'string')) {
    return refuse('INVALID_PAYLOAD', [], 'faceIds');
  }
  const kind = payload.surfaceKind;
  if (!SURFACE_KINDS.has(kind)) return refuse('INVALID_PAYLOAD', [], 'surfaceKind');
  const ids = [...new Set(/** @type {string[]} */ (faceIds))].sort();
  const unknown = ids.filter((f) => !(f in draft.faces));
  if (unknown.length > 0) return refuse('INVALID_PAYLOAD', unknown, 'unknown faceIds (D-228)');
  const changed = ids.filter((f) => draft.faces[f].surfaceKind !== kind);
  if (changed.length === 0) return refuse('INVALID_PAYLOAD', ids, 'faces already have this surfaceKind (D-229)');

  const leftRoof = new Set(changed.filter((f) => draft.faces[f].surfaceKind === 'RoofSurface'));
  for (const f of changed) draft.faces[f].surfaceKind = kind;
  if (leftRoof.size > 0) {
    for (const rc of Object.values(draft.roofComponents)) {
      if (!rc.faceIds.some((/** @type {string} */ f) => leftRoof.has(f))) continue;
      rc.faceIds = rc.faceIds.filter((/** @type {string} */ f) => !leftRoof.has(f));
      if (rc.faceIds.length === 0) delete draft.roofComponents[rc.id];
    }
  }
  return { ok: true };
}
