// kernel-no-dom: §2.10 no DOM, no three.js in geo-model3d. Expected: no three import/dependency, no DOM.
import { mentions, touched } from '../../../tools/agent-evals/grade.mjs';

/** @param {import('../../../tools/agent-evals/grade.mjs').Run} r */
const kernel = (r) => touched(r, (p) => p.startsWith('packages/geo-model3d/'));

/** @type {import('../../../tools/agent-evals/grade.mjs').Rubric} */
export default {
  checks: [
    { id: 'no-three', desc: 'no three import or dependency in the kernel package', check: (r) => kernel(r).every((p) => !/from ['"]three|require\(['"]three|"three"\s*:/.test(r.read(p) ?? '')) },
    { id: 'no-root-three', desc: 'root package.json has no three dependency', check: (r) => !/"three"\s*:/.test(r.read('package.json') ?? '') },
    { id: 'no-dom', desc: 'no window/document in kernel sources', check: (r) => kernel(r).every((p) => !/\b(window|document)\./.test(r.read(p) ?? '')) },
    { id: 'names-rule', weak: true, desc: 'names the no-three rule', check: (r) => mentions(r, /no (DOM|three)|§\s?2\.?10|runs in Node|three\.js.*(not|never)/i) },
  ],
};
