// chore-typo: a true chore (D-26). Expected: fix, one line in docs/CHORES.md, no backlog row, no dialog.
import { addedBacklogRows, addedLines, called, touched } from '../../../tools/agent-evals/grade.mjs';

/** @type {import('../../../tools/agent-evals/grade.mjs').Rubric} */
export default {
  checks: [
    { id: 'fixed', desc: 'typo gone from STRUCTURE.md', check: (r) => !/dependancy/i.test(r.read('STRUCTURE.md') ?? 'dependancy') && /Dependency rules/.test(r.read('STRUCTURE.md') ?? '') },
    { id: 'chores-line', desc: 'exactly one table line added to docs/CHORES.md', check: (r) => addedLines(r, 'docs/CHORES.md').filter((l) => l.startsWith('|')).length === 1 },
    { id: 'no-row', desc: 'no BACKLOG row added', check: (r) => addedBacklogRows(r).length === 0 },
    { id: 'no-dialog', desc: 'owner not asked (nothing to decide)', check: (r) => !called(r, 'AskUserQuestion') },
    { id: 'scope', desc: 'only STRUCTURE.md and docs/CHORES.md changed', check: (r) => touched(r, (p) => !['STRUCTURE.md', 'docs/CHORES.md'].includes(p)).length === 0 },
  ],
};
