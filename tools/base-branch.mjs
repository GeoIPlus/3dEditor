// The base branch of 3DQM and the coordinator marker (D-178). One place for the hook, `check:docs` and their tests.
// CI fetches the same branch in .github/workflows/check.yml; change both together.
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Branch that only the coordinating session writes (D-178). */
export const BASE_BRANCH = 'claude/keen-pascal-u7z2gk';

/**
 * Coordinator marker: a file outside the repository, so no WP branch can carry it. It holds the coordinator's session
 * id (`session_...`, `cse_...` or the bare part after the prefix). A cloud container belongs to one session, so the file
 * exists only where the coordinator wrote it; the id check stops a copied file from working in another session.
 * @param {NodeJS.ProcessEnv} [env]
 */
export const coordinatorMarker = (env = process.env) => env.THREEDQM_COORDINATOR_MARKER || join(homedir(), '.3dqm-coordinator');

/** @param {string} id @returns {string} session id without its `session_` / `cse_` prefix */
export const bareSessionId = (id) => id.trim().replace(/^(session_|cse_)/, '');
