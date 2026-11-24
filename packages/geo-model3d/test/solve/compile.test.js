// 3D-13 compiler: model Constraint -> plane-terms conditions per D-169, tolerances per D-170; constraints the
// table cannot read are rejected with a reason, never guessed.
import { describe, expect, it } from 'vitest';
import { TOL, compiled, gt03 } from './helpers.js';

const model = gt03();
/** @param {any} c */
const one = (c) => compiled(model, [{ id: 'c1', hard: true, ...c }]);

describe('compileConstraints (D-169, D-170)', () => {
  it.each([
    [{ kind: 'FIXED_POINT', entityIds: ['v-r0'] }, 3, TOL.planarTolM],
    [{ kind: 'ON_PLANE', entityIds: ['v-r0', 'f-roof-s'] }, 1, TOL.planarTolM],
    [{ kind: 'ON_PLANE', entityIds: ['v-r0', 'f-roof-s'], target: [0, 4, 8] }, 1, TOL.planarTolM],
    [{ kind: 'FIXED_LINE', entityIds: ['he-f-roof-s-2'] }, 4, TOL.planarTolM],
    [{ kind: 'FIXED_EAVE', entityIds: ['he-f-roof-s-0'] }, 4, TOL.planarTolM],
    [{ kind: 'FIXED_RIDGE', entityIds: ['he-f-roof-s-2'] }, 4, TOL.planarTolM],
    [{ kind: 'EQUAL_Z', entityIds: ['v-r0', 'v-r1', 'v-e0'] }, 2, TOL.zAlignTolM],
    [{ kind: 'EQUAL_Z', entityIds: ['v-r0'], target: 8 }, 1, TOL.zAlignTolM],
    [{ kind: 'COINCIDENT', entityIds: ['v-r0', 'v-r1'] }, 1, TOL.topologySnapTolM],
    [{ kind: 'PLANAR_FACE', entityIds: ['f-roof-s'] }, 4, TOL.planarTolM],
    [{ kind: 'SHARED_EDGE', entityIds: ['he-f-roof-s-2'] }, 4, TOL.planarTolM],
    [{ kind: 'HORIZONTAL', entityIds: ['f-ground'] }, 1, TOL.numericEpsilon],
    [{ kind: 'VERTICAL', entityIds: ['he-f-wall-s-1'] }, 1, TOL.numericEpsilon],
    [{ kind: 'PARALLEL', entityIds: ['f-wall-s', 'f-wall-n'] }, 1, TOL.numericEpsilon],
    [{ kind: 'PERPENDICULAR', entityIds: ['he-f-roof-s-0', 'he-f-roof-s-1'] }, 1, TOL.numericEpsilon],
    [{ kind: 'ROOF_SLOPE', entityIds: ['f-roof-s'], target: 36.87 }, 1, TOL.numericEpsilon],
  ])('%o -> %i conditions, tolerance %d', (c, count, tol) => {
    const r = one(c);
    expect(r.rejected).toEqual([]);
    expect(r.conditions).toHaveLength(count);
    for (const x of r.conditions) {
      expect(x.tol).toBe(tol);
      expect(x.id).toBe('c1');
    }
  });

  it('every compiled hard condition holds on the unedited GT-03 where the geometry already satisfies it', () => {
    const ok = compiled(model, [
      { id: 'a', kind: 'PARALLEL', entityIds: ['f-wall-s', 'f-wall-n'], hard: true },
      { id: 'b', kind: 'HORIZONTAL', entityIds: ['he-f-roof-s-2'], hard: true },
      { id: 'c', kind: 'ROOF_SLOPE', entityIds: ['f-roof-s'], hard: true, target: (Math.acos(0.8) * 180) / Math.PI },
      { id: 'd', kind: 'EQUAL_Z', entityIds: ['v-r0', 'v-r1'], hard: true },
      { id: 'e', kind: 'VERTICAL', entityIds: ['f-wall-e'], hard: true },
    ]);
    const ctx = { plane: (/** @type {string} */ f) => model.faces[f].supportPlane, vertex: (/** @type {string} */ v) => model.vertices[v].p };
    for (const c of ok.conditions) expect(Math.hypot(...c.residual(ctx))).toBeLessThan(1e-12);
  });

  it('MINIMIZE_DISPLACEMENT sets the O1 weight of its faces', () => {
    const r = compiled(model, [{ id: 'm', kind: 'MINIMIZE_DISPLACEMENT', entityIds: ['f-roof-s'], hard: false, weight: 4 }]);
    expect(r).toEqual({ conditions: [], keepWeights: { 'f-roof-s': 4 }, rejected: [] });
  });

  it.each([
    [{ kind: 'BOUNDARY_ON_FOOTPRINT', entityIds: ['f-wall-s'] }, 'TBD'],
    [{ kind: 'CLOSE_TO_MEASUREMENT', entityIds: ['f-roof-s'], hard: false, weight: 1 }, 'TBD'],
    [{ kind: 'SYMMETRY', entityIds: ['f-roof-s', 'f-roof-n'] }, 'SOFT_KIND_MARKED_HARD'],
    [{ kind: 'PARALLEL', entityIds: ['f-roof-s', 'f-roof-n'], hard: false }, 'SOFT_WITHOUT_WEIGHT'],
    [{ kind: 'FIXED_EAVE', entityIds: ['he-f-roof-s-2'] }, 'ENTITIES_DO_NOT_MATCH_KIND'],
    [{ kind: 'FIXED_RIDGE', entityIds: ['he-f-roof-s-0'] }, 'ENTITIES_DO_NOT_MATCH_KIND'],
    [{ kind: 'PARALLEL', entityIds: ['f-roof-s', 'he-f-roof-s-0'] }, 'ENTITIES_DO_NOT_MATCH_KIND'],
    [{ kind: 'ROOF_SLOPE', entityIds: ['f-roof-s'] }, 'ENTITIES_DO_NOT_MATCH_KIND'],
    [{ kind: 'FIXED_POINT', entityIds: ['nope'] }, 'ENTITIES_DO_NOT_MATCH_KIND'],
  ])('%o is rejected: %s', (c, reason) => {
    const r = one(c);
    expect(r.conditions).toEqual([]);
    expect(r.rejected).toEqual([{ id: 'c1', kind: c.kind, reason }]);
  });
});
