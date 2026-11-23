// CRS registry: CityJSON `referenceSystem` / `horizontalCrs` -> supported CRS description (3D-32, D-92, D-122).
// Data: epsg-table.json, generated from PROJ proj.db by tools/crs-table (3D-ADR-0007). No I/O at run time.
import TABLE from './epsg-table.json' with { type: 'json' };

/** Issue / refusal code of the spec (§6 r14, §8 r4). */
export const INVALID_CRS = 'INVALID_CRS';

export class CrsError extends Error {
  /**
   * @param {string} message
   * @param {{ referenceSystem?: unknown, reason: 'MALFORMED' | 'UNKNOWN_OR_UNSUPPORTED' }} details
   */
  constructor(message, details) {
    super(message);
    this.name = 'CrsError';
    this.code = INVALID_CRS;
    this.messageKey = 'model3d.error.invalidCrs';
    this.details = details;
  }
}

/**
 * @typedef {'EN' | 'NE'} AxisOrder  order of the first two file coordinates (east-north or north-east)
 * @typedef {{ a: number, rf?: number, b?: number }} Ellipsoid  metres; `rf` inverse flattening, or `b` semi-minor axis
 * @typedef {{ kind: 'PROJECTED', crs: string, horizontalCrs: string, axisOrder: AxisOrder }} ProjectedCrs
 * @typedef {{ kind: 'GEOGRAPHIC', crs: string, horizontalCrs: string, axisOrder: AxisOrder, ellipsoid: Ellipsoid }} GeographicCrs
 * @typedef {ProjectedCrs | GeographicCrs} ResolvedCrs
 */

/** Data source of the table (PROJ and EPSG versions, proj.db hash). */
export const CRS_TABLE_SOURCE = Object.freeze({ ...TABLE.source });

const OGC_URL = /^https?:\/\/www\.opengis\.net\/def\/crs\/(EPSG|OGC)\/[^/]+\/([A-Za-z0-9.]+)$/;
const SHORT = /^(EPSG|OGC):([A-Za-z0-9.]+)$/;

/**
 * Normalise a CRS reference to `AUTH:CODE`. Accepts the CityJSON 2.0 form
 * `http(s)://www.opengis.net/def/crs/{authority}/{version}/{code}` and the contract form `EPSG:nnnn`.
 * @param {unknown} ref
 * @returns {string}
 */
export function normaliseCrsRef(ref) {
  if (typeof ref !== 'string') throw new CrsError('CRS reference missing or not a string', { referenceSystem: ref, reason: 'MALFORMED' });
  const m = OGC_URL.exec(ref.trim()) ?? SHORT.exec(ref.trim());
  if (!m) throw new CrsError(`CRS reference not understood: ${ref}`, { referenceSystem: ref, reason: 'MALFORMED' });
  return `${m[1]}:${m[2]}`;
}

/**
 * Resolve a CRS reference. A compound CRS resolves through its horizontal component; the vertical CRS is kept as in
 * the file and never transformed (D-93). Unknown or unsupported (non-metre projected, grads, other axes) -> CrsError.
 * @param {unknown} ref
 * @returns {ResolvedCrs}
 */
export function resolveCrs(ref) {
  const crs = normaliseCrsRef(ref);
  /** @type {Record<string, string>} */
  const compound = TABLE.compound;
  const horizontalCrs = compound[crs] ?? crs;
  /** @type {Record<string, string>} */
  const projected = TABLE.projected;
  const p = projected[horizontalCrs];
  if (p) return { kind: 'PROJECTED', crs, horizontalCrs, axisOrder: /** @type {AxisOrder} */ (p) };
  /** @type {Record<string, string[]>} */
  const geographic = TABLE.geographic;
  const g = geographic[horizontalCrs];
  if (g) {
    /** @type {Record<string, Ellipsoid>} */
    const ellipsoids = TABLE.ellipsoids;
    return { kind: 'GEOGRAPHIC', crs, horizontalCrs, axisOrder: /** @type {AxisOrder} */ (g[0]), ellipsoid: { ...ellipsoids[g[1]] } };
  }
  throw new CrsError(`CRS unknown or unsupported: ${crs}`, { referenceSystem: ref, reason: 'UNKNOWN_OR_UNSUPPORTED' });
}
