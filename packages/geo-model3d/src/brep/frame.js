// brep (3D-09): the building's local frame (M-02; spec §1.2, §4; v0.2 B.3). The kernel works in local coordinates;
// world coordinates are reconstructed by transform, never by accumulating edit error.
//
// Boundary with `crs` (3D-32, D-92): a metric mapping turns file world coordinates into an origin-relative metric
// [east, north, up] frame and back. For a projected CRS that is `world - originWorld` (the default here, the same as
// the projected branch of 3D-32's `createMetricFrame`); for a geographic CRS the caller (import, 3D-10) passes the ENU
// mapping of `crs`. This module adds only the rotation by `buildingAxisDeg` about the up axis and does not import `crs`.

/** @typedef {import('./vec.js').P3} P3 */

/**
 * Contract `CoordinateFrame` (building-model.schema.json).
 * @typedef {object} CoordinateFrame
 * @property {string} horizontalCrs
 * @property {string | null} verticalCrs
 * @property {'EAST_NORTH_UP'} axisOrder
 * @property {'m'} unit
 * @property {P3} originWorld
 * @property {number} buildingAxisDeg rotation of the local X axis from east, counter-clockwise, degrees
 */

/**
 * World <-> origin-relative metric ENU mapping (the shape 3D-32's `MetricFrame` provides).
 * @typedef {{ toMetric: (w: P3) => P3, toWorld: (m: P3) => P3 }} MetricMapping
 */

/**
 * @typedef {object} LocalFrame
 * @property {(w: P3) => P3} toLocal world -> local
 * @property {(l: P3) => P3} toWorld local -> world
 * @property {number} cos cosine of `buildingAxisDeg`
 * @property {number} sin sine of `buildingAxisDeg`
 */

/**
 * Cosine and sine of an angle in degrees; exact 0 / ±1 for multiples of 90 so that axis-aligned buildings round-trip
 * without rotation noise.
 * @param {number} deg
 * @returns {[number, number]}
 */
export function cosSinDeg(deg) {
  const r = ((deg % 360) + 360) % 360;
  if (r === 0) return [1, 0];
  if (r === 90) return [0, 1];
  if (r === 180) return [-1, 0];
  if (r === 270) return [0, -1];
  const a = (r * Math.PI) / 180;
  return [Math.cos(a), Math.sin(a)];
}

/**
 * The projected-CRS metric mapping: translation by `originWorld` (no scale, no axis swap; contract axis order is
 * EAST_NORTH_UP and unit is metres).
 * @param {P3} originWorld
 * @returns {MetricMapping}
 */
export function translationMapping(originWorld) {
  const [ox, oy, oz] = originWorld;
  return {
    toMetric: (w) => [w[0] - ox, w[1] - oy, w[2] - oz],
    toWorld: (m) => [m[0] + ox, m[1] + oy, m[2] + oz],
  };
}

/**
 * Local frame of a building.
 * @param {CoordinateFrame} frame the model's frame
 * @param {MetricMapping} [metric] defaults to `translationMapping(frame.originWorld)` (projected CRS)
 * @returns {LocalFrame}
 */
export function localFrame(frame, metric) {
  if (frame.axisOrder !== 'EAST_NORTH_UP' || frame.unit !== 'm') {
    throw new Error(`brep: unsupported frame ${frame.axisOrder} / ${frame.unit} (contract CoordinateFrame)`);
  }
  if (!Number.isFinite(frame.buildingAxisDeg)) throw new Error('brep: buildingAxisDeg is not a finite number');
  const m = metric ?? translationMapping(frame.originWorld);
  const [cos, sin] = cosSinDeg(frame.buildingAxisDeg);
  return {
    cos,
    sin,
    // local = Rz(-axis) · metric
    toLocal: (w) => {
      const e = m.toMetric(w);
      return [cos * e[0] + sin * e[1], -sin * e[0] + cos * e[1], e[2]];
    },
    // metric = Rz(axis) · local
    toWorld: (l) => m.toWorld([cos * l[0] - sin * l[1], sin * l[0] + cos * l[1], l[2]]),
  };
}

/**
 * Convert a direction (not a point) from local to metric ENU: rotation only.
 * @param {LocalFrame} lf @param {P3} v
 * @returns {P3}
 */
export const localDirToMetric = (lf, v) => [lf.cos * v[0] - lf.sin * v[1], lf.sin * v[0] + lf.cos * v[1], v[2]];
