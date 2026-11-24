// import (3D-10): surface semantics (spec §6 rule 7). A CityJSON semantic surface type is carried when it is one of the
// contract `SurfaceKind` values; a surface without semantics is classified by its fitted outward normal:
// |n.z| < 0.1 wall, n.z < -0.9 ground, otherwise roof, and tagged SEMANTICS_INFERRED.

/** Contract `SurfaceKind` values (common.schema.json). */
const SURFACE_KINDS = new Set([
  'RoofSurface', 'WallSurface', 'GroundSurface', 'ClosureSurface', 'OuterCeilingSurface', 'OuterFloorSurface', 'Window', 'Door',
]);

export const SEMANTICS_INFERRED = 'SEMANTICS_INFERRED';

/**
 * @param {string | null} semanticType CityJSON semantic surface type, null when the surface has none
 * @param {[number, number, number]} normal unit outward normal of the fitted plane
 * @returns {{ surfaceKind: string, inferred: boolean }}
 */
export function classifySurface(semanticType, normal) {
  if (semanticType !== null) {
    // [A] a type outside the contract enum (e.g. an extension type "+...") is kept as Unclassified, not re-guessed
    return { surfaceKind: SURFACE_KINDS.has(semanticType) ? semanticType : 'Unclassified', inferred: false };
  }
  const nz = normal[2];
  if (Math.abs(nz) < 0.1) return { surfaceKind: 'WallSurface', inferred: true };
  if (nz < -0.9) return { surfaceKind: 'GroundSurface', inferred: true };
  return { surfaceKind: 'RoofSurface', inferred: true };
}
