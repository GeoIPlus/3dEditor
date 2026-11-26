// ALIGN_JUNCTION (3D-17; spec §10.8 r3; D-3D17-4) on the GT-19 pyramid: fallback rule, REFIT_SELECTED_PLANES,
// displacement limit, payload checks, PREVIEW = COMMIT.
import { describe, expect, it } from 'vitest';
import { readFixture, deepFreeze } from '../brep/helpers.js';
import { run, command, maxPlaneDistance, PROFILE } from './helpers.js';
import { junctionSpread } from '../../src/brep/index.js';

const NODE = ['f-roof-s', 'f-roof-e', 'f-roof-n', 'f-roof-w'];
const pyramid = () => deepFreeze(readFixture('GT-19', 'input.model.json'));
const align = (/** @type {any} */ m, /** @type {any} */ p, over = {}) =>
  run(m, command(m, 'ALIGN_JUNCTION', { vertexId: 'v-a', faceIds: NODE, ...p }, over));
const spread = (/** @type {any} */ m) => junctionSpread(NODE.map((f) => m.faces[f].supportPlane), PROFILE.numericEpsilon);

describe('ALIGN_JUNCTION', () => {
  it('primary = east (the outlier): no majority with it, fallback least squares on the east plane; east unchanged', () => {
    const m = pyramid();
    const out = align(m, { mode: 'KEEP_PRIMARY_PLANE', primaryFaceId: 'f-roof-e' });
    expect(out.result.status).toBe('COMMITTED');
    expect(out.result.warnings).toContain('node v-a closed by LEAST_SQUARES');
    expect(out.model.faces['f-roof-e'].supportPlane).toEqual(m.faces['f-roof-e'].supportPlane);
    expect(spread(out.model)).toBeLessThanOrEqual(PROFILE.topologySnapTolM);
    expect(maxPlaneDistance(out.model)).toBeLessThanOrEqual(PROFILE.planarTolM);
  });

  it('REFIT_SELECTED_PLANES [east]: only east moves', () => {
    const m = pyramid();
    const out = align(m, { mode: 'REFIT_SELECTED_PLANES', movableFaceIds: ['f-roof-e'] });
    expect(out.result.status).toBe('COMMITTED');
    for (const f of ['f-roof-s', 'f-roof-n', 'f-roof-w']) expect(out.model.faces[f].supportPlane).toEqual(m.faces[f].supportPlane);
    expect(spread(out.model)).toBeLessThanOrEqual(PROFILE.topologySnapTolM);
  });

  it('REFIT_SELECTED_PLANES [north]: east is fixed, so no majority; north tilts to the point s, e, w fix', () => {
    const m = pyramid();
    const out = align(m, { mode: 'REFIT_SELECTED_PLANES', movableFaceIds: ['f-roof-n'] });
    expect(out.result.status).toBe('COMMITTED');
    expect(out.result.warnings).toContain('node v-a closed by LEAST_SQUARES');
    for (const f of ['f-roof-s', 'f-roof-e', 'f-roof-w']) expect(out.model.faces[f].supportPlane).toEqual(m.faces[f].supportPlane);
    expect(spread(out.model)).toBeLessThanOrEqual(PROFILE.topologySnapTolM);
  });

  it('maxDisplacementM smaller than the needed move -> CONSTRAINT_CONFLICT, model unchanged', () => {
    const m = pyramid();
    const out = align(m, { mode: 'KEEP_PRIMARY_PLANE', primaryFaceId: 'f-roof-e', maxDisplacementM: 0.001 });
    expect(out.result.error.code).toBe('CONSTRAINT_CONFLICT');
    expect(out.model).toBe(m);
  });

  it.each([
    [{ mode: 'KEEP_PRIMARY_PLANE', primaryFaceId: 'f-wall-s' }],
    [{ mode: 'KEEP_PRIMARY_PLANE', primaryFaceId: 'f-roof-s', faceIds: ['f-roof-s', 'f-wall-s', 'f-roof-n'] }],
    [{ mode: 'REFIT_SELECTED_PLANES', movableFaceIds: [] }],
    [{ mode: 'CANCEL' }],
  ])('INVALID_PAYLOAD: %o', (p) => {
    expect(align(pyramid(), p).result.error.code).toBe('INVALID_PAYLOAD');
  });

  it('PREVIEW then COMMIT give the same patch', () => {
    const m = pyramid();
    const p = { mode: 'KEEP_PRIMARY_PLANE', primaryFaceId: 'f-roof-s' };
    const pv = align(m, p, { phase: 'PREVIEW' });
    expect(align(m, p, { previewId: pv.result.previewId }).result.patch).toEqual(pv.result.patch);
  });
});
