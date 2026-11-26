// INSERT_ROOF_BREAK (3D-15; spec §10.6 r3; owner decision 01, D-297): the part holding movingSidePoint gets newPlane.
import { describe, expect, it } from 'vitest';
import { gable, exec, committed, refused, at, plane, withConstraints } from './core-edits.helpers.js';

const LINE = [[0, 2, 6.5], [10, 2, 6.5]];
const UPPER = { breakLine: LINE, newPlane: plane([0, -1.1, 1], [0, 2, 6.5]), movingSidePoint: [5, 3, 7.25] }; // z = 4.3 + 1.1 y
const LOWER = { breakLine: LINE, newPlane: plane([0, -1, 1], [0, 2, 6.5]), movingSidePoint: [5, 1, 5.75] }; // z = 4.5 + y
const brk = (/** @type {any} */ m, /** @type {any} */ p) => exec(m, 'INSERT_ROOF_BREAK', { faceId: 'f-roof-s', ...p });

describe('INSERT_ROOF_BREAK', () => {
  it('upper part moves: ridge to y = 3.6216, z = 8.2838; eave and north plane unchanged', () => {
    const g = gable();
    const out = brk(g, UPPER);
    const m = committed(out);
    const moved = out.result.topologyLineage.mapped['f-roof-s'][1];
    expect(m.faces['f-roof-s'].supportPlane).toEqual(g.faces['f-roof-s'].supportPlane);
    expect(m.faces['f-roof-n'].supportPlane).toEqual(g.faces['f-roof-n'].supportPlane);
    expect(m.halfEdges['he-f-roof-s-0'].faceId).toBe('f-roof-s');
    expect(m.halfEdges['he-f-roof-s-2'].faceId).toBe(moved);
    at(m, 'v-e0', [0, 0, 5]); at(m, 'v-e1', [10, 0, 5]);
    at(m, 'v-r0', [0, 6.7 / 1.85, 4.3 + (1.1 * 6.7) / 1.85]); at(m, 'v-r1', [10, 6.7 / 1.85, 4.3 + (1.1 * 6.7) / 1.85]);
  });

  it('lower part moves: eave to z = 4.5, ridge unchanged at y = 4, z = 8', () => {
    const m = committed(brk(gable(), LOWER));
    at(m, 'v-e0', [0, 0, 4.5]); at(m, 'v-e1', [10, 0, 4.5]);
    at(m, 'v-r0', [0, 4, 8]); at(m, 'v-r1', [10, 4, 8]);
  });

  it('reversed break line points give the same result', () => {
    const g = gable();
    expect(brk(g, { ...UPPER, breakLine: [LINE[1], LINE[0]] }).result.patch).toEqual(brk(g, UPPER).result.patch);
  });

  it('constraints: a plane constraint stays with the fixed part; a fixed eave on the moving part -> CONSTRAINT_CONFLICT', () => {
    const slope = withConstraints({ id: 'c-slope', kind: 'ROOF_SLOPE', entityIds: ['f-roof-s'], hard: true, target: 36.86989764584402 });
    committed(brk(slope, UPPER));
    const eave = withConstraints({ id: 'c-eave', kind: 'FIXED_EAVE', entityIds: ['he-f-roof-s-0'], hard: true });
    committed(brk(eave, UPPER));
    refused(eave, brk(eave, LOWER), 'CONSTRAINT_CONFLICT');
  });

  it('refusals (D-304): side point on the line or off the face, plane equal to the face, line not on the plane', () => {
    const g = gable();
    refused(g, brk(g, { ...UPPER, movingSidePoint: [5, 2, 6.5] }), 'INVALID_GEOMETRY');
    refused(g, brk(g, { ...UPPER, movingSidePoint: [5, 3, 9] }), 'INVALID_GEOMETRY');
    refused(g, brk(g, { ...UPPER, newPlane: g.faces['f-roof-s'].supportPlane }), 'INVALID_GEOMETRY');
    refused(g, brk(g, { ...UPPER, newPlane: plane([0, -1.1, 1], [0, 2, 7]) }), 'INVALID_GEOMETRY');
    refused(g, brk(g, { ...UPPER, newPlane: { normal: [0, 0, 2], d: 1 } }), 'INVALID_PAYLOAD');
  });
});
