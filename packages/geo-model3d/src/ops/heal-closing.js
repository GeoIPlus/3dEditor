// ops (3D-17): analysis of a hole for HEAL_HOLE (spec §10.8 r2; v0.2 C.14; D-76, D-284..D-286): chain the open boundary
// half-edges into the ring of the new face, fit or copy its plane, and check that the closing is compatible: every
// boundary vertex, re-derived with the new plane among its planes, moves at most `maxDisplacementM` (default
// `planarTolM`, D-284) and lies on its planes; the new ring is simple and not degenerate.
import { derivePoint, distance, dot, unsign0 } from '../brep/index.js';
import { newell, planeBasis, to2d, segmentsMeet } from '../validate/polygon.js';
import { symEigen } from '../solve/linalg.js';
import { endOf } from './repair-topology.js';

/** @typedef {import('../brep/types.js').BuildingModel} BuildingModel */
/** @typedef {import('../brep/vec.js').P3} P3 */
/** @typedef {import('../brep/plane.js').Plane} Plane */
/** @typedef {{ he: string, from: string }} LoopEdge `from`: start vertex of the new half-edge twin to `he` */

/**
 * Chain the hole's half-edges (each `s -> e`, twinId null) into the new face's ring: the new half-edge of `he` runs
 * `e -> s`; the next one starts at `s`. More than one candidate at a vertex = several closings.
 * @param {BuildingModel} m @param {string[]} edgeIds
 * @returns {{ ok: true, loop: LoopEdge[] } | { ok: false, code: string, ids: string[], why: string }}
 */
export function holeLoop(m, edgeIds) {
  /** @type {Map<string, string[]>} */
  const byEnd = new Map();
  for (const id of edgeIds) {
    const he = m.halfEdges[id];
    if (!he) return { ok: false, code: 'INVALID_PAYLOAD', ids: [id], why: 'unknown half-edge' };
    if (he.twinId !== null) return { ok: false, code: 'INVALID_TOPOLOGY', ids: [id], why: 'not an open boundary edge (twinId must be null)' };
    const e = endOf(m, id);
    byEnd.set(e, [...(byEnd.get(e) ?? []), id]);
  }
  const amb = [...byEnd.values()].filter((l) => l.length > 1).flat();
  if (amb.length > 0) return { ok: false, code: 'UNDERCONSTRAINED_GEOMETRY', ids: amb, why: 'the edges close the hole in more than one way' };
  /** @type {LoopEdge[]} */
  const loop = [];
  let id = edgeIds[0];
  while (loop.length < edgeIds.length) {
    loop.push({ he: id, from: endOf(m, id) });
    const next = byEnd.get(m.halfEdges[id].startVertexId);
    if (!next) return { ok: false, code: 'INVALID_TOPOLOGY', ids: [id], why: 'the boundary edges do not form a closed ring' };
    id = next[0];
    if (id === edgeIds[0]) break;
  }
  if (loop.length !== edgeIds.length || id !== edgeIds[0]) return { ok: false, code: 'INVALID_TOPOLOGY', ids: edgeIds, why: 'the boundary edges do not form one closed ring' };
  if (loop.length < 3) return { ok: false, code: 'INVALID_TOPOLOGY', ids: edgeIds, why: 'a hole needs at least three edges' };
  return { ok: true, loop };
}

/** Positions of the new ring. @param {BuildingModel} m @param {LoopEdge[]} loop @returns {P3[]} */
export const loopPoints = (m, loop) => loop.map((l) => m.vertices[l.from].p);

/**
 * Least-squares plane of points (centroid + smallest eigenvector of the scatter), oriented like `towards`.
 * @param {P3[]} pts @param {P3} towards @param {number} eps
 * @returns {Plane | null} null: fewer than three points or collinear
 */
export function fitPlane(pts, towards, eps) {
  if (pts.length < 3) return null;
  const c = /** @type {P3} */ ([0, 1, 2].map((i) => pts.reduce((s, p) => s + p[i], 0) / pts.length));
  const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of pts) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) S[i][j] += (p[i] - c[i]) * (p[j] - c[j]);
  const e = symEigen(S);
  if (!(e.values[1] > eps)) return null;
  return orient({ normal: /** @type {P3} */ (e.vectors[0].slice(0, 3)), d: -dot(/** @type {P3} */ (e.vectors[0]), c) }, towards);
}

/** Flip a plane so that its normal points like `towards`. @param {Plane} pl @param {P3} towards @returns {Plane} */
export function orient(pl, towards) {
  if (dot(pl.normal, towards) >= 0) return { normal: /** @type {P3} */ (pl.normal.map(unsign0)), d: unsign0(pl.d) };
  return { normal: /** @type {P3} */ (pl.normal.map((x) => unsign0(-x))), d: unsign0(-pl.d) };
}

/** Outward direction of the new ring (right-hand rule). @param {BuildingModel} m @param {LoopEdge[]} loop */
export const ringNormal = (m, loop) => newell(loopPoints(m, loop));

/**
 * @typedef {{ ok: true, positions: Record<string, { p: P3, mode: 'DERIVED' | 'EXPLICIT' }> }
 *   | { ok: false, ids: string[], why: string }} Closing
 */

/**
 * Is closing the hole with `plane` compatible (spec §10.8 r2)?
 * @param {BuildingModel} m @param {LoopEdge[]} loop @param {Plane} plane @param {number} maxM @param {any} tol
 * @returns {Closing}
 */
export function checkClosing(m, loop, plane, maxM, tol) {
  /** @type {Record<string, { p: P3, mode: 'DERIVED' | 'EXPLICIT' }>} */
  const positions = {};
  const far = [];
  for (const { from } of loop) {
    const v = m.vertices[from];
    const planes = [...v.definingFaceIds.map((f) => m.faces[f].supportPlane), plane];
    const r = derivePoint(planes, tol.numericEpsilon);
    if (r) {
      const p = /** @type {P3} */ (r.p.map(unsign0));
      if (!(distance(p, v.p) <= maxM) || !(r.residual <= tol.planarTolM)) far.push(from);
      positions[from] = { p, mode: 'DERIVED' };
    } else {
      // fewer than three independent planes: the position stays explicit and must lie on the new plane (spec §4 r3)
      if (!(Math.abs(dot(plane.normal, v.p) + plane.d) <= tol.planarTolM)) far.push(from);
      positions[from] = { p: v.p, mode: 'EXPLICIT' };
    }
  }
  if (far.length > 0) return { ok: false, ids: far, why: `boundary vertices would move more than ${maxM} m or leave their planes` };
  const pts = loop.map((l) => positions[l.from].p);
  const basis = planeBasis(plane.normal);
  const q = to2d(pts, basis, pts[0]);
  const n = q.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segmentsMeet(q[i], q[(i + 1) % n], q[j], q[(j + 1) % n], tol.topologySnapTolM)) {
        return { ok: false, ids: [loop[i].he, loop[j].he], why: 'the closing face would intersect itself' };
      }
    }
  }
  if (!(Math.abs(dot(newell(pts), plane.normal)) / 2 >= tol.minFaceAreaM2)) return { ok: false, ids: loop.map((l) => l.he), why: 'the closing face would have no area' };
  return { ok: true, positions };
}

/** Surface kind by the spec §6 r7 normal thresholds (restated: `ops` may not import `import`); D-286. @param {P3} n */
export const inferKind = (n) => (Math.abs(n[2]) < 0.1 ? 'WallSurface' : n[2] < -0.9 ? 'GroundSurface' : 'RoofSurface');

/**
 * POINT measurements of the model in the local frame (D-215 layout).
 * @param {BuildingModel} m @param {string[]} ids @param {(p: P3, frame: string) => P3} toLocal
 * @returns {{ ok: true, pts: P3[] } | { ok: false, ids: string[], code: string }}
 */
export function measuredPoints(m, ids, toLocal) {
  const pts = [];
  for (const id of ids) {
    const meas = m.measurements[id];
    if (!meas) return { ok: false, ids: [id], code: 'INVALID_PAYLOAD' };
    const q = meas.geometry?.coordinates?.[0];
    if (meas.geometry?.kind !== 'POINT' || !Array.isArray(q) || q.length !== 3 || !q.every(Number.isFinite)) return { ok: false, ids: [id], code: 'INVALID_MEASUREMENT' };
    pts.push(toLocal(/** @type {P3} */ (q), meas.frame));
  }
  return { ok: true, pts };
}
