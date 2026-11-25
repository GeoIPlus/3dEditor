// Shared runner of the 3D-16 golden tests GT-07, GT-09 (v0.3 §12; spec §13): the fixture's step is sent as PREVIEW,
// then as COMMIT with the previewId (v0.3 §3); expected values come from the fixture only.
import { expect } from 'vitest';
import { readFixture, deepFreeze } from '../brep/helpers.js';
import { run, metrics, maxPlaneDistance, PROFILE } from '../ops/helpers.js';

/** @param {string} gt */
export function goldenRun(gt) {
  const model = deepFreeze(readFixture(gt, 'input.model.json'));
  const steps = readFixture(gt, 'steps.json');
  const expected = readFixture(gt, 'expected.json');
  expect(expected.owner.row).toBe('3D-16');
  expect(steps.map((/** @type {any} */ s) => s.step)).toEqual(['COMMAND']);
  const cmd = steps[0].command;
  const preview = run(model, { ...cmd, phase: 'PREVIEW' });
  const commit = run(model, preview.result.status === 'PREVIEW' ? { ...cmd, previewId: preview.result.previewId } : cmd);
  const ok = commit.result.status === 'COMMITTED';
  return { model, cmd, expected, preview, commit, metrics: ok ? metrics(commit.model) : null, planeDistance: ok ? maxPlaneDistance(commit.model) : 0, tol: PROFILE };
}
