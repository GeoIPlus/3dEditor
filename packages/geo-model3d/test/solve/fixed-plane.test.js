// 3D-103: ON_PLANE [face] + Plane target = fixed face plane (D-289, amends D-169). Two hard conditions under one
// constraint id: unit normal (tol numericEpsilon) and offset (tol planarTolM), D-170.
import { describe, expect, it } from 'vitest';
import { solveConstraints } from '../../src/solve/index.js';
import { TOL, compiled, eaveLine, gt03, targetOn } from './helpers.js';

const model = gt03();
const S = model.faces['f-roof-s'].supportPlane;
/** @param {any} target @param {string[]} [entityIds] */
const fixed = (target, entityIds = ['f-roof-s']) => ({ id: 'c-fix', kind: 'ON_PLANE', entityIds, hard: true, target });
/** @param {any} pl */
const flip = (pl) => ({ normal: pl.normal.map((/** @type {number} */ x) => -x), d: -pl.d });

describe('ON_PLANE [face] + Plane target (3D-103)', () => {
  it('compiles to a normal condition (numericEpsilon) and an offset condition (planarTolM) on that face', () => {
    const r = compiled(model, [fixed(S)]);
    expect(r.rejected).toEqual([]);
    expect(r.conditions.map((c) => [c.id, c.tol, c.faces, c.entityIds])).toEqual([
      ['c-fix', TOL.numericEpsilon, ['f-roof-s'], ['f-roof-s']],
      ['c-fix', TOL.planarTolM, ['f-roof-s'], ['f-roof-s']],
    ]);
  });

  it.each([
    ['no target', undefined],
    ['point target', [0, 4, 8]],
    ['zero normal', { normal: [0, 0, 0], d: 1 }],
    ['non-finite d', { normal: [0, 0, 1], d: Number.NaN }],
  ])('%s -> ENTITIES_DO_NOT_MATCH_KIND', (_, target) => {
    expect(compiled(model, [fixed(target)]).rejected).toEqual([{ id: 'c-fix', kind: 'ON_PLANE', reason: 'ENTITIES_DO_NOT_MATCH_KIND' }]);
  });

  it('[vertex] with a Plane target is still rejected (only [face] or [vertex, face])', () => {
    expect(compiled(model, [fixed(S, ['v-r0'])]).rejected[0].reason).toBe('ENTITIES_DO_NOT_MATCH_KIND');
  });

  it.each([['as stored', S], ['opposite orientation', flip(S)], ['scaled normal', { normal: S.normal.map((/** @type {number} */ x) => 2 * x), d: 2 * S.d }]])(
    'target equal to the current plane (%s) holds: movable face stays put', (_, target) => {
      const r = solveConstraints({ model, movableFaceIds: ['f-roof-s'], conditions: compiled(model, [fixed(target)]).conditions }, TOL);
      expect(r.status).toBe('OK');
      for (const pl of /** @type {any[]} */ (Object.values(r.planes))) {
        expect(Math.hypot(...pl.normal.map((/** @type {number} */ x, /** @type {number} */ i) => x - S.normal[i]))).toBeLessThanOrEqual(TOL.numericEpsilon);
        expect(Math.abs(pl.d - S.d)).toBeLessThanOrEqual(TOL.planarTolM);
      }
    });

  it('a movable face is driven onto the target plane', () => {
    const target = { normal: S.normal, d: S.d + 0.3 };
    const r = solveConstraints({ model, movableFaceIds: ['f-roof-s'], conditions: compiled(model, [fixed(target)]).conditions }, TOL);
    expect(r.status).toBe('OK');
    expect(r.planes['f-roof-s'].d).toBeCloseTo(target.d, 6);
  });

  it('a target that moves the face against another hard target -> CONSTRAINT_CONFLICT naming both', () => {
    const conditions = [...compiled(model, [fixed(S)]).conditions, ...targetOn(model, 'f-roof-s', eaveLine(4.5), 'move-eave')];
    const r = solveConstraints({ model, movableFaceIds: ['f-roof-s'], conditions }, TOL);
    expect(r.status).toBe('CONSTRAINT_CONFLICT');
    expect(r.conflictIds).toEqual(['c-fix', 'move-eave']);
    expect(r.planes).toEqual({});
  });

  it('on a fixed face a target off its plane is a conflict without any movable plane', () => {
    const r = solveConstraints({ model, movableFaceIds: [], conditions: compiled(model, [fixed({ normal: S.normal, d: S.d + 0.1 })]).conditions }, TOL);
    expect(r.status).toBe('CONSTRAINT_CONFLICT');
    expect(r.conflictIds).toEqual(['c-fix']);
  });
});
