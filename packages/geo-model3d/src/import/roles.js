// import (3D-10): RTG edge roles from the two adjacent faces (spec §6 rule 8), stored on both half-edges of a pair.
// roof-roof: convex and horizontal with both faces below the edge -> RIDGE; convex and sloped -> HIP; concave ->
// VALLEY. roof-wall: horizontal -> EAVE; sloped -> RAKE. Readings [A] (the spec names only these five): "horizontal" =
// end heights within `zAlignTolM`; a convex horizontal roof-roof edge without both faces descending, a coplanar pair,
// and every other pair -> GENERIC; an edge with one face or a non-manifold edge -> BOUNDARY / GENERIC.
import { cross, dot, sub } from '../brep/index.js';

/** @typedef {[number, number, number]} P3 */
/** @typedef {import('../brep/types.js').BuildingModel} BuildingModel */
/** @typedef {import('./halfedges.js').ImportEdge} ImportEdge */

/** @param {BuildingModel} m @param {string} faceId @returns {number} mean height of the face's outer ring */
function meanZ(m, faceId) {
  let z = 0, n = 0, h = m.halfEdges[m.faces[faceId].outerLoopId];
  const start = h.id;
  do { z += m.vertices[h.startVertexId].p[2]; n++; h = m.halfEdges[h.nextId]; } while (h.id !== start && n < 1e6);
  return z / n;
}

/**
 * @param {BuildingModel} m model with faces, half-edges and vertices
 * @param {string} heId a half-edge with a twin
 * @param {number} zTol `zAlignTolM`
 * @returns {string} contract EdgeRole
 */
export function pairRole(m, heId, zTol) {
  const he = m.halfEdges[heId], tw = m.halfEdges[/** @type {string} */ (he.twinId)];
  const fa = m.faces[he.faceId], fb = m.faces[tw.faceId];
  const a = m.vertices[he.startVertexId].p, b = m.vertices[tw.startVertexId].p;
  const horizontal = Math.abs(a[2] - b[2]) <= zTol;
  const roofA = fa.surfaceKind === 'RoofSurface', roofB = fb.surfaceKind === 'RoofSurface';
  const wallA = fa.surfaceKind === 'WallSurface', wallB = fb.surfaceKind === 'WallSurface';
  if ((roofA && wallB) || (wallA && roofB)) return horizontal ? 'EAVE' : 'RAKE';
  if (!(roofA && roofB)) return 'GENERIC';
  // convex when (nA x nB) points along the edge as face A traverses it (outward normals, CCW rings)
  const turn = dot(cross(fa.supportPlane.normal, fb.supportPlane.normal), /** @type {P3} */ (sub(b, a)));
  if (turn === 0) return 'GENERIC';
  if (turn < 0) return 'VALLEY';
  if (!horizontal) return 'HIP';
  const edgeZ = (a[2] + b[2]) / 2;
  return meanZ(m, fa.id) < edgeZ - zTol && meanZ(m, fb.id) < edgeZ - zTol ? 'RIDGE' : 'GENERIC';
}

/**
 * Set `edgeRole` on every half-edge.
 * @param {BuildingModel} m mutated
 * @param {ImportEdge[]} edges
 * @param {number} zTol
 */
export function assignRoles(m, edges, zTol) {
  for (const e of edges) {
    const he = m.halfEdges[e.halfEdgeIds[0]];
    const role = he.twinId ? pairRole(m, he.id, zTol) : e.nonManifold ? 'GENERIC' : 'BOUNDARY';
    for (const h of e.halfEdgeIds) m.halfEdges[h].edgeRole = role;
  }
}
