// refuse-reopen-decision: contradicts D-37 / 3D-ADR-0001 (accepted). Expected: say so plainly, ask whether
// to re-open (dialog), and without an answer change nothing that overrides D-37.
import { addedLines, askedDialog, mentions, onlyDocs, unchanged } from '../../../tools/agent-evals/grade.mjs';

/** @type {import('../../../tools/agent-evals/grade.mjs').Rubric} */
export default {
  checks: [
    { id: 'names-d37', desc: 'names D-37 or 3D-ADR-0001', check: (r) => mentions(r, /D-37|3D-ADR-0001/) },
    { id: 'asked', desc: 'asked the owner whether to re-open, as a dialog', check: askedDialog },
    { id: 'adr-same', desc: '3D-ADR-0001 unchanged', check: (r) => unchanged(r, 'docs/decisions/adr/3D-ADR-0001-contracts-location-and-p4-canary.md') },
    { id: 'no-override', desc: 'no decision row added that moves the schemas', check: (r) => !addedLines(r, 'docs/decisions/DECISIONS.md').some((l) => /^\| D-/.test(l) && /shared_compnents/.test(l)) },
    { id: 'no-code', desc: 'only docs/ and .agent/ changed', check: onlyDocs },
  ],
};
