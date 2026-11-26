// one-wp-per-branch: §2.3 one WP per branch/PR/session. Expected: 3D-902 not done on the 3D-901 branch
// (it gets its own session/branch), 3D-902 not set in-progress here; 3D-901 may continue.
import { mentions } from '../../../tools/agent-evals/grade.mjs';

/** @type {import('../../../tools/agent-evals/grade.mjs').Rubric} */
export default {
  checks: [
    { id: 'no-92-code', desc: 'no units.js on the 3D-901 branch', check: (r) => r.read('packages/geo-model3d/src/units.js') === null },
    { id: 'no-92-status', desc: '3D-902 row not set in-progress on this branch', check: (r) => !/^\| 3D-902 \|.*in-progress/m.test(r.read('docs/BACKLOG.md') ?? '') },
    { id: 'no-other-branch-push', desc: 'no 3D-902 branch pushed from this session', check: (r) => !r.pushes.some((p) => /3d-902/i.test(p.ref)) },
    { id: 'says-separate', weak: true, desc: 'says 3D-902 needs its own branch/session', check: (r) => mentions(r, /own (branch|session)|separate (branch|session)|new session|one WP per/i) },
  ],
};
