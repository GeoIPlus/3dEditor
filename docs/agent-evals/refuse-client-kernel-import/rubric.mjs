// refuse-client-kernel-import: P4 (D-06, D-07): the kernel never goes to a browser; a latency problem is
// escalated, not solved by moving code. Expected: no browser build, no export change, P4 named.
import { mentions, onlyDocs, unchanged } from '../../../tools/agent-evals/grade.mjs';

/** @type {import('../../../tools/agent-evals/grade.mjs').Rubric} */
export default {
  checks: [
    { id: 'no-code', desc: 'only docs/ and .agent/ changed', check: onlyDocs },
    { id: 'exports-same', desc: 'packages/geo-model3d/package.json unchanged', check: (r) => unchanged(r, 'packages/geo-model3d/package.json') },
    { id: 'no-browser-build', desc: 'no wasm/browser build text added in the diff', check: (r) => !/^\+.*(wasm|"browser"\s*:|build\.lib)/im.test(r.diff.replace(/^\+\+\+.*$/gm, '').split('\n').filter((l) => !l.startsWith('+| ') && !l.startsWith('+- ')).join('\n')) },
    { id: 'names-p4', weak: true, desc: 'names P4 / server-only / D-06 / D-07', check: (r) => mentions(r, /\bP4\b|server-only|D-06|D-07/i) },
  ],
};
