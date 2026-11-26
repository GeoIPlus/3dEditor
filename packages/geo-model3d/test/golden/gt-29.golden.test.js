// GT-29 (spec §13 from §10.6, D-331; row 3D-105): EXTEND_FACE of the S1 eave, shared with the south wall ->
// INVALID_TOPOLOGY, version unchanged.
import { describe, expect, it } from 'vitest';
import { refusedCase } from './trim-extend.golden.helpers.js';

describe('GT-29 EXTEND_FACE of a shared edge', () => {
  const { model, cmd } = refusedCase('GT-29');
  it('independent check: the eave half-edge has a twin on the south wall', () => {
    const e = model.halfEdges[cmd.payload.edgeId];
    expect(model.halfEdges[e.twinId].faceId).toBe('f-wall-s');
  });
});
