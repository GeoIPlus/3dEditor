#!/usr/bin/env node
// PreToolUse hook on Bash (3D-78, D-178): refuse `git push` that writes the base branch unless this session is the
// coordinator. Coordinator = the marker file of tools/base-branch.mjs exists and holds this session's id
// (CLAUDE_CODE_REMOTE_SESSION_ID; outside a cloud session the file alone counts). Quiet otherwise; refusal = one line
// on stderr, exit 2. Covered: explicit refspecs (`base`, `x:base`, `refs/heads/base`, `HEAD` on base), a bare
// `git push` while on base, `--all` / `--mirror`, `--delete base`, `git -C <dir>`. Not covered: pushes hidden in scripts.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE_BRANCH, bareSessionId, coordinatorMarker } from '../base-branch.mjs';

const VALUE_OPTS = new Set(['--repo', '-o', '--push-option', '--receive-pack', '--exec']);
const GIT_VALUE_OPTS = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace']);

/** @param {string} segment @returns {string[]} */
const tokens = (segment) => (segment.match(/"[^"]*"|'[^']*'|\S+/g) || []).map((t) => t.replace(/^(["'])(.*)\1$/, '$2'));

/** @param {string} ref @param {string} current @returns {string} branch a refspec writes */
function destination(ref, current) {
  const spec = ref.replace(/^\+/, '');
  let dst = spec.includes(':') ? spec.slice(spec.indexOf(':') + 1) : spec;
  if (dst === 'HEAD' || dst === '') dst = current;
  return dst.replace(/^refs\/heads\//, '');
}

/**
 * Reason a command would push to `base`, or '' when it does not.
 * @param {string} command shell command line
 * @param {string} base protected branch
 * @param {(dir: string | undefined) => string} currentOf current branch in `dir` (undefined = hook cwd)
 */
export function pushToBase(command, base, currentOf) {
  for (const segment of command.split(/&&|\|\||[;|\n]/)) {
    const t = tokens(segment);
    let i = t.indexOf('git');
    if (i < 0) continue;
    /** @type {string | undefined} */
    let dir;
    for (i++; i < t.length && t[i].startsWith('-'); i++) {
      if (t[i] === '-C') dir = t[i + 1];
      if (GIT_VALUE_OPTS.has(t[i])) i++;
    }
    if (t[i] !== 'push') continue;
    /** @type {string[]} */
    const pos = [];
    for (i++; i < t.length; i++) {
      if (t[i] === '--all' || t[i] === '--mirror') return `\`git push ${t[i]}\` would include ${base}`;
      if (VALUE_OPTS.has(t[i])) i++;
      else if (!t[i].startsWith('-')) pos.push(t[i]);
    }
    const current = currentOf(dir);
    const refs = pos.slice(1);
    if (refs.length === 0 && current === base) return `bare \`git push\` on ${base}`;
    for (const r of refs) if (destination(r, current) === base) return `refspec "${r}" writes ${base}`;
  }
  return '';
}

/** @param {NodeJS.ProcessEnv} env @returns {boolean} */
export function isCoordinator(env) {
  const file = coordinatorMarker(env);
  if (!existsSync(file)) return false;
  const id = env.CLAUDE_CODE_REMOTE_SESSION_ID;
  return !id || bareSessionId(readFileSync(file, 'utf8')) === bareSessionId(id);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  /** @type {{tool_input?: {command?: string}, cwd?: string}} */
  let input = {};
  try {
    input = JSON.parse(readFileSync(0, 'utf8') || '{}');
  } catch {
    process.exit(0);
  }
  const command = input.tool_input?.command ?? '';
  if (!/\bpush\b/.test(command)) process.exit(0);
  const cwd = input.cwd ?? process.cwd();
  const currentOf = (/** @type {string | undefined} */ dir) => {
    try {
      return execFileSync('git', ['branch', '--show-current'], { cwd: dir ? resolve(cwd, dir) : cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      return '';
    }
  };
  const reason = pushToBase(command, BASE_BRANCH, currentOf);
  if (reason && !isCoordinator(process.env)) {
    process.stderr.write(
      `Push refused (D-178, single writer): ${reason}. Only the coordinating session writes the base. Push your own wp/* branch and hand over to the coordinator by send_message ("WP 3D-<id> done, owner accepted, <branch>@<sha>").\n`,
    );
    process.exit(2);
  }
  process.exit(0);
}
