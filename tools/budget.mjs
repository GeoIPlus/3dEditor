#!/usr/bin/env node
// Backlog forecast (3D-86, D-236): docs/metrics/LEDGER.md + docs/BACKLOG.md (+ its git history for growth g)
// -> the "## Budget and forecast" block of README §4. Node built-ins and git only.
// Usage: node tools/budget.mjs [--root <dir>] [--today YYYY-MM-DD] [--fix]
// Prints the block; `--fix` also rewrites the fenced block under "## Budget and forecast" in docs/BACKLOG.md.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parseLedger, parseStatusTable, parseEstimates } from './budget-parse.mjs';
import { forecast, formatBlock, daysBefore } from './budget-calc.mjs';

const BACKLOG = 'docs/BACKLOG.md';
const LEDGER = 'docs/metrics/LEDGER.md';
const HEADING = '## Budget and forecast';

/**
 * BACKLOG status table at the start of the window: newest commit before `from`, else the oldest commit (the
 * backlog is younger than the window). No git history -> empty table dated `from`.
 * @param {string} root @param {string} from YYYY-MM-DD
 * @returns {{rows: import('./budget-parse.mjs').BacklogRow[], date: string}}
 */
export function snapshotBefore(root, from) {
  const git = (/** @type {string[]} */ args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  try {
    let sha = git(['rev-list', '-1', `--before=${from}T00:00:00Z`, 'HEAD', '--', BACKLOG]);
    if (!sha) sha = git(['rev-list', '--reverse', 'HEAD', '--', BACKLOG]).split('\n')[0];
    if (!sha) return { rows: [], date: from };
    const date = git(['show', '-s', '--format=%cs', sha]);
    const text = git(['show', `${sha}:${BACKLOG}`]);
    return { rows: parseStatusTable(text.split('\n')), date: date < from ? from : date };
  } catch {
    return { rows: [], date: from };
  }
}

/**
 * @param {string} root @param {string} today
 * @param {{rows: import('./budget-parse.mjs').BacklogRow[], date: string}} [then] injected snapshot (tests)
 * @returns {string} the forecast block (without fences)
 */
export function budgetBlock(root, today, then) {
  const lines = readFileSync(join(root, BACKLOG), 'utf8').split('\n');
  return formatBlock(forecast({
    today,
    ledger: parseLedger(readFileSync(join(root, LEDGER), 'utf8')),
    rows: parseStatusTable(lines),
    estimates: parseEstimates(lines),
    then: then ?? snapshotBefore(root, daysBefore(today, 14)),
  }));
}

/**
 * Replace the first fenced block under "## Budget and forecast" with `block`.
 * @param {string} text BACKLOG text @param {string} block
 * @returns {string} the new text (unchanged when the section or its fence is missing)
 */
export function replaceBlock(text, block) {
  const lines = text.split('\n');
  const h = lines.findIndex((l) => l.trim() === HEADING);
  if (h < 0) return text;
  const open = lines.findIndex((l, i) => i > h && /^```/.test(l));
  const next = lines.findIndex((l, i) => i > h && /^## /.test(l));
  if (open < 0 || (next >= 0 && open > next)) return text;
  const close = lines.findIndex((l, i) => i > open && /^```\s*$/.test(l));
  if (close < 0) return text;
  return [...lines.slice(0, open + 1), ...block.split('\n'), ...lines.slice(close)].join('\n');
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const opt = (/** @type {string} */ name) => (args.indexOf(name) >= 0 ? args[args.indexOf(name) + 1] : undefined);
  const root = resolve(opt('--root') ?? join(dirname(fileURLToPath(import.meta.url)), '..'));
  const today = opt('--today') ?? new Date().toISOString().slice(0, 10);
  const block = budgetBlock(root, today);
  console.log(block);
  if (args.includes('--fix')) {
    const file = join(root, BACKLOG);
    const text = readFileSync(file, 'utf8');
    const next = replaceBlock(text, block);
    if (next === text && !text.includes(block)) {
      console.error(`budget: no fenced block under "${HEADING}" in ${BACKLOG}`);
      process.exit(1);
    }
    if (next !== text) writeFileSync(file, next);
  }
}
