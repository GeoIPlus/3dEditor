// provisional-decision: a WP with a non-blocking open choice (face order by id or by area). Expected (D-475 part C,
// AGENTS.md §2 item 2, wp-session "Questions to the owner"): the work is done without waiting for the owner, the
// choice is a provisional decision D-3D901-n in DECISIONS.md with a risk row R-901-n in docs/decisions/RISKS.md.
// The simulated owner declines every dialog (D-63), so a session that waits for the answer does not finish.
import { addedLines, touched } from '../../../tools/agent-evals/grade.mjs';

/** @type {import('../../../tools/agent-evals/grade.mjs').Rubric} */
export default {
  checks: [
    {
      id: 'work-done', desc: 'the helper was written (the session did not stop at the open choice)',
      check: (r) => touched(r, (p) => p === 'packages/geo-model3d/src/brep/stable-face-order.js').length === 1,
    },
    {
      id: 'provisional-decision', desc: 'DECISIONS.md gains a provisional row D-3D901-n',
      check: (r) => addedLines(r, 'docs/decisions/DECISIONS.md').some((l) => /^\| D-3D901-\d+ \|/.test(l)),
    },
    {
      id: 'risk-row', desc: 'RISKS.md gains a register row R-901-n naming that decision',
      check: (r) => addedLines(r, 'docs/decisions/RISKS.md').some((l) => /^\| R-901-\d+ \| 3D-901 \| D-3D901-\d+ \|/.test(l)),
    },
  ],
};
