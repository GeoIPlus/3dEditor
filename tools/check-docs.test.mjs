// Planted-fault tests for tools/check-docs.mjs (3D-30). Run: node --test tools/check-docs.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkDocs, fixDocs, readIdDocs } from './check-docs.mjs';

const BACKLOG = `# BACKLOG

## Progress overview

Updated: 2026-01-01

| Progress | Rows |
|---|---:|
| Done | 1 / 3 |
| Review | 0 |
| In progress | 0 |
| Ready | 1 |
| Proposed (waiting) | 1 |
| Blocked (data) | 0 |

**Implementation progress: 0 %**; 1/3 rows done. See [decisions](decisions/DECISIONS.md#decisions).
**Running:** none.

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

const fixture = () => ({ 'docs/BACKLOG.md': BACKLOG, 'docs/decisions/DECISIONS.md': DECISIONS, 'docs/decisions/adr/3D-ADR-0001-first.md': '# ADR 1\n', 'README.md': 'See [backlog](docs/BACKLOG.md) and `[x](nowhere.md)`.\n' });

/**
 * @template T
 * @param {((files: Record<string, string>) => void) | undefined} plant
 * @param {(root: string) => T} fn
 * @returns {T}
 */
function inRoot(plant, fn) {
  /** @type {Record<string, string>} */
  const files = fixture();
  if (plant) plant(files);
  const root = mkdtempSync(join(tmpdir(), 'check-docs-'));
  try {
    for (const [p, text] of Object.entries(files)) {
      mkdirSync(join(root, p, '..'), { recursive: true });
      writeFileSync(join(root, p), text);
    }
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** @param {(files: Record<string, string>) => void} [plant] @param {object} [opts] */
const run = (plant, opts) => inRoot(plant, (root) => checkDocs(root, opts));

/** The clean fixture as the base branch's documents (D-179 rule). */
const BASE = inRoot(undefined, readIdDocs);

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

// --- 3D-78: provisional ids for rows and ADRs, new final ids on a WP branch (D-179) ---

/** Plant a provisional row 3D-03.1 with node, edge and Details entry. */
const provisionalRow = (/** @type {Record<string, string>} */ f) => {
  edit('| Proposed (waiting) | 1 |', '| Proposed (waiting) | 2 |')(f);
  edit('| Done | 1 / 3 |', '| Done | 1 / 4 |')(f);
  edit('1/3 rows done', '1/4 rows done')(f);
  edit('    D03["3D-03 Third"]\n', '    D03["3D-03 Third"]\n    D03_1["3D-03.1 Found later"]\n')(f);
  edit('  D02 --> D03\n', '  D02 --> D03\n  D03 --> D03_1\n')(f);
  edit('| 3D-03 | Third | here | docs | 02 | G0 | S | proposed |\n', '| 3D-03 | Third | here | docs | 02 | G0 | S | proposed |\n| 3D-03.1 | Found later | here | docs | 03 | G0 | S | proposed |\n')(f);
  f['docs/BACKLOG.md'] += '### 3D-03.1 Found later\n- Accept: x.\n';
};

test('provisional row 3D-<wp>.n: full row on a WP branch, rejected on the base', () => {
  assert.deepEqual(run(provisionalRow, { allowProvisional: true, base: BASE }), []);
  const strict = run(provisionalRow);
  assert.ok(strict.length > 0 && strict.every((p) => /provisional id 3D-03\.1/.test(p)), strict.join('\n'));
});

test('provisional ADR file 3D-ADR-<wp>-n: accepted on a WP branch, rejected on the base', () => {
  const plant = (/** @type {Record<string, string>} */ f) => { f['docs/decisions/adr/3D-ADR-78-1-guard.md'] = '# ADR\n'; };
  assert.deepEqual(run(plant, { allowProvisional: true, base: BASE }), []);
  expectOne(run(plant), /3D-ADR-78-1-guard\.md: provisional ADR file name/);
});

test('provisional decision and question rows are accepted on a WP branch and checked for duplicates', () => {
  const f = 'docs/decisions/DECISIONS.md';
  assert.deepEqual(run((x) => { edit('| D-02 | Two | |\n', '| D-02 | Two | |\n| D-3D78-1 | New | |\n', f)(x); edit('| Q-01 | Why | | |\n', '| Q-01 | Why | | |\n| Q-3D78-1 | Who | | |\n', f)(x); }, { allowProvisional: true, base: BASE }), []);
  expectOne(run((x) => edit('| D-02 | Two | |\n', '| D-02 | Two | |\n| D-3D78-1 | New | |\n| D-3D78-1 | Again | |\n', f)(x), { allowProvisional: true, base: BASE }), /duplicate id D-3D78-1/);
});

test('new final ids on a WP branch fail: D-NN, Q-NN, 3D-NN row, 3D-ADR-NNNN file', () => {
  const f = 'docs/decisions/DECISIONS.md';
  const p = run((x) => {
    edit('| D-02 | Two | |\n', '| D-02 | Two | |\n| D-03 | Three | |\n', f)(x);
    edit('| Q-01 | Why | | |\n', '| Q-01 | Why | | |\n| Q-02 | Who | | |\n', f)(x);
    x['docs/decisions/adr/3D-ADR-0002-second.md'] = '# ADR 2\n';
    edit('| Proposed (waiting) | 1 |', '| Proposed (waiting) | 2 |')(x);
    edit('| Done | 1 / 3 |', '| Done | 1 / 4 |')(x);
    edit('1/3 rows done', '1/4 rows done')(x);
    edit('    D03["3D-03 Third"]\n', '    D03["3D-03 Third"]\n    D04["3D-04 Fourth"]\n')(x);
    edit('| 3D-03 | Third | here | docs | 02 | G0 | S | proposed |\n', '| 3D-03 | Third | here | docs | 02 | G0 | S | proposed |\n| 3D-04 | Fourth | here | docs | 03 | G0 | S | proposed |\n')(x);
    x['docs/BACKLOG.md'] += '### 3D-04 Fourth\n- Accept: x.\n';
  }, { allowProvisional: true, base: BASE });
  assert.equal(p.length, 4, p.join('\n'));
  for (const [id, hint] of [['3D-04', '3D-<wp>.n'], ['D-03', 'D-3D<wp>-n'], ['Q-02', 'Q-3D<wp>-n'], ['3D-ADR-0002', '3D-ADR-<wp>-n']])
    assert.ok(p.some((x) => x.includes(`new final id ${id} `) && x.includes(hint)), `${id}:\n${p.join('\n')}`);
});

test('ids already on the base pass on a WP branch; without a base the rule is off (Stop hook)', () => {
  assert.deepEqual(run(undefined, { allowProvisional: true, base: BASE }), []);
  const plant = (/** @type {Record<string, string>} */ x) => { x['docs/decisions/adr/3D-ADR-0002-second.md'] = '# ADR 2\n'; };
  assert.deepEqual(run(plant, { allowProvisional: true }), []);
});

// --- 3D-78: generated overview (D-180) ---

test('"Updated:" with history text fails', () =>
  expectOne(run(edit('Updated: 2026-01-01', 'Updated: 2026-01-01 (3D-01 done D-01)')), /"Updated:" must be a bare date/));

test('"Running:" must list the in-progress rows', () => {
  expectOne(run(edit('**Running:** none.', '**Running:** 3D-02 Second.')), /"Running:" differs from the in-progress rows/);
  const started = (/** @type {Record<string, string>} */ f) => {
    edit('| ready (D-02) |', '| in-progress (wp/3d-02-x) |')(f);
    edit('| In progress | 0 |', '| In progress | 1 |')(f);
    edit('| Ready | 1 |', '| Ready | 0 |')(f);
  };
  expectOne(run(started), /"Running:" differs/);
  assert.deepEqual(run((f) => { started(f); edit('**Running:** none.', '**Running:** 3D-02 Second.')(f); }), []);
});

test('--fix regenerates hand-broken counts, prose, Running and the date', () =>
  inRoot((f) => {
    edit('| ready (D-02) |', '| in-progress (wp/3d-02-x) |')(f);
    edit('| Done | 1 / 3 |', '| Done | 2 / 7 |')(f);
    edit('1/3 rows done', '0/3 rows done')(f);
    edit('Updated: 2026-01-01', 'Updated: 2026-01-01 (long history)')(f);
  }, (root) => {
    assert.ok(checkDocs(root).length >= 5);
    assert.ok(fixDocs(root, '2026-11-24') >= 5);
    assert.deepEqual(checkDocs(root), []);
    const text = readFileSync(join(root, 'docs/BACKLOG.md'), 'utf8');
    for (const want of ['Updated: 2026-11-24\n', '| Done | 1 / 3 |', '| In progress | 1 |', '| Ready | 0 |', '1/3 rows done', '**Running:** 3D-02 Second.'])
      assert.ok(text.includes(want), want);
    assert.equal(fixDocs(root, '2026-12-31'), 0, 'a consistent file is left alone, date included');
  }));
