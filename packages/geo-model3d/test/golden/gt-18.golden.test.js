// GT-18 (v0.3 §12; spec §13; row 3D-20): ADD_DORMER FLAT over the outline 2 x 1.5 m on GT-03 (heightM = back wall
// height, D-3D20-2). Independent checks: closure from the half-edge links, no installation point below the south plane
// z = 5 + 0.75 y beyond planarTolM (bodies touch, never intersect), outline size from the coordinates.
import { describe, expect, it } from 'vitest';
import { goldenRun, installation, closedBody, buildingVolume, volume, maxPlaneDistance } from './installation.golden.helpers.js';

const slopeZ = (/** @type {number[]} */ p) => 5 + 0.75 * p[1];

describe('GT-18 ADD_DORMER FLAT', () => {
  const r = goldenRun('GT-18');
  const a = r.expected.assert, tol = r.expected.tolerance;
  const m = r.commit.model;

  it('commits a VALID_SOLID with the PREVIEW patch', () => {
    expect(r.preview.result.status).toBe('PREVIEW');
    expect(r.commit.result.status).toBe('COMMITTED');
    expect(r.commit.result.patch).toEqual(r.preview.result.patch);
    expect(m.state).toBe(a.state);
    expect(r.commit.result.validation.isValidForTargetState).toBe(true);
    expect(maxPlaneDistance(m)).toBeLessThanOrEqual(r.tol.planarTolM);
  });

  it('BuildingInstallation valid: closed, no issue on its entities, no SOLID_OVERLAP', () => {
    const ins = installation(m);
    expect(ins.node.kind).toBe(a.installation);
    expect(closedBody(m, ins.hes, ins.faces)).toBe(a.installationValid);
    const issues = r.commit.result.validation.issues;
    expect(issues.filter((/** @type {any} */ i) => i.code === 'SOLID_OVERLAP')).toEqual([]);
    expect(issues.filter((/** @type {any} */ i) => i.severity === 'ERROR')).toEqual([]);
  });

  it('no body intersection beyond planarTolM; outline 2 x 1.5 m; building volume unchanged', () => {
    const ins = installation(m);
    expect(a.noIntersectionBeyond).toBe('planarTolM');
    for (const p of ins.pts) expect(p[2]).toBeGreaterThanOrEqual(slopeZ(p) - r.tol.planarTolM);
    const base = ins.pts.filter((p) => Math.abs(p[2] - slopeZ(p)) <= r.tol.planarTolM);
    const xs = base.map((p) => p[0]), ys = base.map((p) => p[1]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(a.outlineM[0], 9);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(a.outlineM[1], 9);
    // top 6.875 + 1 = 7.875; prism 2 x 1.5 m over the slope (mean height 6.3125) -> 4.6875 m3
    console.log('GT-18', JSON.stringify({ buildingVolumeM3: buildingVolume(m), dormerVolumeM3: volume(m, ins.shell.faceIds) }));
    expect(Math.abs(volume(m, ins.shell.faceIds) - 4.6875)).toBeLessThanOrEqual(tol.volumeM3);
    expect(Math.abs(buildingVolume(m) - 520)).toBeLessThanOrEqual(tol.volumeM3);
  });
});
