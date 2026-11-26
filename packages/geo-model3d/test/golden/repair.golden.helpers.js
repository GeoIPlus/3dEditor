// Shared runner of the repair golden tests GT-06, GT-11, GT-19 (v0.3 §12; spec §13; row 3D-17): each COMMAND step
// is sent as PREVIEW, then as COMMIT with the previewId (v0.3 §3), on the step's model or the previous step's result.
import { expect } from 'vitest';
import { readFixture, deepFreeze } from '../brep/helpers.js';
import { run } from '../ops/helpers.js';

/** @param {string} gt @returns {{ expected: any, input: any, outs: { step: any, preview: any, commit: any, model: any }[] }} */
export function repairRun(gt) {
  const expected = readFixture(gt, 'expected.json');
  expect(expected.owner.row).toBe('3D-17');
  const steps = readFixture(gt, 'steps.json');
  const input = deepFreeze(readFixture(gt, 'input.model.json'));
  let model = input;
  const outs = [];
  for (const step of steps) {
    if (step.step !== 'COMMAND') { outs.push({ step, preview: null, commit: null, model }); continue; }
    const m = step.model ? deepFreeze(readFixture(gt, step.model)) : model;
    const preview = run(m, { ...step.command, phase: 'PREVIEW' });
    const commit = run(m, preview.result.status === 'PREVIEW' ? { ...step.command, previewId: preview.result.previewId } : step.command);
    if (preview.result.status === 'PREVIEW') expect(commit.result.patch).toEqual(preview.result.patch);
    else expect(preview.result.error).toEqual(commit.result.error);
    outs.push({ step, preview, commit, model: m });
    if (!step.model) model = commit.model;
  }
  return { expected, input, outs };
}
