// SPLIT_FACE (3D-15; spec §10.6 r2; owner decisions 02, D-3D15-2/3/6): ids, constraint inheritance, refusals.
import { describe, expect, it } from 'vitest';
import { gable, exec, committed, refused, metrics, withConstraints } from './core-edits.helpers.js';

const split = (/** @type {any} */ m, /** @type {any} */ line) => exec(m, 'SPLIT_FACE', { faceId: 'f-roof-s', splitLine: line });
const X5 = [[5, 0, 5], [5, 4, 8]];

describe('SPLIT_FACE', () => {
  it('old vertices and half-edges keep their ids; two new vertices, crossed edges split on both sides', () => {
    const g = gable();
    const out = split(g, X5);
    const m = committed(out);
    for (const v of Object.keys(g.vertices)) expect(m.vertices[v].p).toEqual(g.vertices[v].p);
    for (const h of Object.keys(g.halfEdges)) expect(m.halfEdges[h]).toBeDefined();
    expect(Object.keys(m.vertices).length - Object.keys(g.vertices).length).toBe(2);
    const mapped = out.result.topologyLineage.mapped;
    expect(Object.keys(mapped).sort()).toEqual(['f-roof-s', 'he-f-roof-n-2', 'he-f-roof-s-0', 'he-f-roof-s-2', 'he-f-wall-s-2']);
    // the part holding the start of the first outer half-edge (v-e0 -> v-e1) keeps the id
    expect(m.halfEdges['he-f-roof-s-0'].faceId).toBe('f-roof-s');
    expect(m.vertices['v-e0'].definingFaceIds).toContain('f-roof-s');
    expect(m.vertices['v-e1'].definingFaceIds).not.toContain('f-roof-s');
    expect(m.shells['sh-1'].faceIds).toContain(mapped['f-roof-s'][1]);
    expect(m.roofComponents['rc-1'].faceIds).toContain(mapped['f-roof-s'][1]);
  });

  it('the order of the two line points does not change the result (canonical id rule)', () => {
    const g = gable();
    expect(split(g, [X5[1], X5[0]]).result.patch).toEqual(split(g, X5).result.patch);
  });

  it('cut through two existing vertices (diagonal): two triangles, volume 520 m3', () => {
    const m = committed(split(gable(), [[0, 0, 5], [10, 4, 8]]));
    expect(Math.abs(metrics(m).volumeM3 - 520)).toBeLessThan(1e-9);
  });

  it('constraints: plane kinds copied to the new part, edge kinds to the new fragment, vertex kinds kept (policy table)', () => {
    const g = withConstraints(
      { id: 'c-slope', kind: 'ROOF_SLOPE', entityIds: ['f-roof-s'], hard: true, target: 36.86989764584402 },
      { id: 'c-eave', kind: 'FIXED_EAVE', entityIds: ['he-f-roof-s-0'], hard: true },
      { id: 'c-pt', kind: 'FIXED_POINT', entityIds: ['v-e0'], hard: true, target: [0, 0, 5] },
    );
    const m = committed(split(g, X5));
    const copies = Object.values(m.constraints).filter((/** @type {any} */ c) => !(c.id in g.constraints));
    expect(copies.map((/** @type {any} */ c) => [c.kind, c.entityIds[0]]).sort()).toEqual([['FIXED_EAVE', 'he-1'], ['ROOF_SLOPE', 'f-1']]);
    expect(m.constraints['c-pt']).toEqual(g.constraints['c-pt']);
  });

  it('a hard constraint whose meaning a split cannot keep (TBD kind) -> CONSTRAINT_CONFLICT', () => {
    const g = withConstraints({ id: 'c-fp', kind: 'BOUNDARY_ON_FOOTPRINT', entityIds: ['f-roof-s'], hard: true });
    expect(refused(g, split(g, X5), 'CONSTRAINT_CONFLICT').entityIds).toEqual(['c-fp']);
  });

  it('refusals (D-76, D-3D15-6): outside, tangent, along an edge, zero length, unknown face', () => {
    const g = gable();
    refused(g, split(g, [[20, 0, 5], [20, 4, 8]]), 'INVALID_GEOMETRY');
    refused(g, split(g, [[0, 0, 5], [10, 0, 5]]), 'INVALID_GEOMETRY');
    refused(g, split(g, [[0, 0, 5], [0, 4, 8]]), 'INVALID_GEOMETRY');
    refused(g, split(g, [[5, 0, 5], [5, 0, 5]]), 'INVALID_GEOMETRY');
    refused(g, exec(g, 'SPLIT_FACE', { faceId: 'f-x', splitLine: X5 }), 'INVALID_PAYLOAD');
  });
});
