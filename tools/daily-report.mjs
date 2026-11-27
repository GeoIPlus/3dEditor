#!/usr/bin/env node
// Daily report from git only (3D-137, D-475 part B): for one calendar day in a time zone, compares the base branch's
// documents at the last first-parent commit before the day's start and before its end. Prints WPs that changed status
// (BACKLOG), decisions added (DECISIONS), open owner actions, ledger rows finalized that day with flags, totals by kind
// and sessions without a final row. Cost is per session at its finish (as tools/budget.mjs). Exits 1 on a shallow clone.
// Usage: node tools/daily-report.mjs --date YYYY-MM-DD [--tz Europe/Copenhagen] [--ref <branch>] [--root <dir>]
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE_BRANCH } from './base-branch.mjs';
import { rowNamesWp } from './ledger-check.mjs';
import { dayBounds, statusChanges, decisionsAdded, ownerActions, ledgerDay, flags, clip } from './daily-report-lib.mjs';

const DOCS = { backlog: 'docs/BACKLOG.md', decisions: 'docs/decisions/DECISIONS.md', ledger: 'docs/metrics/LEDGER.md' };
const ORDER = ['done', 'review', 'in-progress', 'ready', 'blocked', 'proposed', 'superseded', 'dropped'];

/** @param {string} root @param {string[]} args @returns {string} */
const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

/** @param {string} root @returns {string} the base branch ref to read: origin/<base>, <base>, else HEAD */
function defaultRef(root) {
  for (const ref of [`origin/${BASE_BRANCH}`, BASE_BRANCH]) {
    try {
      git(root, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
      return ref;
    } catch { /* next */ }
  }
  return 'HEAD';
}

/** @param {string} root @param {string} ref @param {string} iso @returns {string} commit or '' */
const lastBefore = (root, ref, iso) => git(root, ['rev-list', '-1', '--first-parent', `--before=${iso}`, ref]).trim();

/** @param {string} root @param {string} commit @param {string} path @returns {string} file text, '' when absent */
function show(root, commit, path) {
  if (!commit) return '';
  try {
    return git(root, ['show', `${commit}:${path}`]);
  } catch {
    return '';
  }
}

/** @param {number|null} v @param {number} [d] @returns {string} */
const fmt = (v, d = 1) => (v === null ? '?' : v.toFixed(d));

/**
 * The report text.
 * @param {{root: string, date: string, tz: string, ref?: string}} o
 * @returns {string}
 * @throws {Error} on a shallow clone or a bad date
 */
export function dailyReport({ root, date, tz, ref }) {
  if (git(root, ['rev-parse', '--is-shallow-repository']).trim() === 'true') {
    throw new Error('daily-report: shallow clone; run `git fetch --unshallow` first');
  }
  const r = ref ?? defaultRef(root);
  const { start, end } = dayBounds(date, tz);
  const c0 = lastBefore(root, r, start);
  const c1 = lastBefore(root, r, end);
  const doc = (/** @type {string} */ c, /** @type {keyof typeof DOCS} */ k) => show(root, c, DOCS[k]);
  const count = (/** @type {string[]} */ extra) => (c1 && c0 !== c1
    ? git(root, ['rev-list', '--count', ...extra, c0 ? `${c0}..${c1}` : c1]).trim() : '0');
  const out = [`Daily report ${date} (${tz}: ${start} .. ${end})`,
    `Ref ${r}: ${c0.slice(0, 7) || '(none)'} -> ${c1.slice(0, 7) || '(none)'}; commits: ${count(['--first-parent'])} first-parent, ${count([])} in all`];

  const idNum = (/** @type {string} */ id) => Number(id.slice(3));
  const changes = statusChanges(doc(c0, 'backlog'), doc(c1, 'backlog')).sort((a, b) => idNum(a.id) - idNum(b.id));
  out.push('', `## WP status changes (${changes.length})`);
  const groups = [...new Set([...ORDER, ...changes.map((c) => c.to)])];
  for (const to of groups) {
    const g = changes.filter((c) => c.to === to);
    if (g.length === 0) continue;
    out.push(`- ${to} (${g.length}): ${g.map((c) => c.id).join(', ')}`);
    for (const c of g) out.push(`  - ${c.id} ${clip(c.title, 70)} [${c.from ?? 'new'} -> ${c.to}]`);
  }

  const added = decisionsAdded(doc(c0, 'decisions'), doc(c1, 'decisions'));
  out.push('', `## Decisions added (${added.length}${added.length ? `: ${added[0].id} .. ${added.at(-1)?.id}` : ''})`);
  for (const d of added) out.push(`- ${d.id} ${clip(d.text.replace(/\s+/g, ' '), 140)}`);

  const backlog1 = doc(c1, 'backlog');
  const ledger1 = doc(c1, 'ledger');
  const act = ownerActions(backlog1, ledger1);
  out.push('', '## Open owner actions (end of day)',
    `- accept or return (review): ${act.review.join(', ') || 'none'}`,
    `- blocked: ${act.blocked.join(', ') || 'none'}`,
    `- proposed rows to decide (${act.proposed.length}): ${act.proposed.join(', ') || 'none'}`,
    `- open improvement proposals in LEDGER.md: ${act.proposals}`);

  const day = ledgerDay(doc(c0, 'ledger'), ledger1);
  out.push('', `## Ledger rows finalized (${day.finalized.length})`);
  if (day.finalized.length) {
    out.push('| WP | session | kind | cost_usd | out_k | cache_write_k | cache_read_k | ctx_k | flags |', '|---|---|---|---:|---:|---:|---:|---:|---|');
    for (const x of day.finalized) {
      out.push(`| ${x.wp} | ${x.session} | ${x.kind} | ${fmt(x.cost, 2)} | ${fmt(x.out)} | ${fmt(x.cw)} | ${fmt(x.cr)} | ${fmt(x.ctx)} | ${flags(x).join(', ') || '-'} |`);
    }
  }
  out.push('', '## Totals by kind (finalized rows)');
  if (day.totals.size === 0) out.push('- none');
  for (const [kind, t] of day.totals) {
    out.push(`- ${kind}: $${t.cost.toFixed(2)} over ${t.n} session(s)${t.unknown ? ` (${t.unknown} without cost)` : ''}, out ${t.out.toFixed(1)}k`);
  }

  const doneToday = changes.filter((c) => c.to === 'done').map((c) => c.id);
  const finalIds = day.finalized.concat(day.notFinal).filter((x) => x.kind === 'wp' && x.state === 'final');
  const allFinal = new Set(doneToday.filter((id) => finalIds.some((x) => rowNamesWp(x.wp, id))));
  const noRow = doneToday.filter((id) => !allFinal.has(id));
  out.push('', `## Sessions without a final row (${day.notFinal.length})`);
  for (const x of day.notFinal) out.push(`- ${x.wp} ${x.session} (${x.kind}, state "${x.state}")`);
  out.push(`- WPs done on ${date} without a final ledger row (${noRow.length}): ${noRow.join(', ') || 'none'}`);
  out.push('Sessions absent from the ledger are not visible in git; compare list_sessions with this list.');
  return out.join('\n');
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const opt = (/** @type {string} */ n) => (args.indexOf(n) >= 0 ? args[args.indexOf(n) + 1] : undefined);
  const date = opt('--date');
  if (!date) {
    console.error('usage: node tools/daily-report.mjs --date YYYY-MM-DD [--tz Europe/Copenhagen] [--ref <branch>]');
    process.exit(2);
  }
  try {
    console.log(dailyReport({ root: resolve(opt('--root') ?? join(dirname(fileURLToPath(import.meta.url)), '..')),
      date, tz: opt('--tz') ?? 'Europe/Copenhagen', ref: opt('--ref') }));
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}
