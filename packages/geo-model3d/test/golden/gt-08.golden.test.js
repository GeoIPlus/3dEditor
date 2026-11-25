// GT-08 (v0.3 §12; spec §13; row 3D-15): SPLIT_FACE on the GT-03 result, no new plane. Volume and areas are computed by
// the test (divergence theorem, Newell) from the committed vertex coordinates; expected values are the fixture's.
import { describe, expect, it } from 'vitest';
import { readFixture, deepFreeze } from '../brep/helpers.js';
import { run, metrics, faceArea, maxPlaneDistance, PROFILE } from '../ops/helpers.js';

describe('GT-08 SPLIT_FACE', () => {
  const model = deepFreeze(readFixture('GT-08', 'input.model.json'));
  const steps = readFixture('GT-08', 'steps.json');
  const expected = readFixture('GT-08', 'expected.json');
  const a = expected.assert, tol = expected.tolerance;
  const cmd = steps[0].command;
  const preview = run(model, { ...cmd, phase: 'PREVIEW' });
  const commit = run(model, { ...cmd, previewId: preview.result.previewId });

  it('fixture belongs to 3D-15 and has one COMMAND step', () => {
    expect(expected.owner.row).toBe('3D-15');
    expect(steps.map((/** @type {any} */ s) => s.step)).toEqual(['COMMAND']);
  });

  it('commits a VALID_SOLID with the PREVIEW patch', () => {
    expect(preview.result.status).toBe('PREVIEW');
    expect(commit.result.status).toBe('COMMITTED');
    expect(commit.result.patch).toEqual(preview.result.patch);
    expect(commit.model.state).toBe('VALID_SOLID');
    expect(maxPlaneDistance(commit.model)).toBeLessThanOrEqual(PROFILE.planarTolM);
  });

  it('expected values: 2 coplanar faces, volume, lineage 1 -> 2', () => {
    const faceId = cmd.payload.faceId;
    const to = commit.result.topologyLineage.mapped[faceId];
    expect([1, to.length]).toEqual([a.lineage.from, a.lineage.to]);
    const planes = to.map((/** @type {string} */ f) => commit.model.faces[f].supportPlane);
    const coplanar = planes.filter((/** @type {any} */ p) => JSON.stringify(p) === JSON.stringify(model.faces[faceId].supportPlane));
    expect(coplanar.length).toBe(a.coplanarFaces);
    const m = metrics(commit.model);
    console.log('GT-08', JSON.stringify({ volumeM3: m.volumeM3, parts: to.map((/** @type {string} */ f) => faceArea(commit.model, f)) }));
    expect(Math.abs(m.volumeM3 - a.volumeM3)).toBeLessThanOrEqual(tol.volumeM3);
    // independent check of the fixture README: the split line divides the 50 m2 slope into two 25 m2 halves
    for (const f of to) expect(Math.abs(faceArea(commit.model, f) - 25)).toBeLessThanOrEqual(tol.areaM2);
  });
});
