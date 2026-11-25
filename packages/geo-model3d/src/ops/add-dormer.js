// ops (3D-20): ADD_DORMER (spec §10.11 r2, r3; v0.3 §6 F-36; GT-18): a dormer as a separate BuildingInstallation body
// over the whole outline, base in the roof face plane. FLAT: horizontal top at the highest outline corner z +
// `heightM` (back wall height, D-3D20-2). GABLE: walls as FLAT, ridge along the roof face's fall line through the
// outline centroid, `ridgeRiseM` above the wall top; each slope reaches the wall top at the outline corner farthest
// from the ridge on its side; a non-convex outline or a roof face without a fall line -> INVALID_GEOMETRY (D-3D20-3).
// Sizing from `measurementId` -> INVALID_MEASUREMENT until the measurement layout is defined (Q-28, D-3D20-4).
import { resolveRoof, localPoint, onRoofPlane, planOutline, insideRoof } from './installation-place.js';
import { buildInstallation } from './installation-shell.js';
import { orient2 } from '../validate/polygon.js';
import { signedArea2, zAt } from './geom2.js';
import { refuse } from './errors.js';

/** @typedef {import('./geom2.js').P2} P2 */
/** @typedef {[number, number, number]} P3 */
/** @typedef {import('../brep/plane.js').Plane} Plane */

const positive = (/** @type {unknown} */ x) => typeof x === 'number' && Number.isFinite(x) && x > 0;

/**
 * @param {import('../brep/types.js').BuildingModel} draft
 * @param {any} payload contract `command-payload-add-dormer`
 * @param {import('./pipeline.js').OpContext} ctx
 * @returns {import('./pipeline.js').OpResult}
 */
export function addDormer(draft, payload, ctx) {
  const tol = ctx.tol;
  if (!payload || typeof payload !== 'object') return refuse('INVALID_PAYLOAD', [], 'payload');
  const type = payload.dormerType;
  if (type !== 'FLAT' && type !== 'GABLE') return refuse('INVALID_PAYLOAD', [], 'dormerType');
  if (payload.measurementId !== undefined) {
    return refuse('INVALID_MEASUREMENT', [String(payload.measurementId)], 'dormer size from a plane fit is not defined yet (Q-28, D-3D20-4)');
  }
  if (!positive(payload.heightM)) return refuse('INVALID_PAYLOAD', [], 'heightM');
  if (type === 'GABLE' && !positive(payload.ridgeRiseM)) return refuse('INVALID_PAYLOAD', [], 'ridgeRiseM (D-3D20-3)');
  if (!Array.isArray(payload.outline) || payload.outline.length < 3) return refuse('INVALID_PAYLOAD', [], 'outline');
  /** @type {P3[]} */
  const pts = [];
  for (const q of payload.outline) {
    const p = localPoint(q, ctx);
    if (!p) return refuse('INVALID_PAYLOAD', [], 'outline point');
    pts.push(p);
  }
  const found = resolveRoof(draft, payload.roofFaceId, tol.numericEpsilon);
  if (!found.ok) return found;
  const roof = found.roof;
  const off = onRoofPlane(pts, roof, tol.planarTolM);
  if (off) return off;
  const plan = planOutline(pts.map((p) => /** @type {P2} */ ([p[0], p[1]])), roof, tol);
  if (!plan.ok) return plan;
  const ring = plan.ring;
  const outside = insideRoof(ring, roof, tol.topologySnapTolM);
  if (outside) return outside;
  const wallTop = Math.max(...ring.map((p) => /** @type {number} */ (zAt(roof.plane, p[0], p[1], 0)))) + payload.heightM;
  /** @type {Plane[] | string} */
  const tops = type === 'FLAT' ? [{ normal: [0, 0, 1], d: -wallTop }] : gableTops(ring, roof.plane, wallTop, payload.ridgeRiseM, tol);
  if (typeof tops === 'string') return refuse('INVALID_GEOMETRY', [roof.faceId], `${tops} (D-3D20-3)`);
  const built = buildInstallation(draft, { ring, roof: roof.plane, tops, ownerId: roof.ownerId }, ctx.ids, tol);
  if (!built.ok) return refuse('INVALID_GEOMETRY', [roof.faceId], built.reason);
  return { ok: true };
}

/**
 * The two slopes of a GABLE dormer (D-3D20-3), normals up; or the reason it cannot be built.
 * @param {P2[]} ring counter-clockwise @param {Plane} roof @param {number} wallTop @param {number} rise
 * @param {{ numericEpsilon: number, topologySnapTolM: number }} tol
 * @returns {Plane[] | string}
 */
export function gableTops(ring, roof, wallTop, rise, tol) {
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    if (orient2(ring[i], ring[(i + 1) % n], ring[(i + 2) % n]) < -tol.numericEpsilon) return 'GABLE outline is not convex';
  }
  const g = Math.hypot(roof.normal[0], roof.normal[1]);
  if (!(g > tol.numericEpsilon)) return 'roof face has no fall line';
  // ridge direction = fall line in plan; m = its left normal; s = signed distance from the ridge line
  const d = [roof.normal[0] / g, roof.normal[1] / g], m = [-d[1], d[0]];
  const c = centroid(ring);
  const s = ring.map((p) => m[0] * (p[0] - c[0]) + m[1] * (p[1] - c[1]));
  const s1 = Math.max(...s), s2 = -Math.min(...s);
  if (!(s1 > tol.topologySnapTolM && s2 > tol.topologySnapTolM)) return 'GABLE outline too narrow across the fall line';
  const zr = wallTop + rise, mc = m[0] * c[0] + m[1] * c[1];
  // side s > 0: z = zr - (rise / s1) s; side s < 0: z = zr + (rise / s2) s
  const slope = (/** @type {number} */ k) => {
    const nv = [k * m[0], k * m[1], 1], l = Math.hypot(nv[0], nv[1], nv[2]);
    return { normal: /** @type {P3} */ ([nv[0] / l, nv[1] / l, nv[2] / l]), d: -(zr + k * mc) / l };
  };
  return [slope(rise / s1), slope(-rise / s2)];
}

/** Area centroid of a simple ring. @param {P2[]} r @returns {P2} */
function centroid(r) {
  const a = signedArea2(r);
  let x = 0, y = 0;
  for (let i = 0; i < r.length; i++) {
    const p = r[i], q = r[(i + 1) % r.length], k = p[0] * q[1] - q[0] * p[1];
    x += (p[0] + q[0]) * k;
    y += (p[1] + q[1]) * k;
  }
  return [x / (3 * a), y / (3 * a)]; // signedArea2 is twice the area
}
