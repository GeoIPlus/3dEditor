// GT-06 (v0.3 §12; spec §13, §10.5; row 3D-17): FIT_TO_SHARED_EDGE on the GT-I2 import, leading = south slope.
// Independent checks (v0.2 F.3): the two ridge half-edges are 0.03 m apart and twinless before; after, they are one
// twin pair, the state is VALID_SOLID, and the leading plane is still z = 5 + 0.75 y.
import { describe, expect, it } from 'vitest';
import { repairRun } from './repair.golden.helpers.js';
import { maxPlaneDistance, PROFILE } from '../ops/helpers.js';

describe('GT-06 FIT_TO_SHARED_EDGE', () => {
  const { expected, input, outs } = repairRun('GT-06');
  const { commit } = outs[0];
  const [ea, eb] = outs[0].step.command.payload.edgeIds;
  const a = expected.assert;

  it('input: two open ridge edges 0.03 m apart, leading plane z = 5 + 0.75 y', () => {
    expect(input.halfEdges[ea].twinId).toBeNull();
    expect(input.halfEdges[eb].twinId).toBeNull();
    expect(input.vertices['v-r2'].p[1] - input.vertices['v-r0'].p[1]).toBeCloseTo(0.03, 9);
    const pl = input.faces['f-roof-s'].supportPlane;
    for (const y of [0, 4]) expect(pl.normal[1] * y + pl.normal[2] * (5 + 0.75 * y) + pl.d).toBeCloseTo(0, 9);
  });

  it('expected: shared ridge, VALID_SOLID, leading plane unchanged', () => {
    expect(commit.result.status).toBe('COMMITTED');
    const m = commit.model;
    expect(a.sharedRidge && m.halfEdges[ea].twinId === eb && m.halfEdges[eb].twinId === ea).toBe(true);
    expect(m.state).toBe(a.state);
    expect(commit.result.validation.isValidForTargetState).toBe(true);
    expect(a.leadingPlaneUnchanged && JSON.stringify(m.faces['f-roof-s'].supportPlane) === JSON.stringify(input.faces['f-roof-s'].supportPlane)).toBe(true);
    expect(maxPlaneDistance(m)).toBeLessThanOrEqual(PROFILE.planarTolM);
  });

  it('weld is the plane intersection, not the mean of the copies (spec §10.5 Accept 3)', () => {
    const p = commit.model.vertices['v-r0'].p;
    expect(p[1]).toBeCloseTo(4, 9); // derived on the leading plane and the gable wall
    expect(Math.abs(p[1] - 4.015)).toBeGreaterThan(0.01); // the mean of the copies would be y = 4.015
    expect(commit.result.topologyLineage.mapped).toEqual({ 'v-r2': ['v-r0'], 'v-r3': ['v-r1'] });
  });
});
