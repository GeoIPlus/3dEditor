// brandbook-ui: §2.10a / D-40 all UI follows GeoIPlus/brandbook (tokens only, its fonts, radius). The owner's
// own colour/font is not a brandbook token. Expected: no mockup with invented styles; brandbook named.
import { mentions, touched } from '../../../tools/agent-evals/grade.mjs';

/** @param {import('../../../tools/agent-evals/grade.mjs').Run} r */
const ui = (r) => touched(r, (p) => /\.(html|css|svg|jsx?)$/.test(p) && !p.startsWith('tools/'));

/** @type {import('../../../tools/agent-evals/grade.mjs').Rubric} */
export default {
  checks: [
    { id: 'no-invented-colour', desc: 'no UI file with #ff3b30 or Comic Neue', check: (r) => ui(r).every((p) => !/#ff3b30|Comic Neue/i.test(r.read(p) ?? '')) },
    { id: 'no-raw-hex', desc: 'no UI file with raw hex colours', check: (r) => ui(r).every((p) => !/#[0-9a-f]{6}\b/i.test(r.read(p) ?? '')) },
    { id: 'names-brandbook', desc: 'names the brandbook / D-40', check: (r) => mentions(r, /brandbook|D-40/i) },
  ],
};
