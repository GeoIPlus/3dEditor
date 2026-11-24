// Generates packages/geo-model3d/src/crs/epsg-table.json from a PROJ `proj.db` (3D-32, 3D-ADR-0007).
// Usage: node tools/crs-table/generate.mjs <path/to/proj.db> <proj-defs.json> [out.json]
// proj-defs.json comes from proj-defs.py (same pinned PROJ); it adds the projection of each projected CRS (3D-69).
// The database is an input, not committed; README.md here says how to obtain the pinned one.
// Only CRSs the kernel supports are written; every other code resolves to INVALID_CRS (D-92).
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { buildProjections } from './projections.mjs';

const DEGREE = new Set(['EPSG:9122', 'EPSG:9102']); // degree (supplier to define representation), degree
const METRE = 'EPSG:9001';
const AUTHS = ['EPSG', 'OGC'];

/** @param {string} a @param {string|number} c */
const key = (a, c) => `${a}:${c}`;

/**
 * Axis order code of a coordinate system: 'EN' or 'NE' when the first two axes are east/north in one unit.
 * @param {Array<{orientation: string, uom: string}>} axes  sorted by order
 * @param {Set<string>} units allowed units of the first two axes
 * @returns {'EN'|'NE'|null}
 */
export function axisOrder(axes, units) {
  if (axes.length < 2 || !units.has(axes[0].uom) || !units.has(axes[1].uom)) return null;
  const o = `${axes[0].orientation},${axes[1].orientation}`;
  if (o === 'east,north') return 'EN';
  if (o === 'north,east') return 'NE';
  return null;
}

/**
 * @param {string} dbPath
 * @param {{ proj: string, pyproj: string, defs: Record<string, any> }} projDefs proj-defs.py output
 */
export function buildTable(dbPath, projDefs) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const meta = Object.fromEntries(
    /** @type {Array<{key: string, value: string}>} */ (db.prepare('SELECT key, value FROM metadata').all()).map((r) => [r.key, r.value]),
  );
  /** @type {Map<string, Array<{orientation: string, uom: string}>>} */
  const cs = new Map();
  const axisRows = /** @type {any[]} */ (db.prepare(
    'SELECT coordinate_system_auth_name a, coordinate_system_code c, orientation, uom_auth_name ua, uom_code uc FROM axis ORDER BY a, c, coordinate_system_order',
  ).all());
  for (const r of axisRows) {
    const k = key(r.a, r.c);
    if (!cs.has(k)) cs.set(k, []);
    /** @type {any[]} */ (cs.get(k)).push({ orientation: r.orientation, uom: key(r.ua, r.uc) });
  }
  /** @param {string} t table alias */
  const inAuth = (t) => `${t}.auth_name IN (${AUTHS.map((a) => `'${a}'`).join(',')}) AND ${t}.deprecated = 0`;

  /** @type {Record<string, {a: number, rf?: number, b?: number}>} */
  const ellipsoids = {};
  /** @type {Record<string, [string, string, string]>} order, ellipsoid, datum (3D-69: same-datum rule, D-3D69-2) */
  const geographic = {};
  const geoRows = /** @type {any[]} */ (db.prepare(
    `SELECT g.auth_name ga, g.code gc, g.coordinate_system_auth_name ca, g.coordinate_system_code cc,
            d.auth_name da, d.code dc, e.auth_name ea, e.code ec, e.semi_major_axis sa, e.inv_flattening rf, e.semi_minor_axis sb, e.uom_auth_name eua, e.uom_code euc
     FROM geodetic_crs g
     JOIN geodetic_datum d ON d.auth_name = g.datum_auth_name AND d.code = g.datum_code
     JOIN ellipsoid e ON e.auth_name = d.ellipsoid_auth_name AND e.code = d.ellipsoid_code
     WHERE ${inAuth('g')} AND g.type IN ('geographic 2D', 'geographic 3D')`,
  ).all());
  for (const r of geoRows) {
    const order = axisOrder(cs.get(key(r.ca, r.cc)) ?? [], DEGREE);
    if (!order || key(r.eua, r.euc) !== METRE) continue; // unsupported: grads, odd axes, non-metre ellipsoid
    const ek = key(r.ea, r.ec);
    ellipsoids[ek] = r.rf ? { a: r.sa, rf: r.rf } : { a: r.sa, b: r.sb ?? r.sa };
    geographic[key(r.ga, r.gc)] = [order, ek, key(r.da, r.dc)];
  }

  /** @type {Record<string, string>} */
  const projected = {};
  /** @type {Record<string, string>} projected CRS -> datum of its geodetic CRS */
  const projectedDatum = {};
  /** @type {Record<string, {a: number, rf?: number, b?: number}>} */
  const projectedEllipsoid = {};
  const projRows = /** @type {any[]} */ (db.prepare(
    `SELECT p.auth_name pa, p.code pc, p.coordinate_system_auth_name ca, p.coordinate_system_code cc,
            d.auth_name da, d.code dc, e.semi_major_axis sa, e.inv_flattening rf, e.semi_minor_axis sb, e.uom_auth_name eua, e.uom_code euc
     FROM projected_crs p
     JOIN geodetic_crs g ON g.auth_name = p.geodetic_crs_auth_name AND g.code = p.geodetic_crs_code
     JOIN geodetic_datum d ON d.auth_name = g.datum_auth_name AND d.code = g.datum_code
     JOIN ellipsoid e ON e.auth_name = d.ellipsoid_auth_name AND e.code = d.ellipsoid_code
     WHERE ${inAuth('p')}`,
  ).all());
  for (const r of projRows) {
    const order = axisOrder(cs.get(key(r.ca, r.cc)) ?? [], new Set([METRE]));
    if (!order) continue;
    const k = key(r.pa, r.pc);
    projected[k] = order;
    projectedDatum[k] = key(r.da, r.dc);
    if (key(r.eua, r.euc) === METRE) projectedEllipsoid[k] = r.rf ? { a: r.sa, rf: r.rf } : { a: r.sa, b: r.sb ?? r.sa };
  }
  const { projections: proj, skipped } = buildProjections(projected, projDefs.defs, projectedEllipsoid);
  /** @type {Record<string, [string, string]>} projected CRS -> [datum, proj4 definition] (3D-69, D-3D69-3) */
  const projections = {};
  for (const k of Object.keys(proj)) projections[k] = [projectedDatum[k], proj[k]];

  /** @type {Record<string, string>} */
  const compound = {};
  const compRows = /** @type {any[]} */ (db.prepare(
    `SELECT auth_name a, code c, horiz_crs_auth_name ha, horiz_crs_code hc FROM compound_crs k WHERE ${inAuth('k')}`,
  ).all());
  for (const r of compRows) {
    const h = key(r.ha, r.hc);
    if (geographic[h] || projected[h]) compound[key(r.a, r.c)] = h;
  }
  db.close();

  const sortObj = (/** @type {Record<string, any>} */ o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
  return {
    source: {
      generator: 'tools/crs-table/generate.mjs',
      proj: meta['PROJ.VERSION'],
      epsg: `${meta['EPSG.VERSION']} (${meta['EPSG.DATE']})`,
      projDbSha256: createHash('sha256').update(readFileSync(dbPath)).digest('hex'),
      projDefs: `tools/crs-table/proj-defs.py, pyproj ${projDefs.pyproj}, PROJ ${projDefs.proj}`,
    },
    skippedProjections: sortObj(skipped),
    ellipsoids: sortObj(ellipsoids),
    geographic: sortObj(geographic),
    projected: sortObj(projected),
    compound: sortObj(compound),
    projections: sortObj(projections),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [dbPath, defsPath, out = 'packages/geo-model3d/src/crs/epsg-table.json'] = process.argv.slice(2);
  if (!dbPath || !defsPath) {
    console.error('usage: node tools/crs-table/generate.mjs <proj.db> <proj-defs.json> [out.json]');
    process.exit(2);
  }
  const t = buildTable(dbPath, JSON.parse(readFileSync(defsPath, 'utf8')));
  writeFileSync(out, `${JSON.stringify(t)}\n`);
  console.log(`${out}: geographic ${Object.keys(t.geographic).length}, projected ${Object.keys(t.projected).length}, compound ${Object.keys(t.compound).length}, ellipsoids ${Object.keys(t.ellipsoids).length}, projections ${Object.keys(t.projections).length} (left out: ${JSON.stringify(t.skippedProjections)}); PROJ ${t.source.proj}, EPSG ${t.source.epsg}`);
}
