// GT-11 (v0.3 §12; spec §13, §10.8; row 3D-17; D-76, D-3D17-1/2): REMOVE_FACE of the north slope of the GT-03 gable,
// export gate, then HEAL_HOLE COPY_NEIGHBOR_PLANE with the south slope is refused, listing the admissible modes.
// Independent check (v0.2 F.3): the south plane gives z = 11 at y = 8, not the eave z = 5.
import { describe, expect, it } from 'vitest';
import { repairRun } from './repair.golden.helpers.js';

describe('GT-11 REMOVE_FACE, HEAL_HOLE', () => {
  const { expected, input, outs } = repairRun('GT-11');
  const a = expected.assert;
  const removed = outs[0].commit;
  const heal = outs[2].commit;

  it('independent check: copying the south plane cannot close the north hole', () => {
    const pl = input.faces['f-roof-s'].supportPlane;
    expect(-(pl.normal[1] * 8 + pl.d) / pl.normal[2]).toBeCloseTo(11, 9);
  });

  it('REMOVE_FACE -> DRAFT_SOLID, four open boundary edges', () => {
    expect(removed.result.status).toBe('COMMITTED');
    expect(removed.model.state).toBe(a.state);
    expect(removed.model.faces['f-roof-n']).toBeUndefined();
    expect(Object.values(removed.model.halfEdges).filter((h) => /** @type {any} */ (h).twinId === null)).toHaveLength(4);
  });

  it('export refused: the export gate (spec §11 r9) admits only VALID_SOLID / APPROVED', () => {
    // [A] the gate itself is the service's (3D-23 / 3D-24); the kernel's part is the state it hands over
    expect(outs[1].step.step).toBe('EXPORT');
    expect(a.exportRefused && !['VALID_SOLID', 'APPROVED'].includes(outs[1].model.state)).toBe(true);
  });

  it('HEAL_HOLE COPY_NEIGHBOR_PLANE refused with the admissible modes, model unchanged', () => {
    expect(heal.result.status).toBe('REJECTED');
    expect(a.healRefused).toBe(true);
    expect(heal.result.error.code).toBe(expected.decided[0].assert.healRefusalCode);
    expect(a.listsAdmissibleModes).toBe(true);
    expect(heal.result.error.details.admissibleModes).toEqual(['FILL_PLANAR']);
    expect(heal.model).toBe(outs[2].model);
    expect(heal.result.modelVersion).toBe(removed.model.version);
  });
});
