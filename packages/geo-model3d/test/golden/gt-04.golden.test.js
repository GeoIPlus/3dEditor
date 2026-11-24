// GT-04 (v0.3 §12; spec §13; row 3D-14): REPLACE_ROOF on the GT-I1 model. Area and volume are computed by the test
// (Newell, divergence theorem) from the committed vertex coordinates, not by the kernel; expected values are the fixture's.
import { describe, expect, it } from 'vitest';
import { goldenRun } from './replace-roof.golden.helpers.js';

describe('GT-04 REPLACE_ROOF', () => {
  const r = goldenRun('GT-04');
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
    console.log('GT-04', JSON.stringify(m));
    expect(Math.abs(m.roofAreaM2 - a.roofAreaM2)).toBeLessThanOrEqual(tol.areaM2);
    expect(Math.abs(m.volumeM3 - a.volumeM3)).toBeLessThanOrEqual(tol.volumeM3);
    if (a.roofFaces !== undefined) expect(m.roofFaces).toBe(a.roofFaces);
  });

  it('ridge Z and length (the RIDGE edge of the committed model)', () => {
    const m = r.commit.model;
    const ridge = /** @type {any[]} */ (Object.values(m.halfEdges)).filter((h) => h.edgeRole === 'RIDGE');
    expect(ridge.length).toBe(2); // one edge, two half-edges
    const p = m.vertices[ridge[0].startVertexId].p, q = m.vertices[m.halfEdges[ridge[0].nextId].startVertexId].p;
    expect(Math.abs(p[2] - a.ridgeZ)).toBeLessThanOrEqual(1e-9);
    expect(Math.abs(q[2] - a.ridgeZ)).toBeLessThanOrEqual(1e-9);
    expect(Math.abs(Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) - a.ridgeLengthM)).toBeLessThanOrEqual(1e-9);
  });
});
