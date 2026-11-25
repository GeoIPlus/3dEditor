// ops (3D-14): roof templates R-01 FLAT, R-02 SHED, R-03 GABLE, R-04 HIP as analytic roof planes over plan cells
// (spec §10.3 r1; v0.2 C.1-C.4). A cell is one roof face: its plane and its plan rings (outer CCW, courtyards CW).
// Planes are built from eave lines and slopes (plane terms, D-08); ridge and hip points are where planes meet.
// Heights are local z. Refusal codes: D-76, D-214..D-216; UNSUPPORTED_FOOTPRINT spec §10.3 r2.
import { eavePlane, equalHeightOnSegment, len2, meet3, sub2, unit2, zAt, dot2, cross2 } from './geom2.js';
import { isRectangle, pairAlong } from './footprint.js';
import { refuse } from './errors.js';

/** @typedef {import('./geom2.js').P2} P2 */
/** @typedef {import('../brep/plane.js').Plane} Plane */
/** @typedef {{ plane: Plane, rings: P2[][] }} Cell */
/** @typedef {import('./footprint.js').FootprintBody} FootprintBody */
/** @typedef {{ ok: true, cells: Cell[] } | { ok: false, refusal: import('./errors.js').ContractError }} CellsResult */
/** @typedef {{ numericEpsilon: number, topologySnapTolM: number, footprintAngleTolDeg: number, flatRoofTolDeg: number }} TemplateTol */

const TAN = (/** @type {number} */ deg) => Math.tan((deg * Math.PI) / 180);
/** @param {P2} a @param {P2} b @returns {P2} unit normal to the left of a -> b (inside of a CCW ring) */
const leftNormal = (a, b) => { const u = unit2(sub2(b, a)); return [-u[1], u[0]]; };
/** Distance of p from the line through a, b. @param {P2} p @param {P2} a @param {P2} b */
const lineDist = (p, a, b) => Math.abs(cross2(sub2(b, a), sub2(p, a))) / len2(sub2(b, a));
/** @param {P2} a @param {P2} b @returns {P2} */
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

/** @param {FootprintBody} body @param {string} why */
const invalid = (body, why) => refuse('INVALID_GEOMETRY', [body.footprintId], why);

/**
 * R-01 (v0.2 C.1): one horizontal plane `roofZ`, or a given non-vertical plane within `flatRoofTolDeg` of horizontal
 * (a steeper plane is a shed: INVALID_GEOMETRY, D-215). Any valid outline with courtyards.
 * @param {FootprintBody} body @param {{ roofZ?: number, roofPlane?: Plane }} p @param {TemplateTol} tol
 * @returns {CellsResult}
 */
export function flatCells(body, p, tol) {
  /** @type {Plane} */
  let plane;
  if (typeof p.roofZ === 'number') {
    plane = { normal: [0, 0, 1], d: -p.roofZ };
  } else {
    const n = p.roofPlane?.normal, l = n ? Math.hypot(n[0], n[1], n[2]) : 0;
    if (!n || !(l > 0) || typeof p.roofPlane?.d !== 'number') return refuse('INVALID_PAYLOAD', [body.footprintId], 'roofPlane');
    const s = n[2] < 0 ? -1 : 1;
    plane = { normal: [(s * n[0]) / l, (s * n[1]) / l, (s * n[2]) / l], d: (s * p.roofPlane.d) / l };
    if (plane.normal[2] <= tol.numericEpsilon) return invalid(body, 'vertical roof plane gives no z(x, y)');
    const tiltDeg = (Math.acos(Math.min(1, plane.normal[2])) * 180) / Math.PI;
    if (tiltDeg > tol.flatRoofTolDeg) return invalid(body, 'roof plane tilted above flatRoofTolDeg: a shed (D-215)');
  }
  if (body.rings.some((r) => r.some((q) => !(/** @type {number} */ (zAt(plane, q[0], q[1], 0)) > body.baseZ)))) {
    return invalid(body, 'roof at or below the base');
  }
  return { ok: true, cells: [{ plane, rings: body.rings }] };
}

/**
 * The rectangle rotated so that edges 0 and 2 run along `axis`; `rot` is the rotation.
 * @param {FootprintBody} body @param {'LOCAL_X' | 'LOCAL_Y'} axis @param {TemplateTol} tol
 * @returns {{ ok: true, c: P2[], rot: number } | { ok: false, refusal: any }}
 */
function rectAlong(body, axis, tol) {
  if (!isRectangle(body, tol.footprintAngleTolDeg)) return refuse('UNSUPPORTED_FOOTPRINT', [body.footprintId], 'R-02..R-04 need a rectangle');
  const pair = pairAlong(body.rings[0], axis, tol.numericEpsilon);
  if (pair === null) return refuse('UNDERCONSTRAINED_GEOMETRY', [body.footprintId], 'axis does not tell the rectangle sides apart');
  const r = body.rings[0];
  return { ok: true, c: [0, 1, 2, 3].map((i) => r[(i + pair) % 4]), rot: pair };
}

/**
 * R-02 (v0.2 C.2) from the slope axis and the eave heights: the low eave edge (the side perpendicular to the axis
 * with the smaller axis coordinate) at `zLow`, rising to `zHigh` at the opposite side.
 * @param {FootprintBody} body @param {{ slopeAxis: 'LOCAL_X' | 'LOCAL_Y', zLow: number, zHigh: number }} p @param {TemplateTol} tol
 * @returns {CellsResult}
 */
export function shedCells(body, p, tol) {
  const other = p.slopeAxis === 'LOCAL_X' ? 'LOCAL_Y' : 'LOCAL_X';
  const r = rectAlong(body, other, tol);
  if (!r.ok) return r;
  if (!(Math.min(p.zLow, p.zHigh) > body.baseZ)) return invalid(body, 'eave at or below the base');
  const k = p.slopeAxis === 'LOCAL_X' ? 0 : 1;
  const c = r.c;
  const lowFirst = c[0][k] + c[1][k] <= c[2][k] + c[3][k];
  const [a, b, o1, o2] = lowFirst ? [c[0], c[1], c[2], c[3]] : [c[2], c[3], c[0], c[1]];
  const w = (lineDist(mid(o1, o2), a, b) + lineDist(mid(a, b), o1, o2)) / 2;
  const plane = eavePlane(a, p.zLow, leftNormal(a, b), (p.zHigh - p.zLow) / w);
  return { ok: true, cells: [{ plane, rings: [c] }] };
}

/**
 * R-02 from three or more points (POINT measurements, D-215): least squares z = a x + b y + c; fewer than three
 * independent conditions -> UNDERCONSTRAINED_GEOMETRY (v0.2 C.2).
 * @param {FootprintBody} body @param {[number, number, number][]} pts local @param {TemplateTol} tol
 * @returns {CellsResult}
 */
export function shedFromPoints(body, pts, tol) {
  if (!isRectangle(body, tol.footprintAngleTolDeg)) return refuse('UNSUPPORTED_FOOTPRINT', [body.footprintId], 'R-02 needs a rectangle');
  const n = pts.length, mx = pts.reduce((s, q) => s + q[0], 0) / n, my = pts.reduce((s, q) => s + q[1], 0) / n;
  const mz = pts.reduce((s, q) => s + q[2], 0) / n;
  let sxx = 0, sxy = 0, syy = 0, sxz = 0, syz = 0;
  for (const q of pts) {
    const x = q[0] - mx, y = q[1] - my, z = q[2] - mz;
    sxx += x * x; sxy += x * y; syy += y * y; sxz += x * z; syz += y * z;
  }
  const det = sxx * syy - sxy * sxy, scale = (sxx + syy) ** 2;
  if (!(det > tol.numericEpsilon * scale) || n < 3) return refuse('UNDERCONSTRAINED_GEOMETRY', [body.footprintId], 'fewer than three independent roof points');
  const a = (sxz * syy - syz * sxy) / det, b = (syz * sxx - sxz * sxy) / det, c0 = mz - a * mx - b * my;
  const l = Math.hypot(a, b, 1);
  /** @type {Plane} */
  const plane = { normal: [-a / l, -b / l, 1 / l], d: -c0 / l };
  if (body.rings[0].some((q) => !(/** @type {number} */ (zAt(plane, q[0], q[1], 0)) > body.baseZ))) return invalid(body, 'eave at or below the base');
  return { ok: true, cells: [{ plane, rings: [body.rings[0]] }] };
}

/**
 * R-03 (v0.2 C.3): two planes through their eave lines meeting at the ridge; ridge on the mid line (`symmetric`) or
 * moved by `ridgeOffsetM` along the other local axis; heights from `ridgeZ` or from `slopeDeg`.
 * @param {FootprintBody} body
 * @param {{ ridgeAxis: 'LOCAL_X' | 'LOCAL_Y', eaveZ: number, ridgeZ?: number, slopeDeg?: number, symmetric: boolean, ridgeOffsetM?: number }} p
 * @param {TemplateTol} tol
 * @returns {CellsResult}
 */
export function gableCells(body, p, tol) {
  const r = rectAlong(body, p.ridgeAxis, tol);
  if (!r.ok) return r;
  if (!(p.eaveZ > body.baseZ)) return invalid(body, 'eave at or below the base');
  const c = r.c, n0 = leftNormal(c[0], c[1]), n2 = leftNormal(c[2], c[3]);
  const w = (lineDist(mid(c[2], c[3]), c[0], c[1]) + lineDist(mid(c[0], c[1]), c[2], c[3])) / 2;
  const s = p.symmetric ? 0 : (p.ridgeOffsetM ?? 0);
  /** @type {P2} */
  const o = p.ridgeAxis === 'LOCAL_X' ? [0, 1] : [1, 0];
  const d0 = w / 2 + s * dot2(o, n0), d2 = w - d0;
  if (!(d0 > tol.topologySnapTolM && d2 > tol.topologySnapTolM)) return invalid(body, 'ridge outside the footprint (D-216)');
  let t0, t2;
  if (typeof p.ridgeZ === 'number') {
    if (!(p.ridgeZ > p.eaveZ)) return invalid(body, 'ridgeZ at or below eaveZ (D-214)');
    t0 = (p.ridgeZ - p.eaveZ) / d0; t2 = (p.ridgeZ - p.eaveZ) / d2;
  } else {
    if (s !== 0) return invalid(body, 'equal slopes with an off-centre ridge (D-216)');
    t0 = t2 = TAN(/** @type {number} */ (p.slopeDeg));
  }
  const P0 = eavePlane(c[0], p.eaveZ, n0, t0), P2 = eavePlane(c[2], p.eaveZ, n2, t2);
  const ra = equalHeightOnSegment(P0, P2, c[1], c[2]), rb = equalHeightOnSegment(P0, P2, c[3], c[0]);
  if (!ra || !rb || ra.t <= 0 || ra.t >= 1 || rb.t <= 0 || rb.t >= 1) return invalid(body, 'ridge outside the footprint (D-216)');
  return { ok: true, cells: [{ plane: P0, rings: [[c[0], c[1], ra.p, rb.p]] }, { plane: P2, rings: [[c[2], c[3], rb.p, ra.p]] }] };
}

/**
 * R-04 (v0.2 C.4): four planes through the eave lines with their slopes (`slopesDeg` in the stored outer ring order);
 * the ridge ends are where both long planes meet an end plane. Ridge length 0 (within `topologySnapTolM`) gives four
 * triangles (spec §10.3 r3); a negative length (end hips cross) is INVALID_GEOMETRY (D-214).
 * @param {FootprintBody} body @param {{ ridgeAxis: 'LOCAL_X' | 'LOCAL_Y', eaveZ: number, slopesDeg: number[] }} p
 * @param {TemplateTol} tol
 * @returns {CellsResult}
 */
export function hipCells(body, p, tol) {
  const r = rectAlong(body, p.ridgeAxis, tol);
  if (!r.ok) return r;
  if (!(p.eaveZ > body.baseZ)) return invalid(body, 'eave at or below the base');
  const c = r.c;
  const P = [0, 1, 2, 3].map((i) => {
    const slope = p.slopesDeg[body.edgeIndex[0][(i + r.rot) % 4]];
    return eavePlane(c[i], p.eaveZ, leftNormal(c[i], c[(i + 1) % 4]), TAN(slope));
  });
  const ra = meet3(P[0], P[2], P[1]), rb = meet3(P[0], P[2], P[3]);
  if (!ra || !rb) return invalid(body, 'hip planes do not meet');
  const length = dot2(sub2(ra, rb), unit2(sub2(c[1], c[0])));
  if (length < -tol.topologySnapTolM) return invalid(body, 'end hips cross: ridge length < 0 (D-214)');
  if (length <= tol.topologySnapTolM) {
    /** @type {P2} */
    const apex = mid(ra, rb);
    return { ok: true, cells: P.map((pl, i) => ({ plane: pl, rings: [[c[i], c[(i + 1) % 4], apex]] })) };
  }
  return {
    ok: true,
    cells: [
      { plane: P[0], rings: [[c[0], c[1], ra, rb]] }, { plane: P[1], rings: [[c[1], c[2], ra]] },
      { plane: P[2], rings: [[c[2], c[3], rb, ra]] }, { plane: P[3], rings: [[c[3], c[0], rb]] },
    ],
  };
}
