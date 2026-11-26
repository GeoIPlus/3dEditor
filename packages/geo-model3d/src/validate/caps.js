// validate (3D-117, D-343): verified overhang end caps. A `SET_OVERHANG` end cap (D-337: own WallSurface + OVERHANG
// triangle in the plane of its gable wall, built by ops/overhang.js as oA -> A -> sA) can be smaller than
// `minFaceAreaM2` (GT-14: 0.09375 m2). D-343 separates mathematical degeneracy from the minimum-area policy: a cap that
// passes all ten conditions below is measured together with its coplanar end wall; never on the tag alone. Any failed
// condition -> not a verified cap (the caller then reports DEGENERATE_FACE as before); this module never throws on a
// malformed model.
//   C1 WallSurface + OVERHANG              C6 strip and soffit share an edge at the apex
//   C2 one outer ring of three vertices    C7 end wall vertical
//   C3 non-degenerate (area, edge lengths) C8 coplanar with the end wall
//   C4 manifold (twins point back)         C9 no self-intersection, no overlap with the end wall
//   C5 neighbours: end wall, strip, soffit C10 area(cap) + area(end wall) >= minFaceAreaM2
import { dot, distance, signedDistance } from '../brep/index.js';
import { faceArea, to2d, orient2, segmentsMeet, strictlyInside } from './polygon.js';
import { face2d, ringIntersection } from './intersect.js';

/** @typedef {import('./context.js').Ctx} Ctx */
/** @typedef {[number, number, number]} P3 */

const OVERHANG = 'OVERHANG';
/** @param {any} f @param {string} kind @param {boolean} over */
const is = (f, kind, over) => !!f && f.surfaceKind === kind && Array.isArray(f.tags) && f.tags.includes(OVERHANG) === over;

/**
 * The end wall of `capId` when the face is a verified overhang end cap (D-343, conditions C1..C10), else null.
 * @param {Ctx} ctx @param {string} capId @param {number} capArea area of the cap's rings
 * @returns {string | null}
 */
export function verifiedCapWall(ctx, capId, capArea) {
  try {
    return check(ctx, capId, capArea);
  } catch {
    return null; // a malformed model is never a verified cap; the plain checks report it
  }
}

/** @param {Ctx} ctx @param {string} capId @param {number} capArea @returns {string | null} */
function check(ctx, capId, capArea) {
  const { model, tol } = ctx;
  const cap = model.faces[capId];
  if (!is(cap, 'WallSurface', true)) return null; // C1
  const ring = ctx.index.outer.get(capId) ?? [];
  if ((ctx.index.inner.get(capId) ?? []).length || cap.innerLoopIds?.length || ring.length !== 3) return null; // C2
  const hs = ring.map((h) => model.halfEdges[h]);
  const vs = hs.map((h) => h.startVertexId);
  if (new Set(vs).size !== 3) return null; // C2
  const pts = vs.map((v) => /** @type {P3} */ (model.vertices[v]?.p));
  if (pts.some((p) => !p)) return null;
  if (!(capArea > tol.numericEpsilon)) return null; // C3
  if (pts.some((p, i) => !(distance(p, pts[(i + 1) % 3]) >= tol.minEdgeLengthM))) return null; // C3
  /** @type {string[]} */
  const across = [];
  for (let i = 0; i < 3; i++) { // C4
    const twId = hs[i].twinId, tw = twId ? model.halfEdges[twId] : undefined;
    if (!tw || tw.twinId !== hs[i].id || tw.faceId === capId || !model.faces[tw.faceId]) return null;
    if (tw.startVertexId !== vs[(i + 1) % 3] || model.halfEdges[tw.nextId]?.startVertexId !== vs[i]) return null;
    across.push(tw.faceId);
  }
  if (new Set(across).size !== 3) return null; // C5
  const wi = across.findIndex((f) => is(model.faces[f], 'WallSurface', false));
  const si = across.findIndex((f) => is(model.faces[f], 'RoofSurface', true));
  const oi = across.findIndex((f) => is(model.faces[f], 'OuterCeilingSurface', true));
  if (wi < 0 || si < 0 || oi < 0) return null; // C5
  const wallId = across[wi], wall = model.faces[wallId];
  const apex = vs[(wi + 2) % 3]; // the vertex off the end-wall edge vs[wi] -> vs[wi + 1]
  if (!sharesEdgeAt(ctx, across[si], across[oi], apex)) return null; // C6
  const wn = /** @type {P3} */ (wall.supportPlane.normal), cn = /** @type {P3} */ (cap.supportPlane.normal);
  if (!(Math.abs(wn[2]) <= tol.numericEpsilon)) return null; // C7
  if (!(dot(wn, cn) >= 1 - tol.numericEpsilon) || !(Math.abs(wall.supportPlane.d - cap.supportPlane.d) <= tol.planarTolM)) return null; // C8
  if (pts.some((p) => !(Math.abs(signedDistance(wall.supportPlane, p)) <= tol.planarTolM))) return null; // C8
  if (ringIntersection(ctx, capId) || ringIntersection(ctx, wallId)) return null; // C9
  if (!apart(ctx, capId, wallId, vs, wi)) return null; // C9
  const wallArea = faceArea(ctx.ringPts(wallId), wn);
  if (!(capArea + wallArea >= tol.minFaceAreaM2)) return null; // C10
  return wallId;
}

/** Do faces `a` and `b` share an edge (twins) with one end at `v`? @param {Ctx} ctx @param {string} a @param {string} b @param {string} v */
function sharesEdgeAt(ctx, a, b, v) {
  const { model } = ctx;
  for (const h of ctx.index.outer.get(a) ?? []) {
    const he = model.halfEdges[h];
    const tw = he.twinId ? model.halfEdges[he.twinId] : undefined;
    if (tw && tw.faceId === b && (he.startVertexId === v || tw.startVertexId === v)) return true;
  }
  return false;
}

/**
 * C9: cap and end wall do not overlap in their common plane. The apex lies strictly on the far side of the shared edge
 * (away from the wall's own next vertex side); no cap edge crosses a wall edge away from shared vertices; no vertex of
 * one lies strictly inside the other (tolerances of intersect.js: `topologySnapTolM`).
 * @param {Ctx} ctx @param {string} capId @param {string} wallId @param {string[]} vs cap ring vertex ids
 * @param {number} wi index of the cap edge on the end wall
 */
function apart(ctx, capId, wallId, vs, wi) {
  const snap = ctx.tol.topologySnapTolM;
  const fw = face2d(ctx, wallId);
  const cap2 = to2d(ctx.ringPts(capId)[0], fw.basis, fw.origin);
  const wallIds = ctx.ringIds(wallId);
  if (wallIds.length !== fw.rings.length) return false;
  const a = cap2[wi], b = cap2[(wi + 1) % 3], apex = cap2[(wi + 2) % 3];
  // the cap turns counter-clockwise about the shared normal (C8), so its apex is left of a -> b; the wall lies right of it
  if (!(orient2(a, b, apex) > 0)) return false;
  const capSet = new Set(vs);
  for (let r = 0; r < fw.rings.length; r++) {
    const ring = fw.rings[r], ids = wallIds[r];
    for (let j = 0; j < ring.length; j++) {
      const p = ring[j], q = ring[(j + 1) % ring.length];
      const pId = ids[j], qId = ids[(j + 1) % ids.length];
      if (!capSet.has(pId) && strictlyInside(p, [cap2], snap)) return false;
      for (let i = 0; i < 3; i++) {
        const u = vs[i], w = vs[(i + 1) % 3];
        if (u === pId || u === qId || w === pId || w === qId) continue;
        if (segmentsMeet(cap2[i], cap2[(i + 1) % 3], p, q, snap)) return false;
      }
    }
  }
  return !(strictlyInside(apex, fw.rings, snap));
}
