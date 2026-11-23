// Export side of the CRS module (3D-32): metric positions -> file integers of the CityJSON `transform` grid.
// Only vertices changed by an edit are converted back; untouched vertices keep their file integers (D-70, D-92).
// Rounding (D-3D32-3): projected CRS -> `exportRoundDecimals` decimals; geographic CRS -> angles
// `exportRoundDecimals + 5` decimals of a degree (1e-8 deg <= 1.12 mm), heights `exportRoundDecimals`.
// The file `transform` is kept; a grid coarser than the rounding step is reported as PRECISION_LOSS.

/** @typedef {[number, number, number]} P3 */
/** @typedef {import('./frame.js').MetricFrame} MetricFrame */
/** @typedef {{ scale: P3, translate: P3 }} CityJsonTransform */

/** Decimal places beyond `exportRoundDecimals` for angles in degrees (D-3D32-3). */
export const DEGREE_EXTRA_DECIMALS = 5;

/**
 * Decimal places per file axis (file axis order). For a geographic CRS both horizontal axes are angles.
 * @param {MetricFrame} frame
 * @param {number} exportRoundDecimals
 * @returns {P3}
 */
export function roundingDecimals(frame, exportRoundDecimals) {
  const d = exportRoundDecimals;
  return frame.crs.kind === 'GEOGRAPHIC' ? [d + DEGREE_EXTRA_DECIMALS, d + DEGREE_EXTRA_DECIMALS, d] : [d, d, d];
}

/** @param {number} v @param {number} k */
const roundTo = (v, k) => { const f = 10 ** k; return Math.round(v * f) / f; };

/**
 * @param {object} a
 * @param {MetricFrame} a.frame
 * @param {CityJsonTransform} a.transform the file's own `transform`, kept on export
 * @param {P3[]} a.fileVertices integer vertices as read from the file (file axis order)
 * @param {Map<number, P3>} a.changed index -> metric position, only for vertices changed by an edit
 * @param {number} a.exportRoundDecimals tolerance profile value
 * @returns {{ vertices: P3[], maxErrorM: number,
 *   precisionLoss: null | { code: 'PRECISION_LOSS', axisSteps: P3, requiredSteps: P3 } }}
 *   `maxErrorM`: largest metric distance between a changed vertex as asked and as written (rounding + grid).
 */
export function writeBackVertices({ frame, transform, fileVertices, changed, exportRoundDecimals }) {
  const { scale, translate } = transform;
  const dec = roundingDecimals(frame, exportRoundDecimals);
  const vertices = fileVertices.map((v) => /** @type {P3} */ ([v[0], v[1], v[2]]));
  let maxErrorM = 0;
  for (const [i, m] of changed) {
    if (!(i >= 0 && i < vertices.length)) throw new RangeError(`writeBackVertices: vertex index ${i} out of range`);
    const w = frame.toWorld(m);
    const q = /** @type {P3} */ ([0, 1, 2].map((k) => Math.round((roundTo(w[k], dec[k]) - translate[k]) / scale[k])));
    vertices[i] = q;
    const back = frame.toMetric(/** @type {P3} */ ([0, 1, 2].map((k) => q[k] * scale[k] + translate[k])));
    maxErrorM = Math.max(maxErrorM, Math.hypot(back[0] - m[0], back[1] - m[1], back[2] - m[2]));
  }
  const requiredSteps = /** @type {P3} */ (dec.map((k) => 10 ** -k));
  // a tiny relative slack so that e.g. 0.001 vs 10 ** -3 does not report
  const coarse = [0, 1, 2].some((k) => scale[k] > requiredSteps[k] * (1 + 1e-9));
  return {
    vertices,
    maxErrorM,
    precisionLoss: coarse ? { code: 'PRECISION_LOSS', axisSteps: [scale[0], scale[1], scale[2]], requiredSteps } : null,
  };
}

/**
 * Import side helper: integer file vertex -> world coordinates (CityJSON 2.0 `transform`, spec l.1142-1144).
 * @param {P3} v @param {CityJsonTransform} t @returns {P3}
 */
export function decodeVertex(v, t) {
  return [v[0] * t.scale[0] + t.translate[0], v[1] * t.scale[1] + t.translate[1], v[2] * t.scale[2] + t.translate[2]];
}
