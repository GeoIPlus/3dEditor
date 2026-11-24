// ALIGN_RIDGE / ALIGN_EAVE (3D-16; spec §10.7 r1, r2, Accept 2; v0.2 C.7; D-3D16-2..4) on the GT-03 gable.
import { describe, expect, it } from 'vitest';
import { deepFreeze } from '../brep/helpers.js';
import { maxPlaneDistance, PROFILE } from './helpers.js';
import { gable, exec, changedPlanes, addPoint } from './align.helpers.js';

const RIDGE = 'he-f-roof-s-2', EAVE_S = 'he-f-roof-s-0';
const z = (/** @type {any} */ m, /** @type {string} */ v) => m.vertices[v].p[2];

/** @param {any} out @param {any} model @param {string} code */
function refused(out, model, code) {
  expect(out.result.status).toBe('REJECTED');
  expect(out.result.error.code).toBe(code);
  expect(out.result.modelVersion).toBe(model.version);
  expect(out.model).toBe(model);
  return out.result.error;
}

describe('ALIGN_RIDGE', () => {
  it('KEEP_RIDGE -> INVALID_PAYLOAD (INVALID_MODE), spec §10.7 Accept 2', () => {
    const m = deepFreeze(gable());
    const e = refused(exec(m, 'ALIGN_RIDGE', { edgeId: RIDGE, mode: 'KEEP_RIDGE', targetLine: [[0, 4, 8.5], [10, 4, 8.5]] }), m, 'INVALID_PAYLOAD');
    expect(e.message).toMatch(/^INVALID_MODE/);
  });

  it('an edge that is not a ridge, or unknown -> INVALID_PAYLOAD', () => {
    const m = deepFreeze(gable());
    refused(exec(m, 'ALIGN_RIDGE', { edgeId: EAVE_S, mode: 'KEEP_EAVES', targetLine: [[0, 4, 8.5], [10, 4, 8.5]] }), m, 'INVALID_PAYLOAD');
    expect(refused(exec(m, 'ALIGN_RIDGE', { edgeId: 'he-x', mode: 'KEEP_PLANES' }), m, 'INVALID_PAYLOAD').entityIds).toEqual(['he-x']);
  });

  it('KEEP_EAVES with an off-centre target: asymmetric slopes, eaves kept, walls unchanged', () => {
    const m = deepFreeze(gable());
    const out = exec(m, 'ALIGN_RIDGE', { edgeId: RIDGE, mode: 'KEEP_EAVES', targetLine: [[0, 5, 9], [10, 5, 9]] });
    expect(out.result.status).toBe('COMMITTED');
    expect(changedPlanes(m, out.model)).toEqual(['f-roof-n', 'f-roof-s']);
    expect(out.model.vertices['v-r0'].p.map((/** @type {number} */ c) => +c.toFixed(6))).toEqual([0, 5, 9]);
    for (const v of ['v-e0', 'v-e1', 'v-e2', 'v-e3']) expect(Math.abs(z(out.model, v) - 5)).toBeLessThanOrEqual(PROFILE.zAlignTolM);
    expect(maxPlaneDistance(out.model)).toBeLessThanOrEqual(PROFILE.planarTolM);
  });

  it('spec §10.7 r2: a target not coplanar with the locked eave -> CONSTRAINT_CONFLICT, no SVD compromise', () => {
    const m = deepFreeze(gable());
    // skew to the eave line y = 0, z = 5: no plane holds both
    const e = refused(exec(m, 'ALIGN_RIDGE', { edgeId: RIDGE, mode: 'KEEP_EAVES', targetLine: [[0, 4, 8.5], [10, 4, 9.5]] }), m, 'CONSTRAINT_CONFLICT');
    expect(e.entityIds).toContain(RIDGE);
  });

  it('KEEP_PLANES with a target on the intersection line, or none: no plane changes', () => {
    const m = deepFreeze(gable());
    for (const p of [{ targetLine: [[2, 4, 8], [7, 4, 8]] }, {}]) {
      const out = exec(m, 'ALIGN_RIDGE', { edgeId: RIDGE, mode: 'KEEP_PLANES', ...p });
      expect(out.result.status).toBe('COMMITTED');
      expect(changedPlanes(m, out.model)).toEqual([]);
    }
  });

  it('FIT_MEASUREMENTS (D-3D16-3): POINT terms soft with 1/σz², targetLine hard', () => {
    const m = gable();
    addPoint(m, 'm-s', [5, 2, 6.75]);
    addPoint(m, 'm-n', [5, 6, 6.75]);
    deepFreeze(m);
    const out = exec(m, 'ALIGN_RIDGE', { edgeId: RIDGE, mode: 'FIT_MEASUREMENTS', targetLine: [[0, 4, 8.5], [10, 4, 8.5]], measurementIds: ['m-s', 'm-n'] });
    expect(out.result.status).toBe('COMMITTED');
    expect(Math.abs(z(out.model, 'v-r0') - 8.5)).toBeLessThanOrEqual(PROFILE.planarTolM);
    expect(Math.abs(z(out.model, 'v-e0') - 5)).toBeLessThanOrEqual(0.01);
  });

  it('FIT_MEASUREMENTS refusals: LINE kind or no sigmaZ -> INVALID_MEASUREMENT; unknown id -> INVALID_PAYLOAD', () => {
    const m = gable();
    addPoint(m, 'm-l', [5, 2, 6.75], { geometry: { kind: 'LINE', coordinates: [[0, 2, 6.75], [10, 2, 6.75]] } });
    addPoint(m, 'm-0', [5, 2, 6.75], { uncertainty: { unit: 'm' } });
    deepFreeze(m);
    const fit = (/** @type {string[]} */ ids) => exec(m, 'ALIGN_RIDGE', { edgeId: RIDGE, mode: 'FIT_MEASUREMENTS', measurementIds: ids });
    expect(refused(fit(['m-l']), m, 'INVALID_MEASUREMENT').entityIds).toEqual(['m-l']);
    refused(fit(['m-0']), m, 'INVALID_MEASUREMENT');
    refused(fit(['m-x']), m, 'INVALID_PAYLOAD');
  });
});

describe('ALIGN_EAVE', () => {
  it('KEEP_RIDGE: lower the south eave to 4.5 on the wall plane; ridge kept', () => {
    const m = deepFreeze(gable());
    const out = exec(m, 'ALIGN_EAVE', { edgeId: EAVE_S, mode: 'KEEP_RIDGE', targetLine: [[0, 0, 4.5], [10, 0, 4.5]] });
    expect(out.result.status).toBe('COMMITTED');
    expect(changedPlanes(m, out.model)).toEqual(['f-roof-s']);
    expect(Math.abs(z(out.model, 'v-e0') - 4.5)).toBeLessThanOrEqual(PROFILE.planarTolM);
    expect(Math.abs(z(out.model, 'v-r0') - 8)).toBeLessThanOrEqual(PROFILE.planarTolM);
    expect(maxPlaneDistance(out.model)).toBeLessThanOrEqual(PROFILE.planarTolM);
  });

  it('D-3D16-2: a target off the fixed wall plane -> CONSTRAINT_CONFLICT', () => {
    const m = deepFreeze(gable());
    const e = refused(exec(m, 'ALIGN_EAVE', { edgeId: EAVE_S, mode: 'KEEP_RIDGE', targetLine: [[0, -0.5, 5], [10, -0.5, 5]] }), m, 'CONSTRAINT_CONFLICT');
    expect(e.entityIds).toContain('f-wall-s');
  });

  it('KEEP_EAVES is not an ALIGN_EAVE mode -> INVALID_PAYLOAD; a ridge edge -> INVALID_PAYLOAD', () => {
    const m = deepFreeze(gable());
    refused(exec(m, 'ALIGN_EAVE', { edgeId: EAVE_S, mode: 'KEEP_EAVES', targetLine: [[0, 0, 5], [10, 0, 5]] }), m, 'INVALID_PAYLOAD');
    refused(exec(m, 'ALIGN_EAVE', { edgeId: RIDGE, mode: 'KEEP_PLANES' }), m, 'INVALID_PAYLOAD');
  });

  it('D-3D16-4: a listed soft FIXED_EAVE is held hard (conflict); unlisted it stays soft; unknown id -> INVALID_PAYLOAD', () => {
    const m = gable();
    m.constraints['c-eave'] = { id: 'c-eave', kind: 'FIXED_EAVE', entityIds: [EAVE_S], hard: false, weight: 1 };
    deepFreeze(m);
    const p = { edgeId: EAVE_S, mode: 'KEEP_RIDGE', targetLine: [[0, 0, 4.5], [10, 0, 4.5]] };
    const soft = exec(m, 'ALIGN_EAVE', p);
    expect(soft.result.status).toBe('COMMITTED');
    expect(Math.abs(z(soft.model, 'v-e0') - 4.5)).toBeLessThanOrEqual(PROFILE.planarTolM);
    expect(refused(exec(m, 'ALIGN_EAVE', { ...p, hardConstraintIds: ['c-eave'] }), m, 'CONSTRAINT_CONFLICT').entityIds).toContain('c-eave');
    expect(refused(exec(m, 'ALIGN_EAVE', { ...p, hardConstraintIds: ['c-x'] }), m, 'INVALID_PAYLOAD').entityIds).toEqual(['c-x']);
  });
});
