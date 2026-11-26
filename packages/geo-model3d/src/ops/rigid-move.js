// ops (3D-19): TRANSLATE_BUILDING and ROTATE_BUILDING (spec §10.10 r6, r7; v0.3 §6 F-42, F-43): a rigid move of the
// whole building. Planes are primary (D-08): every support plane is mapped (normal rotated, `d` recomputed); a vertex
// position is mapped by the same isometry, which equals its re-derived position exactly up to rounding and keeps an
// imported EXPLICIT vertex (D-70) at its file relation to its planes [A]. Footprints, construction entities, LOCAL
// measurements and constraint targets (FIXED_POINT / ON_PLANE points, planes, EQUAL_Z heights) move with the building;
// the journal gets a warning (v0.3 §6). No topology change: no id is added or removed.
import { cosSinDeg, unsign0 } from '../brep/index.js';
import { compileConstraints } from '../solve/index.js';
import { refuse } from './errors.js';
import { orient, signedArea2 } from './geom2.js';

/** @typedef {[number, number, number]} P3 */
/** @typedef {{ cos: number, sin: number, c: P3, t: P3 }} Iso p -> R (p - c) + c + t, R about +z, counter-clockwise */

/** @param {Iso} m @param {number[]} p @returns {P3} */
const mapPoint = (m, p) => {
  const x = p[0] - m.c[0], y = p[1] - m.c[1];
  return [unsign0(m.cos * x - m.sin * y + m.c[0] + m.t[0]), unsign0(m.sin * x + m.cos * y + m.c[1] + m.t[1]), unsign0((p[2] ?? 0) + m.t[2])];
};
/** @param {Iso} m @param {number[]} n @returns {P3} */
const mapDir = (m, n) => [unsign0(m.cos * n[0] - m.sin * n[1]), unsign0(m.sin * n[0] + m.cos * n[1]), n[2]];
/**
 * Plane n·p + d = 0 under p' = R (p - c) + c + t: n' = R n, d' = d + n·c - n'·(c + t).
 * @param {Iso} m @param {{ normal: number[], d: number }} pl
 */
const mapPlane = (m, pl) => {
  const n2 = mapDir(m, pl.normal);
  const ct = [m.c[0] + m.t[0], m.c[1] + m.t[1], m.c[2] + m.t[2]];
  const d = pl.d + pl.normal[0] * m.c[0] + pl.normal[1] * m.c[1] + pl.normal[2] * m.c[2] - (n2[0] * ct[0] + n2[1] * ct[1] + n2[2] * ct[2]);
  return { normal: n2, d: unsign0(d) };
};
const isV3 = (/** @type {unknown} */ x) => Array.isArray(x) && x.length === 3 && x.every(Number.isFinite);
const isPlane = (/** @type {any} */ x) => x && typeof x === 'object' && isV3(x.normal) && Number.isFinite(x.d);

/**
 * Apply the isometry to everything that carries coordinates in the local frame.
 * @param {any} draft mutated @param {Iso} m
 * @returns {string[]} ids of WORLD-frame measurements left in place (D-345)
 */
function applyIso(draft, m) {
  for (const f of Object.values(draft.faces)) f.supportPlane = mapPlane(m, f.supportPlane);
  for (const v of Object.values(draft.vertices)) v.p = mapPoint(m, v.p);
  for (const fp of Object.values(draft.footprints)) {
    const ring = (/** @type {number[][]} */ r) => r.map((q) => { const p = mapPoint(m, [q[0], q[1], 0]); return [p[0], p[1]]; });
    fp.outerRing = ring(fp.outerRing);
    fp.innerRings = fp.innerRings.map(ring);
    fp.baseElevationM = unsign0(fp.baseElevationM + m.t[2]);
  }
  for (const e of Object.values(draft.constructionEntities)) {
    if (Array.isArray(e.geometry?.points)) e.geometry.points = e.geometry.points.map((/** @type {number[]} */ p) => mapPoint(m, p));
    if (isPlane(e.geometry?.plane)) e.geometry.plane = mapPlane(m, e.geometry.plane);
  }
  for (const c of Object.values(draft.constraints)) {
    // a target tied to a WORLD measurement stays with the real-world observation (D-345)
    if (c.measurementId && draft.measurements[c.measurementId] && draft.measurements[c.measurementId].frame !== 'LOCAL') continue;
    if (isV3(c.target)) c.target = mapPoint(m, c.target);
    else if (isPlane(c.target)) c.target = mapPlane(m, c.target);
    else if (c.kind === 'EQUAL_Z' && typeof c.target === 'number') c.target = unsign0(c.target + m.t[2]);
  }
  /** @type {string[]} */
  const worldKept = [];
  for (const ms of Object.values(draft.measurements)) {
    if (ms.frame !== 'LOCAL') { worldKept.push(ms.id); continue; }
    ms.geometry.coordinates = ms.geometry.coordinates.map((/** @type {number[]} */ p) => (p.length >= 3 ? mapPoint(m, p) : p.length === 2 ? mapPoint(m, [p[0], p[1], 0]).slice(0, 2) : p));
  }
  return worldKept.sort();
}

/** @param {string} op @param {string[]} worldKept */
const warningsOf = (op, worldKept) => [
  `${op}: rigid move of the building; fixed points, constraint targets and LOCAL measurements moved with it (v0.3 §6)`,
  ...(worldKept.length > 0 ? [`WORLD-frame measurements remain unchanged after the rigid building transformation (D-345): ${worldKept.length}: ${worldKept.join(', ')}`] : []),
];

/**
 * D-345: a hard constraint that cannot be verified after the move (its kind is still TBD, D-169) is not taken
 * as satisfied -> CONSTRAINT_CONFLICT; verifiable ones are checked by the pipeline's constraint step.
 * @param {any} draft @param {any} tol
 */
function unverifiable(draft, tol) {
  const hard = Object.values(draft.constraints).filter((c) => c.hard);
  const ids = compileConstraints(draft, hard, tol).rejected.map((r) => r.id).sort();
  return ids.length > 0 ? refuse('CONSTRAINT_CONFLICT', ids, 'hard constraints cannot be verified after the rigid move (D-345)') : null;
}

/** @type {(draft: any, payload: any, ctx: import('./pipeline.js').OpContext) => import('./pipeline.js').OpResult} */
export function translateBuilding(draft, payload, ctx) {
  const v = payload?.vector;
  if (!isV3(v)) return refuse('INVALID_PAYLOAD', [], 'vector');
  // WORLD: the displacement between two mapped points of the building frame [A]
  /** @type {P3} */
  let t = [v[0], v[1], v[2]];
  if (ctx.frame === 'WORLD') {
    const o = /** @type {P3} */ (draft.frame.originWorld);
    const a = ctx.pointToLocal(o, 'WORLD'), b = ctx.pointToLocal([o[0] + v[0], o[1] + v[1], o[2] + v[2]], 'WORLD');
    t = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  }
  if (t.every((x) => x === 0)) return { ok: true };
  const kept = applyIso(draft, { cos: 1, sin: 0, c: [0, 0, 0], t });
  return unverifiable(draft, ctx.tol) ?? { ok: true, warnings: warningsOf('TRANSLATE_BUILDING', kept) };
}

/** @type {(draft: any, payload: any, ctx: import('./pipeline.js').OpContext) => import('./pipeline.js').OpResult} */
export function rotateBuilding(draft, payload, ctx) {
  const deg = payload?.angleDeg;
  if (typeof deg !== 'number' || !Number.isFinite(deg)) return refuse('INVALID_PAYLOAD', [], 'angleDeg');
  const c = footprintCentroid(draft, ctx.tol.numericEpsilon);
  if (!c.ok) return c;
  const [cos, sin] = cosSinDeg(deg);
  if (cos === 1) return { ok: true };
  const kept = applyIso(draft, { cos, sin, c: [c.x, c.y, 0], t: [0, 0, 0] });
  return unverifiable(draft, ctx.tol) ?? { ok: true, warnings: warningsOf('ROTATE_BUILDING', kept) };
}

/**
 * Area centroid of the building's own footprint (outer ring minus courtyards; spec §10.10 r7). Not unique -> D-218.
 * @param {any} draft @param {number} eps
 * @returns {{ ok: true, x: number, y: number } | { ok: false, refusal: any }}
 */
function footprintCentroid(draft, eps) {
  const fps = Object.values(draft.footprints).filter((f) => !f.buildingPartId);
  if (fps.length !== 1) return refuse('INVALID_TOPOLOGY', fps.map((f) => f.id), 'building footprint is not unique (D-218)');
  let a = 0, x = 0, y = 0;
  [fps[0].outerRing, ...fps[0].innerRings].forEach((/** @type {[number, number][]} */ r, /** @type {number} */ k) => {
    const ring = orient(r, k === 0).ring;
    ring.forEach((p, i) => {
      const q = ring[(i + 1) % ring.length];
      const w = p[0] * q[1] - q[0] * p[1];
      x += (p[0] + q[0]) * w; y += (p[1] + q[1]) * w;
    });
    a += signedArea2(ring);
  });
  if (!(Math.abs(a) > eps)) return refuse('INVALID_GEOMETRY', [fps[0].id], 'footprint of zero area has no centroid');
  return { ok: true, x: x / (3 * a), y: y / (3 * a) };
}
