// GT-02 (v0.3 §12; spec §13; row 3D-14): REPLACE_ROOF on the GT-I1 model. Area and volume are computed by the test
// (Newell, divergence theorem) from the committed vertex coordinates, not by the kernel; expected values are the fixture's.
import { describe, expect, it } from 'vitest';
import { goldenRun } from './replace-roof.golden.helpers.js';

describe('GT-02 REPLACE_ROOF', () => {
  const r = goldenRun('GT-02');
  const a = r.expected.assert, tol = r.expected.tolerance;

  it('commits a VALID_SOLID with the PREVIEW patch', () => {
    expect(r.preview.result.status).toBe('PREVIEW');
    expect(r.commit.result.status).toBe('COMMITTED');
    expect(r.commit.result.patch).toEqual(r.preview.result.patch);
    expect(r.commit.model.state).toBe('VALID_SOLID');
    expect(r.commit.result.validation.isValidForTargetState).toBe(true);
    expect(r.planeDistance).toBeLessThanOrEqual(r.tol.planarTolM);
  });

  it('expected values', () => {
    const m = /** @type {any} */ (r.metrics);
    console.log('GT-02', JSON.stringify(m));
    expect(Math.abs(m.roofAreaM2 - a.roofAreaM2)).toBeLessThanOrEqual(tol.areaM2);
    expect(Math.abs(m.volumeM3 - a.volumeM3)).toBeLessThanOrEqual(tol.volumeM3);
    if (a.roofFaces !== undefined) expect(m.roofFaces).toBe(a.roofFaces);
  });
});
