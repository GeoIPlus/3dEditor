// ops (3D-15): cut one face into two parts along a line (topology only; spec §10.6 r2, r3; v0.2 C.5). Shared by
// SPLIT_FACE (both parts keep the support plane) and INSERT_ROOF_BREAK (one part gets a new plane afterwards).
// Domain (D-3D15-6): the line, projected onto the support plane, crosses the outer ring exactly twice (at an edge
// interior or a vertex) and no hole; each hole lies on one side. Ids (D-3D15-3): old vertices and half-edges keep their
// ids; a crossed half-edge keeps its id on the fragment that starts at its old start vertex and the new fragment gets
// a new id (both sides of the twin pair); new cut vertices and the two chord half-edges are new. The part that keeps the
// face id is chosen by the caller's sign rule (`keepSign`). No vertex is moved: a crossing vertex is placed at the
// intersection of the projected line with the crossed edge, on both planes of that edge (spec §4 r3).
import { cross, dot, norm, scale, sub } from '../brep/index.js';
import { refuse } from './errors.js';

/** @typedef {import('../brep/types.js').BuildingModel} BuildingModel */
/** @typedef {[number, number, number]} P3 */

/**
 * Ordered half-edge ids of the loop that starts at `start`.
 * @param {BuildingModel} m @param {string} start
 */
export function loopEdges(m, start) {
  const out = [];
  let h = m.halfEdges[start];
  do { out.push(h.id); h = m.halfEdges[h.nextId]; } while (h.id !== start && out.length <= Object.keys(m.halfEdges).length);
  return out;
}

/**
 * Write `faceId`, `nextId`, `prevId` of a loop given as ordered half-edge ids.
 * @param {BuildingModel} m @param {string[]} hes @param {string} faceId
 */
export function linkLoop(m, hes, faceId) {
  hes.forEach((id, i) => {
    const h = m.halfEdges[id];
    h.faceId = faceId;
    h.nextId = hes[(i + 1) % hes.length];
    h.prevId = hes[(i + hes.length - 1) % hes.length];
  });
}

/**
 * Add `newId` after `oldId` in every shell and roof component that lists `oldId`.
 * @param {BuildingModel} m @param {string} oldId @param {string} newId
 */
function addSibling(m, oldId, newId) {
  for (const c of [...Object.values(m.shells), ...Object.values(m.roofComponents)]) {
    const i = c.faceIds.indexOf(oldId);
    if (i >= 0) c.faceIds.splice(i + 1, 0, newId);
  }
}

/**
 * @typedef {object} Cut
 * @property {true} ok
 * @property {string} keptId face id of the part on the side `keepSign` returns
 * @property {string} newFaceId
 * @property {1 | -1} keptSign side of the kept part (sign of the in-plane normal distance to the line)
 * @property {string[]} cutVertexIds the two ends of the chord
 * @property {string[]} newVertexIds
 * @property {string[]} chord the two new half-edges (kept part side first)
 * @property {[string, string][]} splitEdges [old half-edge id, new fragment id], both sides of each crossed edge
 * @property {Record<string, string[]>} mapped lineage of the face and the crossed half-edges
 * @property {(p: P3) => number} side signed in-plane distance of a point to the line (metres)
 */

/**
 * @param {BuildingModel} draft mutated
 * @param {string} faceId
 * @param {[P3, P3]} line two points, local frame
 * @param {any} tol tolerance profile
 * @param {(kind: string) => string} ids
 * @param {(firstEdgeSign: 1 | -1, side: (p: P3) => number) => (1 | -1 | { ok: false, refusal: any })} keepSign
 * @returns {Cut | { ok: false, refusal: any }}
 */
export function cutFace(draft, faceId, line, tol, ids, keepSign) {
  const f = draft.faces[faceId];
  const { normal: n, d } = f.supportPlane;
  const proj = (/** @type {P3} */ p) => /** @type {P3} */ (sub(p, scale(n, dot(n, p) + d)));
  const a = proj(line[0]);
  const u = sub(proj(line[1]), a);
  const len = norm(u);
  if (!(len >= tol.minEdgeLengthM)) return refuse('INVALID_GEOMETRY', [faceId], 'line has (near) zero length on the plane');
  const e2 = scale(cross(n, scale(u, 1 / len)), 1);
  const side = (/** @type {P3} */ p) => dot(sub(p, a), e2);
  const pos = (/** @type {string} */ v) => draft.vertices[v].p;
  const sgn = (/** @type {string} */ v) => { const t = side(pos(v)); return Math.abs(t) <= tol.topologySnapTolM ? 0 : t > 0 ? 1 : -1; };

  for (const start of f.innerLoopIds) {
    const s = loopEdges(draft, start).map((h) => sgn(draft.halfEdges[h].startVertexId));
    if (s.some((x) => x !== s[0]) || s[0] === 0) return refuse('INVALID_TOPOLOGY', [faceId], 'line crosses or touches a hole');
  }
  const outer = loopEdges(draft, f.outerLoopId);
  const k = outer.length;
  const vs = outer.map((h) => draft.halfEdges[h].startVertexId);
  const s = vs.map(sgn);
  if (!s.includes(1) || !s.includes(-1)) return refuse('INVALID_GEOMETRY', [faceId], 'line outside the face or tangent (zero area)');
  for (let i = 0; i < k; i++) {
    if (s[i] === 0 && s[(i + 1) % k] === 0) return refuse('INVALID_GEOMETRY', [faceId], 'line runs along a boundary edge');
  }
  // transitions between consecutive non-zero signs, cyclic; each is a crossing (edge) or a cut through one zero vertex
  /** @type {{ at: number, edge: boolean, from: number }[]} */
  const cuts = [];
  const first = s.findIndex((x) => x !== 0);
  for (let step = 0, i = first; step < k; step++) {
    let j = (i + 1) % k;
    let zeros = 0;
    while (s[j] === 0) { j = (j + 1) % k; zeros++; }
    if (s[j] !== s[i]) cuts.push({ at: zeros === 0 ? i : (i + 1) % k, edge: zeros === 0, from: s[i] });
    step += zeros;
    i = j;
    if (i === first) break;
  }
  if (cuts.length !== 2) return refuse('INVALID_TOPOLOGY', [faceId], `line cuts the face into ${cuts.length} parts, not two`);
  cuts.sort((x, y) => x.at - y.at);

  const firstSign = /** @type {1 | -1} */ (s[0] !== 0 ? s[0] : s[1]);
  const kept = keepSign(firstSign, side);
  if (typeof kept !== 'number') return kept;
  const newFaceId = ids('face');
  /** @type {Record<string, string[]>} */
  const mapped = { [faceId]: [faceId, newFaceId] };
  /** @type {[string, string][]} */
  const splitEdges = [];
  /** @type {string[]} */
  const newVertexIds = [];
  const partFace = (/** @type {number} */ sign) => (sign === kept ? faceId : newFaceId);

  // extended outer ring: half-edge ids and the index where each cut vertex starts
  /** @type {string[]} */
  const ring = [];
  /** @type {number[]} */
  const cutAt = [];
  /** @type {string[]} */
  const cutVertexIds = [];
  for (let i = 0; i < k; i++) {
    ring.push(outer[i]);
    const c = cuts.find((x) => x.at === i);
    if (!c) continue;
    if (!c.edge) { cutAt.push(ring.length - 1); cutVertexIds.push(vs[i]); continue; }
    const h = draft.halfEdges[outer[i]];
    const w = vs[(i + 1) % k];
    const tv = side(pos(vs[i])), tw = side(pos(w));
    const r = tv / (tv - tw);
    const pv = pos(vs[i]), pw = pos(w);
    const p = /** @type {P3} */ ([0, 1, 2].map((q) => pv[q] + r * (pw[q] - pv[q])));
    const c0 = ids('vertex');
    const g = h.twinId ? draft.halfEdges[h.twinId].faceId : null;
    draft.vertices[c0] = { id: c0, p, positionMode: 'EXPLICIT', definingFaceIds: [...new Set([faceId, newFaceId, ...(g ? [g] : [])])].sort() };
    newVertexIds.push(c0);
    const h2 = ids('halfEdge');
    draft.halfEdges[h2] = { ...h, id: h2, startVertexId: c0 };
    splitEdges.push([h.id, h2]);
    mapped[h.id] = [h.id, h2];
    if (h.twinId) {
      const t = draft.halfEdges[h.twinId];
      const t2 = ids('halfEdge');
      draft.halfEdges[t2] = { ...t, id: t2, startVertexId: c0 };
      // t: w -> c0 (keeps id), t2: c0 -> v; twins cross over
      const tLoop = loopEdges(draft, t.id);
      linkLoop(draft, [t.id, t2, ...tLoop.slice(1)], t.faceId);
      h.twinId = t2; draft.halfEdges[t2].twinId = h.id;
      t.twinId = h2; draft.halfEdges[h2].twinId = t.id;
      splitEdges.push([t.id, t2]);
      mapped[t.id] = [t.id, t2];
    }
    ring.push(h2);
    cutAt.push(ring.length - 1);
    cutVertexIds.push(c0);
  }
  // in ring order, cut 0 leaves sign `cuts[0].from`: the part from cut 1 forward to cut 0 (A) has that sign
  const [i0, i1] = cutAt;
  const signA = cuts[0].from;
  const partA = i1 > i0 ? [...ring.slice(i1), ...ring.slice(0, i0)] : ring.slice(i1, i0);
  const partB = i0 < i1 ? ring.slice(i0, i1) : [...ring.slice(i0), ...ring.slice(0, i1)];
  const chordA = ids('halfEdge'), chordB = ids('halfEdge');
  const [vA, vB] = [cutVertexIds[0], cutVertexIds[1]];
  // A ends at cut vertex 0 and closes 0 -> 1; B ends at cut vertex 1 and closes 1 -> 0
  draft.halfEdges[chordA] = { id: chordA, startVertexId: vA, nextId: '', prevId: '', faceId: '', twinId: chordB, edgeRole: 'GENERIC' };
  draft.halfEdges[chordB] = { id: chordB, startVertexId: vB, nextId: '', prevId: '', faceId: '', twinId: chordA, edgeRole: 'GENERIC' };
  const faceA = partFace(/** @type {1 | -1} */ (signA)), faceB = partFace(/** @type {1 | -1} */ (-signA));
  linkLoop(draft, [...partA, chordA], faceA);
  linkLoop(draft, [...partB, chordB], faceB);
  for (const id of [...partA, ...partB]) {
    const t = draft.halfEdges[id].twinId;
    if (t && draft.halfEdges[t].twinId !== id) throw new Error(`ops: broken twin ${id}`);
  }

  const old = { ...f };
  const loopsOf = (/** @type {string} */ face) => f.innerLoopIds.filter((st) => partFace(/** @type {1 | -1} */ (sgn(draft.halfEdges[st].startVertexId))) === face);
  for (const st of f.innerLoopIds) linkLoop(draft, loopEdges(draft, st), partFace(/** @type {1 | -1} */ (sgn(draft.halfEdges[st].startVertexId))));
  const keptOuter = faceA === faceId ? [...partA, chordA] : [...partB, chordB];
  draft.faces[faceId] = { ...old, outerLoopId: keptOuter.includes(f.outerLoopId) ? f.outerLoopId : keptOuter[0], innerLoopIds: loopsOf(faceId) };
  draft.faces[newFaceId] = { ...old, id: newFaceId, outerLoopId: faceA === newFaceId ? chordA : chordB, innerLoopIds: loopsOf(newFaceId), supportPlane: { normal: [...n], d } };
  addSibling(draft, faceId, newFaceId);

  // vertices only on the new part are defined by the new face instead of the old one; cut vertices by both
  const onNew = new Set(Object.values(draft.halfEdges).filter((h) => h.faceId === newFaceId).map((h) => h.startVertexId));
  const onKept = new Set(Object.values(draft.halfEdges).filter((h) => h.faceId === faceId).map((h) => h.startVertexId));
  for (const v of onNew) {
    const x = draft.vertices[v];
    const fs = x.definingFaceIds.filter((q) => q !== faceId || onKept.has(v));
    x.definingFaceIds = [...new Set([...fs, newFaceId])].sort();
  }
  const chord = faceA === faceId ? [chordA, chordB] : [chordB, chordA];
  return { ok: true, keptId: faceId, newFaceId, keptSign: kept, cutVertexIds, newVertexIds, chord, splitEdges, mapped, side };
}
