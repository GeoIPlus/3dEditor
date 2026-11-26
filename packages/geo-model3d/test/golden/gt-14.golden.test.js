// GT-14 (v0.3 §12; spec §13; row 3D-19): SET_OVERHANG 0.5 m on both eaves of the GT-03 gable (D-3D19-1, D-3D19-2).
// BLOCKED_BY_VALIDATOR_DEPENDENCY 3D-19.4 (D-3D19-8): each end cap is 0.5 x 0.375 / 2 = 0.09375 m2, below
// `minFaceAreaM2` 0.1 (D-13), so with the standard profile the commit to VALID_SOLID is refused (DEGENERATE_FACE on
// the four caps only). The geometry is checked here through a DRAFT_SOLID commit; the VALID_SOLID case is `it.fails`
// and turns red - to be switched to `it` - once 3D-19.4 is merged. Expected values are not changed.
import { describe, expect, it } from 'vitest';
import { envelopeRun } from './envelope.golden.helpers.js';
import { faceArea, volume, metrics, maxPlaneDistance } from '../ops/helpers.js';

const kind = (/** @type {any} */ m, /** @type {string} */ k, /** @type {boolean} */ over) =>
  Object.keys(m.faces).filter((f) => m.faces[f].surfaceKind === k && m.faces[f].tags.includes('OVERHANG') === over);
const area = (/** @type {any} */ m, /** @type {string[]} */ fs) => fs.reduce((s, f) => s + faceArea(m, f), 0);

describe('GT-14 SET_OVERHANG', () => {
  const r = envelopeRun('GT-14', { targetState: 'DRAFT_SOLID' });
  const a = r.expected.assert, tol = r.expected.tolerance;
  const m = r.commit.model;

  it('geometry: footprint 80, roof 112.5, overhang edge Z 4.625 (v0.3 §12) and the D-3D19-1 reference split', () => {
    expect(r.commit.result.status).toBe('COMMITTED');
    expect(r.commit.result.patch).toEqual(r.preview.result.patch);
    expect(Math.abs(area(m, kind(m, 'GroundSurface', false)) - a.footprintAreaM2)).toBeLessThanOrEqual(tol.areaM2);
    const roof = [...kind(m, 'RoofSurface', false), ...kind(m, 'RoofSurface', true)];
    expect(Math.abs(area(m, roof) - a.roofAreaM2)).toBeLessThanOrEqual(tol.areaM2);
    // D-3D19-1: roof plan 90, overhang roof 12.5, soffit 10, cap 0.09375, main 520, overhang 1.875, total 521.875
    const plan = roof.reduce((s, f) => s + faceArea(m, f) * Math.abs(m.faces[f].supportPlane.normal[2]), 0);
    expect(Math.abs(plan - 90)).toBeLessThanOrEqual(tol.areaM2);
    expect(Math.abs(area(m, kind(m, 'RoofSurface', true)) - 12.5)).toBeLessThanOrEqual(tol.areaM2);
    expect(Math.abs(area(m, kind(m, 'OuterCeilingSurface', true)) - 10)).toBeLessThanOrEqual(tol.areaM2);
    const caps = kind(m, 'WallSurface', true);
    expect(caps).toHaveLength(4);
    for (const c of caps) expect(Math.abs(faceArea(m, c) - 0.09375)).toBeLessThanOrEqual(1e-9);
    const main = metrics(r.model).volumeM3, total = volume(m, Object.values(m.shells)[0].faceIds);
    expect(Math.abs(main - 520)).toBeLessThanOrEqual(tol.volumeM3);
    expect(Math.abs(total - main - 1.875)).toBeLessThanOrEqual(tol.volumeM3);
    expect(Math.abs(total - 521.875)).toBeLessThanOrEqual(tol.volumeM3);
    const outer = Object.values(m.vertices).filter((/** @type {any} */ v) => v.p[1] < 0 || v.p[1] > 8);
    expect(outer).toHaveLength(4);
    for (const v of /** @type {any[]} */ (outer)) expect(Math.abs(v.p[2] - a.overhangEdgeZ)).toBeLessThanOrEqual(r.tol.planarTolM);
    expect(maxPlaneDistance(m)).toBeLessThanOrEqual(r.tol.planarTolM);
  });

  it('walls unchanged: every wall keeps id, support plane and semantics (D-3D19-1)', () => {
    expect(a.wallsUnchanged).toBe(true);
    for (const f of kind(r.model, 'WallSurface', false)) {
      expect(m.faces[f].supportPlane).toEqual(r.model.faces[f].supportPlane);
      expect(m.faces[f].surfaceKind).toBe('WallSurface');
      expect(m.faces[f].tags).toEqual(r.model.faces[f].tags);
    }
  });

  it('blocked state: the only errors are DEGENERATE_FACE on the four end caps (3D-19.4)', () => {
    const errors = r.commit.result.validation.issues.filter((/** @type {any} */ i) => i.severity === 'ERROR');
    expect(errors.map((/** @type {any} */ i) => i.code)).toEqual(['DEGENERATE_FACE', 'DEGENERATE_FACE', 'DEGENERATE_FACE', 'DEGENERATE_FACE']);
    expect(errors.flatMap((/** @type {any} */ i) => i.entityIds).sort()).toEqual(kind(m, 'WallSurface', true).sort());
  });

  it.fails('CAP-01: commits VALID_SOLID with the standard profile (BLOCKED_BY_VALIDATOR_DEPENDENCY 3D-19.4)', () => {
    const v = envelopeRun('GT-14');
    expect(v.commit.result.status).toBe('COMMITTED');
    expect(v.commit.model.state).toBe('VALID_SOLID');
  });
});
