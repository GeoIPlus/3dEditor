// ops (3D-14): the footprint an envelope operation works on (spec §10.3): its body (D-3D14-7), its validity (R-01
// errors, D-76) and the rectangle test of R-02..R-04 (spec §10.3 r2). Rings are normalised: outer counter-clockwise,
// courtyards clockwise, no closing duplicate (contract Ring2 orientation is not fixed by the schema).
import { cross2, orient, signedArea2, sub2, dot2, len2 } from './geom2.js';
import { refuse } from './errors.js';

/** @typedef {import('./geom2.js').P2} P2 */
/** @typedef {import('../brep/types.js').BuildingModel} BuildingModel */

/**
 * @typedef {object} FootprintBody
 * @property {string} footprintId
 * @property {P2[][]} rings outer CCW first, then courtyards CW
 * @property {number[][]} edgeIndex per ring and edge: the index of that edge in the stored ring order (slopes of R-04)
 * @property {number} baseZ `baseElevationM` (local frame)
 * @property {string} ownerId semantic node (Building / BuildingPart) of the body
 * @property {string} solidId
 * @property {string} shellId outer shell of the body
 */

/**
 * Resolve the footprint and its body. An unknown `footprintId` is a payload error [A]; a body that is not unique is
 * INVALID_TOPOLOGY (D-3D14-7).
 * @param {BuildingModel} model @param {string} footprintId
 * @returns {{ ok: true, body: FootprintBody } | { ok: false, refusal: import('./errors.js').ContractError }}
 */
export function resolveFootprint(model, footprintId) {
  const fp = typeof footprintId === 'string' ? model.footprints[footprintId] : undefined;
  if (!fp) return refuse('INVALID_PAYLOAD', footprintId ? [footprintId] : [], 'unknown footprintId');
  const nodes = Object.values(model.semantics).filter((s) => (fp.buildingPartId
    ? s.id === fp.buildingPartId && s.kind === 'BuildingPart'
    : s.kind === 'Building' && !s.parentId));
  const node = nodes.length === 1 ? nodes[0] : undefined;
  const solid = node && node.solidIds.length === 1 ? model.solids[node.solidIds[0]] : undefined;
  const shell = solid ? model.shells[solid.outerShellId] : undefined;
  if (!node || !solid || !shell) {
    return refuse('INVALID_TOPOLOGY', [footprintId, ...nodes.map((n) => n.id)], 'footprint body is not unique (D-3D14-7)');
  }
  /** @type {P2[][]} */
  const rings = [];
  /** @type {number[][]} */
  const edgeIndex = [];
  [fp.outerRing, ...fp.innerRings].forEach((/** @type {P2[]} */ r, /** @type {number} */ k) => {
    const { ring, reversed } = orient(r, k === 0);
    const n = ring.length;
    rings.push(ring);
    // edge i of the normalised ring is edge (n - 2 - i) mod n of the stored ring when it was reversed
    edgeIndex.push(ring.map((_, i) => (reversed ? (((n - 2 - i) % n) + n) % n : i)));
  });
  return { ok: true, body: { footprintId, rings, edgeIndex, baseZ: fp.baseElevationM, ownerId: node.id, solidId: solid.id, shellId: shell.id } };
}

/**
 * R-01 footprint errors (v0.2 C.1; D-76: INVALID_GEOMETRY with the footprint id): fewer than three points, zero area
 * (below `minFaceAreaM2` [A]), self-intersecting rings (including a courtyard crossing another ring).
 * @param {FootprintBody} body @param {{ minFaceAreaM2: number, topologySnapTolM: number }} tol
 * @returns {string | null} reason, null when valid
 */
export function footprintError(body, tol) {
  if (body.rings.some((r) => r.length < 3)) return 'ring with fewer than three points';
  const area = body.rings.reduce((s, r) => s + signedArea2(r) / 2, 0);
  if (!(area >= tol.minFaceAreaM2)) return 'zero footprint area';
  /** @type {[P2, P2, number, number][]} */
  const segs = [];
  body.rings.forEach((r, k) => r.forEach((a, i) => segs.push([a, r[(i + 1) % r.length], k, i])));
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const [a, b, ka, ia] = segs[i], [c, d, kb, ib] = segs[j];
      const n = body.rings[ka].length;
      const adjacent = ka === kb && (Math.abs(ia - ib) === 1 || Math.abs(ia - ib) === n - 1);
      if (!adjacent && segmentsTouch(a, b, c, d, tol.topologySnapTolM)) return 'self-intersecting footprint';
    }
  }
  return null;
}

/** Segments a-b and c-d intersect or come closer than `eps`. @param {P2} a @param {P2} b @param {P2} c @param {P2} d @param {number} eps */
function segmentsTouch(a, b, c, d, eps) {
  const o1 = cross2(sub2(b, a), sub2(c, a)), o2 = cross2(sub2(b, a), sub2(d, a));
  const o3 = cross2(sub2(d, c), sub2(a, c)), o4 = cross2(sub2(d, c), sub2(b, c));
  if (((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))) return true;
  return pointSeg(c, a, b) <= eps || pointSeg(d, a, b) <= eps || pointSeg(a, c, d) <= eps || pointSeg(b, c, d) <= eps;
}

/** Distance of p to segment a-b. @param {P2} p @param {P2} a @param {P2} b */
function pointSeg(p, a, b) {
  const ab = sub2(b, a), l2 = dot2(ab, ab);
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, dot2(sub2(p, a), ab) / l2));
  return len2(sub2(p, [a[0] + t * ab[0], a[1] + t * ab[1]]));
}

/**
 * Rectangle test of R-02..R-04 (spec §10.3 r2; v0.3 §6): one ring of 4 vertices, every angle 90 deg +/-
 * `footprintAngleTolDeg`.
 * @param {FootprintBody} body @param {number} angleTolDeg
 */
export function isRectangle(body, angleTolDeg) {
  if (body.rings.length !== 1 || body.rings[0].length !== 4) return false;
  const r = body.rings[0];
  return r.every((p, i) => {
    const u = sub2(r[(i + 3) % 4], p), v = sub2(r[(i + 1) % 4], p);
    const lu = len2(u), lv = len2(v);
    if (lu === 0 || lv === 0) return false;
    const deg = (Math.acos(Math.max(-1, Math.min(1, dot2(u, v) / (lu * lv)))) * 180) / Math.PI;
    return Math.abs(deg - 90) <= angleTolDeg;
  });
}

/**
 * Which pair of opposite rectangle edges runs along a local axis: 0 for edges 0 and 2, 1 for edges 1 and 3, null on an
 * exact tie (the axis does not tell the pairs apart: the ridge is never guessed, spec §10.3 r5).
 * @param {P2[]} rect CCW, 4 corners @param {'LOCAL_X' | 'LOCAL_Y'} axis @param {number} eps
 * @returns {0 | 1 | null}
 */
export function pairAlong(rect, axis, eps) {
  const k = axis === 'LOCAL_X' ? 0 : 1;
  const along = (/** @type {number} */ i) => {
    const d = sub2(rect[(i + 1) % 4], rect[i]);
    return Math.abs(d[k]) / len2(d);
  };
  const s0 = along(0) + along(2), s1 = along(1) + along(3);
  if (Math.abs(s0 - s1) <= eps) return null;
  return s0 > s1 ? 0 : 1;
}
