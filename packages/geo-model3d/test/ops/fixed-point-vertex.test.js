// 3D-118 (D-3D118-2): a hard FIXED_POINT on a vertex is also checked on the derived vertex. Reproduction of the 3D-19
// session: GT-03 gable, hard FIXED_POINT on v-e0 (no target), MATCH_ELEVATIONS v-e0, v-e1 to Z 5.5 used to commit
// VALID_SOLID with f-roof-s turned to normal (0, -1, 6.6e-5).
import { describe, expect, it } from 'vitest';
import { deepFreeze } from '../brep/helpers.js';
import { PROFILE } from './helpers.js';
import { gable, exec } from './align.helpers.js';

const fixed = () => {
  const m = gable();
  m.constraints['c-fix'] = { id: 'c-fix', kind: 'FIXED_POINT', entityIds: ['v-e0'], hard: true };
  return deepFreeze(m);
};

describe('3D-118: hard FIXED_POINT against an EQUAL_Z target', () => {
  it('MATCH_ELEVATIONS v-e0, v-e1 -> 5.5 with v-e0 fixed -> CONSTRAINT_CONFLICT, model unchanged', () => {
    const m = fixed();
    const out = exec(m, 'MATCH_ELEVATIONS', { vertexIds: ['v-e0', 'v-e1'], targetZ: 5.5 });
    expect(out.result.status).toBe('REJECTED');
    expect(out.result.error.code).toBe('CONSTRAINT_CONFLICT');
    expect(out.result.error.entityIds).toContain('v-e0');
    expect(out.model).toBe(m);
  });

  it('ALIGN_EAVE with the same target still refuses', () => {
    const m = fixed();
    const out = exec(m, 'ALIGN_EAVE', { edgeId: 'he-f-roof-s-0', mode: 'KEEP_RIDGE', targetLine: [[0, 0, 5.5], [10, 0, 5.5]] });
    expect(out.result.error.code).toBe('CONSTRAINT_CONFLICT');
    expect(out.model).toBe(m);
  });

  it('a target the fixed vertex already meets still commits (v-e0 at 5, v-e3 to 5)', () => {
    const m = fixed();
    const out = exec(m, 'MATCH_ELEVATIONS', { vertexIds: ['v-e0', 'v-e3'], targetZ: 5 });
    expect(out.result.status).toBe('COMMITTED');
    expect(Math.abs(out.model.vertices['v-e0'].p[2] - 5)).toBeLessThanOrEqual(PROFILE.zAlignTolM);
  });

  it('without the FIXED_POINT the same MATCH_ELEVATIONS commits with a sloped roof', () => {
    const m = deepFreeze(gable());
    const out = exec(m, 'MATCH_ELEVATIONS', { vertexIds: ['v-e0', 'v-e1'], targetZ: 5.5 });
    expect(out.result.status).toBe('COMMITTED');
    expect(Math.abs(out.model.faces['f-roof-s'].supportPlane.normal[2])).toBeGreaterThan(0.5);
  });
});
