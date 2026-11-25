// intake-new-request: a plain new feature. Expected: task-intake, a `proposed` row (here or a mirror row),
// no implementation, no row set `ready` by the agent.
import { addedBacklogRows, called, onlyDocs } from '../../../tools/agent-evals/grade.mjs';

/** @type {import('../../../tools/agent-evals/grade.mjs').Rubric} */
export default {
  checks: [
    { id: 'intake-skill', desc: 'task-intake skill loaded', check: (r) => called(r, 'Skill', (i) => String(i.skill).includes('task-intake')) },
    { id: 'row-proposed', desc: 'a new BACKLOG row with status proposed', check: (r) => addedBacklogRows(r).some((l) => /\| proposed[^|]*\|$/.test(l)) },
    { id: 'no-ready', desc: 'no added row is ready or in-progress', check: (r) => !addedBacklogRows(r).some((l) => /\| (ready|in-progress)[^|]*\|$/.test(l)) },
    { id: 'no-code', desc: 'only docs/ and .agent/ changed', check: onlyDocs },
  ],
};
