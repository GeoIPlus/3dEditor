// Projection definitions for the CRS table (3D-69, D-3D69-3): PROJ's own proj-string of each projected CRS
// (exported by proj-defs.py from the pinned PROJ), normalised for proj4js and kept only when proj4js reproduces PROJ's
// samples. Datum-related tokens are removed: reprojection runs only between CRSs on the same datum (D-3D69-2), so a
// projection is used purely as geodetic <-> easting/northing on the CRS's own ellipsoid (no shift, no grids).
import proj4 from 'proj4';

/** Agreement with PROJ at every sample, metres (the 0.001 m write-back rule of spec §4a, GT-I4). */
export const SAMPLE_TOL_M = 0.001;
const DEG_M = 111320; // metres per degree of latitude, upper bound; used only to express an angle error in metres

/** Tokens dropped: datum shifts (D-3D69-2, no grids), and markers proj4js does not need. */
const DROP = new Set(['+datum', '+ellps', '+towgs84', '+nadgrids', '+wktext', '+type', '+no_defs', '+units']);
/** Tokens that make a definition unusable here (non-Greenwich meridian, axis flips, non-metre unit). */
const REFUSE = new Set(['+pm', '+axis', '+to_meter', '+geoidgrids']);

/**
 * @param {string} projString PROJ's proj-string
 * @param {{a: number, rf?: number, b?: number}} ellipsoid ellipsoid of the CRS's geodetic datum (proj.db)
 * @returns {{ proj: string } | { reason: string }}
 */
export function normaliseProj(projString, ellipsoid) {
  const kept = [];
  let hasShape = false;
  for (const tok of projString.trim().split(/\s+/)) {
    const [name, value] = tok.split('=');
    if (REFUSE.has(name)) return { reason: name.slice(1) };
    if (name === '+units' && value !== 'm') return { reason: 'units' };
    if (DROP.has(name)) continue;
    if (['+a', '+b', '+rf', '+R', '+R_A'].includes(name)) hasShape = true;
    kept.push(tok);
  }
  if (!hasShape) kept.push(`+a=${ellipsoid.a}`, ellipsoid.rf ? `+rf=${ellipsoid.rf}` : `+b=${ellipsoid.b ?? ellipsoid.a}`);
  return { proj: kept.join(' ') };
}

/**
 * The longlat definition on the same figure as a normalised projection (no datum: no shift between the two).
 * @param {string} proj normalised proj-string
 */
export function longlatOf(proj) {
  const shape = proj.split(' ').filter((t) => /^\+(a|b|rf|R|R_A)=/.test(t) || t === '+R_A');
  return `+proj=longlat ${shape.join(' ')} +no_defs`;
}

/**
 * Worst disagreement of proj4js with PROJ's samples, metres; Infinity when proj4js fails.
 * @param {string} proj normalised proj-string
 * @param {Array<{lonlat: [number, number], en: [number, number]}>} samples
 */
export function sampleError(proj, samples) {
  let worst = 0;
  try {
    const conv = proj4(longlatOf(proj), proj);
    for (const s of samples) {
      const en = conv.forward([...s.lonlat]);
      worst = Math.max(worst, Math.hypot(en[0] - s.en[0], en[1] - s.en[1]));
      const ll = conv.inverse([...s.en]);
      const cos = Math.cos((s.lonlat[1] * Math.PI) / 180);
      worst = Math.max(worst, Math.hypot((ll[0] - s.lonlat[0]) * DEG_M * cos, (ll[1] - s.lonlat[1]) * DEG_M));
    }
  } catch {
    return Infinity;
  }
  return Number.isFinite(worst) ? worst : Infinity;
}

/**
 * Builds the `projections` map: CRS key -> normalised proj-string, for the projected CRSs of the table whose PROJ
 * definition proj4js reproduces within SAMPLE_TOL_M. Returns the map and counts of what was left out, by reason.
 * @param {Record<string, string>} projected table keys of the supported projected CRSs
 * @param {Record<string, {proj?: string, samples?: any[], error?: string}>} defs proj-defs.py output `defs`
 * @param {Record<string, {a: number, rf?: number, b?: number}>} ellipsoidOf CRS key -> ellipsoid of its datum
 */
export function buildProjections(projected, defs, ellipsoidOf) {
  /** @type {Record<string, string>} */
  const out = {};
  /** @type {Record<string, number>} */
  const skipped = {};
  const skip = (/** @type {string} */ r) => { skipped[r] = (skipped[r] ?? 0) + 1; };
  for (const key of Object.keys(projected)) {
    const d = defs[key];
    const ell = ellipsoidOf[key];
    if (!d || !d.proj || !d.samples) { skip('no PROJ definition'); continue; }
    if (!ell) { skip('no ellipsoid'); continue; }
    const n = normaliseProj(d.proj, ell);
    if ('reason' in n) { skip(n.reason); continue; }
    const err = sampleError(n.proj, d.samples);
    if (!(err <= SAMPLE_TOL_M)) { skip(`proj4js differs (${d.proj.split(' ')[0]})`); continue; }
    out[key] = n.proj;
  }
  return { projections: out, skipped };
}
