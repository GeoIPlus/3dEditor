// brep (3D-09): planes, vertex derivation, local frame.
import { describe, expect, it } from 'vitest';
import { cosSinDeg, derivePoint, localFrame, planeFromPoints, signedDistance, translationMapping } from '../../src/brep/index.js';
import { TOL } from './helpers.js';

/** @param {[number, number, number]} n @param {number} d */
const pl = (n, d) => {
  const l = Math.hypot(...n);
  return { normal: /** @type {[number, number, number]} */ (n.map((x) => x / l)), d: d / l };
};

describe('derivePoint (spec §4 rules 2, 3, 5)', () => {
  it('three independent planes meet in their exact intersection', () => {
    const planes = [pl([1, 0, 0], -10), pl([0, 1, 0], 0), pl([0, -3, 4], -20)]; // x = 10, y = 0, roof z = 5 + 0.75 y
    const r = derivePoint(planes, TOL.numericEpsilon);
    expect(r).not.toBeNull();
    expect(r?.p[0]).toBeCloseTo(10, 12);
    expect(r?.p[1]).toBeCloseTo(0, 12);
    expect(r?.p[2]).toBeCloseTo(5, 12);
    expect(r?.residual).toBeLessThan(1e-12);
  });

  it('fewer than three planes, or planes sharing a direction, do not fix a point', () => {
    expect(derivePoint([pl([1, 0, 0], 0), pl([0, 1, 0], 0)], TOL.numericEpsilon)).toBeNull();
    expect(derivePoint([pl([1, 0, 0], 0), pl([0, 1, 0], 0), pl([1, 1, 0], -3)], TOL.numericEpsilon)).toBeNull();
    expect(derivePoint([pl([1, 0, 0], 0), pl([-1, 0, 0], 2), pl([0, 0, 1], 0)], TOL.numericEpsilon)).toBeNull();
  });

  it('four planes through one point have zero residual; a shifted fourth plane shows its residual', () => {
    const hip = [pl([1, 0, 1], -5), pl([-1, 0, 1], -5), pl([0, 1, 1], -5), pl([0, -1, 1], -5)]; // apex (0, 0, 5)
    const r = derivePoint(hip, TOL.numericEpsilon);
    expect(r?.p.map((x) => Math.round(x * 1e9) / 1e9)).toEqual([0, 0, 5]);
    expect(r?.residual).toBeLessThan(1e-12);
    const shifted = [...hip.slice(0, 3), { ...hip[3], d: hip[3].d - 0.05 }];
    expect(derivePoint(shifted, TOL.numericEpsilon)?.residual).toBeGreaterThan(0.01);
  });

  it('planeFromPoints follows the right-hand rule', () => {
    const p = planeFromPoints([0, 0, 0], [1, 0, 0], [0, 1, 0]);
    expect(p?.normal).toEqual([0, 0, 1]);
    expect(signedDistance(/** @type {any} */ (p), [3, 4, 2])).toBe(2);
    expect(planeFromPoints([0, 0, 0], [1, 1, 1], [2, 2, 2])).toBeNull();
  });
});

describe('local frame (spec §1.2, M-02)', () => {
  const frame = /** @type {any} */ ({
    horizontalCrs: 'EPSG:25832', verticalCrs: null, axisOrder: 'EAST_NORTH_UP', unit: 'm',
    originWorld: [512345.678, 6123456.789, 12.345], buildingAxisDeg: 0,
  });

  it('multiples of 90 degrees have exact cosine and sine', () => {
    expect(cosSinDeg(0)).toEqual([1, 0]);
    expect(cosSinDeg(90)).toEqual([0, 1]);
    expect(cosSinDeg(-90)).toEqual([0, -1]);
    expect(cosSinDeg(540)).toEqual([-1, 0]);
  });

  it('local X runs along buildingAxisDeg, counter-clockwise from east', () => {
    const lf = localFrame({ ...frame, buildingAxisDeg: 90 });
    expect(lf.toWorld([1, 0, 0])).toEqual([512345.678, 6123457.789, 12.345]); // local X = north
    const lf30 = localFrame({ ...frame, buildingAxisDeg: 30 });
    const w = lf30.toWorld([2, 0, 1]);
    expect(w[0] - frame.originWorld[0]).toBeCloseTo(2 * Math.cos(Math.PI / 6), 9);
    expect(w[1] - frame.originWorld[1]).toBeCloseTo(1, 9);
  });

  it('world -> local -> world at ~6 000 000 m with a skewed axis stays within 1e-6 m', () => {
    for (const deg of [0, 17.3, 90, 213.7, -45]) {
      const lf = localFrame({ ...frame, buildingAxisDeg: deg });
      let max = 0;
      for (let i = 0; i < 200; i++) {
        /** @type {[number, number, number]} */
        const w = [frame.originWorld[0] + ((i * 37) % 101) - 50.123, frame.originWorld[1] + ((i * 53) % 97) - 40.987, 12 + (i % 23)];
        const back = lf.toWorld(lf.toLocal(w));
        max = Math.max(max, Math.hypot(back[0] - w[0], back[1] - w[1], back[2] - w[2]));
      }
      expect(max).toBeLessThan(1e-6);
    }
  });

  it('takes an injected metric mapping (the 3D-32 crs boundary)', () => {
    const calls = { toMetric: 0, toWorld: 0 };
    const base = translationMapping([100, 200, 0]);
    const metric = {
      toMetric: (/** @type {[number, number, number]} */ w) => { calls.toMetric++; return base.toMetric(w); },
      toWorld: (/** @type {[number, number, number]} */ m) => { calls.toWorld++; return base.toWorld(m); },
    };
    const lf = localFrame({ ...frame, originWorld: [0, 0, 0] }, metric);
    expect(lf.toLocal([101, 202, 3])).toEqual([1, 2, 3]);
    expect(lf.toWorld([1, 2, 3])).toEqual([101, 202, 3]);
    expect(calls).toEqual({ toMetric: 1, toWorld: 1 });
  });

  it('refuses a frame outside the contract', () => {
    expect(() => localFrame({ ...frame, axisOrder: 'NORTH_EAST_UP' })).toThrow(/unsupported frame/);
    expect(() => localFrame({ ...frame, buildingAxisDeg: Number.NaN })).toThrow(/finite/);
  });
});
