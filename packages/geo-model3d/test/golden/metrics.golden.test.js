// F-53 metrics through the public API on the golden cases (3D-116; v0.3 §12; spec §13; D-336, D-3D116-1..3): the
// roof area and volume of `computeMetrics` equal the fixture's expected values and the test helpers' independent
// computation (Newell, divergence theorem); GT-14 reproduces the D-336 reference as FINAL (VALID_SOLID since 3D-117).
import { describe, expect, it } from 'vitest';
import { goldenRun as replaceRoofRun } from './replace-roof.golden.helpers.js';
import { goldenRun as alignRun } from './align.golden.helpers.js';
import { envelopeRun } from './envelope.golden.helpers.js';
import { metrics } from '../ops/helpers.js';
import { metricsOf } from '../metrics/helpers.js';

/** @type {Array<[string, () => any]>} */
const CASES = [
  ['GT-01', () => replaceRoofRun('GT-01')], ['GT-02', () => replaceRoofRun('GT-02')], ['GT-03', () => replaceRoofRun('GT-03')],
  ['GT-04', () => replaceRoofRun('GT-04')], ['GT-07', () => alignRun('GT-07')], ['GT-15', () => envelopeRun('GT-15')],
];

describe('computeMetrics on the golden cases', () => {
  for (const [gt, runIt] of CASES) {
    it(`${gt}: roof area and volume equal the fixture and the test helpers; FINAL`, () => {
      const r = runIt(), a = r.expected.assert, tol = r.expected.tolerance;
      expect(r.commit.result.status).toBe('COMMITTED');
      const m = metricsOf(r.commit.model), h = metrics(r.commit.model);
      expect(m.volumeStatus).toBe('FINAL');
      expect(Math.abs(m.roofSurfaceAreaM2 - a.roofAreaM2)).toBeLessThanOrEqual(tol.areaM2);
      expect(Math.abs(m.geometricSolidVolumeM3 - a.volumeM3)).toBeLessThanOrEqual(tol.volumeM3);
      expect(Math.abs(m.roofSurfaceAreaM2 - h.roofAreaM2)).toBeLessThanOrEqual(1e-9);
      expect(Math.abs(m.geometricSolidVolumeM3 - h.volumeM3)).toBeLessThanOrEqual(1e-9);
      expect([m.overhangVolumeM3, m.mainVolumeM3]).toEqual([0, m.geometricSolidVolumeM3]);
    });
  }

  it('GT-14 (VALID_SOLID, 3D-117): 80 / 90 / 112.5 / 12.5 / 10 m2, 520 / 1.875 / 521.875 m3, FINAL', () => {
    const r = envelopeRun('GT-14'), tol = r.expected.tolerance;
    const m = metricsOf(r.commit.model);
    expect([m.state, m.volumeStatus]).toEqual(['VALID_SOLID', 'FINAL']);
    const want = { footprintAreaM2: 80, roofPlanAreaM2: 90, roofSurfaceAreaM2: 112.5, overhangRoofAreaM2: 12.5, soffitAreaM2: 10,
      mainVolumeM3: 520, overhangVolumeM3: 1.875, geometricSolidVolumeM3: 521.875 };
    for (const [k, v] of Object.entries(want)) expect(Math.abs(m[k] - v), k).toBeLessThanOrEqual(k.endsWith('M3') ? tol.volumeM3 : tol.areaM2);
  });
});
