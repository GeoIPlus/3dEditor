// 3D-08 spike (throwaway, server-only, P4): self-intersection tests for FAST_PREVIEW of the affected faces: ring
// self-crossing in the face's own plane, and face-face crossing of an affected face with every face that shares no
// vertex with it (bounding-box prefilter). Coplanar overlapping faces are not tested here [A] (3D-12 decides).
import { cross, dot, sub } from './linalg.js';

/** @typedef {import('./linalg.js').P3} P3 */
/** @typedef {import('./planes.js').Plane} Plane */
/** @typedef {{ id: string, plane: Plane, rings: P3[][], ids: Set<string>, lo: P3, hi: P3 }} FaceGeom */

/**
 * @param {string} id @param {Plane} plane @param {string[][]} ringIds @param {(v: string) => P3} pos
 * @returns {FaceGeom}
 */
export function faceGeom(id, plane, ringIds, pos) {
  const rings = ringIds.map((r) => r.map(pos));
  /** @type {P3} */ const lo = [Infinity, Infinity, Infinity];
  /** @type {P3} */ const hi = [-Infinity, -Infinity, -Infinity];
  for (const p of rings.flat()) for (let i = 0; i < 3; i++) { if (p[i] < lo[i]) lo[i] = p[i]; if (p[i] > hi[i]) hi[i] = p[i]; }
  return { id, plane, rings, ids: new Set(ringIds.flat()), lo, hi };
}

/** True when two edges of the face's rings cross (projection on the dominant plane). @param {FaceGeom} f */
export function ringSelfCrosses(f) {
  const n = f.plane.normal.map(Math.abs);
  const drop = n[0] >= n[1] && n[0] >= n[2] ? 0 : n[1] >= n[2] ? 1 : 2;
  const [i, j] = [0, 1, 2].filter((k) => k !== drop);
  /** @type {[number, number, number, number][]} */
  const segs = [];
  for (const r of f.rings) r.forEach((a, k) => { const b = r[(k + 1) % r.length]; segs.push([a[i], a[j], b[i], b[j]]); });
  for (let s = 0; s < segs.length; s++) {
    for (let t = s + 1; t < segs.length; t++) {
      const A = segs[s]; const B = segs[t];
      if ((A[2] === B[0] && A[3] === B[1]) || (A[0] === B[2] && A[1] === B[3])) continue; // neighbours share a vertex
      if (properCross(A, B)) return true;
    }
  }
  return false;
}

/** @param {number[]} A @param {number[]} B */
function properCross(A, B) {
  const o = (/** @type {number} */ ax, /** @type {number} */ ay, /** @type {number} */ bx, /** @type {number} */ by, /** @type {number} */ cx, /** @type {number} */ cy) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const d1 = o(A[0], A[1], A[2], A[3], B[0], B[1]); const d2 = o(A[0], A[1], A[2], A[3], B[2], B[3]);
  const d3 = o(B[0], B[1], B[2], B[3], A[0], A[1]); const d4 = o(B[0], B[1], B[2], B[3], A[2], A[3]);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/**
 * True when faces f and g, which share no vertex, cross: the intervals of both polygons on the line of their planes
 * overlap by more than eps.
 * @param {FaceGeom} f @param {FaceGeom} g @param {number} eps
 */
export function facesCross(f, g, eps) {
  for (let i = 0; i < 3; i++) if (f.lo[i] > g.hi[i] + eps || g.lo[i] > f.hi[i] + eps) return false;
  const u = cross(f.plane.normal, g.plane.normal);
  if (dot(u, u) < 1e-12) return false; // parallel or coplanar: not tested by the spike [A]
  const a = intervals(g, f.plane, u, eps);
  if (!a.length) return false;
  const b = intervals(f, g.plane, u, eps);
  for (const [a0, a1] of a) for (const [b0, b1] of b) if (Math.min(a1, b1) - Math.max(a0, b0) > eps) return true;
  return false;
}

/**
 * Parameter intervals (along u) of the part of polygon `poly` that lies in `plane`'s crossing line.
 * @param {FaceGeom} poly @param {Plane} plane @param {P3} u @param {number} eps
 * @returns {[number, number][]}
 */
function intervals(poly, plane, u, eps) {
  /** @type {number[]} */
  const ts = [];
  let pos = false; let neg = false;
  for (const r of poly.rings) {
    const ds = r.map((p) => { const d = dot(plane.normal, p) + plane.d; return Math.abs(d) < eps * 1e-3 ? 0 : d; });
    for (const d of ds) { if (d > eps) pos = true; if (d < -eps) neg = true; }
    r.forEach((a, k) => {
      const b = r[(k + 1) % r.length];
      const da = ds[k]; const db = ds[(k + 1) % r.length];
      // Symbolic perturbation: a vertex on the plane counts as positive, so every crossing is counted once.
      const sa = da >= 0; const sb = db >= 0;
      if (sa === sb) return;
      const t = da / (da - db);
      const p = sub(a, /** @type {P3} */ (sub(a, b).map((x) => x * t)));
      ts.push(dot(p, u));
    });
  }
  if (!pos || !neg) return [];
  ts.sort((x, y) => x - y);
  /** @type {[number, number][]} */
  const out = [];
  for (let k = 0; k + 1 < ts.length; k += 2) out.push([ts[k], ts[k + 1]]);
  return out;
}
