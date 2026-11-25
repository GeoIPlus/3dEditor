// cloud (3D-22): plane fit (spec §9 rules 1-3, Accept 2; D-130).
import { describe, expect, it } from 'vitest';
import { canonicalJson, fitPlane } from '@geoiplus/geo-model3d';
import { RANSAC } from '../../src/cloud/fit-plane.js';
import { canonicalOrder } from '../../src/cloud/points.js';
import { mulberry32 } from '../../src/cloud/rng.js';
import { readFixture } from '../brep/helpers.js';
import { ALL, PROFILE, angleDeg, synthetic, validator } from './helpers.js';

const resultOk = validator('plane-fit-result');
const errorOk = validator('error');

describe('fitPlane', () => {
  it('fits a clean plane: unit normal, result valid against plane-fit-result', () => {
    const r = /** @type {any} */ (fitPlane(synthetic({ n: 200 }), ALL, PROFILE));
    expect(resultOk(r.result), JSON.stringify(resultOk.errors)).toBe(true);
    const n = r.result.plane.normal;
    expect(Math.hypot(...n)).toBeCloseTo(1, 12);
    const len = Math.hypot(0, -0.75, 1);
    expect(angleDeg(n, [0, -0.75 / len, 1 / len])).toBeLessThan(0.1);
    expect(n[2]).toBeGreaterThan(0);
    expect(r.result).toMatchObject({ pointCount: 200, inlierCount: 200, inlierRatio: 1, frame: 'LOCAL' });
  });

  it('ignores outliers: inliers found, RMSE from inliers only', () => {
    const r = /** @type {any} */ (fitPlane(synthetic({ n: 160, outliers: 40 }), ALL, PROFILE));
    expect(r.result.inlierCount).toBe(160);
    expect(r.result.inlierRatio).toBe(0.8);
    expect(r.result.rmseM).toBeLessThan(0.005);
  });

  it('is deterministic: equal input -> byte-identical result (seeded, no Math.random)', () => {
    const pts = synthetic({ n: 150, outliers: 60, amp: 0.015 });
    expect(canonicalJson(fitPlane(pts, ALL, PROFILE))).toBe(canonicalJson(fitPlane(pts.slice(), ALL, PROFILE)));
    expect(RANSAC).toEqual({ confidence: 0.999, maxIterations: 1000, seed: RANSAC.seed });
  });

  it('applies the selection: BOX and POLYGON keep only their points', () => {
    const pts = synthetic({ n: 400 });
    const box = /** @type {any} */ (fitPlane(pts, { kind: 'BOX', min: [0, 0, 0], max: [5, 10, 100] }, PROFILE));
    const poly = /** @type {any} */ (fitPlane(pts, { kind: 'POLYGON', ringXY: [[0, 0], [5, 0], [5, 10], [0, 10]], zMin: 0, zMax: 100 }, PROFILE));
    expect(box.result.pointCount).toBeGreaterThan(150);
    expect(box.result.pointCount).toBeLessThan(250);
    expect(poly.result.pointCount).toBe(box.result.pointCount);
  });

  it(`refuses ${PROFILE.planeFitMinPoints - 1} points with INVALID_MEASUREMENT carrying the count (spec §9 Accept 2)`, () => {
    const r = /** @type {any} */ (fitPlane(synthetic({ n: PROFILE.planeFitMinPoints - 1 }), ALL, PROFILE));
    expect(r.error).toEqual({ code: 'INVALID_MEASUREMENT', httpStatus: 422, messageKey: 'model3d.error.planeFit', details: { pointCount: 29 } });
    expect(errorOk(r.error)).toBe(true);
    expect(/** @type {any} */ (fitPlane(synthetic({ n: 30 }), ALL, PROFILE)).result.pointCount).toBe(30);
  });

  it('refuses an inlier ratio below planeFitMinInlierRatio with the count and ratio', () => {
    const r = /** @type {any} */ (fitPlane(synthetic({ n: 50, outliers: 50 }), ALL, PROFILE));
    expect(r.error.code).toBe('INVALID_MEASUREMENT');
    expect(r.error.details.pointCount).toBe(100);
    expect(r.error.details.inlierRatio).toBeLessThan(PROFILE.planeFitMinInlierRatio);
    expect(errorOk(r.error)).toBe(true);
  });

  it('rejects malformed input with INVALID_PAYLOAD', () => {
    const pts = synthetic({ n: 40 });
    for (const [p, s] of /** @type {any[]} */ ([
      [[1, 2, 3], ALL],
      [new Float64Array(4), ALL],
      [pts, { kind: 'BOX', min: [1, 0, 0], max: [0, 1, 1] }],
      [pts, { kind: 'POLYGON', ringXY: [[0, 0], [1, 0], [1, 1]], zMin: 2, zMax: 1 }],
    ])) {
      const r = /** @type {any} */ (fitPlane(p, s, PROFILE));
      expect(r.error.code).toBe('INVALID_PAYLOAD');
      expect(errorOk(r.error), JSON.stringify(errorOk.errors)).toBe(true);
    }
  });

  /** Points of `pts` in the order `order` (indices of points). @param {Float64Array} pts @param {number[]} order */
  const permute = (pts, order) => {
    const out = new Float64Array(pts.length);
    order.forEach((i, m) => out.set(pts.subarray(3 * i, 3 * i + 3), 3 * m));
    return out;
  };
  /** A seeded Fisher-Yates permutation of 0..n-1. @param {number} n @param {number} seed */
  const shuffled = (n, seed) => {
    const rnd = mulberry32(seed);
    const o = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [o[i], o[j]] = [o[j], o[i]];
    }
    return o;
  };

  it('is independent of the input point order: reversed and shuffled give the byte-identical result (3D-80)', () => {
    const gt20 = readFixture('GT-20', 'input.points.json');
    const sel = readFixture('GT-20', 'steps.json')[0].command.payload.selection;
    for (const [pts, s] of /** @type {[Float64Array, any][]} */ ([
      [synthetic({ n: 150, outliers: 60, amp: 0.015 }), ALL],
      [Float64Array.from(gt20.points.flat()), sel],
    ])) {
      const n = pts.length / 3;
      const want = canonicalJson(fitPlane(pts, s, PROFILE));
      expect(/** @type {any} */ (fitPlane(pts, s, PROFILE)).result).toBeDefined();
      const reversed = Array.from({ length: n }, (_, i) => n - 1 - i);
      for (const order of [reversed, shuffled(n, 1), shuffled(n, 2), shuffled(n, 3)]) {
        expect(canonicalJson(fitPlane(permute(pts, order), s, PROFILE))).toBe(want);
      }
    }
  });

  it('canonicalOrder sorts by x, then y, then z and keeps every point', () => {
    const pts = Float64Array.from([1, 2, 3, 0, 5, 5, 1, 2, 2, 1, 1, 9, 0, 5, 5]);
    expect(Array.from(canonicalOrder(pts))).toEqual([0, 5, 5, 0, 5, 5, 1, 1, 9, 1, 2, 2, 1, 2, 3]);
    expect(canonicalOrder(new Float64Array(0))).toHaveLength(0);
  });
});
