// REMOVE_FACE and HEAL_HOLE (3D-17; spec §10.8 r1-r2; D-76, D-3D17-1..3) on the GT-03 gable (fixture GT-11 input).
import { describe, expect, it } from 'vitest';
import { readFixture, deepFreeze } from '../brep/helpers.js';
import { run, command, metrics, maxPlaneDistance, PROFILE } from './helpers.js';

const gable = () => deepFreeze(readFixture('GT-11', 'input.model.json'));
const HOLE = ['he-f-wall-n-2', 'he-f-wall-w-3', 'he-f-roof-s-2', 'he-f-wall-e-2'];
/** North slope removed (DRAFT_SOLID). */
const holed = () => deepFreeze(run(gable(), command(gable(), 'REMOVE_FACE', { faceId: 'f-roof-n' }, { targetState: 'DRAFT_SOLID' })).model);
const heal = (/** @type {any} */ m, /** @type {any} */ p, over = {}) => run(m, command(m, 'HEAL_HOLE', { boundaryEdgeIds: HOLE, ...p }, over));

describe('REMOVE_FACE', () => {
  it('deletes face and half-edges, opens the twins, lineage lists them, vertices of two planes become EXPLICIT', () => {
    const out = run(gable(), command(gable(), 'REMOVE_FACE', { faceId: 'f-roof-n' }, { targetState: 'DRAFT_SOLID' }));
    const m = out.model;
    expect(m.state).toBe('DRAFT_SOLID');
    for (const id of HOLE) expect(m.halfEdges[id].twinId).toBeNull();
    expect(out.result.topologyLineage.deleted).toEqual(expect.arrayContaining(['f-roof-n', 'he-f-roof-n-0', 'he-f-roof-n-3']));
    expect(m.roofComponents['rc-1'].faceIds).toEqual(['f-roof-s']);
    expect(m.shells['sh-1'].faceIds).not.toContain('f-roof-n');
    expect(m.vertices['v-e2']).toMatchObject({ positionMode: 'EXPLICIT', definingFaceIds: ['f-wall-e', 'f-wall-n'] });
    expect(m.vertices['v-r0'].definingFaceIds).toEqual(['f-wall-w', 'f-roof-s']);
  });

  it('with targetState VALID_SOLID the commit gate refuses (open shell is a new error), model unchanged', () => {
    const m = gable();
    const out = run(m, command(m, 'REMOVE_FACE', { faceId: 'f-roof-n' }));
    expect(out.result.status).toBe('REJECTED');
    expect(out.result.error.code).toBe('INVALID_GEOMETRY');
    expect(out.model).toBe(m);
  });

  it('a hard constraint on the removed face refuses CONSTRAINT_CONFLICT (D-213 pattern)', () => {
    const m = structuredClone(readFixture('GT-11', 'input.model.json'));
    m.constraints['c-1'] = { id: 'c-1', kind: 'PLANAR_FACE', entityIds: ['f-roof-n'], hard: true };
    const out = run(deepFreeze(m), command(m, 'REMOVE_FACE', { faceId: 'f-roof-n' }, { targetState: 'DRAFT_SOLID' }));
    expect(out.result.error).toMatchObject({ code: 'CONSTRAINT_CONFLICT', entityIds: ['c-1'] });
  });

  it('unknown face -> INVALID_PAYLOAD', () => {
    const out = run(gable(), command(gable(), 'REMOVE_FACE', { faceId: 'f-x' }, { targetState: 'DRAFT_SOLID' }));
    expect(out.result.error.code).toBe('INVALID_PAYLOAD');
  });
});

describe('HEAL_HOLE', () => {
  it('FILL_PLANAR closes the hole: VALID_SOLID, volume 520 m3, kind inferred and tagged (D-3D17-3)', () => {
    const out = heal(holed(), { mode: 'FILL_PLANAR' });
    expect(out.result.status).toBe('COMMITTED');
    expect(out.model.state).toBe('VALID_SOLID');
    expect(Math.abs(metrics(out.model).volumeM3 - 520)).toBeLessThanOrEqual(0.01);
    const f = /** @type {any} */ (Object.values(out.model.faces).find((x) => !(x.id in gable().faces)));
    expect(f).toMatchObject({ surfaceKind: 'RoofSurface', tags: ['SEMANTICS_INFERRED'], roofComponentId: 'rc-1' });
    expect(f.supportPlane.normal[1]).toBeGreaterThan(0); // outward, north
    expect(maxPlaneDistance(out.model)).toBeLessThanOrEqual(PROFILE.planarTolM);
  });

  it('maxDisplacementM given: the south copy closes when 6 m moves are allowed (operator explicit)', () => {
    const out = heal(holed(), { mode: 'COPY_NEIGHBOR_PLANE', neighborFaceId: 'f-roof-s', maxDisplacementM: 7 }, { targetState: 'DRAFT_SOLID' });
    expect(out.result.status).toBe('COMMITTED');
    expect(out.model.vertices['v-e3'].p[2]).toBeCloseTo(11, 9);
  });

  it('FIT_MEASUREMENTS from three POINT measurements on the old north plane', () => {
    const m = structuredClone(holed());
    const pts = [[1, 7, 5.75], [9, 7, 5.75], [5, 5, 7.25]];
    pts.forEach((p, i) => { m.measurements[`m-${i}`] = { id: `m-${i}`, geometry: { kind: 'POINT', coordinates: [p] }, sourceType: 'MANUAL', sourceId: null, horizontalCrs: 'EPSG:25832', verticalCrs: null, frame: 'LOCAL', status: 'MEASURED', createdBy: 'usr-t' }; });
    const out = heal(deepFreeze(m), { mode: 'FIT_MEASUREMENTS', measurementIds: ['m-0', 'm-1', 'm-2'] }, { targetState: 'DRAFT_SOLID' });
    expect(out.result.status).toBe('COMMITTED');
    expect(out.model.vertices['v-e3'].p.map((x) => +x.toFixed(9))).toEqual([0, 8, 5]);
  });

  it('a refusal lists FIT_MEASUREMENTS when the model holds three POINT measurements ([A], D-3D17-2)', () => {
    const m = structuredClone(holed());
    [[1, 7, 9], [9, 7, 9], [5, 5, 9]].forEach((p, i) => { m.measurements[`m-${i}`] = { id: `m-${i}`, geometry: { kind: 'POINT', coordinates: [p] }, sourceType: 'MANUAL', sourceId: null, horizontalCrs: 'EPSG:25832', verticalCrs: null, frame: 'LOCAL', status: 'MEASURED', createdBy: 'usr-t' }; });
    const out = heal(deepFreeze(m), { mode: 'FIT_MEASUREMENTS', measurementIds: ['m-0', 'm-1', 'm-2'] });
    expect(out.result.error).toMatchObject({ code: 'INVALID_GEOMETRY', details: { admissibleModes: ['FIT_MEASUREMENTS', 'FILL_PLANAR'] } });
  });

  it('a non-neighbour face for COPY_NEIGHBOR_PLANE -> INVALID_PAYLOAD; open chain -> INVALID_TOPOLOGY', () => {
    expect(heal(holed(), { mode: 'COPY_NEIGHBOR_PLANE', neighborFaceId: 'f-ground' }).result.error.code).toBe('INVALID_PAYLOAD');
    expect(heal(holed(), { mode: 'FILL_PLANAR', boundaryEdgeIds: HOLE.slice(0, 3) }).result.error.code).toBe('INVALID_TOPOLOGY');
  });

  it('a refusal leaves the model untouched and lists the admissible modes (D-76)', () => {
    const m = holed();
    const out = heal(m, { mode: 'COPY_NEIGHBOR_PLANE', neighborFaceId: 'f-wall-n' });
    expect(out.result.error).toMatchObject({ code: 'INVALID_GEOMETRY', details: { admissibleModes: ['FILL_PLANAR'] } });
    expect(out.model).toBe(m);
  });
});
