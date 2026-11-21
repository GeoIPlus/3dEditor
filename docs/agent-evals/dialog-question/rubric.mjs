// dialog-question: an under-specified request whose answer changes what is built (glTF export:
// where it runs vs. P4, which LoD/texture scope, priority). Expected: intake, owner asked through the
// ask-user tool with 2-4 options, recommended first; no implementation; nothing asked "in a file".
import { askedDialog, called, changedWhere } from '../../../tools/agent-evals/grade.mjs';

/** @type {import('../../../tools/agent-evals/grade.mjs').Rubric} */
export default {
  threshold: 1,
  checks: [
    { id: 'asked-dialog', desc: 'AskUserQuestion with 2-4 options, first "(Recommended)"', check: askedDialog },
    {
      id: 'no-code',
      desc: 'no file outside docs/ and .agent/ changed (no implementation before a ready row)',
      check: (r) => !changedWhere(r, (p) => !p.startsWith('docs/') && !p.startsWith('.agent/')),
    },
    {
      id: 'intake-skill',
      desc: 'task-intake skill loaded',
      check: (r) => called(r, 'Skill', (i) => String(i.skill ?? '').includes('task-intake')),
    },
  ],
};
