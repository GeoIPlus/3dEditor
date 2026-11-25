// MOVE_VERTEX / MOVE_EDGE (3D-15; spec §10.4): targets as plane constraints, movable planes only, O1 for the rest.
import { describe, expect, it } from 'vitest';
import { gable, exec, committed, refused, at, metrics } from './core-edits.helpers.js';

describe('MOVE_VERTEX', () => {
  it('§10.4 Accept: gable vertex with both roof faces movable; opposite eave vertices are re-derived, not copied', () => {
    const g = gable();
    const out = exec(g, 'MOVE_VERTEX', { vertexId: 'v-r0', targetPoint: [0, 4, 8.5], movableFaceIds: ['f-roof-s', 'f-roof-n'] });
    const m = committed(out); // checks every DERIVED vertex equals the intersection of its planes
    at(m, 'v-r0', [0, 4, 8.5]);
    for (const v of ['v-e0', 'v-e1', 'v-e2', 'v-e3', 'v-r1']) expect(m.vertices[v].positionMode).toBe('DERIVED');
    // walls stay fixed: eave vertices slide on their wall corners (x, y kept), z comes from the solved roof planes
    for (const v of ['v-e0', 'v-e3']) expect(m.vertices[v].p.slice(0, 2)).toEqual(g.vertices[v].p.slice(0, 2));
    expect(m.faces['f-wall-w'].supportPlane).toEqual(g.faces['f-wall-w'].supportPlane);
    expect(m.faces['f-roof-s'].supportPlane).not.toEqual(g.faces['f-roof-s'].supportPlane);
  });

  it('target already on every fixed plane: succeeds with no movable face (rule 4)', () => {
    const g = gable();
    const m = committed(exec(g, 'MOVE_VERTEX', { vertexId: 'v-r0', targetPoint: [0, 4, 8], movableFaceIds: [] }));
    expect(m.vertices).toEqual(g.vertices);
  });

  it('§10.4 Accept: all incident faces fixed, target off a plane -> CONSTRAINT_CONFLICT naming the planes', () => {
    const g = gable();
    const e = refused(g, exec(g, 'MOVE_VERTEX', { vertexId: 'v-r0', targetPoint: [0, 4, 8.5], movableFaceIds: [] }), 'CONSTRAINT_CONFLICT');
    expect(e.entityIds).toEqual(['f-roof-n', 'f-roof-s']);
  });

  it('a fixed incident plane the target leaves -> CONSTRAINT_CONFLICT even with others movable', () => {
    const g = gable();
    const e = refused(g, exec(g, 'MOVE_VERTEX', { vertexId: 'v-r0', targetPoint: [0.5, 4, 8], movableFaceIds: ['f-roof-s', 'f-roof-n'] }), 'CONSTRAINT_CONFLICT');
    expect(e.entityIds).toEqual(['f-wall-w']);
  });

  it('payload errors: unknown vertex, movable face not incident (D-3D15-8)', () => {
    const g = gable();
    refused(g, exec(g, 'MOVE_VERTEX', { vertexId: 'v-x', targetPoint: [0, 4, 8], movableFaceIds: [] }), 'INVALID_PAYLOAD');
    const e = refused(g, exec(g, 'MOVE_VERTEX', { vertexId: 'v-e0', targetPoint: [0, 0, 5.5], movableFaceIds: ['f-roof-n'] }), 'INVALID_PAYLOAD');
    expect(e.entityIds).toEqual(['f-roof-n']);
  });
});

describe('MOVE_EDGE', () => {
  it('ridge raised to 8.5 with both slopes movable: eaves kept by O1, volume 540 m3', () => {
    const g = gable();
    const m = committed(exec(g, 'MOVE_EDGE', { edgeId: 'he-f-roof-s-2', targetLine: [[0, 4, 8.5], [10, 4, 8.5]], movableFaceIds: ['f-roof-s', 'f-roof-n'] }));
    at(m, 'v-r0', [0, 4, 8.5]); at(m, 'v-r1', [10, 4, 8.5]);
    for (const v of ['v-e0', 'v-e1', 'v-e2', 'v-e3']) at(m, v, g.vertices[v].p);
    expect(Math.abs(metrics(m).volumeM3 - 540)).toBeLessThan(1e-6);
  });

  it('only one slope movable: the target line must lie on the fixed one too -> CONSTRAINT_CONFLICT', () => {
    const g = gable();
    refused(g, exec(g, 'MOVE_EDGE', { edgeId: 'he-f-roof-s-2', targetLine: [[0, 4, 8.5], [10, 4, 8.5]], movableFaceIds: ['f-roof-s'] }), 'CONSTRAINT_CONFLICT');
  });

  it('payload errors: unknown edge, zero-length line', () => {
    const g = gable();
    refused(g, exec(g, 'MOVE_EDGE', { edgeId: 'he-x', targetLine: [[0, 4, 8], [10, 4, 8]], movableFaceIds: [] }), 'INVALID_PAYLOAD');
    refused(g, exec(g, 'MOVE_EDGE', { edgeId: 'he-f-roof-s-2', targetLine: [[0, 4, 8], [0, 4, 8]], movableFaceIds: [] }), 'INVALID_GEOMETRY');
  });
});
