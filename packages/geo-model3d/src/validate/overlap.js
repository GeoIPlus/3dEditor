// validate (3D-12): SOLID_OVERLAP between the bodies of one building (BuildingPart solids, installations; v0.2 §16.2
// "compatibility of BuildingPart bodies"; GT-18 "no body intersection beyond planarTolM"). Never between buildings:
// D-89 (P1, row 3D-33). Touching bodies (a chimney standing on a slope) are not an overlap.
import { sub, dot, cross, norm, distance, signedDistance } from '../brep/index.js';
import { facePierces, faceBox, face2d } from './intersect.js';
import { boxesOverlap, bbox, to2d, strictlyInside } from './polygon.js';
import { shellFaces } from './context.js';

/** @typedef {import('./context.js').Ctx} Ctx */
/** @typedef {import('./context.js').RawIssue} RawIssue */
/** @typedef {[number, number, number]} P3 */

/**
 * Generalised winding number of `p` about the closed faces (fan triangles per ring; signed sums make non-convex rings
 * and holes exact). ~1 inside an outward shell, ~0 outside.
 * @param {Ctx} ctx @param {string[]} faces @param {P3} p
 * @returns {number}
 */
export function winding(ctx, faces, p) {
  let omega = 0;
  for (const f of faces) {
    for (const r of ctx.ringPts(f)) {
      for (let i = 1; i + 1 < r.length; i++) {
        const a = sub(r[0], p);
        const b = sub(r[i], p);
        const c = sub(r[i + 1], p);
        const la = norm(a);
        const lb = norm(b);
        const lc = norm(c);
        const num = dot(a, cross(b, c));
        const den = la * lb * lc + dot(a, b) * lc + dot(b, c) * la + dot(c, a) * lb;
        omega += 2 * Math.atan2(num, den);
      }
    }
  }
  return omega / (4 * Math.PI);
}

/**
 * Distance of `p` to a face (plane distance when the foot is inside the polygon, else distance to its boundary).
 * @param {Ctx} ctx @param {string} f @param {P3} p @returns {number}
 */
function distToFace(ctx, f, p) {
  const fb = face2d(ctx, f);
  const dPlane = Math.abs(signedDistance(ctx.model.faces[f].supportPlane, p));
  if (strictlyInside(to2d([p], fb.basis, fb.origin)[0], fb.rings, 0)) return dPlane;
  let best = Infinity;
  for (const r of ctx.ringPts(f)) {
    for (let i = 0; i < r.length; i++) {
      const a = r[i];
      const b = r[(i + 1) % r.length];
      const ab = sub(b, a);
      const len2 = dot(ab, ab);
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), ab) / len2));
      best = Math.min(best, distance(p, [a[0] + t * ab[0], a[1] + t * ab[1], a[2] + t * ab[2]]));
    }
  }
  return best;
}

/**
 * Is `p` inside the closed faces deeper than `planarTolM`?
 * @param {Ctx} ctx @param {string[]} faces @param {P3} p @returns {boolean}
 */
function deepInside(ctx, faces, p) {
  if (Math.abs(winding(ctx, faces, p)) < 0.5) return false;
  return faces.every((f) => distToFace(ctx, f, p) > ctx.tol.planarTolM);
}

/** @param {Ctx} ctx @param {string} solidId @returns {string[]} faces of the outer shell */
const outerFaces = (ctx, solidId) => shellFaces(ctx, ctx.model.solids[solidId].outerShellId);

/**
 * SOLID_OVERLAP for every pair of solids with a checked face. Evidence, in order: a face of one pierces a face of the
 * other; a vertex of one lies deeper than `planarTolM` inside the other; the vertex centroid of one lies inside the other
 * (duplicated or nested bodies) [A].
 * @param {Ctx} ctx @returns {RawIssue[]}
 */
export function solidOverlaps(ctx) {
  const ids = Object.keys(ctx.model.solids).sort();
  const faces = new Map(ids.map((s) => [s, outerFaces(ctx, s)]));
  const boxes = new Map(ids.map((s) => [s, bbox(/** @type {string[]} */ (faces.get(s)).flatMap((f) => ctx.ringPts(f).flat()))]));
  /** @type {RawIssue[]} */
  const out = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const A = /** @type {string[]} */ (faces.get(ids[i]));
      const B = /** @type {string[]} */ (faces.get(ids[j]));
      if (!A.length || !B.length) continue;
      if (!ctx.all && !A.some((f) => ctx.faces.has(f)) && !B.some((f) => ctx.faces.has(f))) continue;
      if (!boxesOverlap(/** @type {any} */ (boxes.get(ids[i])), /** @type {any} */ (boxes.get(ids[j])), -ctx.tol.planarTolM)) continue;
      const hit = findOverlap(ctx, A, B);
      if (hit) out.push({ code: 'SOLID_OVERLAP', entityIds: [ids[i], ids[j]], location: hit, detail: 'bodies overlap' });
    }
  }
  return out;
}

/** @param {Ctx} ctx @param {string[]} A @param {string[]} B @returns {P3 | null} */
function findOverlap(ctx, A, B) {
  for (const a of A) {
    const ba = faceBox(ctx, a);
    for (const b of B) {
      if (!boxesOverlap(ba, faceBox(ctx, b), ctx.tol.planarTolM)) continue;
      const x = piercesAcross(ctx, a, b) ?? piercesAcross(ctx, b, a);
      if (x) return x;
    }
  }
  for (const [X, Y] of [[A, B], [B, A]]) {
    const pts = X.flatMap((f) => ctx.ringPts(f).flat());
    for (const p of pts) if (deepInside(ctx, Y, p)) return p;
    const sum = (/** @type {number} */ k) => pts.reduce((s, p) => s + p[k], 0) / pts.length;
    /** @type {P3} */
    const c = [sum(0), sum(1), sum(2)];
    if (deepInside(ctx, Y, c)) return c;
  }
  return null;
}

/** Edge crossing only: the coplanar test would flag bodies that merely touch. @param {Ctx} ctx @param {string} a @param {string} b */
const piercesAcross = (ctx, a, b) => facePierces(ctx, a, b, false);
