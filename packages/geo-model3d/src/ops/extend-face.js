// ops (3D-105): EXTEND_FACE (spec §10.6 r8; D-324; v0.2 §13.5, E-08). An open half-edge `e` of the outer ring of F
// moves within the plane of F onto L = plane(F) ∩ plane(G) (G = `targetFaceId`): its ring neighbours `a` (before) and
// `b` (after) are prolonged along their lines, and the new ends of `e` are the points of three planes (F, the plane
// across `a` / `b`, G); an open `a` / `b` gives its line in F and an explicit end (spec §4 r3). L must lie outside F on
// the far side of `e` (the area grows), otherwise it is a trim. The plane of F and the ids of F and `e` are kept; the
// ends keep their ids unless closure welds them into a vertex that did not move (D-363; r7.5, `face-line.js`).
// "Parallel" for a line of `a` / `b` and L uses `coplanarTolDeg`, as the planes of r8.2 (owner, D-364).
import { cross, derivePoint, dot, norm, sub } from '../brep/index.js';
import { refuse } from './errors.js';
import { endOf, ringOf } from './repair-topology.js';
import { closeOpenEdges, planeFrame, planeLine, sideOf } from './face-line.js';
import { signedArea2 } from './geom2.js';

/** @typedef {import('../brep/types.js').BuildingModel} BuildingModel */
/** @typedef {[number, number, number]} P3 */

/** @type {import('./registry.js').Operation['run']} */
export function extendFace(draft, payload, ctx) {
  const tol = ctx.tol;
  const fId = payload?.faceId, gId = payload?.targetFaceId, eId = payload?.edgeId;
  if (typeof fId !== 'string' || !draft.faces[fId]) return refuse('INVALID_PAYLOAD', typeof fId === 'string' ? [fId] : [], 'unknown faceId');
  if (typeof gId !== 'string' || !draft.faces[gId] || gId === fId) return refuse('INVALID_PAYLOAD', typeof gId === 'string' ? [gId] : [], 'targetFaceId unknown or equal to faceId');
  const f = draft.faces[fId];
  const ring = ringOf(draft, f.outerLoopId);
  if (typeof eId !== 'string' || !ring.includes(eId)) return refuse('INVALID_PAYLOAD', typeof eId === 'string' ? [eId] : [], 'edgeId is not a half-edge of the outer ring of the face');
  const e = draft.halfEdges[eId];
  if (e.twinId) return refuse('INVALID_TOPOLOGY', [eId], 'the edge is shared; in a closed shell use MOVE_EDGE / OFFSET_FACE of the neighbour');
  const F = f.supportPlane, G = draft.faces[gId].supportPlane;
  const L = planeLine(F, G, tol.coplanarTolDeg);
  if (!L) return refuse('INVALID_GEOMETRY', [fId, gId], 'planes of the face and the target face are parallel within coplanarTolDeg');

  const P = (/** @type {string} */ v) => /** @type {P3} */ (draft.vertices[v].p);
  const vs = e.startVertexId, ve = endOf(draft, eId);
  const a = e.prevId, b = e.nextId;
  const sinTol = Math.sin((tol.coplanarTolDeg * Math.PI) / 180);
  const lDir = sub(L[1], L[0]);
  /**
   * New position of the end of `e` shared with neighbour `n` (other end `far`), and the planes that define it.
   * @param {string} n @param {string} far @param {string} end
   */
  const newEnd = (n, far, end) => {
    const tw = draft.halfEdges[n].twinId;
    const A = tw ? draft.faces[draft.halfEdges[tw].faceId] : null;
    const dir = A ? cross(/** @type {P3} */ (F.normal), /** @type {P3} */ (A.supportPlane.normal)) : sub(P(end), P(far));
    if (!(norm(cross(dir, lDir)) > sinTol * norm(dir))) return null;
    if (A) {
      const d = derivePoint([F, A.supportPlane, G], tol.numericEpsilon);
      return d ? { p: d.p, faces: [fId, A.id, gId] } : null;
    }
    // open neighbour: its line through `far` and `end` meets plane G
    const t = -(dot(/** @type {P3} */ (G.normal), P(far)) + G.d) / dot(/** @type {P3} */ (G.normal), dir);
    return { p: /** @type {P3} */ ([0, 1, 2].map((i) => P(far)[i] + t * dir[i])), faces: [fId, gId] };
  };
  const nS = newEnd(a, draft.halfEdges[a].startVertexId, vs);
  const nE = newEnd(b, endOf(draft, b), ve);
  if (!nS || !nE) return refuse('INVALID_GEOMETRY', [fId, ...(nS ? [] : [a]), ...(nE ? [] : [b])], 'a neighbour edge line is parallel to the target line');

  const side = sideOf(F, L);
  const others = [...new Set([f.outerLoopId, ...f.innerLoopIds].flatMap((st) => ringOf(draft, st)).map((h) => draft.halfEdges[h].startVertexId))];
  const sides = others.map((v) => side(P(v)));
  const s0 = Math.sign(sides[0]);
  if (sides.some((x) => !(Math.abs(x) > tol.topologySnapTolM) || Math.sign(x) !== s0)) return refuse('INVALID_GEOMETRY', [fId], 'the target line touches or crosses the face (that is a trim)');
  const to2 = planeFrame(F);
  const before = ring.map((h) => to2(P(draft.halfEdges[h].startVertexId)));
  const after = ring.map((h) => { const v = draft.halfEdges[h].startVertexId; return to2(v === vs ? nS.p : v === ve ? nE.p : P(v)); });
  if (!(Math.abs(signedArea2(after)) > Math.abs(signedArea2(before))) || Math.sign(signedArea2(after)) !== Math.sign(signedArea2(before))) {
    return refuse('INVALID_GEOMETRY', [fId], 'the target line is not beyond the edge (the face would not grow)');
  }
  if (!simple(after, tol.minEdgeLengthM)) return refuse('INVALID_GEOMETRY', [fId], 'the extended ring crosses itself or has a collapsed edge');

  for (const [v, n] of /** @type {[string, { p: P3, faces: string[] }][]} */ ([[vs, nS], [ve, nE]])) {
    const x = draft.vertices[v];
    x.p = n.p;
    x.definingFaceIds = n.faces;
    x.positionMode = n.faces.length >= 3 ? 'DERIVED' : 'EXPLICIT';
  }
  const existing = new Set(Object.keys(draft.vertices));
  const closure = closeOpenEdges(draft, fId, new Set([vs, ve]), tol, ctx.ids);
  /** @type {Record<string, string[]>} */
  const mapped = {};
  const removed = new Set();
  // a pre-existing vertex welded away maps to its survivor (through a chain of welds)
  const end = (/** @type {string} */ v) => { let x = v; for (const [a, b] of closure.welded) if (a === x) x = b; return x; };
  for (const [from] of closure.welded) if (existing.has(from)) { mapped[from] = [end(from)]; removed.add(from); }
  return { ok: true, mapped, removed };
}

/**
 * Simple ring: no edge shorter than `minLen`, no two non-adjacent edges intersecting.
 * @param {[number, number][]} r @param {number} minLen
 */
function simple(r, minLen) {
  const n = r.length;
  const seg = (/** @type {number} */ i) => [r[i], r[(i + 1) % n]];
  for (let i = 0; i < n; i++) if (Math.hypot(r[(i + 1) % n][0] - r[i][0], r[(i + 1) % n][1] - r[i][1]) < minLen) return false;
  const orient = (/** @type {number[]} */ p, /** @type {number[]} */ q, /** @type {number[]} */ s) => Math.sign((q[0] - p[0]) * (s[1] - p[1]) - (q[1] - p[1]) * (s[0] - p[0]));
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const [p1, p2] = seg(i), [q1, q2] = seg(j);
      if (orient(p1, p2, q1) * orient(p1, p2, q2) < 0 && orient(q1, q2, p1) * orient(q1, q2, p2) < 0) return false;
    }
  }
  return true;
}
