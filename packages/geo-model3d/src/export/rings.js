// export (3D-11): face rings of the model and their match with the original CityJSON surface (D-3D11-2).
// A face is written with its original surface when every vertex is untouched since import (EXPLICIT at its file
// position, D-70), its rings match the original rings ring by ring up to the start vertex (welded file indices
// count as the same vertex) and its surface kind is the one import read. Otherwise its rings are regenerated.

/** @typedef {import('../brep/types.js').BuildingModel} BuildingModel */
/** @typedef {import('../brep/types.js').Face} Face */
/** @typedef {{ members: number[], untouched: boolean }} VertexInfo */

/** Contract `SurfaceKind` values that are CityJSON semantic surface types (`Unclassified` is not). */
export const CITYJSON_KINDS = new Set([
  'RoofSurface', 'WallSurface', 'GroundSurface', 'ClosureSurface', 'OuterCeilingSurface', 'OuterFloorSurface', 'Window', 'Door',
]);

/**
 * Vertex ids of one loop, following `nextId` from its first half-edge.
 * @param {BuildingModel} model @param {string} start @returns {string[]}
 */
export function loopVertices(model, start) {
  /** @type {string[]} */
  const out = [];
  let h = model.halfEdges[start];
  if (!h) throw new Error(`export: half-edge ${start} not in the model`);
  do {
    out.push(h.startVertexId);
    h = model.halfEdges[h.nextId];
    if (!h || out.length > Object.keys(model.halfEdges).length) throw new Error(`export: loop of ${start} is not closed`);
  } while (h.id !== start);
  return out;
}

/** @param {BuildingModel} model @param {Face} face @returns {string[][]} outer ring, then holes */
export const faceRings = (model, face) => [face.outerLoopId, ...face.innerLoopIds].map((l) => loopVertices(model, l));

/**
 * True when the ring of vertex ids is the file ring up to its start vertex, every vertex untouched.
 * @param {string[]} ids @param {unknown} ring file indices @param {Map<string, VertexInfo>} info
 */
function ringMatches(ids, ring, info) {
  if (!Array.isArray(ring) || ring.length !== ids.length) return false;
  const vs = ids.map((id) => info.get(id));
  if (vs.some((v) => !v || !v.untouched)) return false;
  const n = ids.length;
  for (let s = 0; s < n; s++) {
    let ok = true;
    for (let j = 0; j < n && ok; j++) ok = /** @type {VertexInfo} */ (vs[j]).members.includes(ring[(s + j) % n]);
    if (ok) return true;
  }
  return false;
}

/**
 * Semantic surface type import read for a surface (null when the file gives none).
 * @param {any} g original geometry @param {number[]} path
 * @param {(root: unknown, path: number[]) => any} atPath
 * @returns {string | null}
 */
export function fileSurfaceType(g, path, atPath) {
  const v = atPath(g.semantics?.values, path);
  const t = Number.isInteger(v) ? g.semantics?.surfaces?.[v]?.type : null;
  return typeof t === 'string' ? t : null;
}

/**
 * Whether the face's surface kind is still the one import derived from the file type (spec §6 rule 7).
 * @param {Face} face @param {string | null} fileType
 */
export function kindUnchanged(face, fileType) {
  if (fileType === null) return face.tags.includes('SEMANTICS_INFERRED');
  if (face.tags.includes('SEMANTICS_INFERRED')) return false;
  return CITYJSON_KINDS.has(fileType) ? face.surfaceKind === fileType : face.surfaceKind === 'Unclassified';
}

/**
 * @param {string[][]} rings vertex ids of the face
 * @param {unknown} surface original surface (rings of file indices), undefined when the path is not in the file
 * @param {Map<string, VertexInfo>} info
 */
export function surfaceMatches(rings, surface, info) {
  return Array.isArray(surface) && surface.length === rings.length && rings.every((r, k) => ringMatches(r, surface[k], info));
}
