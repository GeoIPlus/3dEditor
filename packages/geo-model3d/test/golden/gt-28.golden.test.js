// GT-28 (spec §13 from §10.6, D-331; row 3D-105): EXTEND_FACE of the S1 top edge (short of the ridge) to S2.
import { describe, expect, it } from 'vitest';
import { committedCase } from './trim-extend.golden.helpers.js';

describe('GT-28 EXTEND_FACE', () => {
  const { commit, cmd, expected } = committedCase('GT-28');
  it('ends re-derived on the ridge; edge id kept, ends welded into the unmoved ridge vertices (D-3D105-3)', () => {
    const e = commit.model.halfEdges[cmd.payload.edgeId];
    expect(e.faceId).toBe(cmd.payload.faceId);
    const ends = [e.startVertexId, commit.model.halfEdges[e.nextId].startVertexId].map((v) => commit.model.vertices[v].p);
    const want = [...expected.assert.ends].sort((/** @type {number[]} */ p, /** @type {number[]} */ q) => p[0] - q[0]);
    const got = [...ends].sort((p, q) => p[0] - q[0]);
    for (let i = 0; i < 2; i++) for (let k = 0; k < 3; k++) expect(Math.abs(got[i][k] - want[i][k])).toBeLessThan(1e-9);
  });
});
