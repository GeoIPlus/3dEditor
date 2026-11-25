// Metric frame of one building: world (file CRS, file axis order) <-> metric east/north/up (3D-32, D-92).
// Projected CRS: translation by the origin only (axis swap when the CRS is north-first). Geographic CRS: local ENU.
// The building's own axis rotation (`buildingAxisDeg`) is applied on top by `brep` (3D-09), not here.
import { resolveCrs } from './registry.js';
import { createEnu } from './enu.js';

/** @typedef {[number, number, number]} P3 */
/** @typedef {import('./registry.js').ResolvedCrs} ResolvedCrs */
/**
 * @typedef {object} MetricFrame
 * @property {ResolvedCrs} crs
 * @property {P3} originWorld origin in the units and axis order of the file CRS (contract `CoordinateFrame.originWorld`)
 * @property {(w: P3) => P3} toMetric world (file axis order) -> metric [east, north, up] relative to the origin
 * @property {(m: P3) => P3} toWorld metric -> world (file axis order)
 */

/** @param {'EN'|'NE'} order @param {P3} p @returns {P3} file order -> [east-ish, north-ish, h] */
const toEN = (order, p) => (order === 'EN' ? [p[0], p[1], p[2]] : [p[1], p[0], p[2]]);

/**
 * Origin: centre of the axis-aligned box of the building's world vertices (deterministic; any fixed point works).
 * @param {P3[]} points
 * @returns {P3}
 */
export function boxCentre(points) {
  if (points.length === 0) throw new RangeError('boxCentre: no points');
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of points) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p[i]); hi[i] = Math.max(hi[i], p[i]); }
  return [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
}

/**
 * @param {unknown} referenceSystem CityJSON `metadata.referenceSystem` or `EPSG:nnnn`
 * @param {P3} originWorld origin in world coordinates (file axis order), e.g. `boxCentre(vertices)`
 * @returns {MetricFrame}
 */
export function createMetricFrame(referenceSystem, originWorld) {
  const crs = resolveCrs(referenceSystem);
  const order = crs.axisOrder;
  const o = toEN(order, originWorld);
  if (crs.kind === 'PROJECTED') {
    return {
      crs,
      originWorld: [...originWorld],
      toMetric: (w) => { const p = toEN(order, w); return [p[0] - o[0], p[1] - o[1], p[2] - o[2]]; },
      toWorld: (m) => toEN(order, [m[0] + o[0], m[1] + o[1], m[2] + o[2]]),
    };
  }
  // geographic: toEN gives [lon, lat, h]
  const enu = createEnu(crs.ellipsoid, o);
  return {
    crs,
    originWorld: [...originWorld],
    toMetric: (w) => enu.toEnu(toEN(order, w)),
    toWorld: (m) => toEN(order, enu.toGeodetic(m)),
  };
}
