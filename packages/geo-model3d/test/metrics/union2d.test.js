// Unit tests of the plan-union area (3D-116, D-3D116-1; MET-05, MET-06): exact areas of hand-computed cases.
import { describe, expect, it } from 'vitest';
import { unionArea } from '../../src/metrics/union2d.js';

/** @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1 @returns {[number, number][]} */
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

describe('unionArea', () => {
  it('one rectangle; clockwise and counter-clockwise rings give the same area', () => {
    expect(unionArea([[rect(0, 0, 10, 8)]])).toBeCloseTo(80, 12);
    expect(unionArea([[rect(0, 0, 10, 8).reverse()]])).toBeCloseTo(80, 12);
  });

  it('MET-05: overlapping squares count the overlap once (4 + 4 - 1 = 7)', () => {
    expect(unionArea([[rect(0, 0, 2, 2)], [rect(1, 1, 3, 3)]])).toBeCloseTo(7, 12);
  });

  it('MET-05: a polygon inside another adds nothing; identical polygons count once', () => {
    expect(unionArea([[rect(0, 0, 10, 8)], [rect(2, 2, 4, 4)]])).toBeCloseTo(80, 12);
    expect(unionArea([[rect(0, 0, 10, 8)], [rect(0, 0, 10, 8)]])).toBeCloseTo(80, 12);
  });

  it('crossing triangles: the crossings are cut points', () => {
    // triangles (0,0)(2,0)(0,2) and (0,0)(2,0)(2,2): overlap is the triangle (0,0)(2,0)(1,1), area 1 -> 2 + 2 - 1
    /** @type {[number, number][][][]} */
    const tri = [[[[0, 0], [2, 0], [0, 2]]], [[[0, 0], [2, 0], [2, 2]]]];
    expect(unionArea(tri)).toBeCloseTo(3, 12);
    // two opposite triangles, area 2 each; cross-section of the overlap at x: x (x <= 1), 2 - x (x >= 1) -> area 1
    /** @type {[number, number][][]} */
    const a = [[[0, 0], [2, 1], [0, 2]]];
    /** @type {[number, number][][]} */
    const b = [[[2, 0], [2, 2], [0, 1]]];
    expect(unionArea([a, b])).toBeCloseTo(3, 12);
  });

  it('MET-06: holes are gaps; a hole covered by another polygon is filled', () => {
    expect(unionArea([[rect(0, 0, 10, 8), rect(2, 2, 6, 5)]])).toBeCloseTo(80 - 12, 12);
    expect(unionArea([[rect(0, 0, 10, 8), rect(2, 2, 6, 5)], [rect(2, 2, 6, 5)]])).toBeCloseTo(80, 12);
  });

  it('touching polygons: shared edge, no gap and no overlap', () => {
    expect(unionArea([[rect(0, 0, 5, 8)], [rect(5, 0, 10, 8)]])).toBeCloseTo(80, 12);
  });

  it('empty input and degenerate (zero-area) polygons give 0', () => {
    expect(unionArea([])).toBe(0);
    expect(unionArea([[/** @type {[number, number][]} */ ([[0, 0], [1, 0], [2, 0]])]])).toBe(0);
  });

  it('far from the origin the result is stable (local coordinates are the caller duty, still bounded here)', () => {
    expect(unionArea([[rect(5e5, 6e6, 5e5 + 10, 6e6 + 8)]])).toBeCloseTo(80, 5);
  });
});
