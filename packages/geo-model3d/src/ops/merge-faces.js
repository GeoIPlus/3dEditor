// ops (3D-15): MERGE_FACES (spec §10.6 r4; v0.2 C.6). The faces must be one edge-connected set in one shell; their
// shared (internal) edges and the vertices only those edges use are deleted; the boundary half-edges of all faces form
// the loops of the surviving face (the first of `faceIds`, D-303): exactly one outer loop, holes allowed, no pinch
// vertex. A vertex that ended an internal edge and is left with two edges, both shared with one neighbour face, lies on
// the line of two planes and is dissolved (its two edges join; the incoming half-edge keeps its id), so a merge after a
// split restores the face (D-303). MERGE_COPLANAR: normals within `coplanarTolDeg`, offsets within `planarTolM`;
// the survivor's plane is kept. MERGE_REFIT: the merged plane is movable when a merged face is in `movableFaceIds`; O1
// (D-110) fits it to its vertices; every other plane is movable only if listed (v0.2 C.6, no implicit fit).
import { cross, dot, norm } from '../brep/index.js';
import { builders } from '../solve/index.js';
import { refuse } from './errors.js';
import { linkLoop, loopEdges } from './face-cut.js';
import { inheritOnMerge, lineageWarnings } from './inherit.js';

/** @typedef {import('../brep/types.js').BuildingModel} BuildingModel */

/** @param {BuildingModel} m @param {string} he */
const endOf = (m, he) => m.halfEdges[m.halfEdges[he].nextId].startVertexId;

/** Newell normal of a loop of half-edges. @param {BuildingModel} m @param {string[]} hes */
function newell(m, hes) {
  const n = [0, 0, 0];
  hes.forEach((h) => {
    const a = m.vertices[m.halfEdges[h].startVertexId].p, b = m.vertices[endOf(m, h)].p;
    n[0] += (a[1] - b[1]) * (a[2] + b[2]); n[1] += (a[2] - b[2]) * (a[0] + b[0]); n[2] += (a[0] - b[0]) * (a[1] + b[1]);
  });
  return n;
}

/** @type {import('./registry.js').Operation['run']} */
export function mergeFaces(draft, payload, ctx) {
  const tol = ctx.tol;
  /** @type {string[]} */
  const faceIds = payload?.faceIds;
  if (!Array.isArray(faceIds) || faceIds.length < 2 || new Set(faceIds).size !== faceIds.length) return refuse('INVALID_PAYLOAD', [], 'faceIds');
  const unknown = faceIds.filter((f) => !draft.faces[f]);
  if (unknown.length > 0) return refuse('INVALID_PAYLOAD', unknown, 'unknown faceIds');
  if (payload.mode !== 'MERGE_COPLANAR' && payload.mode !== 'MERGE_REFIT') return refuse('INVALID_PAYLOAD', [], 'mode');
  const survivor = faceIds[0];
  /** @type {Set<string>} */
  const S = new Set(faceIds);
  const kinds = new Set(faceIds.map((f) => draft.faces[f].surfaceKind));
  const surfaceKind = payload.surfaceKind ?? (kinds.size === 1 ? [...kinds][0] : null);
  if (!surfaceKind) return refuse('INVALID_PAYLOAD', faceIds, 'faces of different semantics need surfaceKind (v0.2 C.6)');
  const shells = Object.values(draft.shells).filter((s) => faceIds.some((f) => s.faceIds.includes(f)));
  if (shells.length !== 1 || !faceIds.every((f) => shells[0].faceIds.includes(f))) return refuse('INVALID_TOPOLOGY', faceIds, 'faces are not in one shell');

  const base = draft.faces[survivor].supportPlane;
  if (payload.mode === 'MERGE_COPLANAR') {
    const cosTol = Math.cos((tol.coplanarTolDeg * Math.PI) / 180);
    const off = faceIds.filter((f) => { const p = draft.faces[f].supportPlane; return !(dot(p.normal, base.normal) >= cosTol && Math.abs(p.d - base.d) <= tol.planarTolM); });
    if (off.length > 0) return refuse('INVALID_GEOMETRY', [survivor, ...off], 'faces are not coplanar within coplanarTolDeg / planarTolM');
  }

  const allHes = faceIds.flatMap((f) => [draft.faces[f].outerLoopId, ...draft.faces[f].innerLoopIds].flatMap((s) => loopEdges(draft, s)));
  const isInternal = (/** @type {string} */ h) => { const t = draft.halfEdges[h].twinId; return !!t && S.has(draft.halfEdges[t].faceId); };
  const internal = allHes.filter(isInternal);
  // edge connectivity of the set (union-find over internal pairs)
  const parent = new Map(faceIds.map((f) => [f, f]));
  const root = (/** @type {string} */ f) => { while (parent.get(f) !== f) f = /** @type {string} */ (parent.get(f)); return f; };
  for (const h of internal) parent.set(root(draft.halfEdges[h].faceId), root(draft.halfEdges[/** @type {string} */ (draft.halfEdges[h].twinId)].faceId));
  if (new Set(faceIds.map(root)).size !== 1) return refuse('INVALID_TOPOLOGY', faceIds, 'faces are not adjacent');

  const boundary = allHes.filter((h) => !isInternal(h));
  /** @type {Map<string, string>} */
  const byStart = new Map();
  for (const h of boundary) {
    const v = draft.halfEdges[h].startVertexId;
    if (byStart.has(v)) return refuse('INVALID_TOPOLOGY', [...faceIds, v], 'union is not one domain (pinch vertex)');
    byStart.set(v, h);
  }
  /** @type {string[][]} */
  const loops = [];
  const seen = new Set();
  for (const h0 of boundary) {
    if (seen.has(h0)) continue;
    const loop = [];
    for (let h = h0; !seen.has(h);) {
      seen.add(h); loop.push(h);
      const nx = byStart.get(endOf(draft, h));
      if (!nx) return refuse('INVALID_TOPOLOGY', faceIds, 'union boundary is not closed');
      h = nx;
    }
    loops.push(loop);
  }
  const outer = loops.filter((l) => dot(newell(draft, l), base.normal) > 0);
  if (outer.length !== 1) return refuse('INVALID_TOPOLOGY', faceIds, 'union is not one domain');
  const boundaryVertices = new Set(boundary.map((h) => draft.halfEdges[h].startVertexId));
  const inner = new Set(internal.flatMap((h) => [draft.halfEdges[h].startVertexId, endOf(draft, h)]).filter((v) => !boundaryVertices.has(v)));
  const outside = Object.values(draft.halfEdges).filter((h) => !S.has(h.faceId) && inner.has(h.startVertexId));
  if (outside.length > 0) return refuse('INVALID_TOPOLOGY', faceIds, 'an interior vertex of the union is used by another face');
  const joints = new Set(internal.flatMap((h) => [draft.halfEdges[h].startVertexId, endOf(draft, h)]).filter((v) => boundaryVertices.has(v)));

  // rewrite: survivor face with the union loops; delete the others, internal edges and interior vertices
  const old = draft.faces[survivor];
  const outerLoop = outer[0];
  const start = outerLoop.includes(old.outerLoopId) ? old.outerLoopId : [...outerLoop].sort()[0];
  const i = outerLoop.indexOf(start);
  linkLoop(draft, [...outerLoop.slice(i), ...outerLoop.slice(0, i)], survivor);
  const holes = loops.filter((l) => l !== outerLoop);
  for (const l of holes) { const k = l.indexOf([...l].sort()[0]); linkLoop(draft, [...l.slice(k), ...l.slice(0, k)], survivor); }
  draft.faces[survivor] = { ...old, surfaceKind, outerLoopId: start, innerLoopIds: holes.map((l) => [...l].sort()[0]) };
  /** @type {Record<string, string[]>} */
  const mapped = Object.fromEntries(faceIds.map((f) => [f, [survivor]]));
  /** @type {Map<string, string>} */
  const rebind = new Map(faceIds.filter((f) => f !== survivor).map((f) => [f, survivor]));
  for (const f of faceIds) if (f !== survivor) delete draft.faces[f];
  for (const c of [...Object.values(draft.shells), ...Object.values(draft.roofComponents)]) c.faceIds = c.faceIds.filter((/** @type {string} */ f) => f === survivor || !S.has(f));
  for (const h of internal) delete draft.halfEdges[h];
  for (const v of inner) delete draft.vertices[v];
  for (const v of Object.values(draft.vertices)) {
    if (v.definingFaceIds.some((/** @type {string} */ f) => S.has(f))) v.definingFaceIds = [...new Set(v.definingFaceIds.map((/** @type {string} */ f) => (S.has(f) ? survivor : f)))];
  }
  const dissolved = dissolve(draft, survivor, joints, mapped, rebind, tol.planarTolM);

  const inh = inheritOnMerge(draft, rebind);
  if (!inh.ok) return inh;
  const removed = new Set([...internal, ...inner, ...dissolved]);
  if (payload.mode === 'MERGE_COPLANAR') return { ok: true, mapped, removed, warnings: lineageWarnings(inh.lineage) };
  const movable = payload.movableFaceIds;
  if (!Array.isArray(movable) || movable.some((/** @type {any} */ f) => typeof f !== 'string' || !(draft.faces[f] || S.has(f)))) return refuse('INVALID_PAYLOAD', [], 'movableFaceIds');
  const movableFaceIds = [...new Set(movable.map((/** @type {string} */ f) => (S.has(f) ? survivor : f)))].sort();
  // the merged plane is fitted to its vertices: one soft point-on-plane term of weight 1 per vertex at its position
  // before the merge (the weighted refit of v0.2 C.6 with equal weights, as O1); without a term `solve` keeps the plane
  const b = builders(draft);
  const verts = [...new Set(Object.values(draft.halfEdges).filter((h) => h.faceId === survivor).map((h) => h.startVertexId))].sort();
  const conditions = !movableFaceIds.includes(survivor) ? [] : verts.map((v) =>
    b.pointOnPlane({ id: 'MERGE_REFIT:fit', kind: 'MERGE_REFIT', hard: false, weight: 1, entityIds: [survivor, v] }, survivor, draft.vertices[v].p, 0));
  return { ok: true, mapped, removed, warnings: lineageWarnings(inh.lineage), movableFaceIds, conditions };
}

/**
 * Dissolve joint vertices left with exactly two half-edges in the survivor and their twins in one neighbour.
 * @param {BuildingModel} m @param {string} survivor @param {Set<string>} joints @param {Record<string, string[]>} mapped
 * @param {Map<string, string>} rebind @param {number} planarTol a vertex on two planes is on their line within it (§4)
 * @returns {string[]} dissolved vertex ids
 */
function dissolve(m, survivor, joints, mapped, rebind, planarTol) {
  /** @type {string[]} */
  const gone = [];
  for (const v of [...joints].sort()) {
    const out = Object.values(m.halfEdges).filter((h) => h.startVertexId === v);
    if (out.length !== 2 || m.vertices[v].definingFaceIds.length !== 2) continue;
    const hOut = out.find((h) => h.faceId === survivor);
    const tOut = out.find((h) => h.faceId !== survivor);
    if (!hOut || !tOut || !hOut.twinId || !tOut.twinId) continue;
    const hIn = m.halfEdges[hOut.prevId], tIn = m.halfEdges[tOut.prevId];
    if (hIn.twinId !== tOut.id || tIn.twinId !== hOut.id) continue;
    if (loopEdges(m, hIn.id).length <= 3 || loopEdges(m, tIn.id).length <= 3) continue;
    const a = m.vertices[hIn.startVertexId].p, b = m.vertices[endOf(m, hOut.id)].p, p = m.vertices[v].p;
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
    if (norm(cross(/** @type {any} */ (u), /** @type {any} */ (w))) / Math.max(norm(/** @type {any} */ (u)), 1e-12) > planarTol) continue;
    for (const [inH, outH] of [[hIn, hOut], [tIn, tOut]]) {
      const loop = loopEdges(m, inH.id).filter((x) => x !== outH.id);
      const face = m.faces[inH.faceId];
      if (face.outerLoopId === outH.id) face.outerLoopId = inH.id;
      face.innerLoopIds = face.innerLoopIds.map((s) => (s === outH.id ? inH.id : s));
      delete m.halfEdges[outH.id];
      linkLoop(m, loop, inH.faceId);
      mapped[outH.id] = [inH.id];
      rebind.set(outH.id, inH.id);
    }
    hIn.twinId = tIn.id; tIn.twinId = hIn.id;
    delete m.vertices[v];
    gone.push(v);
  }
  return gone;
}
