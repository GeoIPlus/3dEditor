// MERGE_FACES (3D-15; spec §10.6 r4; D-3D15-7) and its interplay with SPLIT_FACE (owner decision 02).
import { describe, expect, it } from 'vitest';
import { gable, exec, committed, refused, metrics, withConstraints } from './core-edits.helpers.js';

const X5 = [[5, 0, 5], [5, 4, 8]];
const halves = (/** @type {any} */ m) => committed(exec(m, 'SPLIT_FACE', { faceId: 'f-roof-s', splitLine: X5 }));

describe('MERGE_FACES', () => {
  it('§10.6 Accept: MERGE_COPLANAR of the GT-08 halves: one face, lineage 2 -> 1, volume 520 m3, model restored', () => {
    const g = gable();
    const s = halves(g);
    const out = exec(s, 'MERGE_FACES', { faceIds: ['f-roof-s', 'f-1'], mode: 'MERGE_COPLANAR' });
    const m = committed(out);
    expect(out.result.topologyLineage.mapped['f-roof-s']).toEqual(['f-roof-s']);
    expect(out.result.topologyLineage.mapped['f-1']).toEqual(['f-roof-s']);
    expect(Math.abs(metrics(m).volumeM3 - 520)).toBeLessThan(1e-9);
    // split + merge gives back the input entities (ids, positions, loops); only the version moved on
    for (const k of ['vertices', 'faces', 'halfEdges', 'shells', 'roofComponents']) expect(m[k], k).toEqual(g[k]);
  });

  it('split, merge, split again: same ids and geometry as the first split', () => {
    const s1 = halves(gable());
    const m = committed(exec(s1, 'MERGE_FACES', { faceIds: ['f-roof-s', 'f-1'], mode: 'MERGE_COPLANAR' }));
    const s2 = halves(m);
    for (const k of ['vertices', 'faces', 'halfEdges']) expect(s2[k], k).toEqual(s1[k]);
  });

  it('constraint copies of a split are folded back into the originals (duplicates dropped)', () => {
    const g = withConstraints({ id: 'c-slope', kind: 'ROOF_SLOPE', entityIds: ['f-roof-s'], hard: true, target: 36.86989764584402 },
      { id: 'c-eave', kind: 'FIXED_EAVE', entityIds: ['he-f-roof-s-0'], hard: true });
    const s = halves(g);
    expect(Object.keys(s.constraints).length).toBe(4);
    const m = committed(exec(s, 'MERGE_FACES', { faceIds: ['f-roof-s', 'f-1'], mode: 'MERGE_COPLANAR' }));
    expect(m.constraints).toEqual(g.constraints);
  });

  it('MERGE_REFIT with the merged face movable: refit to its own vertices', () => {
    const m = committed(exec(halves(gable()), 'MERGE_FACES', { faceIds: ['f-1', 'f-roof-s'], mode: 'MERGE_REFIT', movableFaceIds: ['f-1'] }));
    expect(Object.keys(m.faces)).not.toContain('f-roof-s');
    expect(Math.abs(metrics(m).volumeM3 - 520)).toBeLessThan(1e-6);
  });

  it('a gable cannot become one plane: MERGE_REFIT of both slopes is refused, model unchanged', () => {
    const g = gable();
    const out = exec(g, 'MERGE_FACES', { faceIds: ['f-roof-s', 'f-roof-n'], mode: 'MERGE_REFIT', movableFaceIds: ['f-roof-s'] });
    expect(out.result.status).toBe('REJECTED');
    expect(out.model).toBe(g);
  });

  it('refusals (D-3D15-8): not coplanar, not adjacent, different semantics, payload', () => {
    const g = gable();
    refused(g, exec(g, 'MERGE_FACES', { faceIds: ['f-roof-s', 'f-roof-n'], mode: 'MERGE_COPLANAR' }), 'INVALID_GEOMETRY');
    refused(g, exec(g, 'MERGE_FACES', { faceIds: ['f-wall-s', 'f-wall-n'], mode: 'MERGE_REFIT', movableFaceIds: [] }), 'INVALID_TOPOLOGY');
    refused(g, exec(g, 'MERGE_FACES', { faceIds: ['f-roof-s', 'f-wall-s'], mode: 'MERGE_COPLANAR' }), 'INVALID_PAYLOAD');
    refused(g, exec(g, 'MERGE_FACES', { faceIds: ['f-roof-s', 'f-x'], mode: 'MERGE_COPLANAR' }), 'INVALID_PAYLOAD');
  });

  it('a hard PERPENDICULAR between the merged faces cannot hold -> CONSTRAINT_CONFLICT', () => {
    const s = structuredClone(halves(gable()));
    s.constraints['c-perp'] = { id: 'c-perp', kind: 'PERPENDICULAR', entityIds: ['f-roof-s', 'f-1'], hard: true };
    refused(s, exec(s, 'MERGE_FACES', { faceIds: ['f-roof-s', 'f-1'], mode: 'MERGE_COPLANAR' }), 'CONSTRAINT_CONFLICT');
  });
});
