// ops (3D-105): geometry shared by TRIM_FACE and EXTEND_FACE (spec §10.6 r7, r8): the line of two face planes, a point
// in a face, a face's in-plane 2D frame, and the closure step of r7.5 (pair coinciding open half-edges of one shell).
// Closure vertex rule [A] (spec r7.5 / r8.5 name no survivor): when two paired half-edges end in different vertices at
// the same place, a vertex created by this command yields to the other; otherwise the vertex of the edited face survives
// (so EXTEND keeps the ids of the edge's ends, r8.5). The survivor takes the union of both defining-face lists and is
// DERIVED when those planes give a unique point within `planarTolM` of it (spec §4 r3), else EXPLICIT.
import { cross, derivePoint, distance, dot, norm, scale, sub } from '../brep/index.js';
import { mergeVertex, ringOf, ringStarts, endOf } from './repair-topology.js';
import { assignRoles } from './topology.js';

/** @typedef {import('../brep/types.js').BuildingModel} BuildingModel */
/** @typedef {[number, number, number]} P3 */
/** @typedef {{ normal: number[], d: number }} Plane */

/**
 * Intersection line of two planes, or null when their normals are parallel within `tolDeg`.
 * @param {Plane} a @param {Plane} b @param {number} tolDeg
 * @returns {[P3, P3] | null} two points 1 m apart
 */
export function planeLine(a, b, tolDeg) {
  const u = cross(/** @type {P3} */ (a.normal), /** @type {P3} */ (b.normal));
  const s = norm(u);
  if (!(s > Math.sin((tolDeg * Math.PI) / 180))) return null;
  const dir = /** @type {P3} */ (scale(u, 1 / s));
  // point on both planes nearest the origin: p = (c1 (n2 x u) + c2 (u x n1)) / |u|^2 with c = -d (n·p + d = 0)
  const n1 = /** @type {P3} */ (a.normal), n2 = /** @type {P3} */ (b.normal);
  const t1 = scale(cross(n2, u), -a.d), t2 = scale(cross(u, n1), -b.d);
  const p = /** @type {P3} */ ([0, 1, 2].map((i) => (t1[i] + t2[i]) / (s * s)));
  return [p, /** @type {P3} */ ([p[0] + dir[0], p[1] + dir[1], p[2] + dir[2]])];
}

/**
 * Orthonormal in-plane frame of a face: 2D coordinates of a point.
 * @param {Plane} pl @returns {(p: P3) => [number, number]}
 */
export function planeFrame(pl) {
  const n = /** @type {P3} */ (pl.normal);
  const seed = /** @type {P3} */ (Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]);
  const e1 = /** @type {P3} */ (scale(cross(n, seed), 1 / norm(cross(n, seed))));
  const e2 = /** @type {P3} */ (cross(n, e1));
  return (p) => [dot(p, e1), dot(p, e2)];
}

/** Even-odd point-in-polygon in 2D. @param {[number, number]} q @param {[number, number][]} ring */
function inRing(q, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > q[1]) !== (yj > q[1]) && q[0] < ((xj - xi) * (q[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * True when `p` (on the face plane) lies inside the face: inside its outer ring and outside every hole.
 * @param {BuildingModel} m @param {string} faceId @param {P3} p
 */
export function pointInFace(m, faceId, p) {
  const f = m.faces[faceId];
  const to2 = planeFrame(f.supportPlane);
  const ring = (/** @type {string} */ s) => ringOf(m, s).map((h) => to2(/** @type {P3} */ (m.vertices[m.halfEdges[h].startVertexId].p)));
  const q = to2(p);
  return inRing(q, ring(f.outerLoopId)) && f.innerLoopIds.every((s) => !inRing(q, ring(s)));
}

/** Half-edge ids of every ring of a face. @param {BuildingModel} m @param {string} faceId */
export const faceHalfEdges = (m, faceId) => ringStarts(m, faceId).flatMap((s) => ringOf(m, s));

/** @param {BuildingModel} m @param {string} vId @param {any} tol */
function settle(m, vId, tol) {
  const v = m.vertices[vId];
  const d = derivePoint(v.definingFaceIds.map((/** @type {string} */ f) => m.faces[f].supportPlane), tol.numericEpsilon);
  if (d && distance(d.p, v.p) <= tol.planarTolM) { v.p = d.p; v.positionMode = 'DERIVED'; } else v.positionMode = 'EXPLICIT';
}

/**
 * Spec r7.5: every open half-edge of `faceId` whose two ends coincide (within `topologySnapTolM`, reversed) with an open
 * half-edge of another face of the same shell is paired with it; the ends are welded by the rule in the file header.
 * @param {BuildingModel} m mutated @param {string} faceId @param {Set<string>} created vertex ids this command created
 * @param {any} tol
 * @returns {{ paired: string[], welded: [string, string][] }} paired half-edges of `faceId`; [yielding, surviving] vertices
 */
export function closeOpenEdges(m, faceId, created, tol) {
  const shell = Object.values(m.shells).find((s) => s.faceIds.includes(faceId));
  const others = new Set((shell?.faceIds ?? []).filter((f) => f !== faceId));
  const P = (/** @type {string} */ v) => /** @type {P3} */ (m.vertices[v].p);
  const near = (/** @type {string} */ a, /** @type {string} */ b) => a === b || distance(P(a), P(b)) <= tol.topologySnapTolM;
  const candidates = Object.values(m.halfEdges).filter((h) => !h.twinId && others.has(h.faceId)).map((h) => h.id).sort();
  /** @type {[string, string][]} */
  const pairs = [];
  const taken = new Set();
  for (const h of faceHalfEdges(m, faceId).filter((x) => !m.halfEdges[x].twinId).sort()) {
    const a = m.halfEdges[h].startVertexId, b = endOf(m, h);
    const k = candidates.find((c) => !taken.has(c) && near(m.halfEdges[c].startVertexId, b) && near(endOf(m, c), a));
    if (!k) continue;
    taken.add(k);
    pairs.push([h, k]);
  }
  /** @type {[string, string][]} */
  const welded = [];
  const own = new Set(pairs.flatMap(([h]) => [m.halfEdges[h].startVertexId, endOf(m, h)]));
  const weld = (/** @type {string} */ ours, /** @type {string} */ theirs) => {
    if (ours === theirs || !m.vertices[ours] || !m.vertices[theirs]) return;
    const [from, to] = created.has(ours) && !created.has(theirs) ? [ours, theirs] : [theirs, ours];
    mergeVertex(m, from, to);
    welded.push([from, to]);
  };
  for (const [h, k] of pairs) {
    weld(m.halfEdges[h].startVertexId, endOf(m, k));
    weld(endOf(m, h), m.halfEdges[k].startVertexId);
  }
  for (const [h, k] of pairs) { m.halfEdges[h].twinId = k; m.halfEdges[k].twinId = h; }
  for (const [, to] of welded) if (m.vertices[to]) settle(m, to, tol);
  for (const v of own) if (m.vertices[v] && !welded.some(([, t]) => t === v)) settle(m, v, tol);
  assignRoles(m, pairs.flat(), tol.zAlignTolM);
  return { paired: pairs.map(([h]) => h), welded };
}

/** In-plane signed distance of points to a line lying on the plane. @param {Plane} pl @param {[P3, P3]} line */
export function sideOf(pl, line) {
  const u = sub(line[1], line[0]);
  const e = cross(/** @type {P3} */ (pl.normal), /** @type {P3} */ (scale(u, 1 / norm(u))));
  return (/** @type {P3} */ p) => dot(sub(p, line[0]), e);
}
