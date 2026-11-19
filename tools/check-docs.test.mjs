// Planted-fault tests for tools/check-docs.mjs (3D-30). Run: node --test tools/check-docs.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkDocs } from './check-docs.mjs';

const BACKLOG = `# BACKLOG

## Progress overview

| Progress | Rows |
|---|---:|
| Done | 1 / 3 |
| Review | 0 |
| In progress | 0 |
| Ready | 1 |
| Proposed (waiting) | 1 |
| Blocked (data) | 0 |

**Implementation progress: 0 %**; 1/3 rows done. See [decisions](decisions/DECISIONS.md#decisions).

\`\`\`mermaid
flowchart TB
  subgraph done["DONE"]
    D01["3D-01 First"]
  end
  subgraph g0["G0"]
    D02["3D-02 Second"]
    D03["3D-03 Third"]
  end
  D01 --> D02
  D02 --> D03
\`\`\`

## Work-package status

| WP | Title | Repo | Modules | Depends on | Gate | Size | Status |
|---|---|---|---|---|---|---|---|
| 3D-01 | First | here | docs | - | G0 | S | done (D-01) |
| 3D-02 | Second | here | docs | 01 | G0 | S | ready (D-02) |
| 3D-03 | Third | here | docs | 02 | G0 | S | proposed |

## Details

### 3D-01 First
- Accept: something.
### 3D-02 .. 3D-03 Rest (see 3D-99)
- Accept: more.
`;

const DECISIONS = `# DECISIONS

## Decisions

| Id | Decision | Note |
|---|---|---|
| D-01 | One | |
| D-02 | Two | |

## Open questions

| Id | Question | Options | Closed by |
|---|---|---|---|
| Q-01 | Why | | |

## Open-question status updates

| Q | Date | Status | Finding |
|---|---|---|---|
| Q-01 | today | open | repeated id is fine here |
`;

/** @param {(files: Record<string, string>) => void} [plant] @param {object} [opts] */
function run(plant, opts) {
  const files = { 'docs/BACKLOG.md': BACKLOG, 'docs/decisions/DECISIONS.md': DECISIONS, 'README.md': 'See [backlog](docs/BACKLOG.md) and `[x](nowhere.md)`.\n' };
  if (plant) plant(files);
  const root = mkdtempSync(join(tmpdir(), 'check-docs-'));
  try {
    for (const [p, text] of Object.entries(files)) {
      mkdirSync(join(root, p, '..'), { recursive: true });
      writeFileSync(join(root, p), text);
    }
    return checkDocs(root, opts);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** @param {string[]} problems @param {RegExp} re */
function expectOne(problems, re) {
  assert.equal(problems.length, 1, `expected one problem, got:\n${problems.join('\n')}`);
  assert.match(problems[0], re);
}

const edit = (/** @type {string} */ from, /** @type {string} */ to, file = 'docs/BACKLOG.md') =>
  (/** @type {Record<string, string>} */ f) => {
    assert.ok(f[file].includes(from), `fixture lacks ${from}`);
    f[file] = f[file].replace(from, to);
  };

test('clean fixture passes', () => assert.deepEqual(run(), []));

test('overview count differs from table', () =>
  expectOne(run(edit('| Ready | 1 |', '| Ready | 2 |')), /BACKLOG\.md:\d+: overview "Ready" says 2, table has 1/));

test('overview total differs from row count', () =>
  expectOne(run(edit('| Done | 1 / 3 |', '| Done | 1 / 4 |')), /overview total says 4, table has 3 rows/));

test('prose "rows done" differs', () => expectOne(run(edit('1/3 rows done', '2/3 rows done')), /"2\/3 rows done" but table has 1\/3/));

test('row without mermaid node', () => {
  const p = run(edit('    D03["3D-03 Third"]\n', ''));
  assert.equal(p.length, 2, p.join('\n'));
  assert.match(p[0], /row 3D-03 has no mermaid node/);
  assert.match(p[1], /edge uses undefined node D03/);
});

test('mermaid node without row', () =>
  expectOne(run(edit('    D03["3D-03 Third"]\n', '    D03["3D-03 Third"]\n    D04["3D-04 Ghost"]\n')), /node D04 has no row/));

test('done row outside the DONE subgraph', () =>
  expectOne(run(edit('| ready (D-02) |', '| done (D-02) |')).filter((p) => !p.includes('overview') && !p.includes('rows done')),
    /3D-02 is done but its node is in subgraph "g0"/));

test('duplicate decision id', () =>
  expectOne(run(edit('| D-02 | Two |', '| D-01 | Two |', 'docs/decisions/DECISIONS.md')), /DECISIONS\.md:\d+: duplicate id D-01/));

test('provisional id rejected unless allowed', () => {
  const plant = edit('| D-02 | Two |', '| D-02 | Two (was D-3D27-1) |', 'docs/decisions/DECISIONS.md');
  expectOne(run(plant), /provisional id D-3D27-1/);
  assert.deepEqual(run(plant, { allowProvisional: true }), []);
});

test('broken relative link, inline code ignored', () =>
  expectOne(run(edit('[backlog](docs/BACKLOG.md)', '[backlog](docs/MISSING.md)', 'README.md')), /README\.md:1: broken link docs\/MISSING\.md/));

test('row without Details entry', () =>
  expectOne(run(edit('### 3D-02 .. 3D-03 Rest', '### 3D-02 Rest')), /row 3D-03 has no Details entry/));

test('unknown status', () => {
  const p = run(edit('| proposed |\n', '| wip |\n'));
  assert.ok(p.some((x) => /3D-03 has unknown status "wip"/.test(x)), p.join('\n'));
});

test('docs/source is not scanned', () =>
  assert.deepEqual(run((f) => { f['docs/source/old.md'] = 'D-3D1-1 [x](gone.md)\n'; }), []));
