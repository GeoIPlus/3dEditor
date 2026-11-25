// cloud (3D-22): seeded generator, 3x3 eigen solver, ring test.
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../src/cloud/rng.js';
import { symmetricEigen3 } from '../../src/cloud/eigen.js';
import { insideRing, selectPoints } from '../../src/cloud/points.js';

describe('mulberry32', () => {
  it('repeats for a seed, differs between seeds, stays in [0, 1)', () => {
    const a = mulberry32(5);
    const b = mulberry32(5);
    const c = mulberry32(6);
    const xs = Array.from({ length: 1000 }, () => a());
    expect(Array.from({ length: 1000 }, () => b())).toEqual(xs);
    expect(c()).not.toBe(xs[0]);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
  });
});

describe('symmetricEigen3', () => {
  it('diagonalises: A v = lambda v, ascending, orthonormal', () => {
    /** @type {any} */
    const m = [[4, 1, 0.5], [1, 3, 0.2], [0.5, 0.2, 1]];
    const { values, vectors } = symmetricEigen3(m);
    expect(values[0]).toBeLessThanOrEqual(values[1]);
    expect(values[1]).toBeLessThanOrEqual(values[2]);
    vectors.forEach((v, i) => {
      for (let r = 0; r < 3; r++) expect(m[r][0] * v[0] + m[r][1] * v[1] + m[r][2] * v[2]).toBeCloseTo(values[i] * v[r], 12);
      expect(Math.hypot(...v)).toBeCloseTo(1, 12);
    });
    expect(vectors[0][0] * vectors[1][0] + vectors[0][1] * vectors[1][1] + vectors[0][2] * vectors[1][2]).toBeCloseTo(0, 12);
    expect(values.reduce((s, x) => s + x, 0)).toBeCloseTo(8, 12);
  });

  it('handles an already diagonal matrix', () => {
    const { values, vectors } = symmetricEigen3([[3, 0, 0], [0, 1, 0], [0, 0, 2]]);
    expect(values).toEqual([1, 2, 3]);
    expect(vectors[0]).toEqual([0, 1, 0]);
  });
});

describe('selection', () => {
  it('ring test: concave L, outside notch', () => {
    /** @type {[number, number][]} */
    const l = [[0, 0], [10, 0], [10, 4], [4, 4], [4, 8], [0, 8]];
    expect(insideRing(l, 2, 6)).toBe(true);
    expect(insideRing(l, 7, 6)).toBe(false);
  });

  it('box bounds are inclusive; polygon keeps the z range', () => {
    const pts = Float64Array.from([0, 0, 0, 1, 1, 1, 2, 2, 2]);
    expect([...selectPoints(pts, { kind: 'BOX', min: [0, 0, 0], max: [1, 1, 1] })]).toEqual([0, 0, 0, 1, 1, 1]);
    expect([...selectPoints(pts, { kind: 'POLYGON', ringXY: [[-1, -1], [3, -1], [3, 3], [-1, 3]], zMin: 0.5, zMax: 3 })]).toEqual([1, 1, 1, 2, 2, 2]);
  });
});
