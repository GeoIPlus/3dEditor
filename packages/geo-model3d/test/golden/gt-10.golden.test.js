// GT-10 (v0.3 §12; spec §13; row 3D-15): MOVE_VERTEX of a vertex with a hard FIXED_POINT -> CONSTRAINT_CONFLICT,
// version unchanged (spec §10.4 r3). Both PREVIEW and COMMIT are refused; nothing is returned but the input model.
import { describe, expect, it } from 'vitest';
import { readFixture, deepFreeze } from '../brep/helpers.js';
import { run, PROFILE } from '../ops/helpers.js';

describe('GT-10 MOVE_VERTEX with FIXED_POINT', () => {
  const model = deepFreeze(readFixture('GT-10', 'input.model.json'));
  const steps = readFixture('GT-10', 'steps.json');
  const expected = readFixture('GT-10', 'expected.json');
  const cmd = steps[0].command;

  it('fixture belongs to 3D-15; the target differs from the fixed point (independent check)', () => {
    expect(expected.owner.row).toBe('3D-15');
    const c = Object.values(model.constraints).find((/** @type {any} */ x) => x.kind === 'FIXED_POINT' && x.entityIds[0] === cmd.payload.vertexId);
    expect(c.hard).toBe(true);
    expect(model.vertices[cmd.payload.vertexId].p).toEqual(c.target);
    const d = Math.hypot(...c.target.map((/** @type {number} */ x, /** @type {number} */ i) => x - cmd.payload.targetPoint[i]));
    expect(d).toBeGreaterThan(PROFILE.planarTolM);
  });

  for (const phase of ['PREVIEW', 'COMMIT']) {
    it(`${phase}: ${expected.assert.refusal}, version unchanged`, () => {
      const out = run(model, { ...cmd, phase });
      expect(out.result.status).toBe('REJECTED');
      expect(out.result.error.code).toBe(expected.assert.refusal);
      expect(out.result.error.entityIds).toContain(cmd.payload.vertexId);
      expect(expected.assert.versionUnchanged).toBe(true);
      expect(out.result.modelVersion).toBe(model.version);
      expect(out.model).toBe(model);
      expect(out.journal).toBeUndefined();
    });
  }
});
