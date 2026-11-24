// 3D-13 stage 1 (closed form per plane, objective O1, 3D-ADR-0005): parity with the 3D-08 spike cases
// (ADR-0005 Checks) and vertex derivation from the solved planes (spec §5 API, §4 r2).
import { describe, expect, it } from 'vitest';
import { derivePoint } from '../../src/brep/index.js';
import { solveConstraints, solvePlaneO1 } from '../../src/solve/index.js';
import { TOL, compiled, eaveLine, gap, gt03, off, targetOn } from './helpers.js';

const E = ['v-e0', 'v-e1'];

describe('stage 1 on GT-03 (spike parity)', () => {
  it('raises the south eave with the south roof movable: line on the plane, ridge kept <= 1e-9 m', () => {
    const model = gt03();
    const r = solveConstraints({ model, movableFaceIds: ['f-roof-s'], conditions: targetOn(model, 'f-roof-s', eaveLine(5.2)), targetVertexIds: E }, TOL);
    expect(r.status).toBe('OK');
    expect(r.solver.stage).toBe(1);
    const pl = r.planes['f-roof-s'];
    for (const p of eaveLine(5.2)) expect(off(pl, p)).toBeLessThan(1e-9);
    for (const v of ['v-r0', 'v-r1']) expect(off(pl, model.vertices[v].p)).toBeLessThan(1e-9);
    expect(Math.hypot(...pl.normal)).toBeCloseTo(1, 12);
  });

  it('every vertex of the moved face is the intersection of its defining planes (no vertex written)', () => {
    const model = gt03();
    const r = solveConstraints({ model, movableFaceIds: ['f-roof-s'], conditions: targetOn(model, 'f-roof-s', eaveLine(5.2)), targetVertexIds: E }, TOL);
    /** @param {string} f */
    const plane = (f) => r.planes[f] ?? model.faces[f].supportPlane;
    const want = { 'v-e0': [0, 0, 5.2], 'v-e1': [10, 0, 5.2], 'v-r0': [0, 4, 8], 'v-r1': [10, 4, 8] };
    for (const [id, p] of Object.entries(want)) {
      const d = derivePoint(model.vertices[id].definingFaceIds.map(plane), TOL.numericEpsilon);
      expect(d).not.toBeNull();
      expect(gap(/** @type {any} */ (d).p, p)).toBeLessThan(1e-9);
      expect(/** @type {any} */ (d).residual).toBeLessThan(1e-9);
    }
  });

  it('skewed target line against FIXED_POINT ridge vertices -> conflict naming the face and both vertices', () => {
    const model = gt03();
    const fixed = compiled(model, [
      { id: 'fp-r0', kind: 'FIXED_POINT', entityIds: ['v-r0'], hard: true },
      { id: 'fp-r1', kind: 'FIXED_POINT', entityIds: ['v-r1'], hard: true },
    ]).conditions;
    const r = solveConstraints({ model, movableFaceIds: ['f-roof-s'], conditions: [...targetOn(model, 'f-roof-s', eaveLine(5.2, 5.6)), ...fixed], targetVertexIds: E }, TOL);
    expect(r.status).toBe('CONSTRAINT_CONFLICT');
    expect(r.planes).toEqual({});
    expect(r.entityIds).toEqual(expect.arrayContaining(['f-roof-s', 'v-r0', 'v-r1']));
  });

  it('kept points all on the target line -> UNDERCONSTRAINED (one rotation about the line)', () => {
    const model = gt03();
    const r = solveConstraints({ model, movableFaceIds: ['f-roof-s'], conditions: targetOn(model, 'f-roof-s', eaveLine(5)), targetVertexIds: ['v-r0', 'v-r1'] }, TOL);
    expect(r.status).toBe('UNDERCONSTRAINED_GEOMETRY');
    expect(r.missingDegreesOfFreedom).toEqual(['f-roof-s:ROTATION']);
  });

  it('a movable plane no condition reads stays bit-identical', () => {
    const model = gt03();
    const r = solveConstraints({ model, movableFaceIds: ['f-roof-s', 'f-roof-n'], conditions: targetOn(model, 'f-roof-s', eaveLine(5.2)), targetVertexIds: E }, TOL);
    expect(r.planes['f-roof-n']).toEqual(model.faces['f-roof-n'].supportPlane);
  });
});

describe('solvePlaneO1 free degrees (D-171)', () => {
  const old = { normal: /** @type {[number, number, number]} */ ([0, 0, 1]), d: 0 };
  it('one hard point, no keep points -> two rotations', () => {
    const r = solvePlaneO1({ hard: [[0, 0, 0]], keep: [], oldPlane: old, eps: 1e-9 });
    expect(r).toEqual({ status: 'UNDERCONSTRAINED', free: ['ROTATION', 'ROTATION'] });
  });
  it('three non-collinear hard points fix the plane without an objective', () => {
    const r = solvePlaneO1({ hard: [[0, 0, 0], [1, 0, 0], [0, 1, 0]], keep: [], oldPlane: old, eps: 1e-9 });
    expect(r.status).toBe('OK');
  });
  it('no hard condition: the plane does not move', () => {
    const r = solvePlaneO1({ hard: [], keep: [[0, 0, 1]], oldPlane: old, eps: 1e-9 });
    expect(r).toEqual({ status: 'OK', plane: old, cost: 0 });
  });
});
