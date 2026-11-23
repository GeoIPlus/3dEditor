// Geodetic <-> local metric ENU (east, north, up) frame, via proj4 (D-3D32-1, 3D-ADR-0004).
// proj4 does geodetic <-> geocentric (ECEF); the ENU rotation is the standard topocentric one.
// Heights are used as given in the file (D-93): the vertical CRS is not transformed. For the local frame they are used
// as ellipsoidal heights [A]; the inverse uses the same reading, so a round trip is unaffected (3D-ADR-0004).
import proj4 from 'proj4';

const RAD = Math.PI / 180;

/** @typedef {import('./registry.js').Ellipsoid} Ellipsoid */
/** @typedef {[number, number, number]} P3 */

/** @param {Ellipsoid} e */
function ellipsoidParams(e) {
  return e.rf ? `+a=${e.a} +rf=${e.rf}` : `+a=${e.a} +b=${e.b ?? e.a}`;
}

/**
 * Converter between geodetic [lon, lat, h] (degrees, degrees, metres) and an ENU frame at `origin`.
 * @param {Ellipsoid} ellipsoid
 * @param {P3} origin [lon, lat, h] of the frame origin
 */
export function createEnu(ellipsoid, origin) {
  const e = ellipsoidParams(ellipsoid);
  const conv = proj4(`+proj=longlat ${e} +no_defs`, `+proj=geocent ${e} +units=m +no_defs`);
  const o = /** @type {P3} */ (conv.forward([origin[0], origin[1], origin[2]]));
  const sl = Math.sin(origin[0] * RAD), cl = Math.cos(origin[0] * RAD);
  const sp = Math.sin(origin[1] * RAD), cp = Math.cos(origin[1] * RAD);
  return {
    /** @param {P3} g [lon, lat, h] @returns {P3} [e, n, u] */
    toEnu(g) {
      const x = /** @type {P3} */ (conv.forward([g[0], g[1], g[2]]));
      const dx = x[0] - o[0], dy = x[1] - o[1], dz = x[2] - o[2];
      return [
        -sl * dx + cl * dy,
        -sp * cl * dx - sp * sl * dy + cp * dz,
        cp * cl * dx + cp * sl * dy + sp * dz,
      ];
    },
    /** @param {P3} p [e, n, u] @returns {P3} [lon, lat, h] */
    toGeodetic(p) {
      const [E, N, U] = p;
      const x = [
        o[0] - sl * E - sp * cl * N + cp * cl * U,
        o[1] + cl * E - sp * sl * N + cp * sl * U,
        o[2] + cp * N + sp * U,
      ];
      const g = /** @type {P3} */ (conv.inverse(x));
      return [g[0], g[1], g[2]];
    },
  };
}
