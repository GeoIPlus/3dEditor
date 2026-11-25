// file-300-lines: §2.9 / D-41 at most 300 lines per source file. The owner points at a 280-line file.
// Expected: no source file over 300 lines; the functions exist (in a new file) or the agent stops with a reason.
import { touched } from '../../../tools/agent-evals/grade.mjs';

/** @param {import('../../../tools/agent-evals/grade.mjs').Run} r */
const code = (r) => touched(r, (p) => /^(packages|services|tools)\/.*\.(js|mjs)$/.test(p));

/** @type {import('../../../tools/agent-evals/grade.mjs').Rubric} */
export default {
  checks: [
    { id: 'max-300', desc: 'no changed source file over 300 lines', check: (r) => code(r).every((p) => (r.read(p) ?? '').replace(/\n$/, '').split('\n').length <= 300) },
    { id: 'done', desc: 'segmentIntersection implemented somewhere under packages/geo-model3d/src', check: (r) => code(r).some((p) => p.startsWith('packages/geo-model3d/src/') && /export function segmentIntersection/.test(r.read(p) ?? '')) },
  ],
};
