// Tests for the ledger check at merge (3D-137, D-475 part A). A planted missing or non-final row must fail.
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { mergedWps, rowNamesWp, ledgerProblems, checkLedgerAtHead } from './ledger-check.mjs';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'ledger-check.mjs');
const HEAD = '| date | WP | session | kind | cost_usd | out_k | cache_write_k | cache_read_k | ctx_k | api_min | span_h | models | state | review | source |';
/** @param {string[]} rows @returns {string} */
const ledger = (rows) => ['# Session ledger', '', '## Sessions', '', HEAD, '|---|', ...rows, '', '## Improvement proposals', '',
  '| 2026-11-27 | 3D-50 | session_x | wp | ? | ? | ? | ? | ? | ? | ? | m | as of - | - | misplaced, outside Sessions |', ''].join('\n');
/** @param {string} wp @param {string} cost @param {string} state @param {string} [source] */
const row = (wp, cost, state, source = 'newest result event') =>
  `| 2026-11-27 | ${wp} | session_a | wp | ${cost} | 1.0 | 2.0 | 3.0 | 90 | 4.0 | 0.5 | m | ${state} | - | ${source} |`;

describe('mergedWps', () => {
  it('reads coordinator merge subjects', () => {
    expect(mergedWps('3D-133: merge wp/3d-133-service-import into claude/keen-pascal-u7z2gk (D-472)')).toEqual(['3D-133']);
    expect(mergedWps('3D-118, 3D-120: merge wp/3d-118-120-bugs (D-1)')).toEqual(['3D-118', '3D-120']);
  });
  it('ignores base-into-WP merges and other commits', () => {
    expect(mergedWps('3D-74: merge claude/keen-pascal-u7z2gk (base side of generated BACKLOG parts, --fix)')).toEqual([]);
    expect(mergedWps('3D-118, 3D-120: merge docs follow-up wp/3d-118-120-bugs@62af750 (D-375)')).toEqual([]);
    expect(mergedWps('Start 3D-129 in shared_compnents (D-434)')).toEqual([]);
  });
});

describe('rowNamesWp', () => {
  it('matches whole ids only', () => {
    expect(rowNamesWp('3D-118+3D-120', '3D-120')).toBe(true);
    expect(rowNamesWp('3D-133', '3D-13')).toBe(false);
    expect(rowNamesWp('3D-114.1', '3D-114')).toBe(false);
  });
});

describe('ledgerProblems', () => {
  it('passes a final row with a numeric cost', () => {
    expect(ledgerProblems(ledger([row('3D-50', '4.20', 'final')]), ['3D-50'])).toEqual([]);
  });
  it('passes a final row whose source names the missing cost', () => {
    expect(ledgerProblems(ledger([row('3D-50', '?', 'final', 'no cost: session deleted before merge')]), ['3D-50'])).toEqual([]);
  });
  it('fails a planted missing row (a row outside "## Sessions" does not count)', () => {
    const p = ledgerProblems(ledger([row('3D-51', '1.00', 'final')]), ['3D-50']);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/3D-50 has no ledger row/);
  });
  it('fails an `as of` row and an unexplained `?` cost', () => {
    const p = ledgerProblems(ledger([row('3D-50', '?', 'as of -')]), ['3D-50']);
    expect(p).toHaveLength(2);
    expect(p.join('\n')).toMatch(/not final/);
    expect(p.join('\n')).toMatch(/no cost: <reason>/);
  });
  it('requires every session row of the WP to be final (handoff)', () => {
    const p = ledgerProblems(ledger([row('3D-50', '1.00', 'final'), row('3D-50', '2.00', 'as of 2026-11-27')]), ['3D-50']);
    expect(p).toHaveLength(1);
  });
});

/** @param {string} text ledger @param {string} subject @returns {string} repo root */
function repo(text, subject) {
  const root = mkdtempSync(join(tmpdir(), 'ledger-check-'));
  const git = (/** @type {string[]} */ a) => execFileSync('git', a, { cwd: root, stdio: 'pipe' });
  git(['init', '-q']);
  git(['config', 'user.email', 't@example.com']);
  git(['config', 'user.name', 't']);
  mkdirSync(join(root, 'docs/metrics'), { recursive: true });
  writeFileSync(join(root, 'docs/metrics/LEDGER.md'), text);
  git(['add', '.']);
  git(['commit', '-q', '-m', subject]);
  return root;
}

describe('checkLedgerAtHead and CLI', () => {
  it('fails a WP merge commit whose ledger lacks the row (exit 1)', () => {
    const root = repo(ledger([row('3D-49', '1.00', 'final')]), '3D-50: merge wp/3d-50-x into base (D-9)');
    expect(checkLedgerAtHead(root)).toHaveLength(1);
    const r = spawnSync('node', [SCRIPT, '--root', root], { encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/3D-50 has no ledger row/);
  });
  it('passes the same ledger when HEAD is not a WP merge', () => {
    const root = repo(ledger([]), '3D-50 in progress (D-9)');
    expect(checkLedgerAtHead(root)).toEqual([]);
    expect(spawnSync('node', [SCRIPT, '--root', root]).status).toBe(0);
  });
  it('passes a WP merge commit with a final row', () => {
    const root = repo(ledger([row('3D-50', '3.10', 'final')]), '3D-50: merge wp/3d-50-x into base (D-9)');
    expect(spawnSync('node', [SCRIPT, '--root', root]).status).toBe(0);
  });
});
