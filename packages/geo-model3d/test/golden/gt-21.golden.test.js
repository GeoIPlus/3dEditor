// GT-21 (v0.3 §12; spec §13; row 3D-22): heatmap of the GT-03 south slope against the GT-20 points shifted +0.10 m in
// Z: mean slope deviation 0.080 +/- 0.005 m (normal distance). Outliers stay in the input and fall outside
// heatmapBufferM (D-102). Expected values are read from the fixture, never edited to match the code.
import { describe, expect, it } from 'vitest';
import { deviationStats } from '@geoiplus/geo-model3d';
import { readFixture } from '../brep/helpers.js';
import { PROFILE, validator } from '../cloud/helpers.js';

const model = readFixture('GT-21', 'input.model.json');
const input = readFixture('GT-21', 'input.points.json');
const expected = readFixture('GT-21', 'expected.json');
const steps = readFixture('GT-21', 'steps.json');

describe('GT-21 heatmap', () => {
  it('the fixture is the one row 3D-22 owns', () => {
    expect(expected.owner.row).toBe('3D-22');
    expect(steps.map((/** @type {any} */ s) => [s.step, s.name])).toEqual([['REQUEST', 'HEATMAP']]);
    expect(expected.assert.distance).toBe('normal');
  });

  // [A] thresholdM has no default (D-3D22-2) and GT-21 asserts no share: 0.05 m is a test value only.
  const request = { buildingId: model.buildingId, modelVersion: model.version, selection: steps[0].params.selection, faceIds: steps[0].params.faceIds, thresholdM: 0.05 };
  const r = /** @type {any} */ (deviationStats(model, Float64Array.from(input.points.flat()), request, PROFILE));

  it(`mean slope deviation ${expected.assert.meanSlopeDeviationM} +/- ${expected.assert.toleranceM} m`, () => {
    expect(validator('heatmap-request')(request)).toBe(true);
    expect(validator('heatmap-result')(r.result)).toBe(true);
    const slope = r.result.faces[0];
    console.log(`GT-21: ${slope.faceId} mean ${slope.meanM.toFixed(5)} m over ${slope.pointCount} points (rmse ${slope.rmseM.toFixed(5)}, max ${slope.maxAbsM.toFixed(4)})`);
    expect(slope.faceId).toBe('f-roof-s');
    expect(Math.abs(slope.meanM - expected.assert.meanSlopeDeviationM)).toBeLessThanOrEqual(expected.assert.toleranceM);
  });

  it('outliers are outside the buffer: no point with |d| > heatmapBufferM is counted', () => {
    expect(r.result.faces[0].maxAbsM).toBeLessThanOrEqual(PROFILE.heatmapBufferM);
  });
});
