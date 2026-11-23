// Polyhedron -> CityJSON 2.0 document (one Building, one LoD 2.2 `Solid`) for the import fixtures GT-I1..GT-I4.
// Vertices are integers with `transform.scale` 0.001 (millimetres), as CityJSON writers commonly store them.

import { CRS } from './brep.mjs';

/** @typedef {import('./geom.mjs').Poly} Poly */

/** [P] World offset of the import fixtures: a realistic projected position (E, N, 0) in the fixture CRS. */
export const IMPORT_TRANSLATE = /** @type {import('./geom.mjs').P3} */ ([512000, 6170000, 0]);
const SCALE = 0.001;

/**
 * @param {Poly} poly
 * @param {{ cityObjectId: string, triangulateRoof?: boolean }} o `triangulateRoof`: every quad roof face becomes two
 *   triangles (fan from its first vertex), GT-I3
 */
export function toCityJson(poly, o) {
  const ids = Object.keys(poly.vertices);
  const index = new Map(ids.map((id, i) => [id, i]));
  /** @type {{ ring: string[], type: string }[]} */
  const surfaces = [];
  for (const f of poly.faces) {
    if (o.triangulateRoof && f.kind === 'RoofSurface' && f.ring.length === 4) {
      const [a, b, c, d] = f.ring;
      surfaces.push({ ring: [a, b, c], type: f.kind }, { ring: [a, c, d], type: f.kind });
    } else surfaces.push({ ring: f.ring, type: f.kind });
  }
  return {
    type: 'CityJSON',
    version: '2.0',
    transform: { scale: [SCALE, SCALE, SCALE], translate: IMPORT_TRANSLATE },
    metadata: { referenceSystem: `https://www.opengis.net/def/crs/EPSG/0/${CRS.split(':')[1]}` },
    CityObjects: {
      [o.cityObjectId]: {
        type: 'Building',
        geometry: [{
          type: 'Solid',
          lod: '2.2',
          boundaries: [surfaces.map((s) => [s.ring.map((v) => /** @type {number} */ (index.get(v)))])],
          semantics: {
            surfaces: surfaces.map((s) => ({ type: s.type })),
            values: [surfaces.map((_, i) => i)],
          },
        }],
      },
    },
    vertices: ids.map((id) => poly.vertices[id].map((c) => Math.round(c / SCALE))),
  };
}
