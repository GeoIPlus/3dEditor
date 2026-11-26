// GT-26 (spec §13 from §10.6, D-331; row 3D-105): TRIM_FACE of an S1 flap overshooting the ridge, cut by S2.
import { describe, expect, it } from 'vitest';
import { committedCase } from './trim-extend.golden.helpers.js';

describe('GT-26 TRIM_FACE', () => {
  const { model, commit } = committedCase('GT-26');
  it('flap vertices deleted; ridge and rakes paired', () => {
    const gone = Object.keys(model.vertices).filter((v) => !commit.model.vertices[v]);
    expect(gone.sort()).toEqual(['v-t0', 'v-t1']);
    const ridge = Object.values(commit.model.halfEdges).filter((/** @type {any} */ h) => h.edgeRole === 'RIDGE');
    expect(ridge.map((/** @type {any} */ h) => h.faceId).sort()).toEqual(['f-roof-n', 'f-roof-s']);
  });
});
