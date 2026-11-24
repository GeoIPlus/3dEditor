// tools/crs-table projections (3D-69): proj-string normalisation and the PROJ sample check.
import { describe, it, expect } from 'vitest';
import { normaliseProj, longlatOf, sampleError, buildProjections } from './projections.mjs';

const GRS80 = { a: 6378137, rf: 298.257222101 };
// PROJ 9.8.1 for EPSG:25832 at lon 9.195965131, lat 55.606881869 (reproject.test.js oracle, inverted).
const SAMPLE = [{ lonlat: /** @type {[number, number]} */ ([9.19596513111348, 55.60688186893101]), en: /** @type {[number, number]} */ ([512345.678, 6162345.432]) }];

describe('normaliseProj', () => {
  it('drops datum and marker tokens and writes the datum ellipsoid explicitly', () => {
    const n = normaliseProj('+proj=utm +zone=32 +datum=WGS84 +towgs84=0,0,0 +units=m +no_defs +type=crs', GRS80);
    expect(n).toEqual({ proj: '+proj=utm +zone=32 +a=6378137 +rf=298.257222101' });
  });
  it('keeps an explicit figure (pseudo-Mercator sphere) and drops +nadgrids', () => {
    const n = /** @type {{ proj: string }} */ (normaliseProj('+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +nadgrids=@null +wktext +no_defs', GRS80));
    expect(n.proj).toBe('+proj=merc +a=6378137 +b=6378137 +lat_ts=0');
    expect(longlatOf(n.proj)).toBe('+proj=longlat +a=6378137 +b=6378137 +no_defs');
  });
  it('refuses a non-Greenwich meridian, axis flips and non-metre units', () => {
    expect(normaliseProj('+proj=lcc +pm=paris', GRS80)).toEqual({ reason: 'pm' });
    expect(normaliseProj('+proj=tmerc +axis=wsu', GRS80)).toEqual({ reason: 'axis' });
    expect(normaliseProj('+proj=tmerc +units=us-ft', GRS80)).toEqual({ reason: 'units' });
  });
});

describe('sample check', () => {
  it('a correct definition agrees with PROJ within 1 mm; a wrong one is left out with its method named', () => {
    expect(sampleError('+proj=utm +zone=32 +a=6378137 +rf=298.257222101', SAMPLE)).toBeLessThan(0.001);
    expect(sampleError('+proj=utm +zone=33 +a=6378137 +rf=298.257222101', SAMPLE)).toBeGreaterThan(1);
    const defs = { 'EPSG:1': { proj: '+proj=utm +zone=32 +ellps=GRS80', samples: SAMPLE }, 'EPSG:2': { proj: '+proj=utm +zone=33 +ellps=GRS80', samples: SAMPLE } };
    const r = buildProjections({ 'EPSG:1': 'EN', 'EPSG:2': 'EN', 'EPSG:3': 'EN' }, defs, { 'EPSG:1': GRS80, 'EPSG:2': GRS80, 'EPSG:3': GRS80 });
    expect(Object.keys(r.projections)).toEqual(['EPSG:1']);
    expect(r.skipped).toEqual({ 'proj4js differs (+proj=utm)': 1, 'no PROJ definition': 1 });
  });
});
