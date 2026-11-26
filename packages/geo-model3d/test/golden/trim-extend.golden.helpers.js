// Shared steps of the GT-26..GT-29 golden tests (3D-105; spec §13; TRIM_FACE / EXTEND_FACE, spec §10.6 r7, r8).
import { expect, it } from 'vitest';
import { readFixture, deepFreeze } from '../brep/helpers.js';
import { run, metrics, faceArea, maxPlaneDistance, PROFILE } from '../ops/helpers.js';

/** @param {string} gt */
export function load(gt) {
  const model = deepFreeze(readFixture(gt, 'input.model.json'));
  const steps = readFixture(gt, 'steps.json');
  const expected = readFixture(gt, 'expected.json');
  return { model, steps, expected, cmd: steps[0].command };
}

/** A face edit that commits: PREVIEW patch = COMMIT patch, state, plane unchanged, areas and volume. @param {string} gt */
export function committedCase(gt) {
  const { model, steps, expected, cmd } = load(gt);
  const a = expected.assert, tol = expected.tolerance;
  const preview = run(model, { ...cmd, phase: 'PREVIEW' });
  const commit = run(model, { ...cmd, previewId: preview.result.previewId });
  const faceId = cmd.payload.faceId;

  it('fixture belongs to 3D-105, source is spec §13, one COMMAND step', () => {
    expect(expected.owner.row).toBe('3D-105');
    expect(expected.source.document).toBe('docs/specs/3dqm-spec.md');
    expect(steps.map((/** @type {any} */ s) => s.step)).toEqual(['COMMAND']);
    expect(model.state).toBe('DRAFT_SOLID');
    expect(Math.abs(faceArea(model, faceId) - a.faceAreaM2.before)).toBeLessThanOrEqual(tol.areaM2);
  });

  it(`commits ${a.state} with the PREVIEW patch; the plane of the face is unchanged`, () => {
    expect(preview.result.status).toBe('PREVIEW');
    expect(commit.result.status).toBe('COMMITTED');
    expect(commit.result.patch).toEqual(preview.result.patch);
    expect(commit.model.state).toBe(a.state);
    expect(maxPlaneDistance(commit.model)).toBeLessThanOrEqual(PROFILE.planarTolM);
    expect(commit.model.faces[faceId].supportPlane).toEqual(model.faces[faceId].supportPlane);
    expect(Object.values(commit.model.halfEdges).every((/** @type {any} */ h) => h.twinId)).toBe(true);
  });

  it('expected values: face area, roof area, volume', () => {
    const m = metrics(commit.model);
    const f = faceArea(commit.model, faceId);
    console.log(gt, JSON.stringify({ faceAreaM2: f, roofAreaM2: m.roofAreaM2, volumeM3: m.volumeM3 }));
    expect(Math.abs(f - a.faceAreaM2.after)).toBeLessThanOrEqual(tol.areaM2);
    expect(Math.abs(m.roofAreaM2 - a.roofAreaM2)).toBeLessThanOrEqual(tol.areaM2);
    expect(Math.abs(m.volumeM3 - a.volumeM3)).toBeLessThanOrEqual(tol.volumeM3);
  });
  return { model, commit, cmd, expected };
}

/** A refused case: PREVIEW and COMMIT refused with the code, version unchanged. @param {string} gt */
export function refusedCase(gt) {
  const { model, expected, cmd } = load(gt);
  it('fixture belongs to 3D-105, source is spec §13', () => {
    expect(expected.owner.row).toBe('3D-105');
    expect(expected.source.document).toBe('docs/specs/3dqm-spec.md');
  });
  for (const phase of ['PREVIEW', 'COMMIT']) {
    it(`${phase}: ${expected.assert.refusal}, version unchanged`, () => {
      const out = run(model, { ...cmd, phase });
      expect(out.result.status).toBe('REJECTED');
      expect(out.result.error.code).toBe(expected.assert.refusal);
      expect(expected.assert.versionUnchanged).toBe(true);
      expect(out.result.modelVersion).toBe(model.version);
      expect(out.model).toBe(model);
      expect(out.journal).toBeUndefined();
    });
  }
  return { model, cmd };
}
