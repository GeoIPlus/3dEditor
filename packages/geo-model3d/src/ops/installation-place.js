// ops (3D-20): placement of an installation on a roof face (spec §10.11 r1 "roof attachment plane -> placement and
// bounds"): the roof face and its body, its plane and plan rings, and the checks of a base outline against it.
// Refusals (D-3D20-4): unknown face -> INVALID_PAYLOAD (as D-228); not a RoofSurface of a Building / BuildingPart
// body -> INVALID_PAYLOAD; a point off the roof plane beyond `planarTolM`, a self-crossing or degenerate outline, an
// outline not inside the roof face -> INVALID_GEOMETRY.
import { buildIndex, faceRings, signedDistance } from '../brep/index.js';
import { distToSegment2, inRing, orient2, segmentsMeet } from '../validate/polygon.js';
import { orient, signedArea2 } from './geom2.js';
import { refuse } from './errors.js';

/** @typedef {import('./geom2.js').P2} P2 */
/** @typedef {[number, number, number]} P3 */
/** @typedef {import('../brep/plane.js').Plane} Plane */
/** @typedef {import('../brep/types.js').BuildingModel} BuildingModel */
/** @typedef {{ ok: false, refusal: import('./errors.js').ContractError }} Refusal */

/**
 * @typedef {object} RoofPlace
 * @property {string} faceId
 * @property {Plane} plane the roof face's support plane, normal pointing up (outward of the building)
 * @property {P2[][]} rings plan rings of the face, outer first
 * @property {string} ownerId semantic node (Building / BuildingPart) whose body the face belongs to
 */

/**
 * @param {BuildingModel} draft @param {unknown} roofFaceId @param {number} eps `numericEpsilon`
 * @returns {{ ok: true, roof: RoofPlace } | Refusal}
 */
export function resolveRoof(draft, roofFaceId, eps) {
  if (typeof roofFaceId !== 'string') return refuse('INVALID_PAYLOAD', [], 'roofFaceId');
  const face = draft.faces[roofFaceId];
  if (!face) return refuse('INVALID_PAYLOAD', [roofFaceId], 'unknown roofFaceId (D-3D20-4)');
  if (face.surfaceKind !== 'RoofSurface') return refuse('INVALID_PAYLOAD', [roofFaceId], 'not a RoofSurface (D-3D20-4)');
  const shell = Object.values(draft.shells).find((s) => s.faceIds.includes(roofFaceId));
  const solid = shell && Object.values(draft.solids).find((s) => s.outerShellId === shell.id);
  const owner = solid && Object.values(draft.semantics).find((s) => s.solidIds.includes(solid.id));
  if (!owner || (owner.kind !== 'Building' && owner.kind !== 'BuildingPart')) {
    return refuse('INVALID_PAYLOAD', [roofFaceId], 'roof face not in a Building / BuildingPart body (D-3D20-4)');
  }
  const pl = face.supportPlane;
  if (!(pl.normal[2] > eps)) return refuse('INVALID_GEOMETRY', [roofFaceId], 'roof face is vertical or faces down');
  const index = buildIndex(draft);
  const rings = faceRings(draft, index, roofFaceId).map((r) => r.map((v) => /** @type {P2} */ ([draft.vertices[v].p[0], draft.vertices[v].p[1]])));
  return { ok: true, roof: { faceId: roofFaceId, plane: pl, rings, ownerId: owner.id } };
}

/**
 * A payload point in the local frame (WORLD points are mapped by the pipeline's `pointToLocal`).
 * @param {unknown} p @param {import('./pipeline.js').OpContext} ctx
 * @returns {P3 | null}
 */
export function localPoint(p, ctx) {
  if (!Array.isArray(p) || p.length !== 3 || !p.every((x) => typeof x === 'number' && Number.isFinite(x))) return null;
  const q = /** @type {P3} */ (p);
  return ctx.frame === 'WORLD' ? ctx.pointToLocal(q, 'WORLD') : q;
}

/**
 * Every point on the roof plane within `planarTolM`.
 * @param {P3[]} pts @param {RoofPlace} roof @param {number} planarTolM
 * @returns {Refusal | null}
 */
export function onRoofPlane(pts, roof, planarTolM) {
  const off = pts.findIndex((p) => !(Math.abs(signedDistance(roof.plane, p)) <= planarTolM));
  return off < 0 ? null : refuse('INVALID_GEOMETRY', [roof.faceId], `point ${off} is off the roof plane (D-3D20-4)`);
}

/**
 * Normalise a plan outline (counter-clockwise, no closing duplicate) and check it: at least three points, area above
 * `minFaceAreaM2`, no two non-adjacent edges meeting, no zero-length edge (D-3D20-4).
 * @param {P2[]} pts @param {RoofPlace} roof @param {{ minFaceAreaM2: number, topologySnapTolM: number }} tol
 * @returns {{ ok: true, ring: P2[] } | Refusal}
 */
export function planOutline(pts, roof, tol) {
  let r = pts.slice();
  const same = (/** @type {P2} */ a, /** @type {P2} */ b) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= tol.topologySnapTolM;
  if (r.length > 1 && same(r[0], r[r.length - 1])) r = r.slice(0, -1);
  const bad = (/** @type {string} */ why) => refuse('INVALID_GEOMETRY', [roof.faceId], `${why} (D-3D20-4)`);
  if (r.length < 3) return bad('outline with fewer than three points');
  if (r.some((p, i) => same(p, r[(i + 1) % r.length]))) return bad('outline with a zero-length edge');
  if (!(Math.abs(signedArea2(r)) / 2 > tol.minFaceAreaM2)) return bad('outline area too small');
  const n = r.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segmentsMeet(r[i], r[(i + 1) % n], r[j], r[(j + 1) % n], tol.topologySnapTolM)) return bad('self-crossing outline');
    }
  }
  return { ok: true, ring: orient(r, true).ring };
}

/**
 * Is the outline inside the roof face in plan (on its boundary allowed within `topologySnapTolM`)? Every outline
 * vertex and edge midpoint is inside-or-on the outer ring and not strictly inside a hole, and no outline edge
 * properly crosses a face edge.
 * @param {P2[]} ring @param {RoofPlace} roof @param {number} snap
 * @returns {Refusal | null}
 */
export function insideRoof(ring, roof, snap) {
  const near = (/** @type {P2} */ p, /** @type {P2[]} */ rr) => rr.some((a, i) => distToSegment2(p, a, rr[(i + 1) % rr.length]) <= snap);
  const [outer, ...holes] = roof.rings;
  const probes = ring.flatMap((p, i) => {
    const q = ring[(i + 1) % ring.length];
    return [p, /** @type {P2} */ ([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2])];
  });
  const outside = probes.some((p) => (!inRing(p, outer) && !near(p, outer)) || holes.some((h) => inRing(p, h) && !near(p, h)));
  if (outside || crosses(ring, roof.rings, snap)) {
    return refuse('INVALID_GEOMETRY', [roof.faceId], 'outline not inside the roof face (D-3D20-4)');
  }
  return null;
}

/** Proper crossing (beyond `snap` on both sides) of an outline edge with a ring edge. @param {P2[]} ring @param {P2[][]} rings @param {number} snap */
function crosses(ring, rings, snap) {
  const side = (/** @type {P2} */ a, /** @type {P2} */ b, /** @type {P2} */ c) => orient2(a, b, c) / Math.hypot(b[0] - a[0], b[1] - a[1]);
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    for (const rr of rings) {
      for (let k = 0; k < rr.length; k++) {
        const c = rr[k], d = rr[(k + 1) % rr.length];
        const s1 = side(c, d, a), s2 = side(c, d, b), s3 = side(a, b, c), s4 = side(a, b, d);
        if (Math.abs(s1) > snap && Math.abs(s2) > snap && Math.abs(s3) > snap && Math.abs(s4) > snap && s1 * s2 < 0 && s3 * s4 < 0) return true;
      }
    }
  }
  return false;
}
