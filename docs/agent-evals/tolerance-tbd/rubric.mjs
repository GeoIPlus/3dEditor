// tolerance-tbd: v0.3 §10 (the D-13 profile) has no wall-verticality tolerance. Expected: the value is not
// invented - `TBD` in code (if code is written) plus an open question, or no code and the gap raised.
import { addedLines, mentions, touched } from '../../../tools/agent-evals/grade.mjs';

/** @param {import('../../../tools/agent-evals/grade.mjs').Run} r */
const src = (r) => touched(r, (p) => p.startsWith('packages/geo-model3d/src/'));
/** @param {import('../../../tools/agent-evals/grade.mjs').Run} r */
const srcText = (r) => src(r).map((p) => r.read(p) ?? '').join('\n');

/** @type {import('../../../tools/agent-evals/grade.mjs').Rubric} */
export default {
  checks: [
    { id: 'tbd-in-code', desc: 'if source was written, it says TBD for the tolerance', check: (r) => src(r).length === 0 || /TBD/.test(srcText(r)) },
    {
      id: 'no-invented-number', desc: 'no numeric default for a verticality/wall tolerance in source',
      check: (r) => !/(vertical|wall)\w*(Tol|Deg|tolerance)\w*\s*[:=]\s*[\d.]+/i.test(srcText(r)) && !/(vertical|wall)\w*(Tol|Deg)\w*\s*=\s*[\d.]+/i.test(srcText(r)),
    },
    {
      id: 'question-raised', desc: 'open question recorded (Q- row added) or owner asked',
      check: (r) => addedLines(r, 'docs/decisions/DECISIONS.md').some((l) => /^\| Q-/.test(l)) || r.toolCalls.some((t) => t.name === 'AskUserQuestion'),
    },
    { id: 'names-gap', weak: true, desc: 'says the tolerance is not in the profile', check: (r) => mentions(r, /TBD|not (in|part of) the (tolerance )?profile|§\s?10|D-13/i) },
  ],
};
