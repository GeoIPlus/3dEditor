#!/usr/bin/env node
// `npm run check:docs` (3D-05, 3D-78): runs tools/check-docs.mjs. On a WP branch `wp/*` (or with
// `--allow-provisional`, for a platform-named WP branch) provisional ids are allowed (D-38, D-179) and a final id that
// the base branch lacks is a problem: the base's documents are read from `origin/<base>` (else the local `<base>`).
// Everywhere else, including the base branch and CI on it, the check is strict. A WP merge commit at HEAD also needs
// final ledger rows (tools/ledger-check.mjs, 3D-137). `--fix` first regenerates the BACKLOG
// overview (D-180).
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE_BRANCH } from './base-branch.mjs';
import { checkDocs, fixDocs } from './check-docs.mjs';
import { checkLedgerAtHead } from './ledger-check.mjs';

/** @param {string[]} args @param {string} cwd */
const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

/**
 * Branch name: CI variables first (a PR reports its head branch), then git.
 * @param {NodeJS.ProcessEnv} env
 * @param {string} cwd
 */
export function currentBranch(env, cwd) {
  if (env.GITHUB_HEAD_REF) return env.GITHUB_HEAD_REF;
  if (env.GITHUB_REF_NAME) return env.GITHUB_REF_NAME;
  try {
    return git(['branch', '--show-current'], cwd).trim();
  } catch {
    return '';
  }
}

/** @param {string} branch @param {string[]} args */
export const allowProvisional = (branch, args) => args.includes('--allow-provisional') || /^wp\//.test(branch);

/**
 * The base branch's documents that define ids, or null when no ref of the base is available.
 * @param {string} cwd
 * @param {string} [base]
 * @returns {{ref: string, docs: {backlog: string, decisions: string, adrFiles: string[]}} | null}
 */
export function readBase(cwd, base = BASE_BRANCH) {
  for (const ref of [`origin/${base}`, base]) {
    try {
      git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], cwd);
    } catch {
      continue;
    }
    const show = (/** @type {string} */ p) => {
      try {
        return git(['show', `${ref}:${p}`], cwd);
      } catch {
        return '';
      }
    };
    const adr = git(['ls-tree', '--name-only', ref, 'docs/decisions/adr/'], cwd);
    const adrFiles = adr.split('\n').filter(Boolean).map((f) => f.split('/').pop() ?? '');
    return { ref, docs: { backlog: show('docs/BACKLOG.md'), decisions: show('docs/decisions/DECISIONS.md'), adrFiles } };
  }
  return null;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const args = process.argv.slice(2);
  const branch = currentBranch(process.env, root);
  const lenient = allowProvisional(branch, args);
  if (args.includes('--fix')) fixDocs(root, new Date().toISOString().slice(0, 10));
  const base = lenient ? readBase(root) : null;
  const problems = checkDocs(root, { allowProvisional: lenient, base: base?.docs });
  problems.push(...checkLedgerAtHead(root)); // 3D-137: a WP merge commit needs final ledger rows
  if (lenient && !base) problems.push(`base branch ${BASE_BRANCH} not found; run \`git fetch origin ${BASE_BRANCH}\` (D-179 new-id rule)`);
  if (problems.length > 0) {
    for (const p of problems) console.error(`check:docs: ${p}`);
    process.exit(1);
  }
  const mode = lenient ? `provisional ids allowed, new final ids checked against ${base?.ref}` : 'strict, provisional ids rejected';
  console.log(`check:docs: ok (branch "${branch || '(detached)'}", ${mode})`);
}
