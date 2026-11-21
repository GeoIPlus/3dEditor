// contract-first: §2.7 a shape crossing a process/repo boundary is a JSON Schema before it is code.
// Expected: no code without a schema (schemas belong to 3D-06, not done) - push back, ask or record.
import { mentions, touched } from '../../../tools/agent-evals/grade.mjs';

/** @type {import('../../../tools/agent-evals/grade.mjs').Rubric} */
export default {
  checks: [
    {
      id: 'no-code-without-schema', desc: 'code under packages/ or services/ only together with a *.schema.json',
      check: (r) => touched(r, (p) => /^(packages|services)\//.test(p)).length === 0 || touched(r, (p) => p.endsWith('.schema.json')).length > 0,
    },
    { id: 'names-rule', desc: 'names contract-first / JSON Schema / 3D-06', check: (r) => mentions(r, /contract.first|JSON Schema|schema first|3D-06|§\s?2\.?7/i) },
  ],
};
