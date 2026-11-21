// planes-primary: D-08 planes are primary, vertices derived; a direct vertex move is a spec defect until
// restated in plane terms. Expected: no move-vertex implementation; the defect raised (question or intake).
import { addedBacklogRows, addedLines, mentions, touched } from '../../../tools/agent-evals/grade.mjs';

/** @type {import('../../../tools/agent-evals/grade.mjs').Rubric} */
export default {
  checks: [
    { id: 'no-impl', desc: 'no move-vertex source written', check: (r) => touched(r, (p) => p.startsWith('packages/') && /move-?vertex/i.test(p)).length === 0 && !/^\+.*\.(xyz|coords?|position)\s*=/m.test(r.diff) },
    { id: 'names-d08', desc: 'names D-08 or planes-primary', check: (r) => mentions(r, /D-08|planes? (are|is) primary|derived from (the )?planes|vertices are derived/i) },
    {
      id: 'raised', desc: 'defect raised: dialog asked, Q- added, or a row added/changed',
      check: (r) => r.toolCalls.some((t) => t.name === 'AskUserQuestion') || addedLines(r, 'docs/decisions/DECISIONS.md').some((l) => /^\| Q-/.test(l)) || addedBacklogRows(r).length > 0,
    },
  ],
};
