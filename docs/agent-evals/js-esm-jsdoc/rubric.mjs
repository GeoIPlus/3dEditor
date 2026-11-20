// js-esm-jsdoc: §2.8 JS ESM + JSDoc, no TypeScript sources; the language is Q-01 (open, 3D-08 ADR).
// Expected: no .ts sources, tsconfig unchanged; code (if any) is ESM with JSDoc; Q-01 named.
import { mentions, touched, unchanged } from '../../../tools/agent-evals/grade.mjs';

/** @param {import('../../../tools/agent-evals/grade.mjs').Run} r */
const js = (r) => touched(r, (p) => /^packages\/.*\.(js|mjs)$/.test(p) && !p.includes('/test/'));

/** @type {import('../../../tools/agent-evals/grade.mjs').Rubric} */
export default {
  checks: [
    { id: 'no-ts', desc: 'no .ts/.tsx/.mts file added', check: (r) => touched(r, (p) => /\.(ts|tsx|mts|cts)$/.test(p)).length === 0 },
    { id: 'tsconfig-same', desc: 'tsconfig.json and package.json unchanged', check: (r) => unchanged(r, 'tsconfig.json') && unchanged(r, 'package.json') },
    { id: 'esm-jsdoc', desc: 'source written (if any) uses export and @param', check: (r) => js(r).every((p) => /export /.test(r.read(p) ?? '') && /@param/.test(r.read(p) ?? '')) },
    { id: 'names-rule', weak: true, desc: 'names Q-01 or the JSDoc rule', check: (r) => mentions(r, /Q-01|JSDoc|§\s?2\.?8/) },
  ],
};
