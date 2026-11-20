// Throwaway start state for one eval run (3D-28): a local clone of the ref under test, a local bare
// `origin` so pushes are harmless and observable, an optional per-task setup, and the end-state snapshot.
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * @param {string} cwd
 * @param {string[]} args
 * @returns {string}
 */
export function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/** @param {string} remote */
function refs(remote) {
  const out = git(remote, ['for-each-ref', '--format=%(refname) %(objectname)']);
  return new Map(out ? out.split('\n').map((l) => /** @type {[string, string]} */ (l.split(' '))) : []);
}

/** Base branch of the repository (AGENTS.md handoffs name it). */
export const BASE_BRANCH = 'claude/keen-pascal-u7z2gk';

/** Paths removed from the clone before the run. */
export const HIDDEN = ['docs/agent-evals', 'tools/agent-evals', '.agent/checkpoints/3D-28.md'];

/**
 * @typedef {{dir: string, work: string, remote: string, startSha: string, branch: string, startRefs: Map<string,string>}} Workspace
 */

/**
 * Create the start state. `setup` (task's setup.mjs default export) runs in the clone and is committed,
 * so the agent starts from a clean tree that already contains the scenario.
 * @param {{repoRoot: string, ref: string, dir: string, branch: string, taskDir: string}} o
 * @returns {Promise<Workspace>}
 */
export async function prepare(o) {
  mkdirSync(o.dir, { recursive: true });
  const work = join(o.dir, 'work');
  const remote = join(o.dir, 'remote.git');
  const sha = git(o.repoRoot, ['rev-parse', o.ref]);
  execFileSync('git', ['clone', '-q', '--no-hardlinks', o.repoRoot, work]);
  git(work, ['checkout', '-q', '-B', o.branch, sha]);
  // Only the task branch, the base and main exist, all at the ref under test.
  for (const b of git(work, ['for-each-ref', '--format=%(refname:short)', 'refs/heads']).split('\n'))
    if (b && b !== o.branch) git(work, ['branch', '-q', '-D', b]);
  for (const b of [BASE_BRANCH, 'main']) if (b !== o.branch) git(work, ['branch', '-q', b, sha]);
  git(work, ['config', 'user.email', 'eval@localhost']);
  git(work, ['config', 'user.name', 'agent-eval']);
  const nm = resolve(o.repoRoot, 'node_modules');
  if (existsSync(nm)) symlinkSync(nm, join(work, 'node_modules'));
  appendFileSync(join(work, '.git', 'info', 'exclude'), '\nnode_modules\n');
  // The agent must not see the tasks, rubrics or runner it is graded by.
  for (const p of HIDDEN) rmSync(join(work, p), { recursive: true, force: true });
  const setupFile = join(o.taskDir, 'setup.mjs');
  if (existsSync(setupFile)) {
    const mod = await import(pathToFileURL(setupFile).href);
    await mod.default({ work, git: (/** @type {string[]} */ a) => git(work, a) });
  }
  git(work, ['add', '-A']);
  git(work, ['commit', '-q', '--allow-empty', '-m', 'Session start state']);
  execFileSync('git', ['clone', '-q', '--bare', work, remote]);
  git(work, ['remote', 'set-url', 'origin', remote]);
  git(work, ['fetch', '-q', 'origin']);
  git(work, ['branch', '-q', '--set-upstream-to', `origin/${o.branch}`]);
  const startSha = git(work, ['rev-parse', 'HEAD']);
  return { dir: o.dir, work, remote, startSha, branch: o.branch, startRefs: refs(remote) };
}

/**
 * @typedef {{
 *   changed: {status: string, path: string}[],
 *   commits: string[],
 *   branch: string,
 *   pushes: {ref: string, sha: string | null}[],
 *   read: (p: string) => string | null,
 *   readStart: (p: string) => string | null,
 *   diff: string,
 *   work: string,
 * }} EndState
 */

/**
 * @param {Workspace} ws
 * @returns {EndState}
 */
export function snapshot(ws) {
  const w = ws.work;
  git(w, ['add', '-A']);
  const ns = git(w, ['diff', '--cached', '--name-status', '--no-renames', ws.startSha]);
  const changed = ns ? ns.split('\n').map((l) => ({ status: l[0], path: l.slice(1).trim() })) : [];
  const log = git(w, ['log', '--format=%s', `${ws.startSha}..HEAD`]);
  const endRefs = refs(ws.remote);
  /** @type {{ref: string, sha: string | null}[]} */
  const pushes = [];
  for (const [ref, sha] of endRefs) if (ws.startRefs.get(ref) !== sha) pushes.push({ ref, sha });
  for (const ref of ws.startRefs.keys()) if (!endRefs.has(ref)) pushes.push({ ref, sha: null });
  return {
    changed: changed.filter((c) => c.path !== 'node_modules'),
    commits: log ? log.split('\n') : [],
    branch: git(w, ['rev-parse', '--abbrev-ref', 'HEAD']),
    pushes,
    read: (p) => (existsSync(join(w, p)) ? readFileSync(join(w, p), 'utf8') : null),
    readStart: (p) => {
      try {
        return git(w, ['show', `${ws.startSha}:${p}`]);
      } catch {
        return null;
      }
    },
    diff: git(w, ['diff', '--cached', ws.startSha, '--', '.', ':!node_modules']).slice(0, 200_000),
    work: w,
  };
}
