// 3D-114 RESIZE_ROOF refusals (RR-10..RR-14, D-390, D-391, D-344, D-213): the model is returned unchanged.
import { describe, expect, it } from 'vitest';
import { exec, gable, hip } from './envelope.helpers.js';
import { readFixture, deepFreeze } from '../brep/helpers.js';
import { run } from './helpers.js';

/** @param {any} m @param {any} outline @param {boolean} mv @param {string} code */
const refused = (m, outline, mv, code) => {
  const out = exec(m, 'RESIZE_ROOF', { roofOutline: outline, moveWallFootprint: mv });
  expect(out.result.status).toBe('REJECTED');
  expect(out.result.error.code, JSON.stringify(out.result.error)).toBe(code);
  expect(out.model).toBe(m);
  expect(out.journal).toBeUndefined();
  return out.result.error;
};
const RECT = [[0, 0], [10, 0], [10, 8], [0, 8]];
/** GT-03 turned into a butterfly roof: eaves at 8, a valley at y = 4, z = 5. */
function butterfly() {
  const m = structuredClone(readFixture('GT-03', 'input.model.json'));
  m.faces['f-roof-s'].supportPlane = { normal: [0, 0.6, 0.8], d: -6.4 };
  m.faces['f-roof-n'].supportPlane = { normal: [0, -0.6, 0.8], d: -1.6 };
  for (const v of ['v-e0', 'v-e1', 'v-e2', 'v-e3']) m.vertices[v].p[2] = 8;
  for (const v of ['v-r0', 'v-r1']) m.vertices[v].p[2] = 5;
  return deepFreeze(m);
}
/** @param {string} gt */
const after = (gt) => {
  const m = readFixture(gt, 'input.model.json');
  return deepFreeze(run(m, readFixture(gt, 'steps.json')[0].command).model);
};

describe('RESIZE_ROOF refusals, model unchanged', () => {
  it('RR-10 false: outline beyond a gable end or a hip corner -> INVALID_TOPOLOGY (D-344)', () => {
    refused(gable(), [[-0.5, 0], [10, 0], [10, 8], [-0.5, 8]], false, 'INVALID_TOPOLOGY');
    refused(hip(), [[0, -0.5], [10, -0.5], [10, 8], [0, 8]], false, 'INVALID_TOPOLOGY');
    // not an edge-wise offset (a skewed edge) cannot close by an eave overhang either
    refused(gable(), [[0, -0.5], [10, -1], [10, 8], [0, 8]], false, 'INVALID_TOPOLOGY');
  });

  it('RR-11 non-convex, self-intersecting, too short an edge, or (false) not covering -> INVALID_GEOMETRY', () => {
    for (const mv of [true, false]) {
      refused(gable(), [[0, 0], [10, 0], [10, 4], [5, 4], [5, 8], [0, 8]], mv, 'INVALID_GEOMETRY');
      refused(gable(), [[0, 0], [10, 8], [10, 0], [0, 8]], mv, 'INVALID_GEOMETRY');
      refused(gable(), [[0, 0], [10, 0], [10, 8], [10, 8.01], [0, 8]], mv, 'INVALID_GEOMETRY');
    }
    refused(gable(), [[0, 1], [10, 1], [10, 8], [0, 8]], false, 'INVALID_GEOMETRY');
    refused(gable(), 'box', true, 'INVALID_PAYLOAD');
  });

  it('RR-12 a valley roof (not its lower envelope) -> INVALID_TOPOLOGY naming the valley faces (D-391)', () => {
    for (const mv of [true, false]) expect(refused(butterfly(), RECT, mv, 'INVALID_TOPOLOGY').entityIds).toEqual(['f-roof-n', 'f-roof-s']);
  });

  it('RR-13 a roof with a chimney or a dormer -> INVALID_TOPOLOGY naming the installation (D-391)', () => {
    for (const gt of ['GT-17', 'GT-18']) {
      const m = after(gt);
      const inst = Object.values(m.semantics).filter((s) => s.kind === 'BuildingInstallation').map((s) => s.id);
      expect(inst).toHaveLength(1);
      expect(refused(m, [[-2, 0], [12, 0], [12, 8], [-2, 8]], true, 'INVALID_TOPOLOGY').entityIds).toEqual(inst);
    }
  });

  it('RR-14 a hard FIXED_POINT on a ridge vertex that the new outline removes -> CONSTRAINT_CONFLICT (D-213)', () => {
    const m = deepFreeze(readFixture('GT-10', 'input.model.json'));
    const e = refused(m, [[-2, 0], [12, 0], [12, 8], [-2, 8]], true, 'CONSTRAINT_CONFLICT');
    expect(e.entityIds).toContain('c-fix-r0');
  });
});
