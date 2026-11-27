// ops (3D-19): overhang topology of SET_OVERHANG (D-336, D-337) - shared by SET_OVERHANG and SET_HEIGHT EAVE.
// At a structural eave A -> B of roof face R over wall W, with end walls GA (at A) and GB (at B):
//   strip  RoofSurface + OVERHANG, plane of R:          B -> A -> oA -> oB
//   soffit OuterCeilingSurface + OVERHANG, level:        oB -> oA -> sA -> sB
//   capA / capB WallSurface + OVERHANG, plane of GA/GB:  oA -> A -> sA  /  B -> oB -> sB
// W's top edge B -> A becomes sB -> sA; GA and GB get the collinear vertices sA, sB (no T-junction).
// Planes are primary (D-08): the outer edge is strip ∩ soffit ∩ cap, so the width in plan is carried by the soffit
// plane (through the outer edge at both corners, D-463); oA, oB, sA, sB are derived from three planes. A and B
// keep only two independent planes (R, GA / GB) and become EXPLICIT at R ∩ W ∩ G (spec §4 r3; definingFaceIds must be incident faces, brep checkTopology) - a recorded
// limitation for other rows' operations (D-341). The width is recovered from the geometry (signed distance of oA
// from W); a removed overhang hands its ids back so a rebuild adds no new entities.
import { derivePoint, signedDistance } from '../brep/index.js';
import { pairRole } from './topology.js';
import { refuse } from './errors.js';

/** @typedef {[number, number, number]} P3 */
/** @typedef {{ normal: P3, d: number }} Plane */
/**
 * @typedef {object} Slots ids of one overhang
 * @property {string} strip @property {string} soffit @property {string} capA @property {string} capB
 * @property {string} oA @property {string} oB @property {string} sA @property {string} sB
 * @property {Record<string, string>} he strip t,a1,a2,a3; soffit q0..q3; caps c0..c2, d0..d2; end walls g1, g2
 */

const OVERHANG = 'OVERHANG';
const isOver = (/** @type {any} */ f, /** @type {string} */ kind) => f && f.surfaceKind === kind && f.tags.includes(OVERHANG);
const vertical = (/** @type {any} */ f, /** @type {number} */ eps) => f.surfaceKind === 'WallSurface' && Math.abs(f.supportPlane.normal[2]) <= eps;
/** @param {any} d @param {string} id */
const twin = (d, id) => d.halfEdges[/** @type {string} */ (d.halfEdges[id].twinId)];
/** @param {any} d @param {string} v @returns {Set<string>} */
const facesAt = (d, v) => new Set(Object.values(d.halfEdges).filter((h) => h.startVertexId === v).map((h) => h.faceId));

/**
 * The overhang at a structural eave, if any. A partial or ambiguous overhang -> INVALID_TOPOLOGY (D-341: no hidden
 * heuristics).
 * @param {any} d @param {string} hId main-roof half-edge of the structural eave
 * @returns {{ ok: true, found: null | (Slots & { width: number, wall: string, gA: string, gB: string }) } | { ok: false, refusal: any }}
 */
export function findOverhang(d, hId) {
  const h = d.halfEdges[hId];
  const t = h.twinId ? d.halfEdges[h.twinId] : undefined;
  if (!t || !d.faces[t.faceId].tags.includes(OVERHANG)) return { ok: true, found: null };
  const bad = () => refuse('INVALID_TOPOLOGY', [hId, t.faceId], 'overhang faces do not form the D-336 profile');
  const a1 = d.halfEdges[t.nextId], a2 = d.halfEdges[a1.nextId], a3 = d.halfEdges[a2.nextId];
  if (a3.nextId !== t.id || !isOver(d.faces[t.faceId], 'RoofSurface') || !a1.twinId || !a2.twinId || !a3.twinId) return bad();
  const q0 = twin(d, a2.id), q1 = d.halfEdges[q0.nextId], q2 = d.halfEdges[q1.nextId], q3 = d.halfEdges[q2.nextId];
  const c0 = twin(d, a1.id), c1 = d.halfEdges[c0.nextId], c2 = d.halfEdges[c1.nextId];
  const d0 = twin(d, a3.id), d1 = d.halfEdges[d0.nextId], d2 = d.halfEdges[d1.nextId];
  if (q3.nextId !== q0.id || c2.nextId !== c0.id || d2.nextId !== d0.id || !q2.twinId || !c1.twinId || !d2.twinId) return bad();
  if (!isOver(d.faces[q0.faceId], 'OuterCeilingSurface') || !isOver(d.faces[c0.faceId], 'WallSurface') || !isOver(d.faces[d0.faceId], 'WallSurface')) return bad();
  const w2 = twin(d, q2.id), g1 = twin(d, c1.id), g2 = twin(d, d2.id);
  const wall = d.faces[w2.faceId];
  if (wall.tags.includes(OVERHANG) || d.faces[g1.faceId].tags.includes(OVERHANG) || d.faces[g2.faceId].tags.includes(OVERHANG)) return bad();
  const oA = a2.startVertexId;
  return {
    ok: true,
    found: {
      strip: t.faceId, soffit: q0.faceId, capA: c0.faceId, capB: d0.faceId,
      oA, oB: a3.startVertexId, sA: q2.startVertexId, sB: q3.startVertexId,
      he: { t: t.id, a1: a1.id, a2: a2.id, a3: a3.id, q0: q0.id, q1: q1.id, q2: q2.id, q3: q3.id, c0: c0.id, c1: c1.id, c2: c2.id, d0: d0.id, d1: d1.id, d2: d2.id, g1: g1.id, g2: g2.id },
      width: signedDistance(wall.supportPlane, d.vertices[oA].p), wall: w2.faceId, gA: g1.faceId, gB: g2.faceId,
    },
  };
}

/**
 * Remove an overhang and restore the plain eave (W's top edge, end-wall loops, A and B derived from R, W, G).
 * @param {any} d mutated @param {string} hId @param {NonNullable<Extract<ReturnType<typeof findOverhang>, { ok: true }>['found']>} f
 * @param {number} eps @returns {Slots} the ids, for a rebuild
 */
export function removeOverhang(d, hId, f, eps) {
  const h = d.halfEdges[hId], he = f.he;
  const A = h.startVertexId, B = d.halfEdges[he.t].startVertexId;
  const w2 = twin(d, he.q2), wn = d.halfEdges[w2.nextId];
  w2.startVertexId = B; wn.startVertexId = A;
  w2.twinId = h.id; h.twinId = w2.id; w2.edgeRole = 'EAVE'; h.edgeRole = 'EAVE';
  unlink(d, he.g1);
  const g2 = d.halfEdges[he.g2], after = d.halfEdges[g2.nextId];
  after.startVertexId = B;
  unlink(d, he.g2);
  for (const k of ['t', 'a1', 'a2', 'a3', 'q0', 'q1', 'q2', 'q3', 'c0', 'c1', 'c2', 'd0', 'd1', 'd2']) delete d.halfEdges[he[k]];
  const gone = [f.strip, f.soffit, f.capA, f.capB];
  for (const id of gone) delete d.faces[id];
  for (const v of [f.oA, f.oB, f.sA, f.sB]) delete d.vertices[v];
  for (const s of Object.values(d.shells)) s.faceIds = s.faceIds.filter((/** @type {string} */ x) => !gone.includes(x));
  for (const rc of Object.values(d.roofComponents)) rc.faceIds = rc.faceIds.filter((/** @type {string} */ x) => x !== f.strip);
  for (const [v, cap] of [[A, f.capA], [B, f.capB]]) {
    const vx = d.vertices[v];
    vx.definingFaceIds = vx.definingFaceIds.filter((/** @type {string} */ x) => x !== cap).map((/** @type {string} */ x) => (x === f.strip ? f.wall : x));
    place(d, v, eps);
  }
  const { width: _w, wall: _x, gA: _a, gB: _b, ...slots } = f;
  return slots;
}

/**
 * Add an overhang of `width` (> 0, in plan) at the structural eave `hId`, with the ids of `reuse` if given.
 * @param {any} d mutated @param {string} hId @param {number} width @param {{ ids: (k: string) => string, tol: any }} ctx
 * @param {Slots} [reuse] @returns {{ ok: true, faceIds: string[] } | { ok: false, refusal: any }}
 */
export function addOverhang(d, hId, width, ctx, reuse) {
  const tol = ctx.tol, eps = tol.numericEpsilon;
  const h = d.halfEdges[hId];
  const R = d.faces[h.faceId];
  const t = h.twinId ? d.halfEdges[h.twinId] : undefined;
  const corner = (/** @type {string} */ why) => refuse('INVALID_TOPOLOGY', [hId], `unsupported overhang junction: ${why} (D-336 V1)`);
  if (!t || !vertical(d.faces[t.faceId], eps)) return corner('the eave is not on a vertical wall');
  const W = d.faces[t.faceId];
  const wp = d.halfEdges[t.prevId], wn = d.halfEdges[t.nextId];
  const wpT = twin(d, wp.id), wnT = twin(d, wn.id);
  const GA = d.faces[wnT.faceId], GB = d.faces[wpT.faceId];
  const A = h.startVertexId, B = t.startVertexId;
  for (const [v, G] of [[A, GA], [B, GB]]) {
    const at = facesAt(d, v);
    if (!vertical(G, eps) || G.id === W.id || G.tags.includes(OVERHANG) || at.size !== 3 || !at.has(R.id) || !at.has(W.id) || !at.has(G.id)) {
      return corner(`eave end ${v} does not meet exactly one end wall`);
    }
  }
  const V = { normal: W.supportPlane.normal, d: W.supportPlane.d - width };
  const pA = derivePoint([R.supportPlane, V, GA.supportPlane], eps)?.p, pB = derivePoint([R.supportPlane, V, GB.supportPlane], eps)?.p;
  if (!pA || !pB) return corner('roof, overhang line and end wall do not meet in a point');
  const geo = (/** @type {string} */ why) => refuse('INVALID_GEOMETRY', [hId], why);
  if (Math.abs(pB[2] - pA[2]) > tol.zAlignTolM) return geo('eave is not horizontal');
  if (!(pA[2] < d.vertices[A].p[2] - eps) || !(pB[2] < d.vertices[B].p[2] - eps)) return geo('the roof does not descend outward over the eave');
  const below = [d.halfEdges[wn.nextId].startVertexId, wp.startVertexId];
  if (below.some((v, i) => !(d.vertices[v].p[2] < [pA, pB][i][2] - tol.minEdgeLengthM))) return geo('soffit at or below the next wall vertex');

  const id = (/** @type {keyof Slots | string} */ k, /** @type {string} */ kind) => (reuse ? (/** @type {any} */ (reuse)[k] ?? reuse.he[k]) : ctx.ids(kind));
  /** @type {Slots} */
  const s = {
    strip: id('strip', 'face'), soffit: id('soffit', 'face'), capA: id('capA', 'face'), capB: id('capB', 'face'),
    oA: id('oA', 'vertex'), oB: id('oB', 'vertex'), sA: id('sA', 'vertex'), sB: id('sB', 'vertex'), he: {},
  };
  for (const k of ['t', 'a1', 'a2', 'a3', 'q0', 'q1', 'q2', 'q3', 'c0', 'c1', 'c2', 'd0', 'd1', 'd2', 'g1', 'g2']) s.he[k] = id(k, 'halfEdge');
  const soffitPlane = soffitThrough(pA, pB, W.supportPlane.normal, eps);
  const copy = (/** @type {Plane} */ p) => ({ normal: /** @type {P3} */ ([...p.normal]), d: p.d });
  const face = (/** @type {string} */ fid, /** @type {Plane} */ plane, /** @type {string} */ kind, /** @type {string} */ first, /** @type {any} */ extra = {}) => {
    d.faces[fid] = { ...extra, id: fid, outerLoopId: first, innerLoopIds: [], supportPlane: plane, surfaceKind: kind, tags: [OVERHANG] };
  };
  face(s.strip, copy(R.supportPlane), 'RoofSurface', s.he.t, R.roofComponentId ? { roofComponentId: R.roofComponentId } : {});
  face(s.soffit, soffitPlane, 'OuterCeilingSurface', s.he.q0);
  face(s.capA, copy(GA.supportPlane), 'WallSurface', s.he.c0);
  face(s.capB, copy(GB.supportPlane), 'WallSurface', s.he.d0);
  const vtx = (/** @type {string} */ vid, /** @type {string[]} */ faces) => { d.vertices[vid] = { id: vid, p: [0, 0, 0], definingFaceIds: faces, positionMode: 'DERIVED' }; };
  vtx(s.oA, [s.strip, s.soffit, s.capA]); vtx(s.oB, [s.strip, s.soffit, s.capB]);
  vtx(s.sA, [W.id, s.soffit, GA.id, s.capA]); vtx(s.sB, [W.id, s.soffit, GB.id, s.capB]);
  const H = s.he;
  ring(d, s.strip, [[H.t, B], [H.a1, A], [H.a2, s.oA], [H.a3, s.oB]]);
  ring(d, s.soffit, [[H.q0, s.oB], [H.q1, s.oA], [H.q2, s.sA], [H.q3, s.sB]]);
  ring(d, s.capA, [[H.c0, s.oA], [H.c1, A], [H.c2, s.sA]]);
  ring(d, s.capB, [[H.d0, B], [H.d1, s.oB], [H.d2, s.sB]]);
  insertAfter(d, wnT.id, H.g1, s.sA);
  insertAfter(d, wpT.prevId, H.g2, B);
  wpT.startVertexId = s.sB;
  t.startVertexId = s.sB; wn.startVertexId = s.sA;
  for (const [x, y] of [[h.id, H.t], [t.id, H.q2], [H.a1, H.c0], [H.a2, H.q0], [H.a3, H.d0], [H.q1, H.c2], [H.q3, H.d1], [H.c1, H.g1], [H.d2, H.g2]]) {
    d.halfEdges[x].twinId = y; d.halfEdges[y].twinId = x;
  }
  for (const [v, cap] of [[A, s.capA], [B, s.capB]]) {
    const vx = d.vertices[v];
    vx.definingFaceIds = [...vx.definingFaceIds.map((/** @type {string} */ x) => (x === W.id ? s.strip : x)), cap];
    vx.positionMode = 'EXPLICIT';
  }
  for (const v of [s.oA, s.oB, s.sA, s.sB]) place(d, v, eps);
  const added = [s.strip, s.soffit, s.capA, s.capB];
  const shell = Object.values(d.shells).find((x) => x.faceIds.includes(R.id));
  shell.faceIds.push(...added);
  if (R.roofComponentId && d.roofComponents[R.roofComponentId]) d.roofComponents[R.roofComponentId].faceIds.push(s.strip);
  for (const x of [...Object.values(H), t.id, wn.id, wp.id]) {
    const e = d.halfEdges[x];
    e.edgeRole = e.twinId ? pairRole(d, x, tol.zAlignTolM) : 'BOUNDARY';
  }
  h.edgeRole = 'EAVE'; d.halfEdges[H.t].edgeRole = 'EAVE';
  return { ok: true, faceIds: added };
}

/**
 * Soffit plane through the outer edge pA -> pB, level across the overhang (contains W's horizontal normal) - D-463:
 * the width in plan is exact at both corners; on an eave horizontal only within `zAlignTolM` the soffit follows the
 * eave's height difference along it, on an exactly horizontal eave it is z = pA.z.
 * @param {P3} pA @param {P3} pB @param {P3} nW @param {number} eps @returns {Plane}
 */
function soffitThrough(pA, pB, nW, eps) {
  if (Math.abs(pB[2] - pA[2]) <= eps) return { normal: [0, 0, -1], d: pA[2] };
  const e = [pB[0] - pA[0], pB[1] - pA[1], pB[2] - pA[2]], u = [nW[0], nW[1], 0];
  let n = [e[1] * u[2] - e[2] * u[1], e[2] * u[0] - e[0] * u[2], e[0] * u[1] - e[1] * u[0]];
  const len = Math.hypot(n[0], n[1], n[2]) * (n[2] > 0 ? -1 : 1);
  n = n.map((x) => x / len);
  return { normal: /** @type {P3} */ (n), d: -(n[0] * pA[0] + n[1] * pA[1] + n[2] * pA[2]) };
}

/** Write one loop: [half-edge id, start vertex] in order. @param {any} d @param {string} faceId @param {[string, string][]} loop */
function ring(d, faceId, loop) {
  loop.forEach(([id, v], i) => {
    d.halfEdges[id] = {
      id, startVertexId: v, nextId: loop[(i + 1) % loop.length][0], prevId: loop[(i + loop.length - 1) % loop.length][0],
      faceId, twinId: null, edgeRole: 'GENERIC',
    };
  });
}

/** Insert a new half-edge starting at `v` after `prevId` in its loop. @param {any} d @param {string} prevId @param {string} id @param {string} v */
function insertAfter(d, prevId, id, v) {
  const p = d.halfEdges[prevId], n = d.halfEdges[p.nextId];
  d.halfEdges[id] = { id, startVertexId: v, nextId: n.id, prevId: p.id, faceId: p.faceId, twinId: null, edgeRole: 'GENERIC' };
  p.nextId = id; n.prevId = id;
}

/** Take a half-edge out of its loop (its face's outer loop id moves on if needed). @param {any} d @param {string} id */
function unlink(d, id) {
  const e = d.halfEdges[id], p = d.halfEdges[e.prevId], n = d.halfEdges[e.nextId];
  p.nextId = n.id; n.prevId = p.id;
  const f = d.faces[e.faceId];
  if (f.outerLoopId === id) f.outerLoopId = n.id;
  f.innerLoopIds = f.innerLoopIds.map((/** @type {string} */ x) => (x === id ? n.id : x));
  delete d.halfEdges[id];
}

/**
 * Position a vertex from its defining planes; A / B of an overhang have rank 2 and are placed at R ∩ W ∩ G by the
 * caller before (their own planes keep them on the line).
 * @param {any} d @param {string} v @param {number} eps
 */
function place(d, v, eps) {
  const vx = d.vertices[v];
  const r = derivePoint(vx.definingFaceIds.map((/** @type {string} */ f) => d.faces[f].supportPlane), eps);
  if (r) { vx.p = [r.p[0] + 0, r.p[1] + 0, r.p[2] + 0]; vx.positionMode = 'DERIVED'; }
}
