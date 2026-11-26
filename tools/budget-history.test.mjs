// Tests for the growth g row history (3D-89, D-250) on a git repository with dated commits. Expected figures by hand.
import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { rowHistory } from './budget-history.mjs';
import { budgetBlock } from './budget.mjs';
import { forecast } from './budget-calc.mjs';
import { parseLedger, parseStatusTable, parseEstimates } from './budget-parse.mjs';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'budget.mjs');
const LEDGER = '# Session ledger\n\n## Sessions\n\n| date | WP | session | kind | cost_usd | out_k | cache_write_k | cache_read_k | api_min | span_h | models | state | review | source |\n|---|\n';

/** @param {[string, string][]} rows id, status @returns {string} BACKLOG text */
const backlog = (rows) => ['# BACKLOG', '', '## Budget and forecast', '', '```', 'x', '```', '', '## Work-package status', '',
  '| WP | Title | Repo | Modules | Depends on | Gate | Size | Type | Status |', '|---|',
  ...rows.map(([id, st]) => `| ${id} | t | here | m | - | G0 | S | spec | ${st} |`), ''].join('\n');

/*
 * History (today 2026-11-25; 14-day window from 2026-11-11; baseline C0 2026-11-01, plan period until 2026-11-15):
 *   C0 11-01 A, B added (baseline)              C1 11-10 C added, B done (before the window)
 *   C2 11-13 D added, A done (in the 14 d window, but plan period)
 *   side branch from C2: S1 11-14 G added (plan period); S2 11-16 E added; S3 11-18 E done
 *   main M1 11-17 F added, C done;  merge MG 11-20 of the side branch (all rows; G and E appear here again)
 *   M2 11-22 D done
 * g window 11-15..11-25: added E (11-16), F (11-17) = 2 - not D (11-13), not G (11-14 on the side branch, though the
 *   merge is 11-20), E once; finished C (11-17), E (11-18), D (11-22) = 3 - not A (11-13), not B. g = 2/3.
 * Throughput window 11-11..11-25: done A, C, E, D = 4 rows in 14 d -> 2.0 rows/week.
 */
const DAY = { C0: '2026-11-01', C1: '2026-11-10', C2: '2026-11-13', S1: '2026-11-14', S2: '2026-11-16', S3: '2026-11-18',
  M1: '2026-11-17', MG: '2026-11-20', M2: '2026-11-22' };

/** @returns {string} a fresh repository with the history above */
function makeRepo() {
  const root = mkdtempSync(join(tmpdir(), 'budget-hist-'));
  const git = (/** @type {string[]} */ a, /** @type {string} */ day = DAY.C0) => execFileSync('git', a, {
    cwd: root, stdio: 'pipe',
    env: { ...process.env, GIT_AUTHOR_DATE: `${day}T12:00:00Z`, GIT_COMMITTER_DATE: `${day}T12:00:00Z`,
      GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' },
  });
  const commit = (/** @type {keyof DAY} */ c, /** @type {[string, string][]} */ rows) => {
    writeFileSync(join(root, 'docs/BACKLOG.md'), backlog(rows));
    git(['add', '-A'], DAY[c]);
    git(['commit', '-qm', c], DAY[c]);
  };
  git(['init', '-q', '-b', 'main']);
  mkdirSync(join(root, 'docs/metrics'), { recursive: true });
  writeFileSync(join(root, 'docs/metrics/LEDGER.md'), LEDGER);
  commit('C0', [['3D-01', 'ready'], ['3D-02', 'ready']]); // A=01 B=02
  commit('C1', [['3D-01', 'ready'], ['3D-02', 'done'], ['3D-03', 'ready']]); // C=03
  commit('C2', [['3D-01', 'done'], ['3D-02', 'done'], ['3D-03', 'ready'], ['3D-04', 'ready']]); // D=04
  git(['checkout', '-qb', 'side']);
  commit('S1', [['3D-01', 'done'], ['3D-02', 'done'], ['3D-03', 'ready'], ['3D-04', 'ready'], ['3D-07', 'ready']]); // G=07
  commit('S2', [['3D-01', 'done'], ['3D-02', 'done'], ['3D-03', 'ready'], ['3D-04', 'ready'], ['3D-05', 'ready'], ['3D-07', 'ready']]); // E=05
  commit('S3', [['3D-01', 'done'], ['3D-02', 'done'], ['3D-03', 'ready'], ['3D-04', 'ready'], ['3D-05', 'done'], ['3D-07', 'ready']]);
  git(['checkout', '-q', 'main']);
  commit('M1', [['3D-01', 'done'], ['3D-02', 'done'], ['3D-03', 'done'], ['3D-04', 'ready'], ['3D-06', 'ready']]); // F=06
  git(['merge', '-q', '--no-commit', '-s', 'ours', 'side'], DAY.MG);
  const merged = /** @type {[string, string][]} */ ([['3D-01', 'done'], ['3D-02', 'done'], ['3D-03', 'done'], ['3D-04', 'ready'],
    ['3D-05', 'done'], ['3D-06', 'ready'], ['3D-07', 'ready']]);
  commit('MG', merged);
  commit('M2', merged.map(([id, st]) => [id, id === '3D-04' ? 'done' : st]));
  return root;
}

describe('growth g from per-row first appearance (3D-89)', () => {
  /** @type {string} */
  let root;
  beforeAll(() => { root = makeRepo(); });

  it('dates rows by their earliest commit, side branches included', () => {
    const h = rowHistory(root);
    expect(h?.baseline.date).toBe('2026-11-01');
    expect(h?.baseline.sha).toMatch(/^[0-9a-f]{7}$/);
    expect(Object.fromEntries(h?.first ?? [])).toEqual({ '3D-01': DAY.C0, '3D-02': DAY.C0, '3D-03': DAY.C1, '3D-04': DAY.C2,
      '3D-05': DAY.S2, '3D-06': DAY.M1, '3D-07': DAY.S1 });
    expect(Object.fromEntries(h?.done ?? [])).toEqual({ '3D-01': DAY.C2, '3D-02': DAY.C1, '3D-03': DAY.M1, '3D-04': DAY.M2,
      '3D-05': DAY.S3 });
  });

  it('reproduces the hand-checked added / finished / g', () => {
    const lines = execFileSync('git', ['show', 'HEAD:docs/BACKLOG.md'], { cwd: root, encoding: 'utf8' }).split('\n');
    const f = forecast({ today: '2026-11-25', ledger: parseLedger(LEDGER), rows: parseStatusTable(lines),
      estimates: parseEstimates(lines), history: rowHistory(root) });
    expect([f.added, f.finished]).toEqual([2, 3]);
    expect(f.g).toBeCloseTo(2 / 3, 10);
    expect(f.gWindow).toEqual({ from: '2026-11-15', to: '2026-11-25' });
    expect(f.perWeek.rows).toBeCloseTo(2, 10);
    const block = budgetBlock(root, '2026-11-25');
    expect(block).toContain(`baseline ${f.baseline.sha} 2026-11-01`);
    expect(block).toContain('Growth g=0.67 (2 added / 3 finished, 2026-11-15..2026-11-25)');
  });

  it('gives the same block on another full clone', () => {
    const other = mkdtempSync(join(tmpdir(), 'budget-full-'));
    execFileSync('git', ['clone', '-q', '--no-local', root, other], { stdio: 'pipe' });
    expect(budgetBlock(other, '2026-11-25')).toBe(budgetBlock(root, '2026-11-25'));
  });

  it('refuses a shallow clone with a message', () => {
    const shallow = mkdtempSync(join(tmpdir(), 'budget-shallow-'));
    execFileSync('git', ['clone', '-q', '--depth', '1', `file://${root}`, shallow], { stdio: 'pipe' });
    const r = spawnSync(process.execPath, [SCRIPT, '--root', shallow, '--today', '2026-11-25'], { encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('shallow clone');
    expect(r.stdout).toBe('');
  });
});
