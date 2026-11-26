// FIT_TO_SHARED_EDGE (3D-17; spec §10.5 Accept 2-3, r4-r5; D-76) on the GT-06 input (GT-I2 import): gap over the
// limit, pairing, fixed B, payload checks, PREVIEW = COMMIT, refusals leave the model untouched.
import { describe, expect, it } from 'vitest';
import { readFixture, deepFreeze } from '../brep/helpers.js';
import { run, command, maxPlaneDistance, PROFILE } from './helpers.js';

const base = () => deepFreeze(readFixture('GT-06', 'input.model.json'));
const P = { edgeIds: ['he-f-roof-s-2', 'he-f-roof-n-2'], leadingFaceId: 'f-roof-s', maxDisplacementM: 0.05, movableFaceIds: ['f-roof-n'] };
const fit = (/** @type {any} */ m, /** @type {any} */ p, over = {}) => run(m, command(m, 'FIT_TO_SHARED_EDGE', { ...P, ...p }, { targetState: 'VALID_SOLID', ...over }));

describe('FIT_TO_SHARED_EDGE', () => {
  it('a gap larger than maxDisplacementM is refused CONSTRAINT_CONFLICT with the vertex ids, model unchanged', () => {
    const m = base();
    const out = fit(m, { maxDisplacementM: 0.02 });
    expect(out.result.status).toBe('REJECTED');
    expect(out.result.error.code).toBe('CONSTRAINT_CONFLICT');
    // minimal conflict set (spec §5 r2): at least one welded vertex with its B copy
    const ids = out.result.error.entityIds;
    expect((ids.includes('v-r0') && ids.includes('v-r2')) || (ids.includes('v-r1') && ids.includes('v-r3'))).toBe(true);
    expect(out.model).toBe(m);
    expect(out.result.modelVersion).toBe(m.version);
  });

  it('B fixed: the weld is derived from A, B and the gable wall; within the limit it commits', () => {
    const out = fit(base(), { movableFaceIds: [] });
    expect(out.result.status).toBe('COMMITTED');
    const p = out.model.vertices['v-r0'].p;
    const b = out.model.faces['f-roof-n'].supportPlane;
    // on the unchanged B plane and on the leading plane (here A ∩ B happens to lie 0.06 mm from the copies' mean;
    // the case where they differ is GT-06, spec §10.5 Accept 3)
    const a = out.model.faces['f-roof-s'].supportPlane;
    for (const pl of [a, b]) expect(Math.abs(pl.normal[1] * p[1] + pl.normal[2] * p[2] + pl.d)).toBeLessThan(1e-9);
    expect(maxPlaneDistance(out.model)).toBeLessThanOrEqual(PROFILE.planarTolM);
  });

  it('no unique pairing (both edges run the same way) -> INVALID_TOPOLOGY with the edge ids', () => {
    const m = structuredClone(readFixture('GT-06', 'input.model.json'));
    // reverse the roles: weld the north ridge edge with the south eave edge, whose ends pair with one ridge end only
    const out = fit(deepFreeze(m), { edgeIds: ['he-f-wall-e-3', 'he-f-roof-n-2'], leadingFaceId: 'f-roof-n', movableFaceIds: [] });
    expect(out.result.status).toBe('REJECTED');
    expect(out.result.error.code).toBe('INVALID_TOPOLOGY');
    expect(out.result.error.entityIds).toEqual(expect.arrayContaining(['he-f-wall-e-3', 'he-f-roof-n-2']));
  });

  it.each([
    [{ maxDisplacementM: undefined }, 'no maximum displacement (D-76)'],
    [{ movableFaceIds: ['f-roof-s'] }, 'leading plane movable'],
    [{ leadingFaceId: 'f-wall-n' }, 'leading face not on an edge'],
    [{ edgeIds: ['he-f-roof-s-2', 'he-f-roof-s-1'] }, 'edge with a twin'],
  ])('INVALID_PAYLOAD: %o (%s)', (/** @type {any} */ p, /** @type {string} */ _why) => {
    const m = base();
    const out = fit(m, p);
    expect(out.result.error.code).toBe('INVALID_PAYLOAD');
    expect(out.model).toBe(m);
  });

  it('PREVIEW then COMMIT give the same patch; lineage covers the deleted copies and collapsed edges', () => {
    const m = base();
    const pv = fit(m, {}, { phase: 'PREVIEW' });
    const c = fit(m, {}, { previewId: pv.result.previewId });
    expect(c.result.patch).toEqual(pv.result.patch);
    const lin = c.result.topologyLineage;
    const touched = new Set([...Object.keys(lin.mapped), ...lin.deleted, ...lin.preserved]);
    for (const ch of [...c.result.patch.updated, ...c.result.patch.deleted]) {
      const id = ch.entity?.id ?? ch.id;
      if (['Face', 'HalfEdge', 'Vtx'].includes(ch.type)) expect(touched.has(id), id).toBe(true);
    }
  });
});
