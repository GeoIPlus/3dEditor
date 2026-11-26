// MATCH_ELEVATIONS (3D-16; spec §10.7 r3; v0.2 F-34; D-231): EQUAL_Z within zAlignTolM, movable = non-vertical
// roof faces defining the vertices; walls, ground and hard-constrained faces fixed.
import { describe, expect, it } from 'vitest';
import { deepFreeze } from '../brep/helpers.js';
import { maxPlaneDistance, PROFILE } from './helpers.js';
import { gable, exec, changedPlanes } from './align.helpers.js';

const z = (/** @type {any} */ m, /** @type {string} */ v) => m.vertices[v].p[2];

describe('MATCH_ELEVATIONS', () => {
  it('number target: the two west eave corners to Z 4.6; only roof planes change', () => {
    const m = deepFreeze(gable());
    const out = exec(m, 'MATCH_ELEVATIONS', { vertexIds: ['v-e0', 'v-e3'], targetZ: 4.6 });
    expect(out.result.status).toBe('COMMITTED');
    for (const v of ['v-e0', 'v-e3']) expect(Math.abs(z(out.model, v) - 4.6)).toBeLessThanOrEqual(PROFILE.zAlignTolM);
    for (const f of changedPlanes(m, out.model)) expect(m.faces[f].surfaceKind).toBe('RoofSurface');
    expect(maxPlaneDistance(out.model)).toBeLessThanOrEqual(PROFILE.planarTolM);
  });

  it('MIN / MAX / MEAN of the current heights (south eave 4.5, north eave 5)', () => {
    const base = gable();
    const low = exec(base, 'ALIGN_EAVE', { edgeId: 'he-f-roof-s-0', mode: 'KEEP_RIDGE', targetLine: [[0, 0, 4.5], [10, 0, 4.5]] });
    expect(low.result.status).toBe('COMMITTED');
    const m = deepFreeze(low.model);
    for (const [targetZ, want] of /** @type {const} */ ([['MIN', 4.5], ['MAX', 5], ['MEAN', 4.75]])) {
      const out = exec(m, 'MATCH_ELEVATIONS', { vertexIds: ['v-e0', 'v-e3'], targetZ });
      expect(out.result.status).toBe('COMMITTED');
      for (const v of ['v-e0', 'v-e3']) expect(Math.abs(z(out.model, v) - want)).toBeLessThanOrEqual(PROFILE.zAlignTolM);
      expect(maxPlaneDistance(out.model)).toBeLessThanOrEqual(PROFILE.planarTolM);
    }
  });

  it('a ground vertex cannot move (no movable plane) -> CONSTRAINT_CONFLICT naming it', () => {
    const m = deepFreeze(gable());
    const out = exec(m, 'MATCH_ELEVATIONS', { vertexIds: ['v-b0', 'v-e0'], targetZ: 5 });
    expect(out.result.status).toBe('REJECTED');
    expect(out.result.error.code).toBe('CONSTRAINT_CONFLICT');
    expect(out.result.error.entityIds).toContain('v-b0');
    expect(out.model).toBe(m);
  });

  it('a hard constraint on the roof face keeps it fixed (D-231) -> CONSTRAINT_CONFLICT', () => {
    const m = gable();
    m.constraints['c-slope'] = { id: 'c-slope', kind: 'ROOF_SLOPE', entityIds: ['f-roof-s'], hard: true, target: 36.86989764584402 };
    deepFreeze(m);
    const out = exec(m, 'MATCH_ELEVATIONS', { vertexIds: ['v-e0', 'v-e1'], targetZ: 4.5 });
    expect(out.result.status).toBe('REJECTED');
    expect(out.result.error.code).toBe('CONSTRAINT_CONFLICT');
  });

  it('payload refusals: one vertex, unknown vertex, bad targetZ -> INVALID_PAYLOAD', () => {
    const m = deepFreeze(gable());
    for (const p of [{ vertexIds: ['v-e0'], targetZ: 5 }, { vertexIds: ['v-e0', 'v-x'], targetZ: 5 }, { vertexIds: ['v-e0', 'v-e1'], targetZ: 'MEDIAN' }]) {
      const out = exec(m, 'MATCH_ELEVATIONS', p);
      expect(out.result.error.code).toBe('INVALID_PAYLOAD');
      expect(out.model).toBe(m);
    }
  });
});
