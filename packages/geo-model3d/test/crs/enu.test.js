// Accuracy of the geodetic <-> ENU conversion against independent oracles (dev-only, 3D-ADR-0004):
// the closed-form geodetic -> ECEF formula, and GeographicLib geodesic distances.
import { describe, it, expect } from 'vitest';
import geodesicLib from 'geographiclib-geodesic';
import { createMetricFrame } from '../../src/crs/index.js';

const RAD = Math.PI / 180;
const A = 6378137, RF = 298.257222101; // GRS80, EPSG:7019
const geod = new geodesicLib.Geodesic.Geodesic(A, 1 / RF);

/** Closed-form geodetic -> ECEF (textbook formula). @param {number} lon @param {number} lat @param {number} h */
function ecef(lon, lat, h) {
  const f = 1 / RF, e2 = f * (2 - f);
  const N = A / Math.sqrt(1 - e2 * Math.sin(lat * RAD) ** 2);
  return [(N + h) * Math.cos(lat * RAD) * Math.cos(lon * RAD), (N + h) * Math.cos(lat * RAD) * Math.sin(lon * RAD), (N * (1 - e2) + h) * Math.sin(lat * RAD)];
}

describe('ENU frame (3D-32)', () => {
  const origin = /** @type {[number, number, number]} */ ([55.6800, 9.1950, 40]); // EPSG:4937 order lat, lon, h
  const frame = createMetricFrame('EPSG:4937', origin);

  it('ENU vector length equals the ECEF chord (closed-form oracle) within 1e-6 m', () => {
    const o = ecef(origin[1], origin[0], origin[2]);
    let worst = 0;
    for (const [dlat, dlon, h] of [[0.001, 0.001, 45], [-0.002, 0.0015, 10], [0.0005, -0.003, 120], [0, 0, 0]]) {
      const p = /** @type {[number, number, number]} */ ([origin[0] + dlat, origin[1] + dlon, h]);
      const m = frame.toMetric(p);
      const x = ecef(p[1], p[0], p[2]);
      worst = Math.max(worst, Math.abs(Math.hypot(...m) - Math.hypot(x[0] - o[0], x[1] - o[1], x[2] - o[2])));
    }
    expect(worst).toBeLessThan(1e-6);
  });

  it('distances on the ellipsoid match GeographicLib geodesics within 1e-4 m (<= 300 m)', () => {
    let worst = 0;
    for (const [dlat, dlon] of [[0.001, 0], [0, 0.002], [0.0015, -0.0025], [-0.002, 0.001]]) {
      const p = /** @type {[number, number, number]} */ ([origin[0] + dlat, origin[1] + dlon, 0]);
      const q = /** @type {[number, number, number]} */ ([origin[0] - dlat / 2, origin[1] + dlon / 3, 0]);
      const chord = Math.hypot(...[0, 1, 2].map((k) => frame.toMetric(p)[k] - frame.toMetric(q)[k]));
      const { s12 } = geod.Inverse(p[0], p[1], q[0], q[1]);
      // chord vs. arc differ by s^3 / (24 R^2): < 1e-9 m at 300 m
      worst = Math.max(worst, Math.abs(chord - /** @type {number} */ (s12)));
    }
    expect(worst).toBeLessThan(1e-4);
  });

  it('metric -> world -> metric round trip within 1e-6 m over +-500 m', () => {
    let worst = 0;
    for (const e of [-500, -37.25, 0, 12.5, 500]) for (const n of [-500, 3.75, 499]) for (const u of [-30, 0, 60]) {
      const back = frame.toMetric(frame.toWorld([e, n, u]));
      worst = Math.max(worst, Math.hypot(back[0] - e, back[1] - n, back[2] - u));
    }
    expect(worst).toBeLessThan(1e-6);
  });

  it('origin maps to [0, 0, 0]; up is +h; north is +lat', () => {
    expect(Math.hypot(...frame.toMetric(origin))).toBeLessThan(1e-9);
    const up = frame.toMetric([origin[0], origin[1], origin[2] + 10]);
    expect(up[2]).toBeCloseTo(10, 9);
    expect(frame.toMetric([origin[0] + 0.001, origin[1], origin[2]])[1]).toBeGreaterThan(100);
  });

  it('axis order: a lat-first CRS and the lon-first OGC:CRS84 give the same metric point (same ellipsoid family)', () => {
    const f84 = createMetricFrame('EPSG:4326', [55.68, 9.195, 40]);
    const crs84 = createMetricFrame('http://www.opengis.net/def/crs/OGC/1.3/CRS84', [9.195, 55.68, 40]);
    const a = f84.toMetric([55.681, 9.196, 42]), b = crs84.toMetric([9.196, 55.681, 42]);
    expect(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])).toBeLessThan(1e-9);
  });
});
