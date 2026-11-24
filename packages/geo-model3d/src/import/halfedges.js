// import (3D-10): canonical vertices, faces and half-edges from the merged faces (spec §6 rules 6, 16; spec §4 rule 7).
// Twins are paired within one shell: an undirected edge used once -> `twinId = null`; used by exactly two faces in
// opposite directions -> twin pair; used three or more times -> every half-edge gets one `nonManifoldGroupId` and no
// twin [A: the contract allows a group id, not a choice of twin]. Two uses in the same direction stay unpaired [A].
// Vertices stay EXPLICIT at their file position with the file indices as `sourceRef` (D-70).
import { NON_PLANAR_FACE } from './state.js';
import { SEMANTICS_INFERRED } from './semantics.js';

/** @typedef {[number, number, number]} P3 */
/** @typedef {import('./faces.js').RawFace} RawFace */
/** @typedef {import('../brep/types.js').BuildingModel} BuildingModel */
/** @typedef {(kind: string) => string} IdSource */

/**
 * @typedef {object} ImportEdge one undirected edge of a shell
 * @property {string[]} halfEdgeIds in creation order
 * @property {[string, string]} vertexIds start and end of the first half-edge
 * @property {boolean} nonManifold
 */

/**
 * @param {RawFace[]} faces merged faces
 * @param {Map<number, P3>} local representative -> local position (vertices are created per body and representative)
 * @param {Map<number, number[]>} members representative -> file indices
 * @param {IdSource} ids
 * @param {number} planarTolM
 * @returns {{ vertices: BuildingModel['vertices'], faces: BuildingModel['faces'], halfEdges: BuildingModel['halfEdges'],
 *   faceIds: string[], edges: ImportEdge[] }}
 */
export function buildTopology(faces, local, members, ids, planarTolM) {
  // vertices are scoped per body: a BuildingPart is edited as its own body (spec §6 rule 13)
  const used = [...new Set(faces.flatMap((f) => f.rings.flat().map((r) => `${f.body}:${r}`)))]
    .map((k) => k.split(':').map(Number))
    .sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  /** @type {Map<string, string>} */
  const vid = new Map(used.map(([b, r]) => [`${b}:${r}`, ids('vertex')]));
  /** @type {BuildingModel['vertices']} */
  const vertices = {};
  for (const [b, r] of used) {
    const id = /** @type {string} */ (vid.get(`${b}:${r}`));
    vertices[id] = {
      id, p: /** @type {P3} */ ([.../** @type {P3} */ (local.get(r))]), definingFaceIds: [], positionMode: 'EXPLICIT',
      sourceRef: /** @type {number[]} */ (members.get(r)).join(','),
    };
  }
  /** @type {BuildingModel['faces']} */
  const outFaces = {};
  /** @type {BuildingModel['halfEdges']} */
  const halfEdges = {};
  /** @type {Map<string, { ids: string[], from: string[] }>} shell + undirected key -> half-edges */
  const byEdge = new Map();
  const faceIds = faces.map((f) => {
    const id = ids('face');
    const loops = f.rings.map((ring) => {
      const heIds = ring.map(() => ids('halfEdge'));
      ring.forEach((r, i) => {
        const a = /** @type {string} */ (vid.get(`${f.body}:${r}`));
        const b = /** @type {string} */ (vid.get(`${f.body}:${ring[(i + 1) % ring.length]}`));
        halfEdges[heIds[i]] = {
          id: heIds[i], startVertexId: a, nextId: heIds[(i + 1) % ring.length],
          prevId: heIds[(i + ring.length - 1) % ring.length], faceId: id, twinId: null, edgeRole: 'GENERIC',
        };
        const key = `${f.body}/${f.solid}/${f.shell}:${a < b ? `${a}|${b}` : `${b}|${a}`}`;
        const e = byEdge.get(key) ?? { ids: [], from: [] };
        e.ids.push(heIds[i]);
        e.from.push(a);
        byEdge.set(key, e);
        if (!vertices[a].definingFaceIds.includes(id)) vertices[a].definingFaceIds.push(id);
      });
      return heIds[0];
    });
    const tags = [];
    if (f.maxDeviation > planarTolM) tags.push(NON_PLANAR_FACE);
    if (f.inferred) tags.push(SEMANTICS_INFERRED);
    outFaces[id] = {
      id, outerLoopId: loops[0], innerLoopIds: loops.slice(1), supportPlane: f.plane, surfaceKind: f.surfaceKind, tags,
      sourceRef: f.refs[0],
    };
    return id;
  });
  for (const v of Object.values(vertices)) v.definingFaceIds.sort();
  /** @type {ImportEdge[]} */
  const edges = [];
  for (const e of byEdge.values()) {
    const first = halfEdges[e.ids[0]];
    const vertexIds = /** @type {[string, string]} */ ([first.startVertexId, halfEdges[first.nextId].startVertexId]);
    const nonManifold = e.ids.length > 2;
    if (e.ids.length === 2 && e.from[0] !== e.from[1]) {
      halfEdges[e.ids[0]].twinId = e.ids[1];
      halfEdges[e.ids[1]].twinId = e.ids[0];
    } else if (nonManifold) {
      const g = ids('nonManifoldGroup');
      for (const h of e.ids) halfEdges[h].nonManifoldGroupId = g;
    }
    edges.push({ halfEdgeIds: e.ids, vertexIds, nonManifold });
  }
  return { vertices, faces: outFaces, halfEdges, faceIds, edges };
}
