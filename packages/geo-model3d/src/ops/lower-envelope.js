// ops (3D-114): the lower envelope of roof planes (D-339) - plan geometry for RESIZE_ROOF. A roof is its lower
// envelope when z(x, y) = min_i z_i(x, y) over the roof: every shared roof edge is a convex crease (no valley) and no
// plane passes below a roof vertex. Over a convex outline the cell of plane i is the outline clipped by the
// half-planes z_i <= z_j (Sutherland-Hodgman); planes are primary (D-08), corners are where planes meet.
import { cross2, len2, signedArea2, sub2 } from './geom2.js';

/** @typedef {import('./geom2.js').P2} P2 */
/** @typedef {import('../brep/plane.js').Plane} Plane */

/** z = gx * x + gy * y + c of a non-vertical plane. @param {Plane} pl @returns {[number, number, number]} */
export const slopeOf = (pl) => [-pl.normal[0] / pl.normal[2], -pl.normal[1] / pl.normal[2], -pl.d / pl.normal[2]];

/** @param {[number, number, number]} s @param {number} x @param {number} y */
const zOf = (s, x, y) => s[0] * x + s[1] * y + s[2];

/**
 * Roof faces where the roof is not its lower envelope: both faces of a valley edge, and a face whose vertex lies above
 * another roof plane by more than `tolM`.
 * @param {any} d model @param {string[]} roofIds main roof faces (non-vertical planes)
 * @param {{ planarTolM: number }} tol
 * @returns {string[]} sorted, empty when the roof is its lower envelope
 */
export function notLowerEnvelope(d, roofIds, tol) {
  const set = new Set(roofIds);
  const s = Object.fromEntries(roofIds.map((f) => [f, slopeOf(d.faces[f].supportPlane)]));
  /** @type {Set<string>} */
  const bad = new Set();
  for (const h of Object.values(d.halfEdges)) {
    if (!set.has(h.faceId) || !h.twinId) continue;
    const g = d.halfEdges[h.twinId]?.faceId;
    if (!set.has(g) || g === h.faceId) continue;
    const a = d.vertices[h.startVertexId].p, b = d.vertices[d.halfEdges[h.nextId].startVertexId].p;
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy);
    if (l === 0) continue;
    // u points into face h.faceId (rings counter-clockwise seen from above); plane g below it there -> valley
    const u = [-dy / l, dx / l];
    const sf = s[h.faceId], sg = s[g];
    if ((sg[0] - sf[0]) * u[0] + (sg[1] - sf[1]) * u[1] < -1e-9) { bad.add(h.faceId); bad.add(g); }
  }
  for (const h of Object.values(d.halfEdges)) {
    if (!set.has(h.faceId)) continue;
    const p = d.vertices[h.startVertexId].p;
    for (const f of roofIds) if (zOf(s[f], p[0], p[1]) < p[2] - tol.planarTolM) { bad.add(h.faceId); bad.add(f); }
  }
  return [...bad].sort();
}

/**
 * The outline as a strictly convex counter-clockwise ring, or why it is not one.
 * @param {unknown} ring @param {number} minEdgeM
 * @returns {{ ok: true, ring: P2[] } | { ok: false, reason: string }}
 */
export function convexOutline(ring, minEdgeM) {
  const isP = (/** @type {any} */ p) => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]);
  if (!Array.isArray(ring) || !ring.every(isP)) return { ok: false, reason: 'roofOutline' };
  /** @type {P2[]} */
  let r = ring.map((p) => [p[0], p[1]]);
  if (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) r = r.slice(0, -1);
  if (r.length < 3) return { ok: false, reason: 'outline with fewer than three points' };
  if (signedArea2(r) < 0) r = r.reverse();
  let turn = 0;
  for (let i = 0; i < r.length; i++) {
    const e1 = sub2(r[i], r[(i + r.length - 1) % r.length]), e2 = sub2(r[(i + 1) % r.length], r[i]);
    if (len2(e2) < minEdgeM) return { ok: false, reason: 'outline edge shorter than minEdgeLengthM' };
    if (!(cross2(e1, e2) / (len2(e1) * len2(e2)) > 1e-9)) return { ok: false, reason: 'outline is not strictly convex' };
    turn += Math.atan2(cross2(e1, e2), e1[0] * e2[0] + e1[1] * e2[1]);
  }
  if (Math.abs(turn - 2 * Math.PI) > 1e-6) return { ok: false, reason: 'self-intersecting outline' };
  return { ok: true, ring: r };
}

/**
 * Cells of the lower envelope over a convex counter-clockwise outline: one per plane that is lowest somewhere.
 * Corners computed in several cells are merged to one value (`mergeTolM`) so cells share them exactly.
 * @param {P2[]} outline @param {Plane[]} planes @param {number} mergeTolM
 * @returns {{ index: number, ring: P2[] }[]}
 */
export function envelopeCells(outline, planes, mergeTolM) {
  const s = planes.map(slopeOf);
  /** @type {{ index: number, ring: P2[] }[]} */
  const cells = [];
  s.forEach((si, i) => {
    let ring = outline;
    for (let j = 0; j < s.length && ring.length >= 3; j++) {
      if (j === i) continue;
      const sj = s[j];
      // keep z_i - z_j <= 0
      ring = clip(ring, (p) => zOf(si, p[0], p[1]) - zOf(sj, p[0], p[1]));
    }
    ring = dedupe(ring, 1e-9);
    if (ring.length >= 3 && signedArea2(ring) / 2 > 1e-9) cells.push({ index: i, ring });
  });
  /** @type {P2[]} */
  const seen = [...outline];
  for (const c of cells) {
    c.ring = c.ring.map((p) => {
      const q = seen.find((x) => Math.hypot(x[0] - p[0], x[1] - p[1]) <= mergeTolM);
      if (q) return q;
      seen.push(p);
      return p;
    });
    c.ring = dedupe(c.ring, 0);
  }
  return cells;
}

/** Sutherland-Hodgman against f(p) <= 0. @param {P2[]} ring @param {(p: P2) => number} f @returns {P2[]} */
function clip(ring, f) {
  /** @type {P2[]} */
  const out = [];
  const eps = 1e-12;
  for (let k = 0; k < ring.length; k++) {
    const a = ring[k], b = ring[(k + 1) % ring.length];
    const fa = f(a), fb = f(b);
    if (fa <= eps) out.push(a);
    if ((fa < -eps && fb > eps) || (fa > eps && fb < -eps)) {
      const t = fa / (fa - fb);
      out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
  }
  return out;
}

/** Drop consecutive points closer than `eps`. @param {P2[]} ring @param {number} eps @returns {P2[]} */
function dedupe(ring, eps) {
  /** @type {P2[]} */
  const out = [];
  for (const p of ring) {
    const q = out[out.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > eps) out.push(p);
  }
  while (out.length > 1 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) <= eps) out.pop();
  return out;
}
