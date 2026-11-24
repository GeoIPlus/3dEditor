// 3D-13 conflicts: spec §5 Accept 1 (two contradictory hard constraints -> feasible = false, both ids, no plane changed),
// minimal sets by the deletion filter (3D-ADR-0005 A1), checks on fixed planes (§10.4 r4), the post-check of r4 and
// FIXED_POINT never changing (r6).
import { describe, expect, it } from 'vitest';
import { derivePoint } from '../../src/brep/index.js';
import { deletionFilter, solveConstraints, toSolveError } from '../../src/solve/index.js';
import { createAjv } from '../../../../contracts/model3d/test/load.mjs';
import { TOL, compiled, eaveLine, gap, gt03, targetOn } from './helpers.js';

const validError = /** @type {import('ajv').ValidateFunction} */ (createAjv().getSchema('urn:geoiplus:schema:model3d-error:v1'));

describe('contradictory hard constraints (spec §5 Accept 1)', () => {
  it('two ROOF_SLOPE values on one face -> both ids, feasible false, no planes, frozen model untouched', () => {
    const model = gt03();
    const c = compiled(model, [
      { id: 'slope-30', kind: 'ROOF_SLOPE', entityIds: ['f-roof-s'], hard: true, target: 30 },
      { id: 'slope-40', kind: 'ROOF_SLOPE', entityIds: ['f-roof-s'], hard: true, target: 40 },
    ]);
    const r = solveConstraints({ model, movableFaceIds: ['f-roof-s'], conditions: c.conditions }, TOL);
    expect(r.feasible).toBe(false);
    expect(r.status).toBe('CONSTRAINT_CONFLICT');
    expect(r.conflictIds).toEqual(['slope-30', 'slope-40']);
    expect(r.planes).toEqual({});
    const err = toSolveError(r);
    expect(validError(err), JSON.stringify(validError.errors)).toBe(true);
    expect(err.entityIds).toEqual(expect.arrayContaining(['slope-30', 'slope-40', 'f-roof-s']));
  });

  it('PARALLEL and PERPENDICULAR on the same two roof faces -> exactly both ids', () => {
    const model = gt03();
    const c = compiled(model, [
      { id: 'par', kind: 'PARALLEL', entityIds: ['f-roof-s', 'f-roof-n'], hard: true },
      { id: 'perp', kind: 'PERPENDICULAR', entityIds: ['f-roof-s', 'f-roof-n'], hard: true },
    ]);
    const r = solveConstraints({ model, movableFaceIds: ['f-roof-s', 'f-roof-n'], conditions: c.conditions }, TOL);
    expect(r.status).toBe('CONSTRAINT_CONFLICT');
    expect(r.conflictIds).toEqual(['par', 'perp']);
  });

  it('three constraints, two in conflict -> the deletion filter returns exactly those two', () => {
    const model = gt03();
    const c = compiled(model, [
      { id: 'a-eqz', kind: 'EQUAL_Z', entityIds: ['v-r0', 'v-r1'], hard: true, target: 8.5 },
      { id: 'b-eqz', kind: 'EQUAL_Z', entityIds: ['v-r0', 'v-r1'], hard: true, target: 9 },
      { id: 'c-sym', kind: 'SYMMETRY', entityIds: ['f-roof-s', 'f-roof-n'], hard: false, weight: 1 },
      { id: 'd-fix', kind: 'FIXED_EAVE', entityIds: ['he-f-roof-s-0'], hard: true },
    ]);
    const r = solveConstraints({ model, movableFaceIds: ['f-roof-s', 'f-roof-n'], conditions: c.conditions }, TOL);
    expect(r.conflictIds).toEqual(['a-eqz', 'b-eqz']);
  });

  it('target off a fixed plane (no movable plane can absorb it) -> conflict naming the fixed face (§10.4 r4)', () => {
    const model = gt03();
    const r = solveConstraints({ model, movableFaceIds: ['f-roof-s'], conditions: targetOn(model, 'f-wall-s', [[0, 0.5, 5]], 'on-wall') }, TOL);
    expect(r.status).toBe('CONSTRAINT_CONFLICT');
    expect(r.conflictIds).toEqual(['on-wall']);
    expect(r.entityIds).toEqual(['f-wall-s']);
  });

  it('deletion filter keeps only the ids needed for the failure', () => {
    const conds = ['a', 'b', 'c', 'd'].map((id) => /** @type {any} */ ({ id, hard: true }));
    // infeasible exactly when both b and d are present
    expect(deletionFilter(conds, (ids) => !(ids.has('b') && ids.has('d')))).toEqual(['b', 'd']);
  });
});

describe('hard constraints hold after the solve', () => {
  it('FIXED_POINT on a movable face never changes (spec §5 r6): ridge vertices within 1e-9 m', () => {
    const model = gt03();
    const c = compiled(model, [
      { id: 'fp-r0', kind: 'FIXED_POINT', entityIds: ['v-r0'], hard: true },
      { id: 'fp-r1', kind: 'FIXED_POINT', entityIds: ['v-r1'], hard: true },
      { id: 'sym', kind: 'SYMMETRY', entityIds: ['f-roof-s', 'f-roof-n'], hard: false, weight: 1 },
    ]);
    const conditions = [...targetOn(model, 'f-roof-s', eaveLine(5.3)), ...c.conditions];
    const r = solveConstraints({ model, movableFaceIds: ['f-roof-s', 'f-roof-n'], conditions, targetVertexIds: ['v-e0', 'v-e1', 'v-e2', 'v-e3'] }, TOL);
    expect(r.status).toBe('OK');
    expect(r.solver.stage).toBe(2);
    /** @param {string} f */
    const plane = (f) => r.planes[f] ?? model.faces[f].supportPlane;
    for (const v of ['v-r0', 'v-r1']) {
      const d = derivePoint(model.vertices[v].definingFaceIds.map(plane), TOL.numericEpsilon);
      expect(gap(/** @type {any} */ (d).p, model.vertices[v].p)).toBeLessThan(1e-9);
    }
    // north eave targeted (not kept): its free rotation about the ridge is decided by the soft symmetry
    expect(Math.abs(plane('f-roof-s').normal[2] - plane('f-roof-n').normal[2])).toBeLessThan(1e-9);
  });

  it('every hard residual is re-checked: an unreachable demand is refused, not projected (spec §5 r4)', () => {
    const model = gt03();
    // the south roof cannot be vertical and hold a 30 degree slope; with only one plane movable the check must fail
    const c = compiled(model, [
      { id: 'v', kind: 'VERTICAL', entityIds: ['f-roof-s'], hard: true },
      { id: 's', kind: 'ROOF_SLOPE', entityIds: ['f-roof-s'], hard: true, target: 30 },
    ]);
    const r = solveConstraints({ model, movableFaceIds: ['f-roof-s'], conditions: c.conditions }, TOL);
    expect(r.status).toBe('CONSTRAINT_CONFLICT');
    expect(r.residuals.some((x) => x.hard && x.value > (x.tol ?? 0))).toBe(true);
  });
});
