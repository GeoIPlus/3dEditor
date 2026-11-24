// GT-09 (v0.3 §12; spec §13; row 3D-16): ALIGN_RIDGE KEEP_PLANES with an arbitrary target -> CONSTRAINT_CONFLICT,
// version unchanged. The test checks independently that the target is off the intersection of the two slope planes.
import { describe, expect, it } from 'vitest';
import { goldenRun } from './align.golden.helpers.js';

describe('GT-09 ALIGN_RIDGE KEEP_PLANES, arbitrary target', () => {
  const r = goldenRun('GT-09');

  it('the target is off the intersection line of the fixed slope planes (> planarTolM)', () => {
    const dist = (/** @type {any} */ pl, /** @type {number[]} */ p) => Math.abs(pl.normal[0] * p[0] + pl.normal[1] * p[1] + pl.normal[2] * p[2] + pl.d);
    const off = r.cmd.payload.targetLine.some((/** @type {number[]} */ p) => ['f-roof-s', 'f-roof-n'].some((f) => dist(r.model.faces[f].supportPlane, p) > r.tol.planarTolM));
    expect(off).toBe(true);
  });

  it('refuses CONSTRAINT_CONFLICT in PREVIEW and COMMIT; version and model unchanged', () => {
    for (const out of [r.preview, r.commit]) {
      expect(out.result.status).toBe('REJECTED');
      expect(out.result.error.code).toBe(r.expected.assert.refusal);
      expect(out.result.modelVersion).toBe(r.model.version);
      expect(out.model).toBe(r.model);
      expect(out.result.error.entityIds).toContain(r.cmd.payload.edgeId);
    }
  });
});
