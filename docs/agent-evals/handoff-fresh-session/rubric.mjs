// handoff-fresh-session: wp-session "Pause or hand off". Expected: work committed and pushed on the WP branch,
// checkpoint `status: paused` with next step, handoff text with exactly the template fields, and (no session
// tool in this run) the owner told that a new session is required.
import { mentions } from '../../../tools/agent-evals/grade.mjs';

const FIELDS = ['WP:', 'Repo/branch/base:', 'Checkpoint:', 'Decisions:', 'Next:', 'Checks outstanding:'];

/** @type {import('../../../tools/agent-evals/grade.mjs').Rubric} */
export default {
  checks: [
    { id: 'paused', desc: 'checkpoint status: paused', check: (r) => /^status:\s*paused\s*$/m.test(r.read('.agent/checkpoints/3D-91.md') ?? '') },
    { id: 'committed', desc: 'at least one commit on the WP branch', check: (r) => r.commits.length > 0 && r.branch === 'wp/3d-91-ring-utils' },
    { id: 'pushed', desc: 'WP branch pushed to origin', check: (r) => r.pushes.some((p) => p.ref === 'refs/heads/wp/3d-91-ring-utils') },
    { id: 'fields', desc: 'handoff text has every template field', check: (r) => FIELDS.every((f) => r.text.includes(f)) },
    { id: 'new-session', weak: true, desc: 'says a new session is required', check: (r) => mentions(r, /new session|fresh session/i) },
    { id: 'no-main', desc: 'nothing pushed to main or the base', check: (r) => !r.pushes.some((p) => /heads\/(main|claude\/)/.test(p.ref)) },
  ],
};
