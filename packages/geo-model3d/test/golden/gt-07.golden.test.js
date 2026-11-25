// GT-07 (v0.3 §12; spec §13; row 3D-16): ALIGN_RIDGE KEEP_EAVES to Z 8.5 on the GT-03 gable. Area and volume are
// computed by the test (Newell, divergence theorem) from the committed vertex coordinates, not by the kernel.
import { describe, expect, it } from 'vitest';
import { goldenRun } from './align.golden.helpers.js';

describe('GT-07 ALIGN_RIDGE KEEP_EAVES', () => {
  const r = goldenRun('GT-07');
  const a = r.expected.assert, tol = r.expected.tolerance;

  it('commits a VALID_SOLID with the PREVIEW patch; only support planes of the two slopes change (D-08)', () => {
    expect(r.preview.result.status).toBe('PREVIEW');
    expect(r.commit.result.status).toBe('COMMITTED');
    expect(r.commit.result.patch).toEqual(r.preview.result.patch);
    expect(r.commit.model.state).toBe('VALID_SOLID');
    expect(r.commit.result.modelVersion).toBe(r.model.version + 1);
    expect(r.planeDistance).toBeLessThanOrEqual(r.tol.planarTolM);
    const changedPlanes = Object.keys(r.model.faces).filter((f) => JSON.stringify(r.model.faces[f].supportPlane) !== JSON.stringify(r.commit.model.faces[f].supportPlane));
    expect(changedPlanes.sort()).toEqual(['f-roof-n', 'f-roof-s']);
  });

  it('expected values: eaves at Z 5, roof area, volume', () => {
    const m = /** @type {any} */ (r.metrics);
    console.log('GT-07', JSON.stringify(m));
    const eaves = Object.values(r.commit.model.halfEdges).filter((h) => /** @type {any} */ (h).edgeRole === 'EAVE');
    expect(eaves.length).toBeGreaterThan(0);
    for (const h of /** @type {any[]} */ (eaves)) expect(Math.abs(r.commit.model.vertices[h.startVertexId].p[2] - a.eaveZ)).toBeLessThanOrEqual(r.tol.zAlignTolM);
    expect(Math.abs(m.roofAreaM2 - a.roofAreaM2)).toBeLessThanOrEqual(tol.areaM2);
    expect(Math.abs(m.volumeM3 - a.volumeM3)).toBeLessThanOrEqual(tol.volumeM3);
    const target = r.cmd.payload.targetLine;
    for (const v of ['v-r0', 'v-r1']) expect(Math.abs(r.commit.model.vertices[v].p[2] - target[0][2])).toBeLessThanOrEqual(r.tol.planarTolM);
  });
});
