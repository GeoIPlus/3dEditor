// Planted-fault tests for docs/coordination shapes (3D-136). Run: node --test tools/check-docs-coordination.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run, expectOne } from './check-docs-fixture.mjs';

const HANDOVER = `# Coordinator handover 2026-11-27-1
From: session_01ABC  Base: claude/keen-pascal-u7z2gk@f20c54a

## Running WPs
| WP | session | branch | state |
|---|---|---|---|
| 3D-02 | session_01DEF | wp/3d-02-second | working |

## Merges pending
- none

## Owner actions and questions open
- none

## Ids
Last decision: D-02. Next free: D-03, Q-02, row 3D-04, ADR 3D-ADR-0002.

## Do not repeat
- none
`;
const HISTORY = `# History 2026-11

- 2026-11-27 merge D-02 3D-01: 3D-01 accepted; merged into the base
- 2026-11-26 decision D-01: recorded after the merge line, dated earlier
- 2026-11-27 rotation session_01GHI: coordinator moved
`;
const H = 'docs/coordination/handover-2026-11-27-1.md';
const Y = 'docs/coordination/history/2026-11.md';
const with_ = (/** @type {Record<string, string>} */ add) => (/** @type {Record<string, string>} */ f) => { Object.assign(f, add); };

test('3D-136: well-formed handover and history pass', () => assert.deepEqual(run(with_({ [H]: HANDOVER, [Y]: HISTORY })), []));

test('3D-136: an extra section in a handover fails', () =>
  expectOne(run(with_({ [H]: HANDOVER.replace('## Do not repeat', '## Conversation so far\n- long story\n\n## Do not repeat') })), /sections .* should be exactly/));

test('3D-136: a missing section or wrong order fails', () =>
  expectOne(run(with_({ [H]: HANDOVER.replace('## Ids\n', '') })), /sections .* should be exactly/));

test('3D-136: title must match the file name', () =>
  expectOne(run(with_({ [H]: HANDOVER.replace('2026-11-27-1\n', '2026-11-27-2\n') })), /title should be "# Coordinator handover 2026-11-27-1"/));

test('3D-136: a handover over 80 lines fails', () =>
  expectOne(run(with_({ [H]: HANDOVER.replace('- none\n', '- x\n'.repeat(80)) })), /lines, at most 80/));

test('3D-136: an unknown file in docs/coordination fails', () =>
  expectOne(run(with_({ 'docs/coordination/notes.md': '# x\n' })), /only handover-YYYY-MM-DD-N.md and history/));

test('3D-136: a history line with an unknown kind or no text fails', () => {
  expectOne(run(with_({ [Y]: `${HISTORY}- 2026-11-27 chat D-03: talked\n` })), /:6: event line should be/);
  expectOne(run(with_({ [Y]: `${HISTORY}- 2026-11-27 merge D-03 3D-02:\n` })), /:6: event line should be/);
});

test('3D-136: a history date outside the file month fails', () =>
  expectOne(run(with_({ [Y]: `${HISTORY}- 2026-12-01 decision D-03: next month\n` })), /date 2026-12-01 outside 2026-11/));
