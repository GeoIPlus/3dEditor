// World <-> world mapping between two horizontal CRSs on the same geodetic datum (3D-69, D-164, D-3D69-2, D-3D69-3).
// Path: file order -> east/north -> geodetic lon/lat on the shared datum (projection inverse, proj4 with the
// definition of the generated table) -> the other CRS. No datum shift, no grids (no I/O); heights pass through
// unchanged (D-93: the cloud shares the building's vertical CRS).
import proj4 from 'proj4';
import TABLE from './epsg-table.json' with { type: 'json' };
import { resolveCrs, CrsError } from './registry.js';

/** @typedef {[number, number, number]} P3 */
/** @typedef {import('./registry.js').ResolvedCrs} ResolvedCrs */
/**
 * @typedef {object} CrsMapping
 * @property {boolean} identity both references name the same horizontal CRS: points are not touched
 * @property {(p: P3) => P3} forward world of `from` (its axis order) -> world of `to` (its axis order)
 * @property {(p: P3) => P3} inverse world of `to` -> world of `from`
 */

/** @type {Record<string, string[]>} */
const GEOGRAPHIC = TABLE.geographic;
/** @type {Record<string, string[]>} [datum, proj4 definition] */
const PROJECTIONS = TABLE.projections;

/** @param {'EN'|'NE'} order @param {P3} p @returns {P3} */
const swap = (order, p) => (order === 'EN' ? [p[0], p[1], p[2]] : [p[1], p[0], p[2]]);

/** The longlat definition on the figure of a table projection (same figure, no datum: proj4 applies no shift). */
const longlatOf = (/** @type {string} */ def) =>
  `+proj=longlat ${def.split(' ').filter((t) => /^\+(a|b|rf|R)=/.test(t) || t === '+R_A').join(' ')} +no_defs`;

/**
 * Datum and geodetic converter of one resolved CRS.
 * @param {ResolvedCrs} crs
 * @param {unknown} ref the reference as given, for the error
 * @returns {{ datum: string, toGeodetic: (en: P3) => P3, fromGeodetic: (g: P3) => P3 }} en / g in east-north order
 */
function geodeticSide(crs, ref) {
  if (crs.kind === 'GEOGRAPHIC') {
    return { datum: GEOGRAPHIC[crs.horizontalCrs][2], toGeodetic: (p) => [p[0], p[1], p[2]], fromGeodetic: (g) => [g[0], g[1], g[2]] };
  }
  const entry = PROJECTIONS[crs.horizontalCrs];
  if (!entry) {
    throw new CrsError(`No verified projection for ${crs.horizontalCrs}: points cannot be reprojected`, {
      referenceSystem: ref, reason: 'NO_PROJECTION',
    });
  }
  const conv = proj4(longlatOf(entry[1]), entry[1]);
  return {
    datum: entry[0],
    toGeodetic: (p) => { const g = conv.inverse([p[0], p[1]]); return [g[0], g[1], p[2]]; },
    fromGeodetic: (g) => { const p = conv.forward([g[0], g[1]]); return [p[0], p[1], g[2]]; },
  };
}

/**
 * Mapping between the worlds of two CRSs. Same horizontal CRS -> identity (the path is unchanged). Different
 * datums -> CrsError `INVALID_CRS` with reason DATUM_MISMATCH naming both (D-3D69-2); a projected CRS without a
 * verified projection in the table -> reason NO_PROJECTION (D-3D69-3).
 * @param {unknown} fromRef CRS reference (`EPSG:nnnn` or the CityJSON OGC URL)
 * @param {unknown} toRef
 * @returns {CrsMapping}
 */
export function createCrsMapping(fromRef, toRef) {
  const from = resolveCrs(fromRef);
  const to = resolveCrs(toRef);
  if (from.horizontalCrs === to.horizontalCrs) return { identity: true, forward: (p) => [p[0], p[1], p[2]], inverse: (p) => [p[0], p[1], p[2]] };
  const a = geodeticSide(from, fromRef);
  const b = geodeticSide(to, toRef);
  if (a.datum !== b.datum) {
    throw new CrsError(`Datum of ${from.horizontalCrs} (${a.datum}) differs from datum of ${to.horizontalCrs} (${b.datum}); no datum shift is applied`, {
      referenceSystem: fromRef, reason: 'DATUM_MISMATCH', datums: [a.datum, b.datum],
    });
  }
  return {
    identity: false,
    forward: (p) => swap(to.axisOrder, b.fromGeodetic(a.toGeodetic(swap(from.axisOrder, p)))),
    inverse: (p) => swap(from.axisOrder, a.fromGeodetic(b.toGeodetic(swap(to.axisOrder, p)))),
  };
}
