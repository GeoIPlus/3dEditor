// Tests for the backlog forecast (3D-86). The fixture's expected figures are computed by hand in the comments.
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseLedger, parseStatusTable, parseEstimates } from './budget-parse.mjs';
import { quantile, forecast, formatBlock } from './budget-calc.mjs';
import { budgetBlock, replaceBlock } from './budget.mjs';

const H = '| date | WP | session | kind | cost_usd | out_k | cache_write_k | cache_read_k | api_min | span_h | models | state | review | source |';
const L = (/** @type {string} */ d, /** @type {string} */ wp, /** @type {string} */ kind, /** @type {string} */ cost,
  /** @type {string} */ api, /** @type {string} */ span, review = '-') =>
  `| ${d} | ${wp} | s | ${kind} | ${cost} | ? | ? | ? | ${api} | ${span} | m | final | ${review} | x |`;

const LEDGER = ['# Session ledger', '', '## Sessions', '', H, '|---|', ...[
  L('2026-11-01', 'coord', 'coord', '100.00', '600', '50'), // outside the 14-day window
  L('2026-11-20', '3D-01', 'wp', '1.00', '6', '1'),
  L('2026-11-20', '3D-02', 'wp', '2.00', '6', '1'),
  L('2026-11-21', '3D-03', 'wp', '3.00', '12', '2', 'yes, $0.50'),
  L('2026-11-21', '3D-04', 'wp', '4.00', '?', '?'),
  L('2026-11-22', '3D-05', 'wp', '5.00', '30', '1'),
  L('2026-11-22', '3D-05', 'wp', '1.00', '0', '0.5'), // second session of 3D-05: actual 6
  L('2026-11-23', '3D-06', 'wp', '10.00', '60', '3'),
  L('2026-11-23', '3D-07', 'wp', '4.00', '24', '2'),
  L('2026-11-24', 'coord', 'coord', '2.00', '12', '10'),
  L('2026-11-24', 'evals', 'evals', '3.00', '?', '?'),
  L('2026-11-24', 'other', 'other', '50.00', '?', '?'), // not overhead
], '', '## Improvement proposals', ''].join('\n');

const R = (/** @type {string} */ id, /** @type {string} */ size, /** @type {string} */ type, /** @type {string} */ st) =>
  `| ${id} | t | here | m | - | G0 | ${size} | ${type} | ${st} |`;

const BACKLOG = ['# BACKLOG', '', '## Budget and forecast', '', 'text', '', '```', 'old block', '```', '',
  '## Work-package status', '', '| WP | Title | Repo | Modules | Depends on | Gate | Size | Type | Status |', '|---|',
  R('3D-01', 'S', 'spec', 'done (D-1)'), R('3D-02', 'S', 'spec', 'done'), R('3D-03', 'S', 'spec', 'done'),
  R('3D-04', 'S', 'spec', 'done'), R('3D-05', 'S', 'spec', 'done'), R('3D-06', 'M', 'kernel', 'done'),
  R('3D-07', 'M', 'kernel', 'in-progress (wp/x)'), R('3D-08', 'S', 'spec', 'proposed'), R('3D-09', 'M', 'kernel', 'ready'),
  R('3D-10', 'L', 'kernel', 'dropped (why)'), R('3D-11', 'S', 'tooling', 'review'),
  '', '## Details', '',
  '### 3D-01 One', '- Estimate: $1.50 (p80 $2), ~5 min model time; basis: all n=3',
  '### 3D-02 Two', '- Estimate: prior (no data) - all-WP median $4 (n=3)',
  '### 3D-07 Seven', '- Estimate: $5 (p80 $9)', '- Re-estimate 2026-11-23: $7 (p80 $12)',
  '### 3D-09 Nine', '- Estimate: prior (no data)',
  '### 3D-11 Eleven', '- Estimate: $2 (p80 $3)',
  '### 3D-12 .. 3D-13 Range', '- Estimate: $100 (p80 $200)', ''].join('\n');

// Row history (3D-89): backlog started 2026-10-01 (plan period over on 2026-10-15, before the window); 3D-01..3D-07
// first seen then, 3D-01 done 2026-10-05; 3D-08..3D-11 first seen and 3D-02..3D-06 done on 2026-11-20.
/** @param {string[]} ns @param {string} day @returns {[string, string][]} */
const dated = (ns, day) => ns.map((n) => [`3D-${n}`, day]);
/** @type {import('./budget-history.mjs').RowHistory} */
const HISTORY = {
  baseline: { sha: 'abc1234', date: '2026-10-01' },
  first: new Map([...dated(['01', '02', '03', '04', '05', '06', '07'], '2026-10-01'), ...dated(['08', '09', '10', '11'], '2026-11-20')]),
  done: new Map([...dated(['01'], '2026-10-05'), ...dated(['02', '03', '04', '05', '06'], '2026-11-20')]),
};

/*
 * Hand check (today 2026-11-25, window from 2026-11-11):
 * done actuals: 01=1, 02=2, 03=3, 04=4, 05=5+1=6, 06=10. Class S spec n=5: [1,2,3,4,6] p50=3, p80 at 3.2 -> 4+0.2*2=4.4.
 * Open rows (dropped excluded): 07 in-progress current 7/12 minus spent 4 -> 3/8; 08 S spec class -> 3/4.4;
 *   09 prior -> M kernel n=1, M n=1, all n=6 [1,2,3,4,6,10]: p50 at 2.5 -> 3.5, p80 at 4.0 -> 6; 11 own 2/3.
 *   Known = 3+3+3.5+2 = 11.5 / 8+4.4+6+3 = 21.4 over 4 rows.
 * k: wp cost in window 30, review 0.5 -> 29.5; overhead coord 2 + evals 3 + review 0.5 = 5.5; k = 1+5.5/29.5 = 1.18644.
 * g: added 08,09,10,11 = 4; finished 02..06 = 5; g = 0.8 -> x5. ETC = 11.5*1.18644*5 = 68.22 / 21.4*1.18644*5 = 126.95.
 * g window 2026-11-11..2026-11-25 (plan end 2026-10-15 is earlier). Throughput 5 rows x 7/14 = 2.5; model min
 *   6+6+12+30+0+60+24+12 = 150 in 14 d -> 75 per week.
 * Waiting: span 1+1+2+1+0.5+3+2+10 = 20.5; wait 0.9+0.9+1.8+0.5+0.5+2+1.6+9.8 = 18.0 -> 87.8 %.
 * Accuracy: 01 = 1/1.5 = 0.667, 02 = 2/4 = 0.5 -> median 0.583, n=2. Ledger WPs with cost: 01..07 = 7.
 */
const EXPECTED = [
  'Forecast 2026-11-25 (ledger n=7 WPs, classes with n>=5: S spec n=5; baseline abc1234 2026-10-01)',
  'Known remaining: $12 / $21 over 4 rows   Overhead k=1.19   Growth g=0.80 (4 added / 5 finished, 2026-11-11..2026-11-25)',
  'ETC: $68 / $127',
  'Throughput: 2.5 rows/week (14 d), 75 model min/week; waiting share 88 %   Accuracy: median ratio 0.58 (last 2, range 0.50..0.67)',
].join('\n');

const input = () => {
  const lines = BACKLOG.split('\n');
  return { today: '2026-11-25', ledger: parseLedger(LEDGER), rows: parseStatusTable(lines), estimates: parseEstimates(lines), history: HISTORY };
};

describe('budget forecast (3D-86)', () => {
  it('quantile interpolates linearly', () => {
    expect(quantile([1, 2, 3, 4, 6], 0.8)).toBeCloseTo(4.4, 10);
    expect(quantile([], 0.5)).toBeNull();
  });

  it('parses estimates: est0, prior, re-estimate, ranges ignored', () => {
    const e = parseEstimates(BACKLOG.split('\n'));
    expect(e.get('3D-01')).toEqual({ est0: { p50: 1.5, p80: 2 }, est0Prior: false, current: { p50: 1.5, p80: 2 } });
    expect(e.get('3D-02')).toEqual({ est0: { p50: 4, p80: null }, est0Prior: true, current: null });
    expect(e.get('3D-07')?.current).toEqual({ p50: 7, p80: 12 });
    expect(e.get('3D-09')).toEqual({ est0: null, est0Prior: true, current: null });
    expect(e.has('3D-12')).toBe(false);
  });

  it('reproduces the hand-checked fixture', () => {
    const f = forecast(input());
    expect(f.known.p50).toBeCloseTo(11.5, 10);
    expect(f.known.p80).toBeCloseTo(21.4, 10);
    expect(f.k).toBeCloseTo(1 + 5.5 / 29.5, 10);
    expect(f.g).toBeCloseTo(0.8, 10);
    expect(f.etc?.p50).toBeCloseTo(11.5 * (1 + 5.5 / 29.5) * 5, 8);
    expect(f.waitShare).toBeCloseTo(18 / 20.5, 10);
    expect(f.accuracy.median).toBeCloseTo((2 / 3 + 0.5) / 2, 10);
    expect(formatBlock(f)).toBe(EXPECTED);
  });

  it('reports a backlog that does not converge instead of an ETC', () => {
    const inp = input();
    inp.history = { ...HISTORY, done: new Map(dated(['01'], '2026-10-05')) }; // 02..06 done earlier: 0 finished
    inp.rows = inp.rows.map((r) => (['3D-02', '3D-03', '3D-04', '3D-05', '3D-06'].includes(r.id) ? { ...r, status: 'ready' } : r));
    const f = forecast(inp);
    expect(f.etc).toBeNull();
    expect(formatBlock(f)).toContain('ETC: not converging (g >= 1)');
  });

  it('does not measure g in the plan period and says so', () => {
    const inp = input();
    inp.history = { ...HISTORY, baseline: { sha: 'abc1234', date: '2026-11-19' } };
    const f = forecast(inp);
    expect(f.g).toBeNull();
    expect(f.etc).toBeNull();
    const b = formatBlock(f);
    expect(b).toContain('Growth g=TBD (plan period until 2026-12-03)');
    expect(b).toContain('ETC: TBD (g not measured before 2026-12-03); known x k = $14 / $25');
  });

  it('rewrites only the fenced block, idempotently', () => {
    const once = replaceBlock(BACKLOG, EXPECTED);
    expect(once).toContain('```\n' + EXPECTED + '\n```');
    expect(once).not.toContain('old block');
    expect(replaceBlock(once, EXPECTED)).toBe(once);
    expect(replaceBlock('# x\n', EXPECTED)).toBe('# x\n');
  });

  it('reads the files', () => {
    const root = mkdtempSync(join(tmpdir(), 'budget-'));
    mkdirSync(join(root, 'docs/metrics'), { recursive: true });
    writeFileSync(join(root, 'docs/metrics/LEDGER.md'), LEDGER);
    writeFileSync(join(root, 'docs/BACKLOG.md'), BACKLOG);
    expect(budgetBlock(root, '2026-11-25', HISTORY)).toBe(EXPECTED);
    expect(readFileSync(join(root, 'docs/BACKLOG.md'), 'utf8')).toBe(BACKLOG);
  });
});
