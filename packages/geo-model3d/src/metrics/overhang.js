// metrics (3D-116): overhang volume by boundary-loop closure (D-414). The main body's faces tagged OVERHANG are
// grouped by shared edges (a shared vertex does not connect, OVM-15). Per group:
//   1. its boundary = half-edges whose twin face is outside the group; a missing twin fails (open, OVM-08);
//   2. the boundary forms exactly one simple closed loop: no vertex starts two boundary edges (branch, OVM-09), every
//      boundary edge on the one cycle (several loops, OVM-11), no edge of length <= numericEpsilon;
//   3. the closing plane is the support plane of a non-OVERHANG WallSurface bordering the loop that holds every loop
//      vertex within numericEpsilon (the normalised plane, OVM-35; never planarTolM, no projection, OVM-12, OVM-33);
//   4. the loop, in that plane's 2D basis, does not cross itself (OVM-10);
//   5. the group lies on the outer side of that wall plane (no protrusion into the main body, OVM-27);
//   6. volume = signed divergence sum of the group's rings about the loop centroid c: the virtual fan closure from c
//      lies in the plane through c and adds 0, so it is never built (OVM-07, concave loops included); the volume must
//      be finite and > numericEpsilon (a wrong orientation is a failure, OVM-13; a flat group is empty).
// Groups must be proven disjoint by a separating plane (their walls or face planes). Any failure -> the split is unknown (null), never a partial
// sum (OVM-25). No OVERHANG face -> 0.
import { dot, norm, endVertexId } from '../brep/index.js';
import { planeBasis, to2d, segmentsMeet } from '../validate/polygon.js';
import { signedVolume } from './volume.js';
import { hasTag } from './body.js';

/** @typedef {import('./body.js').Body} Body */
/** @typedef {[number, number, number]} P3 */

/**
 * @param {Body} body @param {number} eps numericEpsilon (m)
 * @returns {{ volume: number | null, groups: number[], reason?: string }} total overhang volume (null = not proven), group
 *   volumes, and on failure an internal reason code (tests only; not a contract member, D-414)
 */
export function overhangVolume(body, eps) {
  const m = body.model;
  const tagged = new Set(body.faceIds.filter((f) => hasTag(m, f, 'OVERHANG')));
  if (!tagged.size) return { volume: 0, groups: [] };
  const groups = components(body, tagged);
  /** @type {number[]} */
  const vols = [];
  /** @type {{ pts: P3[], planes: { n: P3, d: number }[] }[]} */
  const parts = [];
  for (const g of groups) {
    const v = groupVolume(body, g, eps);
    if (typeof v === 'string') return { volume: null, groups: [], reason: v };
    vols.push(v.volume);
    parts.push({ pts: [...g].flatMap((f) => body.rings(f).flat()), planes: [v.wall, ...[...g].map((f) => facePlane(body, f))] });
  }
  for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
    if (!separated(parts[i], parts[j], eps)) return { volume: null, groups: [], reason: 'OVERLAP' };
  }
  return { volume: vols.reduce((s, v) => s + v, 0), groups: vols };
}

/** Normalised support plane of a face in the body's origin. @param {Body} body @param {string} f */
function facePlane(body, f) {
  const sp = body.model.faces[f].supportPlane, len = norm(sp.normal);
  const n = /** @type {P3} */ (sp.normal.map((x) => x / len));
  return { n, d: sp.d / len + dot(n, body.origin) };
}

/**
 * Two groups are proven disjoint when one of their planes (closing wall or face support plane) has one group on each
 * side (within eps). Sufficient, not necessary: an unproven pair is reported as an overlap (OVM-27).
 * @param {{ pts: P3[], planes: { n: P3, d: number }[] }} a @param {{ pts: P3[], planes: { n: P3, d: number }[] }} b
 * @param {number} eps
 */
function separated(a, b, eps) {
  for (const pl of [...a.planes, ...b.planes]) {
    const side = (/** @type {P3[]} */ pts) => pts.map((p) => dot(pl.n, p) + pl.d);
    const sa = side(a.pts), sb = side(b.pts);
    if ((Math.max(...sa) <= eps && Math.min(...sb) >= -eps) || (Math.min(...sa) >= -eps && Math.max(...sb) <= eps)) return true;
  }
  return false;
}

/** Connected components of the tagged faces through shared edges. @param {Body} body @param {Set<string>} tagged */
export function components(body, tagged) {
  const m = body.model;
  /** @type {Map<string, Set<string>>} */
  const adj = new Map([...tagged].map((f) => [f, new Set()]));
  for (const he of Object.values(m.halfEdges)) {
    const t = he.twinId ? m.halfEdges[he.twinId] : null;
    if (t && tagged.has(he.faceId) && tagged.has(t.faceId) && he.faceId !== t.faceId) adj.get(he.faceId)?.add(t.faceId);
  }
  /** @type {Set<string>[]} */
  const out = [];
  const seen = new Set();
  for (const f of [...tagged].sort()) {
    if (seen.has(f)) continue;
    const g = new Set([f]), stack = [f];
    seen.add(f);
    while (stack.length) for (const n of adj.get(/** @type {string} */ (stack.pop())) ?? []) {
      if (!seen.has(n)) { seen.add(n); g.add(n); stack.push(n); }
    }
    out.push(g);
  }
  return out;
}

/**
 * @param {Body} body @param {Set<string>} g @param {number} eps
 * @returns {{ volume: number, wall: { n: P3, d: number } } | string} volume and closing plane, or the failure reason
 */
function groupVolume(body, g, eps) {
  const m = body.model;
  const index = body.index;
  /** @type {string[]} */
  const boundary = [];
  for (const f of g) for (const ring of [index.outer.get(f) ?? [], ...(index.inner.get(f) ?? [])]) for (const h of ring) {
    const he = m.halfEdges[h];
    if (!he.twinId || !m.halfEdges[he.twinId]) return 'OPEN';
    if (!g.has(m.halfEdges[he.twinId].faceId)) boundary.push(h);
  }
  const loop = singleLoop(m, boundary);
  if (typeof loop === 'string') return loop;
  const pts = loop.map((h) => relP(body, m.halfEdges[h].startVertexId));
  for (let i = 0; i < pts.length; i++) if (!(dist(pts[i], pts[(i + 1) % pts.length]) > eps)) return 'ZERO_EDGE';
  const plane = wallPlane(body, g, loop, pts, eps);
  if (!plane) return 'NOT_IN_WALL_PLANE';
  if (loopSelfIntersects(to2d(pts, planeBasis(plane.n), pts[0]), eps)) return 'SELF_INTERSECTION';
  for (const f of g) for (const r of body.rings(f)) for (const p of r) if (dot(plane.n, p) + plane.d < -eps) return 'PROTRUDES';
  const c = /** @type {P3} */ ([0, 1, 2].map((k) => pts.reduce((s, p) => s + p[k], 0) / pts.length));
  const vol = signedVolume(body, g, c);
  if (!Number.isFinite(vol)) return 'NOT_FINITE';
  return vol > eps ? { volume: vol, wall: plane } : vol < -eps ? 'ORIENTATION' : 'EMPTY';
}

/**
 * Two non-adjacent edges of a closed 2D loop meet (within eps).
 * @param {[number, number][]} p2 @param {number} eps @returns {boolean}
 */
export function loopSelfIntersects(p2, eps) {
  const n = p2.length;
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue;
    if (segmentsMeet(p2[i], p2[(i + 1) % n], p2[j], p2[(j + 1) % n], eps)) return true;
  }
  return false;
}

/** @param {P3} a @param {P3} b */
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Vertex position relative to the body origin. @param {Body} body @param {string} v @returns {P3} */
const relP = (body, v) => {
  const p = body.model.vertices[v].p, o = body.origin;
  return [p[0] - o[0], p[1] - o[1], p[2] - o[2]];
};

/**
 * The boundary half-edges as one simple cycle in order, or the failure reason.
 * @param {import('../brep/types.js').BuildingModel} m @param {string[]} boundary
 */
function singleLoop(m, boundary) {
  if (boundary.length < 3) return 'NO_LOOP';
  /** @type {Map<string, string>} */
  const byStart = new Map();
  for (const h of boundary) {
    const s = m.halfEdges[h].startVertexId;
    if (byStart.has(s)) return 'BRANCH';
    byStart.set(s, h);
  }
  const loop = [boundary[0]];
  for (;;) {
    const next = byStart.get(endVertexId(m, loop[loop.length - 1]));
    if (!next) return 'OPEN';
    if (next === loop[0]) break;
    if (loop.length >= boundary.length) return 'BRANCH';
    loop.push(next);
  }
  return loop.length === boundary.length ? loop : 'MULTIPLE_LOOPS';
}

/**
 * Support plane (normalised, in the body's origin) of a bordering non-OVERHANG WallSurface that holds every loop point.
 * @param {Body} body @param {Set<string>} g @param {string[]} loop @param {P3[]} pts @param {number} eps
 */
function wallPlane(body, g, loop, pts, eps) {
  const m = body.model;
  const walls = [...new Set(loop.map((h) => m.halfEdges[/** @type {string} */ (m.halfEdges[h].twinId)].faceId))]
    .filter((f) => !g.has(f) && m.faces[f].surfaceKind === 'WallSurface' && !hasTag(m, f, 'OVERHANG')).sort();
  for (const w of walls) {
    const sp = m.faces[w].supportPlane, len = norm(sp.normal);
    if (!(len > 0)) continue;
    /** @type {P3} */
    const n = [sp.normal[0] / len, sp.normal[1] / len, sp.normal[2] / len];
    const d = sp.d / len + dot(n, body.origin);
    if (pts.every((p) => Math.abs(dot(n, p) + d) <= eps)) return { n, d };
  }
  return null;
}
