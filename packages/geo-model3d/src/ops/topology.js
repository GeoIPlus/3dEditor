// ops (3D-14): half-edges of new faces from vertex loops, twin pairing by opposite traversal, and RTG edge roles of
// the pairs (spec §4 r7; the role rule of import, spec §6 r8, restated here since `ops` may not import `import`):
// roof-wall horizontal -> EAVE, sloped -> RAKE; roof-roof convex horizontal with both faces below -> RIDGE, convex
// sloped -> HIP, concave -> VALLEY; every other pair -> GENERIC.
import { cross, dot, sub } from '../brep/index.js';

/** @typedef {import('../brep/types.js').BuildingModel} BuildingModel */
/** @typedef {[number, number, number]} P3 */

/**
 * @typedef {object} NewFace
 * @property {string} id
 * @property {import('../brep/plane.js').Plane} plane
 * @property {string} surfaceKind
 * @property {string[][]} loops vertex ids, outer first
 * @property {Record<string, any>} [keep] members of a reused face kept as they are (tags, sourceRef, roofComponentId)
 */

/**
 * Write faces and their half-edges into the draft. A half-edge reuses the id of an old one with the same face, start
 * and end vertex (`oldEdges`, D-3D14-1); others get fresh ids.
 * @param {BuildingModel} draft mutated
 * @param {NewFace[]} faces
 * @param {Map<string, string>} oldEdges `${faceId}|${start}|${end}` -> old half-edge id
 * @param {(kind: string) => string} ids
 * @returns {{ halfEdgeIds: string[], unpaired: string[] }}
 */
export function writeFaces(draft, faces, oldEdges, ids) {
  /** @type {Map<string, string>} directed `${start}|${end}` -> half-edge id */
  const directed = new Map();
  /** @type {string[]} */
  const halfEdgeIds = [];
  for (const f of faces) {
    const loopIds = f.loops.map((loop) => {
      const hes = loop.map((v, i) => {
        const w = loop[(i + 1) % loop.length];
        const id = oldEdges.get(`${f.id}|${v}|${w}`) ?? ids('halfEdge');
        if (directed.has(`${v}|${w}`)) throw new Error(`ops: edge ${v}-${w} used twice in one direction`);
        directed.set(`${v}|${w}`, id);
        return id;
      });
      hes.forEach((id, i) => {
        draft.halfEdges[id] = {
          id, startVertexId: loop[i], nextId: hes[(i + 1) % hes.length], prevId: hes[(i + hes.length - 1) % hes.length],
          faceId: f.id, twinId: null, edgeRole: 'GENERIC',
        };
        halfEdgeIds.push(id);
      });
      return hes[0];
    });
    draft.faces[f.id] = {
      ...(f.keep ?? {}), id: f.id, outerLoopId: loopIds[0], innerLoopIds: loopIds.slice(1),
      supportPlane: f.plane, surfaceKind: f.surfaceKind, tags: f.keep?.tags ?? [],
    };
  }
  /** @type {string[]} */
  const unpaired = [];
  for (const [key, id] of directed) {
    const [v, w] = key.split('|');
    const twin = directed.get(`${w}|${v}`);
    if (twin) draft.halfEdges[id].twinId = twin;
    else unpaired.push(id);
  }
  return { halfEdgeIds, unpaired };
}

/** Mean z of a face's outer ring. @param {BuildingModel} m @param {string} faceId */
function meanZ(m, faceId) {
  let z = 0, n = 0, h = m.halfEdges[m.faces[faceId].outerLoopId];
  const start = h.id;
  do { z += m.vertices[h.startVertexId].p[2]; n++; h = m.halfEdges[h.nextId]; } while (h.id !== start && n < 1e6);
  return z / n;
}

/**
 * Role of a twin pair from its two faces (rule in the file header).
 * @param {BuildingModel} m @param {string} heId @param {number} zTol `zAlignTolM`
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
  const turn = dot(cross(fa.supportPlane.normal, fb.supportPlane.normal), /** @type {P3} */ (sub(b, a)));
  if (turn === 0) return 'GENERIC';
  if (turn < 0) return 'VALLEY';
  if (!horizontal) return 'HIP';
  const edgeZ = (a[2] + b[2]) / 2;
  return meanZ(m, fa.id) < edgeZ - zTol && meanZ(m, fb.id) < edgeZ - zTol ? 'RIDGE' : 'GENERIC';
}

/**
 * Set the role of every paired half-edge among `halfEdgeIds` (both of a pair get the same role).
 * @param {BuildingModel} draft mutated @param {string[]} halfEdgeIds @param {number} zTol
 */
export function assignRoles(draft, halfEdgeIds, zTol) {
  for (const id of halfEdgeIds) {
    const he = draft.halfEdges[id];
    he.edgeRole = he.twinId ? pairRole(draft, id, zTol) : 'BOUNDARY';
  }
}
