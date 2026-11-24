// 3D-13 underconstrained: spec §5 Accept 2 (fewer conditions than degrees of freedom, no soft constraint ->
// UNDERCONSTRAINED_GEOMETRY naming the free degrees; shape D-171, threshold D-172), and soft weights (r3).
import { describe, expect, it } from 'vitest';
import { solveConstraints, toSolveError } from '../../src/solve/index.js';
import { createAjv } from '../../../../contracts/model3d/test/load.mjs';
import { TOL, compiled, eaveLine, gt03, targetOn } from './helpers.js';

const validError = /** @type {import('ajv').ValidateFunction} */ (createAjv().getSchema('urn:geoiplus:schema:model3d-error:v1'));
const ALL_S = ['v-e0', 'v-e1', 'v-r0', 'v-r1'];

describe('UNDERCONSTRAINED_GEOMETRY (spec §5 Accept 2)', () => {
  it('stage 1: eave line only, every vertex targeted -> one free rotation, valid contract error', () => {
    const model = gt03();
    const r = solveConstraints({ model, movableFaceIds: ['f-roof-s'], conditions: targetOn(model, 'f-roof-s', eaveLine(5.2)), targetVertexIds: ALL_S }, TOL);
    expect(r.status).toBe('UNDERCONSTRAINED_GEOMETRY');
    expect(r.planes).toEqual({});
    expect(r.missingDegreesOfFreedom).toEqual(['f-roof-s:ROTATION']);
    const err = toSolveError(r);
    expect(validError(err), JSON.stringify(validError.errors)).toBe(true);
    expect(err.entityIds).toEqual(['f-roof-s']);
  });

  it('stage 2: a slope fixes the tilt but not the offset of an untargeted-free plane -> OFFSET named', () => {
    const model = gt03();
    const c = compiled(model, [{ id: 's', kind: 'ROOF_SLOPE', entityIds: ['f-roof-n'], hard: true, target: 40 }]);
    const r = solveConstraints({ model, movableFaceIds: ['f-roof-n'], conditions: c.conditions, targetVertexIds: ['v-e2', 'v-e3', 'v-r0', 'v-r1'] }, TOL);
    expect(r.status).toBe('UNDERCONSTRAINED_GEOMETRY');
    expect(r.missingDegreesOfFreedom).toContain('f-roof-n:OFFSET');
    expect(validError(toSolveError(r))).toBe(true);
  });

  it('the same solve with O1 keep points is fixed and holds the slope', () => {
    const model = gt03();
    const c = compiled(model, [{ id: 's', kind: 'ROOF_SLOPE', entityIds: ['f-roof-n'], hard: true, target: 40 }]);
    const r = solveConstraints({ model, movableFaceIds: ['f-roof-n'], conditions: c.conditions }, TOL);
    expect(r.status).toBe('OK');
    expect(r.planes['f-roof-n'].normal[2]).toBeCloseTo(Math.cos((40 * Math.PI) / 180), 12);
  });
});

describe('soft constraints by weight (spec §5 r3)', () => {
  it('two soft slopes on a plane free to rotate about its eave: n_z = weighted mean of the cosines', () => {
    const model = gt03();
    const c = compiled(model, [
      { id: 's30', kind: 'ROOF_SLOPE', entityIds: ['f-roof-s'], hard: false, weight: 1, target: 30 },
      { id: 's45', kind: 'ROOF_SLOPE', entityIds: ['f-roof-s'], hard: false, weight: 3, target: 45 },
    ]);
    const conditions = [...targetOn(model, 'f-roof-s', eaveLine(5)), ...c.conditions];
    const r = solveConstraints({ model, movableFaceIds: ['f-roof-s'], conditions, targetVertexIds: ALL_S }, TOL);
    expect(r.status).toBe('OK');
    const cos = (/** @type {number} */ d) => Math.cos((d * Math.PI) / 180);
    expect(r.planes['f-roof-s'].normal[2]).toBeCloseTo((1 * cos(30) + 3 * cos(45)) / 4, 9);
    const soft = r.residuals.filter((x) => !x.hard).map((x) => x.id);
    expect(soft).toEqual(['s30', 's45']);
    expect(r.solver.converged).toBe(true);
  });
});
