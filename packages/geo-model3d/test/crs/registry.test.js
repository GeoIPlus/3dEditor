import { describe, it, expect } from 'vitest';
import { resolveCrs, normaliseCrsRef, CrsError, INVALID_CRS, CRS_TABLE_SOURCE } from '../../src/crs/index.js';

/** @param {unknown} ref */
function refusal(ref) {
  try {
    resolveCrs(ref);
  } catch (e) {
    expect(e).toBeInstanceOf(CrsError);
    return /** @type {CrsError} */ (e);
  }
  throw new Error(`expected INVALID_CRS for ${String(ref)}`);
}

describe('crs registry (3D-32)', () => {
  it('accepts the CityJSON 2.0 URL form (http and https) and the contract form', () => {
    expect(normaliseCrsRef('https://www.opengis.net/def/crs/EPSG/0/25832')).toBe('EPSG:25832');
    expect(normaliseCrsRef('http://www.opengis.net/def/crs/EPSG/0/7415')).toBe('EPSG:7415');
    expect(normaliseCrsRef('http://www.opengis.net/def/crs/OGC/1.3/CRS84')).toBe('OGC:CRS84');
    expect(normaliseCrsRef('EPSG:4326')).toBe('EPSG:4326');
  });

  it('projected CRSs keep the projected path; axis order from EPSG (D-122)', () => {
    expect(resolveCrs('https://www.opengis.net/def/crs/EPSG/0/25832')).toEqual({ kind: 'PROJECTED', crs: 'EPSG:25832', horizontalCrs: 'EPSG:25832', axisOrder: 'EN' });
    expect(resolveCrs('EPSG:31467').axisOrder).toBe('NE'); // DHDN / 3-degree Gauss-Kruger zone 3: northing first in EPSG
  });

  it('geographic CRSs resolve with ellipsoid and authority axis order', () => {
    const g = resolveCrs('EPSG:4326');
    expect(g).toMatchObject({ kind: 'GEOGRAPHIC', axisOrder: 'NE', ellipsoid: { a: 6378137, rf: 298.257223563 } });
    expect(resolveCrs('EPSG:4937')).toMatchObject({ kind: 'GEOGRAPHIC', axisOrder: 'NE', ellipsoid: { a: 6378137, rf: 298.257222101 } });
    expect(resolveCrs('http://www.opengis.net/def/crs/OGC/1.3/CRS84').axisOrder).toBe('EN');
    expect(resolveCrs('EPSG:7035').axisOrder).toBe('EN'); // one of the 26 east-first EPSG geographic CRSs
  });

  it('compound CRSs resolve through the horizontal component; vertical kept (D-93)', () => {
    expect(resolveCrs('https://www.opengis.net/def/crs/EPSG/0/7415')).toMatchObject({ kind: 'PROJECTED', crs: 'EPSG:7415', horizontalCrs: 'EPSG:28992' });
    expect(resolveCrs('EPSG:9705')).toMatchObject({ kind: 'GEOGRAPHIC', crs: 'EPSG:9705', horizontalCrs: 'EPSG:4326' });
  });

  it('unknown or unsupported CRS -> INVALID_CRS', () => {
    for (const ref of ['EPSG:999999', 'EPSG:4807' /* grads */, 'EPSG:2263' /* US survey foot */, 'EPSG:4978' /* geocentric */]) {
      const e = refusal(ref);
      expect(e.code).toBe(INVALID_CRS);
      expect(e.details.reason).toBe('UNKNOWN_OR_UNSUPPORTED');
      expect(e.messageKey).toBe('model3d.error.invalidCrs');
    }
    for (const ref of [undefined, 42, '', 'urn:ogc:def:crs:EPSG::4326', 'https://example.org/crs/EPSG/0/4326']) {
      expect(refusal(ref).details.reason).toBe('MALFORMED');
    }
  });

  it('records its data source', () => {
    expect(CRS_TABLE_SOURCE.proj).toBe('9.8.1');
    expect(CRS_TABLE_SOURCE.epsg).toMatch(/^v12\.029/);
    expect(CRS_TABLE_SOURCE.projDbSha256).toMatch(/^[0-9a-f]{64}$/);
  });
});
