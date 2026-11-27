// GT-I4 "val3dity without errors" against the pinned image (v0.3 §12; D-189, row 3D-74) and the other image-bound
// acceptance lines of 3D-74: a defective export (GT-I2) gives findings mapped by `validate`, the image's version is
// the pin and appears in validatorVersion. Needs the running image: VAL3DITY_URL=http://127.0.0.1:8080 (README of
// images/val3dity). Without it the suite is skipped, never faked; the recorded replies are unit-tested in
// val3dity.test.js. Reaching the image is local (loopback / compose network), not the internet.
import { describe, expect, it } from 'vitest';
import { exportBuilding, validateModel } from '@geoiplus/geo-model3d';
import { createVal3dityValidator, VAL3DITY_PIN } from '../src/adapters/val3dity.js';
import { PROFILE, golden } from './val3dity-helpers.js';

const URL_ = process.env.VAL3DITY_URL ?? '';
const clock = () => '2026-11-26T00:00:00Z';

describe.skipIf(URL_ === '')('val3dity image (3D-74) at VAL3DITY_URL', () => {
  /** @param {{ cityjson: any }} g */
  const port = (g) => createVal3dityValidator({ url: URL_, documentOf: () => g.cityjson });

  it('GET /version: val3dity equals the pin (2.7.0 @ fbe9e4d), CGAL / GEOS / Boost recorded', async () => {
    const v = await port({ cityjson: null }).version();
    console.log(`val3dity image: ${JSON.stringify(v)}`);
    expect(v).toMatchObject({ name: 'val3dity', version: VAL3DITY_PIN.version, commit: VAL3DITY_PIN.commit });
    expect(Object.keys(v.libraries).sort()).toEqual(['boost', 'cgal', 'geos']);
  });

  it('GT-I4: import GT-I1 -> export without edits -> val3dity without errors; validatorVersion carries the pin', async () => {
    const g = golden('GT-I4');
    const { findings } = exportBuilding({ model: g.model, cityjson: g.cityjson, toleranceProfile: PROFILE });
    expect(findings).toEqual([]);
    const ext = await port(g).validate({ model: g.model, tolerances: PROFILE });
    expect(ext).toEqual({ validatorVersion: 'val3dity 2.7.0', findings: [] });
    const r = await validateModel(g.model, {
      mode: 'FINAL_VALIDATION', targetState: 'VALID_SOLID', tolerances: PROFILE, clock, fullSolid: true, externalValidator: port(g),
    });
    expect(r.validatorVersion).toMatch(/\+val3dity 2\.7\.0$/);
    expect(r.issues.filter((i) => i.severity === 'ERROR')).toEqual([]);
    expect(r.isValidForTargetState).toBe(true);
  });

  it('GT-I2 shape (ridge gap 0.03 m): findings with externalValidatorCode, mapped by validate', async () => {
    const g = golden('GT-I2');
    const before = structuredClone(g.model);
    const r = await validateModel(g.model, {
      mode: 'FINAL_VALIDATION', targetState: 'VALID_SOLID', tolerances: PROFILE, clock, externalValidator: port(g),
    });
    const ext = r.issues.filter((i) => i.externalValidatorCode);
    console.log(`GT-I2 val3dity issues: ${JSON.stringify(ext.map((i) => [i.externalValidatorCode, i.code, i.severity, i.entityIds]))}`);
    expect(ext.length).toBeGreaterThan(0);
    expect(ext.map((i) => [i.externalValidatorCode, i.code])).toContainEqual(['302', 'SHELL_NOT_CLOSED']);
    for (const i of ext) expect(i.entityIds.length).toBeGreaterThan(0);
    expect(r.isValidForTargetState).toBe(false);
    expect(g.model).toEqual(before);
  });
});
