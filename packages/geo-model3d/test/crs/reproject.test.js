// Reprojection between two CRSs on one datum (3D-69, D-197, D-198) against PROJ 9.8.1 (pyproj 3.8.0,
// `Transformer.from_crs(src, dst).transform`, EPSG authority axis order on both sides), computed once offline on
// 2026-11-24 and written here as numbers (as the 3D-32 oracles; no PROJ at test time).
import { describe, it, expect } from 'vitest';
import { createCrsMapping, CrsError } from '../../src/crs/index.js';
import RAW from '../../src/crs/epsg-table.json' with { type: 'json' };

/** @type {Record<string, Record<string, any>>} */
const TABLE = /** @type {any} */ (RAW);

/** Angle error in degrees -> metres (upper bound, 111.32 km per degree). */
const degM = (/** @type {number} */ d) => Math.abs(d) * 111320;

/** [from, to, input in `from` order, PROJ output in `to` order]; methods: UTM, TM (north-first), Swiss oblique
 *  Mercator, Krovak, pseudo-Mercator (sphere), oblique stereographic, LCC 2SP, UTM -> UTM. */
const ORACLE = /** @type {const} */ ([
  ['EPSG:25832', 'EPSG:4937', [512345.678, 6162345.432, 47.25], [55.60688186893101, 9.19596513111348, 47.25]],
  ['EPSG:31467', 'EPSG:4314', [5402345.432, 3512345.678, 310.5], [48.759513101045464, 9.16793535677136, 310.5]],
  ['EPSG:2056', 'EPSG:4150', [2600123.45, 1200456.78, 520.0], [46.956514848109634, 7.441205360929341, 520.0]],
  ['EPSG:5514', 'EPSG:4156', [-742000.5, -1043000.25, 250.0], [50.08935140542771, 14.433526502880794, 250.0]],
  ['EPSG:3857', 'EPSG:4326', [1113194.9, 6800125.5, 30.0], [52.0000002522094, 9.999999928739022, 30.0]],
  ['EPSG:28992', 'EPSG:4289', [155123.4, 463456.7, 2.0], [52.16026580796683, 5.389442512526406, 2.0]],
  ['EPSG:2154', 'EPSG:4171', [652345.6, 6862345.7, 35.0], [48.859382641324544, 2.350483144992043, 35.0]],
  ['EPSG:25832', 'EPSG:25833', [812345.6, 5802345.7, 40.0], [403126.5513947409, 5793411.253248917, 40.0]],
]);

describe('createCrsMapping (3D-69)', () => {
  it('same horizontal CRS is the identity, also through a compound CRS; no point is changed', () => {
    const compound = Object.keys(TABLE.compound).find((k) => TABLE.compound[k] === 'EPSG:25832');
    for (const ref of ['EPSG:25832', 'http://www.opengis.net/def/crs/EPSG/0/25832', compound]) {
      const m = createCrsMapping(ref, 'EPSG:25832');
      expect(m.identity).toBe(true);
      const p = [512345.678, 6162345.432, 47.25];
      expect(m.forward(/** @type {any} */ (p))).toEqual(p);
    }
  });

  for (const [from, to, input, want] of ORACLE) {
    it(`${from} -> ${to} matches PROJ within 1 mm and round-trips within 1 mm`, () => {
      const m = createCrsMapping(from, to);
      expect(m.identity).toBe(false);
      const got = m.forward(/** @type {any} */ ([...input]));
      const geo = TABLE.geographic[to];
      const err = geo
        ? Math.max(degM(got[0] - want[0]), degM(got[1] - want[1]))
        : Math.hypot(got[0] - want[0], got[1] - want[1]);
      expect(err).toBeLessThan(0.001);
      expect(got[2]).toBe(input[2]); // heights pass through (D-93)
      const back = m.inverse(got);
      expect(Math.hypot(back[0] - input[0], back[1] - input[1])).toBeLessThan(0.001);
    });
  }

  it('different datums are refused: INVALID_CRS, DATUM_MISMATCH naming both (D-197)', () => {
    /** @type {any} */
    let e;
    try { createCrsMapping('EPSG:32632', 'EPSG:4937'); } catch (x) { e = x; }
    expect(e).toBeInstanceOf(CrsError);
    expect(e.code).toBe('INVALID_CRS');
    expect(e.details.reason).toBe('DATUM_MISMATCH');
    expect(e.details.datums).toEqual(['EPSG:6326', 'EPSG:6258']);
  });

  it('a projected CRS without a verified projection is refused: NO_PROJECTION (EPSG:3035, proj4js laea > 1 mm)', () => {
    expect(TABLE.projected['EPSG:3035']).toBe('NE');
    expect(TABLE.projections['EPSG:3035']).toBeUndefined();
    expect(() => createCrsMapping('EPSG:3035', 'EPSG:4937')).toThrow(expect.objectContaining({ details: expect.objectContaining({ reason: 'NO_PROJECTION' }) }));
  });

  it('unknown CRS stays UNKNOWN_OR_UNSUPPORTED', () => {
    expect(() => createCrsMapping('EPSG:999999', 'EPSG:4937')).toThrow(expect.objectContaining({ code: 'INVALID_CRS' }));
  });
});
