// GT-20 (v0.3 §12; spec §13; row 3D-22): plane fit on 500 points of z = 0.75 y + 5, noise 0.01 m, 10 % outliers.
// Expected values are read from the fixture, never edited to match the code. The step is a FIT_PLANE command; the
// command wiring is a later row (3D-71, D-3D22-5), so the runner calls `fitPlane` with the step's selection.
import { describe, expect, it } from 'vitest';
import { fitPlane } from '@geoiplus/geo-model3d';
import { readFixture } from '../brep/helpers.js';
import { PROFILE, angleDeg, validator } from '../cloud/helpers.js';

const input = readFixture('GT-20', 'input.points.json');
const expected = readFixture('GT-20', 'expected.json');
const steps = readFixture('GT-20', 'steps.json');
const truth = readFixture('GT-20', 'truth.points.json');

describe('GT-20 FIT_PLANE', () => {
  it('the fixture is the one row 3D-22 owns', () => {
    expect(expected.owner.row).toBe('3D-22');
    expect(steps.map((/** @type {any} */ s) => s.command.operation)).toEqual(['FIT_PLANE']);
    expect(validator('command')(steps[0].command)).toBe(true);
    expect(input.frame).toBe('LOCAL');
    expect(input.points).toHaveLength(expected.assert.points);
  });

  const r = /** @type {any} */ (fitPlane(Float64Array.from(input.points.flat()), steps[0].command.payload.selection, PROFILE));
  const len = Math.hypot(0.75, 1);
  const truthNormal = [0, -0.75 / len, 1 / len]; // z = 0.75 y + 5  <=>  -0.75 y + z - 5 = 0
  const dev = r.result ? angleDeg(r.result.plane.normal, truthNormal) : NaN;

  it(`normal deviation <= ${expected.assert.normalDeviationDegMax} deg, RMSE <= ${expected.assert.rmseMMax} m, inlier ratio >= ${expected.assert.inlierRatioMin}`, () => {
    console.log(`GT-20: normal deviation ${dev.toFixed(4)} deg, RMSE ${r.result?.rmseM.toFixed(5)} m, inliers ${r.result?.inlierCount}/${r.result?.pointCount} = ${r.result?.inlierRatio}`);
    expect(r.error).toBeUndefined();
    expect(r.result.pointCount).toBe(expected.assert.points);
    expect(dev).toBeLessThanOrEqual(expected.assert.normalDeviationDegMax);
    expect(r.result.rmseM).toBeLessThanOrEqual(expected.assert.rmseMMax);
    expect(r.result.inlierRatio).toBeGreaterThanOrEqual(expected.assert.inlierRatioMin);
  });

  it('no fixture outlier is taken as an inlier (outliers lie 1.5..3 m off the plane, D-102)', () => {
    expect(r.result.inlierCount).toBeLessThanOrEqual(input.points.length - truth.outlierIndices.length);
  });
});
