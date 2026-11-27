// Tests for the daily report from git (3D-137, D-475 part B). Expected values by hand; the last block reproduces the
// WP and decision lists of the owner's 2026-11-26 report from this repository's own history.
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { dayBounds, statusChanges, decisionsAdded, ledgerDay, flags, ownerActions } from './daily-report-lib.mjs';
import { dailyReport } from './daily-report.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(ROOT, 'tools/daily-report.mjs');

/** @param {[string, string][]} rows id, status */
const backlog = (rows) => ['# B', '', '## Work-package status', '', '| WP | Title | Repo | Status |', '|---|',
  ...rows.map(([id, st]) => `| ${id} | Title ${id} | here | ${st} |`), '', '## Details', ''].join('\n');
/** @param {string[]} ids */
const decisionsText = (ids) => ['# D', '', '## Decisions', '', '| Id | Decision | Source |', '|---|',
  ...ids.map((id) => `| ${id} | text of ${id} | owner |`), '', '## Open questions', '', '| Q-01 | q | x | y |', ''].join('\n');
const LH = '| date | WP | session | kind | cost_usd | out_k | cache_write_k | cache_read_k | ctx_k | api_min | span_h | models | state | review | source |';
/** @param {string[]} rows */
const ledger = (rows) => ['# L', '', '## Sessions', '', LH, '|---|', ...rows, '', '## Improvement proposals', '',
  '| 2026-11-26 | 3D-2, session_b | P1 x | y | open |', '| 2026-11-26 | 3D-2, session_b | P2 x | y | adopted (D-9) |', ''].join('\n');
/** @param {string} wp @param {string} s @param {string} kind @param {string} cost @param {string} cw @param {string} ctx @param {string} state */
const lrow = (wp, s, kind, cost, cw, ctx, state) =>
  `| 2026-11-26 | ${wp} | ${s} | ${kind} | ${cost} | 10.0 | ${cw} | 900 | ${ctx} | 5 | 1 | m | ${state} | - | src |`;

describe('dayBounds', () => {
  it('winter, summer and the DST change in Europe/Copenhagen', () => {
    expect(dayBounds('2026-11-26', 'Europe/Copenhagen')).toEqual({ start: '2026-11-25T23:00:00.000Z', end: '2026-11-26T23:00:00.000Z' });
    expect(dayBounds('2026-07-01', 'Europe/Copenhagen')).toEqual({ start: '2026-06-30T22:00:00.000Z', end: '2026-07-01T22:00:00.000Z' });
    expect(dayBounds('2026-03-29', 'Europe/Copenhagen')).toEqual({ start: '2026-03-28T23:00:00.000Z', end: '2026-03-29T22:00:00.000Z' });
    expect(dayBounds('2026-12-31', 'UTC')).toEqual({ start: '2026-12-31T00:00:00.000Z', end: '2027-01-01T00:00:00.000Z' });
  });
  it('rejects a bad date', () => expect(() => dayBounds('26.11.2026', 'UTC')).toThrow(/YYYY-MM-DD/));
});

describe('document diffs', () => {
  it('status changes, new rows included', () => {
    const c = statusChanges(backlog([['3D-1', 'ready'], ['3D-2', 'done (D-1)']]),
      backlog([['3D-1', 'done (D-5; merged)'], ['3D-2', 'done (D-1)'], ['3D-3', 'proposed (D-6)']]));
    expect(c.map((x) => [x.id, x.from, x.to])).toEqual([['3D-1', 'ready', 'done'], ['3D-3', null, 'proposed']]);
  });
  it('decisions added', () => {
    expect(decisionsAdded(decisionsText(['D-1']), decisionsText(['D-1', 'D-2', 'D-3D7-1'])).map((d) => d.id)).toEqual(['D-2', 'D-3D7-1']);
  });
  it('ledger rows finalized, totals, flags, rows not final', () => {
    const before = ledger([lrow('3D-1', 'session_a', 'wp', '?', '?', '?', 'as of -')]);
    const after = ledger([lrow('3D-1', 'session_a', 'wp', '4.00', '600', '260', 'final'),
      lrow('coord', 'session_c', 'coord', '9.50', '100', '120', 'final'), lrow('3D-2', 'session_b', 'wp', '?', '?', '?', 'as of -')]);
    const d = ledgerDay(before, after);
    expect(d.finalized.map((r) => r.wp)).toEqual(['3D-1', 'coord']);
    expect(flags(d.finalized[0])).toEqual(['ctx>250k', 'cache-write>2x ctx']);
    expect(flags(d.finalized[1])).toEqual([]);
    expect(d.totals.get('wp')).toEqual({ n: 1, cost: 4, unknown: 0, out: 10 });
    expect(d.totals.get('coord')?.cost).toBe(9.5);
    expect(d.notFinal.map((r) => r.wp)).toEqual(['3D-2']);
    expect(ledgerDay(after, after).finalized).toEqual([]);
  });
  it('owner actions', () => {
    const a = ownerActions(backlog([['3D-1', 'review (local)'], ['3D-2', 'proposed'], ['3D-3', 'blocked (Q-1)']]), ledger([]));
    expect(a).toEqual({ review: ['3D-1'], blocked: ['3D-3'], proposed: ['3D-2'], proposals: 1 });
  });
});

describe('dailyReport on a dated repository', () => {
  const root = mkdtempSync(join(tmpdir(), 'daily-report-'));
  const git = (/** @type {string[]} */ a, /** @type {string} */ at = '2026-11-20T12:00:00Z') => execFileSync('git', a,
    { cwd: root, stdio: 'pipe', env: { ...process.env, GIT_AUTHOR_DATE: at, GIT_COMMITTER_DATE: at } });
  /** @param {string} at @param {[string, string][]} rows @param {string[]} ids @param {string[]} lrows */
  const commit = (at, rows, ids, lrows) => {
    mkdirSync(join(root, 'docs/decisions'), { recursive: true });
    mkdirSync(join(root, 'docs/metrics'), { recursive: true });
    writeFileSync(join(root, 'docs/BACKLOG.md'), backlog(rows));
    writeFileSync(join(root, 'docs/decisions/DECISIONS.md'), decisionsText(ids));
    writeFileSync(join(root, 'docs/metrics/LEDGER.md'), ledger(lrows));
    git(['add', '.'], at);
    git(['commit', '-q', '-m', at], at);
  };
  git(['init', '-q', '-b', 'main']);
  git(['config', 'user.email', 't@example.com']);
  git(['config', 'user.name', 't']);
  const open = lrow('3D-1', 'session_a', 'wp', '?', '?', '?', 'as of -');
  const fin = lrow('3D-1', 'session_a', 'wp', '4.00', '600', '260', 'final');
  // 23:30 Z on the 25th is 00:30 in Copenhagen on the 26th (inside the day); 23:30 Z on the 26th is outside.
  commit('2026-11-25T22:30:00Z', [['3D-1', 'in-progress'], ['3D-2', 'ready']], ['D-1'], [open]);
  commit('2026-11-25T23:30:00Z', [['3D-1', 'review'], ['3D-2', 'ready']], ['D-1', 'D-2'], [open]);
  commit('2026-11-26T22:30:00Z', [['3D-1', 'done (D-3)'], ['3D-2', 'ready']], ['D-1', 'D-2', 'D-3'], [fin]);
  commit('2026-11-26T23:30:00Z', [['3D-1', 'done (D-3)'], ['3D-2', 'done (D-4)']], ['D-1', 'D-2', 'D-3', 'D-4'], [fin]);

  it('reports only the Copenhagen day', () => {
    const r = dailyReport({ root, date: '2026-11-26', tz: 'Europe/Copenhagen', ref: 'main' });
    expect(r).toMatch(/commits: 2 first-parent, 2 in all/);
    expect(r).toMatch(/- done \(1\): 3D-1\n/);
    expect(r).toMatch(/3D-1 Title 3D-1 \[in-progress -> done\]/);
    expect(r).not.toMatch(/3D-2 Title/);
    expect(r).toMatch(/## Decisions added \(2: D-2 \.\. D-3\)/);
    expect(r).toMatch(/\| 3D-1 \| session_a \| wp \| 4\.00 \| .* \| ctx>250k, cache-write>2x ctx \|/);
    expect(r).toMatch(/- wp: \$4\.00 over 1 session\(s\)/);
    expect(r).toMatch(/WPs done on 2026-11-26 without a final ledger row \(0\): none/);
  });
  it('CLI prints the report and needs --date', () => {
    const ok = spawnSync('node', [SCRIPT, '--date', '2026-11-27', '--root', root, '--ref', 'main'], { encoding: 'utf8' });
    expect(ok.status).toBe(0);
    expect(ok.stdout).toMatch(/- done \(1\): 3D-2/);
    expect(spawnSync('node', [SCRIPT, '--root', root]).status).toBe(2);
  });
});

// The owner's report for 2026-11-26 (scheduled task run 2026-11-27T06:46Z, read by 3D-137): 24 rows done (it also named
// 3D-124 with the remark that its merge came after midnight: committed 2026-11-26T23:56Z = 00:56 in Copenhagen),
// in progress at the end 3D-124 and 3D-128, ready 3D-41/43/50/127/129, ten new proposed rows, decisions D-273..D-428.
const END = 'af0ce7d7a4cbe93e33dd29ca45c4e47e1af68754';
const has = spawnSync('git', ['cat-file', '-e', `${END}^{commit}`], { cwd: ROOT }).status === 0
  && execFileSync('git', ['rev-parse', '--is-shallow-repository'], { cwd: ROOT, encoding: 'utf8' }).trim() === 'false';
describe.skipIf(!has)('reproduces the 2026-11-26 report from git', () => {
  it('WP and decision lists', () => {
    const r = dailyReport({ root: ROOT, date: '2026-11-26', tz: 'Europe/Copenhagen', ref: END });
    expect(r).toMatch(/- done \(24\): 3D-15, 3D-17, 3D-18, 3D-19, 3D-23, 3D-45, 3D-71, 3D-82, 3D-83, 3D-102, 3D-103, 3D-104, 3D-105, 3D-109, 3D-110, 3D-114, 3D-115, 3D-116, 3D-117, 3D-118, 3D-119, 3D-120, 3D-121, 3D-126\n/);
    expect(r).toMatch(/- in-progress \(2\): 3D-124, 3D-128\n/);
    expect(r).toMatch(/- ready \(5\): 3D-41, 3D-43, 3D-50, 3D-127, 3D-129\n/);
    expect(r).toMatch(/- proposed \(10\): 3D-106, 3D-107, 3D-108, 3D-111, 3D-112, 3D-113, 3D-122, 3D-123, 3D-125, 3D-130\n/);
    expect(r).toMatch(/## Decisions added \(156: D-273 \.\. D-428\)/);
    expect(r).toMatch(/proposed rows to decide \(23\)/);
  });
});
