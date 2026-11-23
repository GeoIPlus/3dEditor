// validate (3D-12): SELF_INTERSECTION (spec §8 rules 1-2; v0.2 §16.2) - rings of one face (self-crossing, crossing
// rings, hole outside the outer ring; val3dity 104 / 201 / 206 [A]) and faces of one shell that pierce or overlap each
// other (val3dity 306 [A]). Tolerance-based predicates only (D-3D12-3). The face-pair test is reused by overlap.js.
import { signedDistance, sub, scale, add } from '../brep/index.js';
import { planeBasis, to2d, segmentsMeet, strictlyInside, inRing, bbox, boxesOverlap } from './polygon.js';
import { shellFaces } from './context.js';

/** @typedef {import('./context.js').Ctx} Ctx */
/** @typedef {import('./context.js').RawIssue} RawIssue */
/** @typedef {[number, number, number]} P3 */
/** @typedef {[number, number]} P2 */

/**
 * 2D view of a face in its support plane.
 * @param {Ctx} ctx @param {string} f
 * @returns {{ rings: P2[][], basis: { u: P3, v: P3 }, origin: P3 }}
 */
export function face2d(ctx, f) {
  const n = /** @type {P3} */ (ctx.model.faces[f].supportPlane.normal);
  const basis = planeBasis(n);
  const origin = /** @type {P3} */ (scale(n, -ctx.model.faces[f].supportPlane.d));
  return { rings: ctx.ringPts(f).map((r) => to2d(r, basis, origin)), basis, origin };
}

/**
 * Ring-level self-intersection of one face. Adjacent segments share a vertex and are skipped. [A] Touching counts within
 * `topologySnapTolM`: points nearer than the weld distance would be merged (spec §2.3).
 * @param {Ctx} ctx @param {string} f @returns {string | null} what was found
 */
export function ringIntersection(ctx, f) {
  const { rings } = face2d(ctx, f);
  const tol = ctx.tol.topologySnapTolM;
  for (let ri = 0; ri < rings.length; ri++) {
    const r = rings[ri];
    const m = r.length;
    for (let i = 0; i < m; i++) {
      for (let j = i + 1; j < m; j++) {
        if (j === i + 1 || (i === 0 && j === m - 1)) continue;
        if (segmentsMeet(r[i], r[(i + 1) % m], r[j], r[(j + 1) % m], tol)) return `ring ${ri} segments ${i} and ${j} meet`;
      }
    }
    for (let rj = ri + 1; rj < rings.length; rj++) {
      const s = rings[rj];
      for (let i = 0; i < m; i++) {
        for (let j = 0; j < s.length; j++) {
          if (segmentsMeet(r[i], r[(i + 1) % m], s[j], s[(j + 1) % s.length], tol)) return `rings ${ri} and ${rj} meet`;
        }
      }
    }
    if (ri > 0 && r.length && !inRing(r[0], rings[0])) return `inner ring ${ri} outside the outer ring`;
  }
  return null;
}

/**
 * Does face `a` pierce or lie inside face `b`? (1) an edge of `a` crosses the plane of `b` with both ends farther than
 * `planarTolM` and the crossing point is inside `b`, away from its boundary by more than `topologySnapTolM`; (2) a vertex
 * of `a` that `b` does not use lies on the plane of `b` and inside `b` (coplanar overlap, T-junction).
 * @param {Ctx} ctx @param {string} a @param {string} b
 * @param {boolean} [coplanar] run test (2); false for bodies that may touch (overlap.js)
 * @returns {P3 | null} a point of the intersection
 */
export function facePierces(ctx, a, b, coplanar = true) {
  const { model, tol } = ctx;
  const pb = model.faces[b].supportPlane;
  const vb = new Set(ctx.ringIds(b).flat());
  const fb = face2d(ctx, b);
  /** @param {P3} p */
  const inside = (p) => strictlyInside(to2d([p], fb.basis, fb.origin)[0], fb.rings, tol.topologySnapTolM);
  const ids = ctx.ringIds(a);
  const pts = ctx.ringPts(a);
  for (let ri = 0; ri < pts.length; ri++) {
    const r = pts[ri];
    for (let i = 0; i < r.length; i++) {
      const p = r[i];
      const q = r[(i + 1) % r.length];
      const dp = signedDistance(pb, p);
      const dq = signedDistance(pb, q);
      if (coplanar && !vb.has(ids[ri][i]) && Math.abs(dp) <= tol.planarTolM && inside(p)) return p;
      if ((dp > tol.planarTolM && dq < -tol.planarTolM) || (dp < -tol.planarTolM && dq > tol.planarTolM)) {
        const x = /** @type {P3} */ (add(p, scale(sub(q, p), dp / (dp - dq))));
        if (inside(x)) return x;
      }
    }
  }
  return null;
}

/** @param {Ctx} ctx @param {string} f */
export const faceBox = (ctx, f) => bbox(ctx.ringPts(f).flat());

/**
 * SELF_INTERSECTION for the checked faces: ring-level, then face pairs of the same shell. With an affected set the pair
 * test runs only for checked faces against the faces of their shell whose boxes meet ("affected volume", spec §8 rule 1).
 * @param {Ctx} ctx @param {{ faces: boolean }} opts faces: run the face-pair test
 * @returns {RawIssue[]}
 */
export function selfIntersections(ctx, opts) {
  /** @type {RawIssue[]} */
  const out = [];
  for (const f of [...ctx.faces].sort()) {
    const why = ringIntersection(ctx, f);
    if (why) out.push({ code: 'SELF_INTERSECTION', entityIds: [f], detail: why });
  }
  if (!opts.faces) return out;
  /** @type {Set<string>} */
  const seen = new Set();
  for (const sh of Object.values(ctx.model.shells)) {
    const faces = shellFaces(ctx, sh.id).sort();
    const boxes = new Map(faces.map((f) => [f, faceBox(ctx, f)]));
    for (const a of faces) {
      if (!ctx.faces.has(a)) continue;
      for (const b of faces) {
        if (a === b) continue;
        const key = a < b ? `${a}|${b}` : `${b}|${a}`;
        if (seen.has(key)) continue;
        if (!boxesOverlap(/** @type {any} */ (boxes.get(a)), /** @type {any} */ (boxes.get(b)), ctx.tol.planarTolM)) continue;
        const x = facePierces(ctx, a, b) ?? facePierces(ctx, b, a);
        if (x) {
          seen.add(key);
          out.push({ code: 'SELF_INTERSECTION', entityIds: a < b ? [a, b] : [b, a], location: x, detail: 'faces intersect' });
        }
      }
    }
  }
  return out;
}
