// FIT_PLANE command (3D-71; spec §10.12 r4 and Accept 2, §9 r2, r4, r5; D-3D71-1..3). Expected vertex positions are
// computed by hand from the planes (z = 0.75 y + c south, z = 11 - 0.75 y north), not by the kernel.
import { describe, expect, it } from 'vitest';
import { fitPlane } from '@geoiplus/geo-model3d';
import { readFixture } from '../brep/helpers.js';
import { command, maxPlaneDistance, run, PROFILE } from './helpers.js';
import { synthetic } from '../cloud/helpers.js';

const model = () => structuredClone(readFixture('GT-20', 'input.model.json'));
const gt20 = Float64Array.from(readFixture('GT-20', 'input.points.json').points.flat());
const SEL = { kind: 'BOX', min: [0, 0, 2], max: [10, 4, 11] };
/** GT-20 points raised by dz: the true plane becomes z = 0.75 y + 5 + dz. @param {number} dz */
const raised = (dz) => gt20.map((c, i) => (i % 3 === 2 ? c + dz : c));
const fit = (/** @type {any} */ payload, /** @type {any} */ points, over = {}) => {
  const m = model();
  return { m, out: run(m, command(m, 'FIT_PLANE', payload, over), { points }) };
};

describe('FIT_PLANE apply MEASUREMENT', () => {
  const { m, out } = fit({ selection: SEL, apply: 'MEASUREMENT' }, gt20);
  const r = /** @type {any} */ (fitPlane(gt20, /** @type {any} */ (SEL), PROFILE)).result;

  it('commits one PLANE measurement [[nx, ny, nz, d]] with sigma = RMSE (D-3D71-1, D-3D71-2)', () => {
    expect(out.result.status).toBe('COMMITTED');
    expect(out.result.patch.added).toHaveLength(1);
    const me = out.result.patch.added[0];
    expect(me.type).toBe('Measurement3D');
    expect(me.entity).toEqual({
      id: 'measurement-1', geometry: { kind: 'PLANE', coordinates: [[...r.plane.normal, r.plane.d]] },
      sourceType: 'POINT_CLOUD', sourceId: null, horizontalCrs: 'EPSG:25832', verticalCrs: null, frame: 'LOCAL',
      uncertainty: { sigmaX: r.rmseM, sigmaY: r.rmseM, sigmaZ: r.rmseM, unit: 'm' },
      fit: { method: 'RANSAC_SVD', inliers: r.inlierCount, rmseM: r.rmseM }, status: 'MEASURED', createdBy: 'usr-t',
    });
    expect(out.result.patch.updated ?? []).toEqual([]);
    expect(out.model.measurements['measurement-1']).toEqual(me.entity);
    expect(out.model.vertices).toEqual(m.vertices);
  });

  it('PREVIEW gives the COMMIT patch and keeps the model', () => {
    const p = fit({ selection: SEL, apply: 'MEASUREMENT' }, gt20, { phase: 'PREVIEW' });
    expect(p.out.result.status).toBe('PREVIEW');
    expect(p.out.result.patch).toEqual(out.result.patch);
    expect(p.out.model).toBe(p.m);
  });
});

describe('FIT_PLANE apply FACE_PLANE (spec §10.12 Accept 2)', () => {
  it('the GT-20 fit on the GT-03 south slope re-derives its ridge and eave vertices', () => {
    const { out } = fit({ selection: SEL, apply: 'FACE_PLANE', faceId: 'f-roof-s' }, gt20);
    const r = /** @type {any} */ (fitPlane(gt20, /** @type {any} */ (SEL), PROFILE)).result;
    expect(out.result.status).toBe('COMMITTED');
    expect(out.model.state).toBe('VALID_SOLID');
    const pl = out.model.faces['f-roof-s'].supportPlane;
    expect(pl.normal[2]).toBeGreaterThan(0); // outward sign kept
    expect(Math.abs(pl.d)).toBeCloseTo(Math.abs(r.plane.d), 12);
    expect(maxPlaneDistance(out.model)).toBeLessThanOrEqual(1e-9);
    const changed = out.result.patch.updated.filter((/** @type {any} */ u) => u.type === 'Vtx').map((/** @type {any} */ u) => u.entity.id).sort();
    expect(changed).toEqual(['v-e0', 'v-e1', 'v-r0', 'v-r1']);
    expect(out.result.patch.added).toEqual([]);
  });

  it('a fit 0.3 m higher moves eave to z 5.3 and ridge to y 3.8, z 8.15; walls follow', () => {
    const { out } = fit({ selection: { kind: 'BOX', min: [0, 0, 2], max: [10, 4, 11.5] }, apply: 'FACE_PLANE', faceId: 'f-roof-s' }, raised(0.3));
    expect(out.result.status).toBe('COMMITTED');
    const v = out.model.vertices;
    const near = (/** @type {number[]} */ p, /** @type {number[]} */ q) => p.forEach((c, i) => expect(Math.abs(c - q[i])).toBeLessThanOrEqual(0.01));
    near(v['v-e0'].p, [0, 0, 5.3]);
    near(v['v-e1'].p, [10, 0, 5.3]);
    near(v['v-r0'].p, [0, 3.8, 8.15]);
    near(v['v-r1'].p, [10, 3.8, 8.15]);
    expect(v['v-e2'].p).toEqual([10, 8, 5]);
    expect(maxPlaneDistance(out.model)).toBeLessThanOrEqual(1e-9);
    expect(out.model.state).toBe('VALID_SOLID');
  });

  it('a hard FIXED_POINT on the ridge refuses the moved plane, model unchanged', () => {
    const m = model();
    m.constraints['c-fix'] = { id: 'c-fix', kind: 'FIXED_POINT', entityIds: ['v-r0'], hard: true, target: [0, 4, 8] };
    const out = run(m, command(m, 'FIT_PLANE', { selection: { kind: 'BOX', min: [0, 0, 2], max: [10, 4, 11.5] }, apply: 'FACE_PLANE', faceId: 'f-roof-s' }), { points: raised(0.3) });
    expect(out.result.status).toBe('REJECTED');
    expect(out.result.error.code).toBe('CONSTRAINT_CONFLICT');
    expect(out.model).toBe(m);
  });
});

describe('FIT_PLANE refusals leave the model unchanged', () => {
  /** @param {any} payload @param {any} points @param {string} code */
  const refused = (payload, points, code) => {
    const { m, out } = fit(payload, points);
    expect(out.result.status).toBe('REJECTED');
    expect(out.result.error.code).toBe(code);
    expect(out.model).toBe(m);
    expect(out.result.modelVersion).toBe(m.version);
    return out.result.error;
  };

  it('29 points -> INVALID_MEASUREMENT with the count (spec §9 Accept)', () => {
    const e = refused({ selection: SEL, apply: 'MEASUREMENT' }, gt20.slice(0, 29 * 3), 'INVALID_MEASUREMENT');
    expect(e.details).toEqual({ pointCount: 29 });
  });

  it('inlier ratio below 0.6 -> INVALID_MEASUREMENT with the ratio; the face is named', () => {
    const pts = synthetic({ n: 40, outliers: 100 }); // 40 on a plane, 100 scattered above: ratio <= 40 / 140
    const e = refused({ selection: { kind: 'BOX', min: [0, 0, 0], max: [10, 10, 30] }, apply: 'FACE_PLANE', faceId: 'f-roof-s' }, pts, 'INVALID_MEASUREMENT');
    expect(e.details.pointCount).toBe(140);
    expect(e.details.inlierRatio).toBeLessThan(0.6);
    expect(e.entityIds).toEqual(['f-roof-s']);
  });

  it('payload and host errors', () => {
    refused({ selection: SEL, apply: 'FACE_PLANE', faceId: 'f-nope' }, gt20, 'INVALID_PAYLOAD');
    refused({ selection: SEL, apply: 'FACE_PLANE' }, gt20, 'INVALID_PAYLOAD');
    refused({ selection: SEL, apply: 'MEASUREMENT', faceId: 'f-roof-s' }, gt20, 'INVALID_PAYLOAD');
    refused({ selection: SEL, apply: 'BOTH' }, gt20, 'INVALID_PAYLOAD');
    refused({ selection: { kind: 'BOX', min: [0, 0], max: [1, 1, 1] }, apply: 'MEASUREMENT' }, gt20, 'INVALID_PAYLOAD');
    refused({ selection: SEL, apply: 'MEASUREMENT' }, undefined, 'INTERNAL');
  });
});
