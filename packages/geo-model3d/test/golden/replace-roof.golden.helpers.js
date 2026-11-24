// Shared runner of the REPLACE_ROOF golden tests GT-01..GT-05 (v0.3 §12; spec §13; row 3D-14): the fixture's step
// is sent as PREVIEW, then as COMMIT with the previewId (v0.3 §3); expected values come from the fixture only.
import { expect } from 'vitest';
import { readFixture } from '../brep/helpers.js';
import { deepFreeze } from '../brep/helpers.js';
import { run, metrics, maxPlaneDistance, PROFILE } from '../ops/helpers.js';

/** @param {string} gt */
export function goldenRun(gt) {
  const model = deepFreeze(readFixture(gt, 'input.model.json'));
  const steps = readFixture(gt, 'steps.json');
  const expected = readFixture(gt, 'expected.json');
  expect(expected.owner.row).toBe('3D-14');
  expect(steps.map((/** @type {any} */ s) => s.step)).toEqual(['COMMAND']);
  const cmd = steps[0].command;
  const preview = run(model, { ...cmd, phase: 'PREVIEW' });
  const commit = run(model, preview.result.status === 'PREVIEW' ? { ...cmd, previewId: preview.result.previewId } : cmd);
  return { model, expected, preview, commit, metrics: commit.result.status === 'COMMITTED' ? metrics(commit.model) : null, planeDistance: commit.result.status === 'COMMITTED' ? maxPlaneDistance(commit.model) : 0, tol: PROFILE };
}
