// Tests for owner questions (3D-138): RISKS.md and checkpoint parsers, QUESTIONS.md build, check-docs rules.
// Run: node --test tools/questions.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseRisks, parseOpenQuestions } from './questions-parse.mjs';
import { buildQuestions } from './questions.mjs';
import { checkQuestions } from './check-docs-questions.mjs';

const HEAD = '| Risk | WP | Decision | Date | Options | Chosen and why | Review |\n|---|---|---|---|---|---|---|\n';
const REV = '## Reviews\n\n| Risk | Date | Status | Decision | By |\n|---|---|---|---|---|\n';
const row = (/** @type {string} */ id, wp = '3D-7', d = 'D-3D7-1', review = 'provisional') =>
  `| ${id} | ${wp} | ${d} | 2026-11-27 | (a) x; (b) y | (b) y | ${review} |\n`;
const risks = (/** @type {string} */ rows, reviews = '') => `# R\n\n## Register\n\n${HEAD}${rows}\n${REV}${reviews}`;
const cp = (/** @type {string} */ lines) => `# cp\n\n## Open questions\n<!-- form\n- blocking: x | since: 2026-01-01 -->\n${lines}\n## Log\n`;

test('valid register and review parse without problems', () => {
  const r = parseRisks(risks(row('R-7-1') + row('R-7-2', '3D-7', 'D-12'), '| R-7-1 | 2026-11-28 | confirmed | D-480 | Owner, dialog |\n'));
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.risks.map((x) => x.id), ['R-7-1', 'R-7-2']);
  assert.equal(r.reviews[0].status, 'confirmed');
});

test('register faults: id form, WP mismatch, duplicate, decision, review not provisional', () => {
  const p = parseRisks(risks(row('R7-1') + row('R-8-1') + row('R-7-1') + row('R-7-1', '3D-7', 'X-1', 'confirmed'))).problems;
  assert.ok(p.some((x) => /risk id "R7-1" is not R-<wp>-<n>/.test(x)), p.join('\n'));
  assert.ok(p.some((x) => /R-8-1 belongs to 3D-8, row says "3D-7"/.test(x)));
  assert.ok(p.some((x) => /duplicate risk R-7-1/.test(x)));
  assert.ok(p.some((x) => /decision "X-1" is not/.test(x)));
  assert.ok(p.some((x) => /review is "confirmed"/.test(x)));
});

test('review of an unknown risk and a bad status fail', () => {
  const p = parseRisks(risks(row('R-7-1'), '| R-9-1 | 2026-11-28 | maybe | D-480 | Owner |\n')).problems;
  assert.ok(p.some((x) => /unknown risk "R-9-1"/.test(x)), p.join('\n'));
  assert.ok(p.some((x) => /review status "maybe"/.test(x)));
});

test('checkpoint open questions: valid lines, multi-line comment skipped, bad line reported', () => {
  const ok = parseOpenQuestions(cp('- blocking: which CRS? | since: 2026-11-27\n- provisional D-3D7-1 (R-7-1): took (b) | since: 2026-11-27\n'), 'c.md');
  assert.deepEqual(ok.problems, []);
  assert.deepEqual(ok.items.map((x) => [x.kind, x.risk]), [['blocking', ''], ['provisional', 'R-7-1']]);
  assert.equal(parseOpenQuestions(cp('- none\n'), 'c.md').items.length, 0);
  assert.match(parseOpenQuestions(cp('- provisional: took (b) | since: 2026-11-27\n'), 'c.md').problems[0], /needs "D-\.\. \(R-\.\.\)"/);
  assert.match(parseOpenQuestions(cp('- ask later about CRS\n'), 'c.md').problems[0], /c\.md:\d+: open-question line not in the form/);
  assert.equal(parseOpenQuestions('# no section\n', 'c.md').items.length, 0);
});

test('QUESTIONS.md: blocking from checkpoints, unreviewed risks, branch checkpoint replaces working tree', () => {
  const wt = { wp: '', source: 'working tree', risks: risks(row('R-7-1') + row('R-7-2'), '| R-7-2 | 2026-11-28 | overridden | D-481 | Owner |\n'),
    checkpoints: new Map([['3D-7', cp('- blocking: old | since: 2026-11-26\n')]]) };
  const br = { wp: '3D-9', source: 'wp/3d-9-x', risks: risks(row('R-9-1', '3D-9', 'D-3D9-1') + row('R-7-1', '3D-7', 'D-3D7-9')),
    checkpoints: new Map([['3D-7', cp('- blocking: new | since: 2026-11-27\n')]]) };
  const { text, problems } = buildQuestions([wt, br]);
  assert.deepEqual(problems, []);
  assert.match(text, /\| 3D-7 \| new \| 2026-11-27 \| wp\/3d-9-x \|/);
  assert.doesNotMatch(text, /\| old \|/);
  assert.match(text, /\| R-7-1 \| 3D-7 \| D-3D7-1 \|.*\| working tree \|/, 'working tree wins for the same risk id');
  assert.match(text, /\| R-9-1 \| 3D-9 \| D-3D9-1 \|/);
  assert.doesNotMatch(text, /R-7-2/, 'reviewed risk is not listed');
  assert.equal(buildQuestions([wt, br]).text, text, 'deterministic');
});

test('QUESTIONS.md: empty sources give "none" rows', () => {
  const { text } = buildQuestions([{ wp: '', source: 'working tree', risks: '', checkpoints: new Map() }]);
  assert.equal((text.match(/^\| none \|/gm) ?? []).length, 2);
});

test('check-docs rule: provisional line must name a risk that RISKS.md has', () => {
  const root = mkdtempSync(join(tmpdir(), 'questions-'));
  try {
    mkdirSync(join(root, 'docs/decisions'), { recursive: true });
    mkdirSync(join(root, '.agent/checkpoints'), { recursive: true });
    writeFileSync(join(root, 'docs/decisions/RISKS.md'), risks(row('R-7-1')));
    writeFileSync(join(root, '.agent/checkpoints/3D-7.md'), cp('- provisional D-3D7-1 (R-7-1): b | since: 2026-11-27\n'));
    assert.deepEqual(checkQuestions(root), []);
    writeFileSync(join(root, '.agent/checkpoints/3D-7.md'), cp('- provisional D-3D7-2 (R-7-2): b | since: 2026-11-27\n'));
    const p = checkQuestions(root);
    assert.equal(p.length, 1, p.join('\n'));
    assert.match(p[0], /3D-7\.md:\d+: R-7-2 is not in docs\/decisions\/RISKS\.md/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
