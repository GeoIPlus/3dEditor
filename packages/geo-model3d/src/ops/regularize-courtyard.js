// ops (3D-126): remove a degenerate courtyard for REGULARIZE_FOOTPRINT with `allowCourtyardRemoval` (D-3D126-4).
// V1: the courtyard's walls border only each other, one ground face (the courtyard is one of its holes) and one roof
// face (the courtyard is one of its holes); otherwise INVALID_TOPOLOGY. The walls, their half-edges and vertices and the
// two hole loops are deleted, so the ground and the roof face close over the courtyard (their planes are unchanged).
import { loopEdges } from './face-cut.js';
import { refuse } from './errors.js';

/** @typedef {import('../brep/types.js').BuildingModel} BuildingModel */

/**
 * @param {BuildingModel} d mutated @param {string} groundId @param {string[]} walls the courtyard's wall faces
 * @returns {{ ok: true, removed: Set<string> } | { ok: false, refusal: any }}
 */
export function removeCourtyard(d, groundId, walls) {
  const W = new Set(walls);
  const why = 'courtyard hole is not in one ground face and one roof face (D-3D126-4)';
  const wallHes = walls.flatMap((f) => [d.faces[f].outerLoopId, ...d.faces[f].innerLoopIds].flatMap((s) => loopEdges(d, s)));
  /** @type {string[]} */
  const across = [];
  const others = new Set();
  for (const h of wallHes) {
    const t = d.halfEdges[h].twinId;
    if (!t) return refuse('INVALID_TOPOLOGY', walls, why);
    const tf = d.halfEdges[t].faceId;
    if (W.has(tf)) continue;
    across.push(t);
    others.add(tf);
  }
  others.delete(groundId);
  if (others.size !== 1) return refuse('INVALID_TOPOLOGY', [...walls, ...others], why);
  const roofId = /** @type {string} */ ([...others][0]);
  const ground = d.faces[groundId], roof = d.faces[roofId];
  const holeOf = (/** @type {any} */ face, /** @type {string} */ fid) => {
    const mine = across.filter((t) => d.halfEdges[t].faceId === fid);
    const loop = mine.length > 0 ? loopEdges(d, mine[0]) : [];
    const entry = face.innerLoopIds.find((/** @type {string} */ s) => loop.includes(s));
    const same = loop.length === mine.length && mine.every((t) => loop.includes(t));
    return entry && same ? { entry, loop } : null;
  };
  const g = holeOf(ground, groundId), r = holeOf(roof, roofId);
  if (!g || !r) return refuse('INVALID_TOPOLOGY', [...walls, groundId, roofId], why);
  const gone = new Set([...wallHes, ...g.loop, ...r.loop]);
  const verts = new Set([...gone].map((h) => d.halfEdges[h].startVertexId));
  const shared = Object.values(d.halfEdges).filter((h) => !gone.has(h.id) && verts.has(h.startVertexId));
  if (shared.length > 0) return refuse('INVALID_TOPOLOGY', [...walls, ...shared.map((h) => h.startVertexId)], why);
  ground.innerLoopIds = ground.innerLoopIds.filter((s) => s !== g.entry);
  roof.innerLoopIds = roof.innerLoopIds.filter((s) => s !== r.entry);
  for (const h of gone) delete d.halfEdges[h];
  for (const v of verts) delete d.vertices[v];
  for (const f of walls) delete d.faces[f];
  for (const c of [...Object.values(d.shells), ...Object.values(d.roofComponents)]) c.faceIds = c.faceIds.filter((/** @type {string} */ f) => !W.has(f));
  return { ok: true, removed: new Set([...walls, ...gone, ...verts]) };
}
