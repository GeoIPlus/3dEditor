// ops (3D-105): TRIM_FACE (spec §10.6 r7; D-322, D-323; v0.2 §13.5, E-08). The trim line L = plane(F) ∩ plane(G)
// (G = `cuttingFaceId`); F is cut along L with the cut domain and codes of D-302 (`face-cut.js`); the part holding
// `keepPoint` stays. v1 removes only a dangling flap: every half-edge of the removed part R except the chord is open.
// R's face, its half-edges and the vertices no ring uses any more are deleted; the plane of F is unchanged. The chord
// ends lie on L and on the crossed (open) edges: with fewer than three planes they are explicit (spec §4 r3), defined by
// F and G. Closure (r7.5): coinciding open half-edges of the kept part are paired (`face-line.js`).
import { refuse } from './errors.js';
import { cutFace } from './face-cut.js';
import { isV3 } from './split-face.js';
import { closeOpenEdges, faceHalfEdges, planeLine, pointInFace, sideOf } from './face-line.js';

/** @typedef {import('../brep/types.js').BuildingModel} BuildingModel */
/** @typedef {[number, number, number]} P3 */

/** @type {import('./registry.js').Operation['run']} */
export function trimFace(draft, payload, ctx) {
  const tol = ctx.tol;
  const fId = payload?.faceId, gId = payload?.cuttingFaceId;
  if (typeof fId !== 'string' || !draft.faces[fId]) return refuse('INVALID_PAYLOAD', typeof fId === 'string' ? [fId] : [], 'unknown faceId');
  if (typeof gId !== 'string' || !draft.faces[gId] || gId === fId) return refuse('INVALID_PAYLOAD', typeof gId === 'string' ? [gId] : [], 'cuttingFaceId unknown or equal to faceId');
  if (!isV3(payload.keepPoint)) return refuse('INVALID_PAYLOAD', [], 'keepPoint');
  const F = draft.faces[fId].supportPlane;
  const line = planeLine(F, draft.faces[gId].supportPlane, tol.coplanarTolDeg);
  if (!line) return refuse('INVALID_GEOMETRY', [fId, gId], 'planes of the face and the cutting face are parallel within coplanarTolDeg');
  const keep = /** @type {P3} */ (ctx.pointToLocal(payload.keepPoint, ctx.frame));
  const off = F.normal[0] * keep[0] + F.normal[1] * keep[1] + F.normal[2] * keep[2] + F.d;
  if (!(Math.abs(off) <= tol.planarTolM)) return refuse('INVALID_GEOMETRY', [fId], 'keepPoint is off the face plane beyond planarTolM');
  const onF = /** @type {P3} */ ([0, 1, 2].map((i) => keep[i] - off * F.normal[i]));
  const ks = sideOf(F, line)(onF);
  if (!(Math.abs(ks) > tol.topologySnapTolM)) return refuse('INVALID_GEOMETRY', [fId], 'keepPoint lies on the trim line');
  if (!pointInFace(draft, fId, onF)) return refuse('INVALID_GEOMETRY', [fId], 'keepPoint is outside the face');

  const cut = cutFace(draft, fId, line, tol, ctx.ids, (_first, side) => (side(onF) > 0 ? 1 : -1));
  if (!cut.ok) return cut;
  const rId = cut.newFaceId;
  const [keptChord, flapChord] = cut.chord;
  const fixed = faceHalfEdges(draft, rId).filter((h) => h !== flapChord && draft.halfEdges[h].twinId);
  if (fixed.length > 0) return refuse('INVALID_TOPOLOGY', [fId, ...fixed.sort()], 'the removed part shares edges with other faces (v1 trims only a dangling flap)');

  const removed = deletePart(draft, rId, flapChord);
  draft.halfEdges[keptChord].twinId = null;
  draft.halfEdges[keptChord].edgeRole = 'BOUNDARY';
  const created = new Set(cut.newVertexIds);
  for (const v of cut.cutVertexIds.filter((x) => created.has(x))) {
    const x = draft.vertices[v];
    x.definingFaceIds = [...new Set([...x.definingFaceIds.filter((/** @type {string} */ f) => f !== rId), gId])];
    x.positionMode = 'EXPLICIT';
  }
  for (const v of Object.values(draft.vertices)) {
    if (v.definingFaceIds.includes(rId)) v.definingFaceIds = v.definingFaceIds.filter((/** @type {string} */ f) => f !== rId);
  }
  const closure = closeOpenEdges(draft, fId, created, tol);
  for (const [from] of closure.welded) if (!created.has(from)) removed.add(from);
  return { ok: true, mapped: lineage(draft, cut.mapped, closure.welded, created), removed };
}

/**
 * Delete the flap face, its half-edges and the vertices no ring uses any more; drop it from shells and components.
 * @param {BuildingModel} m @param {string} rId @param {string} flapChord @returns {Set<string>} deleted pre-existing ids
 */
function deletePart(m, rId, flapChord) {
  const hes = faceHalfEdges(m, rId);
  for (const h of hes) delete m.halfEdges[h];
  delete m.faces[rId];
  for (const c of [...Object.values(m.shells), ...Object.values(m.roofComponents)]) c.faceIds = c.faceIds.filter((f) => f !== rId);
  const used = new Set(Object.values(m.halfEdges).map((h) => h.startVertexId));
  /** @type {Set<string>} */
  const removed = new Set(hes.filter((h) => h !== flapChord));
  for (const v of Object.keys(m.vertices)) if (!used.has(v)) { delete m.vertices[v]; removed.add(v); }
  return removed;
}

/**
 * Lineage: the cut's map restricted to ids that still exist, entries equal to themselves dropped; a pre-existing
 * vertex welded into another maps to it.
 * @param {BuildingModel} m @param {Record<string, string[]>} cutMap @param {[string, string][]} welded @param {Set<string>} created
 */
function lineage(m, cutMap, welded, created) {
  /** @type {Record<string, string[]>} */
  const out = {};
  const live = (/** @type {string} */ id) => !!(m.faces[id] || m.halfEdges[id] || m.vertices[id]);
  for (const [k, vs] of Object.entries(cutMap)) {
    const t = vs.filter(live);
    if (t.length > 0 && !(t.length === 1 && t[0] === k)) out[k] = t;
  }
  for (const [from, to] of welded) if (!created.has(from) && live(to)) out[from] = [to];
  return out;
}
