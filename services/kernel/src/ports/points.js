// Points port of the kernel service (3D-22; spec §9 API, §11; 3D-ADR-0002 C2; D-35). The kernel reads no point source
// (C1 rule 1); the service reads points through this port and passes them to `fitPlane` / `deviationStats`.
// Adapters: interim LAS whole (`adapters/las-points.js`, D-3D22-4); COPC by box and the later crowdsource COPC
// `stream` dataset (3D-61) implement the same port.

/** @typedef {[number, number, number]} V3 */
/** @typedef {{ min: V3, max: V3 }} WorldBox axis-aligned, inclusive, in the dataset CRS (dataset units, metres) */

/**
 * @typedef {object} PointsPort
 * @property {(box: WorldBox, options?: { signal?: AbortSignal }) => Promise<Float64Array>} queryBox points inside the
 *   box, x y z interleaved, world coordinates in the dataset CRS, full double precision of the source (spec §9 rule 7)
 */

/**
 * Checks that an object implements the port (used by the handler at start-up, and by adapter tests).
 * @param {unknown} port
 * @returns {port is PointsPort}
 */
export function isPointsPort(port) {
  return typeof port === 'object' && port !== null && typeof /** @type {any} */ (port).queryBox === 'function';
}

/**
 * Inclusive box test, shared by in-memory adapters.
 * @param {WorldBox} box @param {number} x @param {number} y @param {number} z
 */
export const inBox = (box, x, y, z) =>
  x >= box.min[0] && x <= box.max[0] && y >= box.min[1] && y <= box.max[1] && z >= box.min[2] && z <= box.max[2];
