// GT-15 (v0.3 §12; spec §13; row 3D-19): SET_HEIGHT BASE = -1 on the GT-03 gable.
import { describe, expect, it } from 'vitest';
import { envelopeRun } from './envelope.golden.helpers.js';
import { metrics, maxPlaneDistance } from '../ops/helpers.js';

describe('GT-15 SET_HEIGHT BASE', () => {
  const r = envelopeRun('GT-15');
  const a = r.expected.assert, tol = r.expected.tolerance;

  it('commits a VALID_SOLID with the PREVIEW patch; only the ground plane changes (D-08)', () => {
    expect(r.commit.result.status).toBe('COMMITTED');
    expect(r.commit.result.patch).toEqual(r.preview.result.patch);
    expect(r.commit.model.state).toBe('VALID_SOLID');
    const changed = Object.keys(r.model.faces).filter((f) => JSON.stringify(r.model.faces[f].supportPlane) !== JSON.stringify(r.commit.model.faces[f].supportPlane));
    expect(changed).toEqual(['f-ground']);
    expect(maxPlaneDistance(r.commit.model)).toBeLessThanOrEqual(r.tol.planarTolM);
    expect(r.commit.model.footprints['fp-1'].baseElevationM).toBe(-1);
  });

  it('expected values: volume 600, roof 100', () => {
    const m = metrics(r.commit.model);
    console.log('GT-15', JSON.stringify(m));
    expect(Math.abs(m.volumeM3 - a.volumeM3)).toBeLessThanOrEqual(tol.volumeM3);
    expect(Math.abs(m.roofAreaM2 - a.roofAreaM2)).toBeLessThanOrEqual(tol.areaM2);
  });
});
