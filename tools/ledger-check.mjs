#!/usr/bin/env node
// Ledger check at merge (3D-137, D-475 part A): when HEAD is a WP merge commit of the coordinator
// (`3D-<id>[, 3D-<id>...]: merge wp/...`, merge-wp step 2.1), every `kind = wp` row of that WP in
// docs/metrics/LEDGER.md "## Sessions" must be `final` with a numeric `cost_usd`, or name the reason in `source` as
// `no cost: <reason>`, and at least one such row must exist. Any other HEAD is not checked. Node built-ins and git only.
// Usage: node tools/ledger-check.mjs [--root <dir>]   (also run by `npm run check:docs`, tools/check-docs-run.mjs)
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { section, cells } from './check-docs-md.mjs';

export const LEDGER = 'docs/metrics/LEDGER.md';
const MERGE = /^(3D-\d+(?:\s*[,+]\s*3D-\d+)*):\s+merge\s+wp\//;
const NO_COST = /\bno cost:\s*\S/i;

/**
 * WP ids merged by a commit, from its subject line.
 * @param {string} subject
 * @returns {string[]} e.g. ['3D-118', '3D-120']; empty when the subject is not a WP merge
 */
export function mergedWps(subject) {
  const m = MERGE.exec(subject.trim());
  return m ? m[1].split(/[,+]/).map((s) => s.trim()) : [];
}

/** @param {string} cell WP cell of a ledger row @param {string} id @returns {boolean} */
export const rowNamesWp = (cell, id) => new RegExp(`(^|[^\\d.])${id}(?![\\d.])`).test(cell);

/**
 * Problems for the merged WPs `ids` in the ledger text.
 * @param {string} text LEDGER.md
 * @param {string[]} ids
 * @returns {string[]}
 */
export function ledgerProblems(text, ids) {
  const lines = section(text.split('\n'), '## Sessions').lines;
  const header = lines.find((l) => /^\|\s*date\s*\|/.test(l));
  if (!header) return ids.length ? [`${LEDGER}: no "## Sessions" table`] : [];
  const col = cells(header);
  const at = (/** @type {string} */ name) => col.indexOf(name);
  const rows = lines.filter((l) => /^\|\s*\d{4}-\d\d-\d\d\s*\|/.test(l)).map(cells);
  /** @type {string[]} */
  const problems = [];
  for (const id of ids) {
    const own = rows.filter((c) => c[at('kind')] === 'wp' && rowNamesWp(c[at('WP')] ?? '', id));
    if (own.length === 0) problems.push(`${LEDGER}: merged WP ${id} has no ledger row (merge-wp step 4a)`);
    for (const c of own) {
      const who = `${id} ${c[at('session')]}`;
      if (c[at('state')] !== 'final') problems.push(`${LEDGER}: row ${who} is "${c[at('state')]}", not final (merge-wp step 4a)`);
      const cost = c[at('cost_usd')] ?? '';
      if (!/^\d+(\.\d+)?$/.test(cost) && !NO_COST.test(c[at('source')] ?? '')) {
        problems.push(`${LEDGER}: row ${who} has cost_usd "${cost}" and no "no cost: <reason>" in source`);
      }
    }
  }
  return problems;
}

/**
 * Check the working tree's ledger against the HEAD commit subject (the merge-wp gate runs before the amend).
 * @param {string} root
 * @returns {string[]} problems; empty when HEAD is not a WP merge
 */
export function checkLedgerAtHead(root) {
  let subject = '';
  try {
    subject = execFileSync('git', ['log', '-1', '--format=%s'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return [];
  }
  const ids = mergedWps(subject);
  if (ids.length === 0) return [];
  const file = join(root, LEDGER);
  if (!existsSync(file)) return [`${LEDGER} missing; HEAD merges ${ids.join(', ')}`];
  return ledgerProblems(readFileSync(file, 'utf8'), ids);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const i = args.indexOf('--root');
  const root = resolve(i >= 0 ? args[i + 1] : join(dirname(fileURLToPath(import.meta.url)), '..'));
  const problems = checkLedgerAtHead(root);
  for (const p of problems) console.error(`ledger-check: ${p}`);
  if (problems.length) process.exit(1);
  console.log('ledger-check: ok');
}
