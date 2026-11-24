// import (3D-10): `Footprint` derived from GroundSurface faces (spec §6 rule 9; `sourceKind: DERIVED_FROM_GROUND`).
// Readings [A]: one footprint per ground face; rings are its rings projected to plan and reversed so that the outer
// ring is counter-clockwise seen from above (a ground face is counter-clockwise seen from below); `baseElevationM` is
// the lowest height of its outer ring.

/** @typedef {import('../brep/types.js').BuildingModel} BuildingModel */

/** @param {BuildingModel} m @param {string} start @returns {string[]} vertex ids of a ring */
function ringVertices(m, start) {
  const out = [];
  let h = m.halfEdges[start];
  do { out.push(h.startVertexId); h = m.halfEdges[h.nextId]; } while (h.id !== start && out.length < 1e6);
  return out;
}

/**
 * @param {BuildingModel} m model with faces
 * @param {Map<string, string | undefined>} partOfFace face id -> BuildingPart semantic id (undefined for the Building)
 * @param {(kind: string) => string} ids
 * @returns {BuildingModel['footprints']}
 */
export function deriveFootprints(m, partOfFace, ids) {
  /** @type {BuildingModel['footprints']} */
  const out = {};
  for (const f of Object.values(m.faces)) {
    if (f.surfaceKind !== 'GroundSurface') continue;
    const rings = [f.outerLoopId, ...f.innerLoopIds].map((s) => ringVertices(m, s));
    const plan = rings.map((r) => r.map((v) => [m.vertices[v].p[0], m.vertices[v].p[1]]).reverse());
    const id = ids('footprint');
    const part = partOfFace.get(f.id);
    out[id] = {
      id, outerRing: plan[0], innerRings: plan.slice(1),
      baseElevationM: Math.min(...rings[0].map((v) => m.vertices[v].p[2])),
      sourceMeasurementIds: [], sourceKind: 'DERIVED_FROM_GROUND',
      ...(part ? { buildingPartId: part } : {}),
    };
  }
  return out;
}
