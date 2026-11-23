// GT-25 (v0.3 §12; spec §13; row 3D-09): building with coordinates of the order of 6 000 000 m,
// world -> local -> world within 0.001 m. Expected values are read from the fixture, never edited to match the code.
import { describe, expect, it } from 'vitest';
import { localToWorld, worldToLocal } from '@geoiplus/geo-model3d';
import { readFixture } from '../brep/helpers.js';

const model = readFixture('GT-25', 'input.model.json');
const world = readFixture('GT-25', 'input.world.json');
const expected = readFixture('GT-25', 'expected.json');
const steps = readFixture('GT-25', 'steps.json');

/** @param {number[]} a @param {number[]} b */
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe('GT-25 world -> local -> world', () => {
  it('the fixture is the one row 3D-09 owns', () => {
    expect(expected.owner.row).toBe('3D-09');
    expect(steps.map((/** @type {any} */ s) => s.step)).toEqual(['WORLD_LOCAL_ROUNDTRIP']);
    expect(world.crs).toBe(model.frame.horizontalCrs);
    expect(Math.max(...world.points.map((/** @type {number[]} */ p) => Math.abs(p[1])))).toBeGreaterThanOrEqual(expected.assert.coordinateOrderM);
  });

  it(`round trip error <= ${expected.assert.roundTripToleranceM} m for every point`, () => {
    const local = worldToLocal(model.frame, world.points);
    const back = localToWorld(model.frame, local);
    const errors = world.points.map((/** @type {number[]} */ p, /** @type {number} */ i) => dist(p, back[i]));
    const max = Math.max(...errors);
    console.log(`GT-25 max world -> local -> world error: ${max.toExponential(3)} m over ${errors.length} points`);
    expect(max).toBeLessThanOrEqual(expected.assert.roundTripToleranceM);
  });

  it('world -> local lands on the model vertices (the transform is the model frame)', () => {
    const local = worldToLocal(model.frame, world.points);
    const vertices = Object.values(model.vertices).map((/** @type {any} */ v) => v.p);
    const max = Math.max(...local.map((p, i) => dist(p, vertices[i])));
    expect(max).toBeLessThanOrEqual(expected.assert.roundTripToleranceM);
  });
});
