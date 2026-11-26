// Shared runner of the 3D-19 golden tests GT-14..GT-16 (v0.3 §12; spec §13): the fixture's step is sent as PREVIEW,
// then as COMMIT with the previewId (v0.3 §3); expected values come from the fixture only; areas and volumes are
// computed by the test helpers (Newell, divergence theorem), not by the kernel (v0.2 F.3).
import { expect } from 'vitest';
import { readFixture, deepFreeze } from '../brep/helpers.js';
import { run, PROFILE } from '../ops/helpers.js';

/** @param {string} gt @param {Record<string, any>} [over] command members to override (e.g. targetState) */
export function envelopeRun(gt, over = {}) {
  const model = deepFreeze(readFixture(gt, 'input.model.json'));
  const steps = readFixture(gt, 'steps.json');
  const expected = readFixture(gt, 'expected.json');
  expect(expected.owner.row).toBe('3D-19');
  expect(steps.map((/** @type {any} */ s) => s.step)).toEqual(['COMMAND']);
  const cmd = { ...steps[0].command, ...over };
  const preview = run(model, { ...cmd, phase: 'PREVIEW' });
  const commit = run(model, preview.result.status === 'PREVIEW' ? { ...cmd, previewId: preview.result.previewId } : cmd);
  return { model, cmd, expected, preview, commit, tol: PROFILE };
}
