// OFFSET_FACE (3D-15; spec §10.6 r1; owner decisions 03, 04): parallel plane, neighbours re-intersected.
import { describe, expect, it } from 'vitest';
import { gable, exec, committed, refused, at } from './core-edits.helpers.js';

describe('OFFSET_FACE', () => {
  it('§10.6 Accept: +0.1 m on the south slope, ridge free: eaves and ridge re-derived, normal unchanged', () => {
    const g = gable();
    const m = committed(exec(g, 'OFFSET_FACE', { faceId: 'f-roof-s', offsetM: 0.1, fixedMode: 'NONE' }));
    // the plane comes from the solver's closed form for three pinned points (plane-pin.js): equal up to rounding
    m.faces['f-roof-s'].supportPlane.normal.forEach((/** @type {number} */ x, /** @type {number} */ i) => expect(x).toBeCloseTo(g.faces['f-roof-s'].supportPlane.normal[i], 12));
    expect(m.faces['f-roof-s'].supportPlane.d).toBeCloseTo(-4.1, 12);
    at(m, 'v-e0', [0, 0, 5.125]); at(m, 'v-e1', [10, 0, 5.125]);
    at(m, 'v-r0', [0, 4 - 0.125 / 1.5, 8.0625]); at(m, 'v-r1', [10, 4 - 0.125 / 1.5, 8.0625]);
    at(m, 'v-e2', [10, 8, 5]); at(m, 'v-e3', [0, 8, 5]);
    expect(m.faces['f-roof-n'].supportPlane).toEqual(g.faces['f-roof-n'].supportPlane);
  });

  it('-0.1 m: sign along the unit normal', () => {
    const m = committed(exec(gable(), 'OFFSET_FACE', { faceId: 'f-roof-s', offsetM: -0.1, fixedMode: 'NONE' }));
    at(m, 'v-e0', [0, 0, 4.875]); at(m, 'v-r0', [0, 4 + 0.125 / 1.5, 7.9375]);
  });

  for (const fixedMode of ['FIXED_RIDGE', 'FIXED_EAVE', 'FIXED_BOUNDARY']) {
    it(`${fixedMode} with a non-zero offset -> CONSTRAINT_CONFLICT naming the fixed edges (D-3D15-4)`, () => {
      const g = gable();
      const e = refused(g, exec(g, 'OFFSET_FACE', { faceId: 'f-roof-s', offsetM: 0.1, fixedMode }), 'CONSTRAINT_CONFLICT');
      const want = { FIXED_RIDGE: ['he-f-roof-s-2'], FIXED_EAVE: ['he-f-roof-s-0'], FIXED_BOUNDARY: ['he-f-roof-s-0', 'he-f-roof-s-1', 'he-f-roof-s-2', 'he-f-roof-s-3'] }[fixedMode];
      expect(e.entityIds).toEqual(['f-roof-s', ...(want ?? [])]);
    });
  }

  it('a mode the face does not have -> INVALID_PAYLOAD, no fallback to NONE (owner decision 03)', () => {
    const g = gable();
    refused(g, exec(g, 'OFFSET_FACE', { faceId: 'f-wall-s', offsetM: 0.1, fixedMode: 'FIXED_RIDGE' }), 'INVALID_PAYLOAD');
    refused(g, exec(g, 'OFFSET_FACE', { faceId: 'f-roof-s', offsetM: 0.1, fixedMode: 'KEEP' }), 'INVALID_PAYLOAD');
  });

  it('zero offset leaves geometry, topology, constraints and ids unchanged (owner decision 04)', () => {
    const g = gable();
    const out = exec(g, 'OFFSET_FACE', { faceId: 'f-roof-s', offsetM: 0, fixedMode: 'FIXED_RIDGE' });
    expect([out.result.patch.added, out.result.patch.updated, out.result.patch.deleted]).toEqual([[], [], []]);
    expect(out.model.vertices).toEqual(g.vertices);
  });

  it.todo('zero offset: version unchanged, no journal entry (owner decision 04) - needs the pipeline change asked in D-3D15-9');
});
