#!/usr/bin/env node
// `npm run check:docs` (3D-05): runs tools/check-docs.mjs. Provisional ids `D-3D<wp>-<n>` / `Q-3D<wp>-<n>` are allowed
// only on a WP branch `wp/*` (D-38: the merging session assigns final ids); everywhere else, including the base
// branch and CI on it, the check is strict. `--allow-provisional` forces the lenient mode (platform-named WP branch).
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkDocs } from './check-docs.mjs';

/**
 * Branch name: CI variables first (a PR reports its head branch), then git.
 * @param {NodeJS.ProcessEnv} env
 * @param {string} cwd
 */
export function currentBranch(env, cwd) {
  if (env.GITHUB_HEAD_REF) return env.GITHUB_HEAD_REF;
  if (env.GITHUB_REF_NAME) return env.GITHUB_REF_NAME;
  try {
    return execFileSync('git', ['branch', '--show-current'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

/** @param {string} branch @param {string[]} args */
export const allowProvisional = (branch, args) => args.includes('--allow-provisional') || /^wp\//.test(branch);

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const args = process.argv.slice(2);
  const branch = currentBranch(process.env, root);
  const lenient = allowProvisional(branch, args);
  const problems = checkDocs(root, { allowProvisional: lenient });
  if (problems.length > 0) {
    for (const p of problems) console.error(`check:docs: ${p}`);
    process.exit(1);
  }
  const mode = lenient ? 'provisional ids allowed' : 'strict, provisional ids rejected';
  console.log(`check:docs: ok (branch "${branch || '(detached)'}", ${mode})`);
}
