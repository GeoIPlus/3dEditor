// GT-19 (v0.3 §12; spec §13, §10.8 r3; row 3D-17; D-152, D-3D17-4): ALIGN_JUNCTION KEEP_PRIMARY_PLANE on a pyramid
// roof whose east slope passes 0.05 m above the apex. Independent check (v0.2 F.3): south, north and west meet at
// (4, 4, 8); the east plane misses it by 0.05 m vertically, so the node spread exceeds topologySnapTolM.
import { describe, expect, it } from 'vitest';
import { repairRun } from './repair.golden.helpers.js';
import { maxPlaneDistance, PROFILE } from '../ops/helpers.js';
import { junctionSpread } from '../../src/brep/index.js';

const NODE = ['f-roof-s', 'f-roof-e', 'f-roof-n', 'f-roof-w'];
/** @param {any} m */
const spread = (m) => junctionSpread(NODE.map((f) => m.faces[f].supportPlane), PROFILE.numericEpsilon);
/** @param {any} pl @param {number} x @param {number} y */
const zAt = (pl, x, y) => -(pl.normal[0] * x + pl.normal[1] * y + pl.d) / pl.normal[2];

describe('GT-19 ALIGN_JUNCTION', () => {
  const { expected, input, outs } = repairRun('GT-19');
  const a = expected.assert;
  const { commit } = outs[0];

  it('input: 4 planes, east 0.05 m above the apex', () => {
    expect(NODE).toHaveLength(a.planes);
    for (const f of ['f-roof-s', 'f-roof-n', 'f-roof-w']) expect(zAt(input.faces[f].supportPlane, 4, 4)).toBeCloseTo(8, 9);
    expect(zAt(input.faces['f-roof-e'].supportPlane, 4, 4) - 8).toBeCloseTo(a.divergenceM, 9);
    expect(spread(input)).toBeGreaterThan(PROFILE.topologySnapTolM);
  });

  it('expected: node within topologySnapTolM, primary plane unchanged', () => {
    expect(commit.result.status).toBe('COMMITTED');
    expect(a.nodeWithin).toBe('topologySnapTolM');
    expect(spread(commit.model)).toBeLessThanOrEqual(PROFILE.topologySnapTolM);
    expect(a.primaryPlaneUnchanged).toBe(true);
    expect(commit.model.faces['f-roof-s'].supportPlane).toEqual(input.faces['f-roof-s'].supportPlane);
    expect(commit.model.vertices['v-a'].p.map((/** @type {number} */ x) => +x.toFixed(9))).toEqual([4, 4, 8]);
    expect(maxPlaneDistance(commit.model)).toBeLessThanOrEqual(PROFILE.planarTolM);
  });

  it('majority rule (D-3D17-4): only the diverging east slope moves', () => {
    for (const f of ['f-roof-n', 'f-roof-w']) expect(commit.model.faces[f].supportPlane).toEqual(input.faces[f].supportPlane);
    expect(commit.result.topologyLineage.preserved).toContain('f-roof-e');
  });

  it.todo('fixed variant: refusal listing the conflicting faces - its ON_PLANE [face] + plane target is not compiled by solve (D-169); owner question 3D-17');
});
