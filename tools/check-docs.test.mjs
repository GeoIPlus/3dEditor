// Planted-fault tests for tools/check-docs.mjs (3D-30). Run: node --test tools/check-docs.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkDocs, fixDocs } from './check-docs.mjs';
import { inRoot, run, BASE, expectOne, edit } from './check-docs-fixture.mjs';

test('clean fixture passes', () => assert.deepEqual(run(), []));

test('overview count differs from table', () =>
  expectOne(run(edit('| Ready | 1 |', '| Ready | 2 |')), /BACKLOG\.md:\d+: overview "Ready" says 2, table has 1/));

test('overview total differs from row count', () =>
  expectOne(run(edit('| Done | 1 / 3 |', '| Done | 1 / 4 |')), /overview total says 4, table has 3 rows/));

test('prose "rows done" differs', () => expectOne(run(edit('1/3 rows done', '2/3 rows done')), /"2\/3 rows done" but table has 1\/3/));

test('row without mermaid node', () => {
  const p = run(edit('    D03["💡 🔧 3D-03 Third"]\n', ''));
  assert.equal(p.length, 2, p.join('\n'));
  assert.match(p[0], /row 3D-03 has no mermaid node/);
  assert.match(p[1], /edge uses undefined node D03/);
});

test('mermaid node without row', () =>
  expectOne(run(edit('    D03["💡 🔧 3D-03 Third"]\n', '    D03["💡 🔧 3D-03 Third"]\n    D04["3D-04 Ghost"]\n')), /node D04 has no row/));

test('done row outside the DONE subgraph', () =>
  expectOne(run(edit('| ready (D-02) |', '| done (D-02) |')).filter((p) => !p.includes('overview') && !p.includes('rows done') && !p.includes('icons')),
    /3D-02 is done but its node is in subgraph "g0"/));

test('duplicate decision id', () =>
  expectOne(run(edit('| D-02 | Two |', '| D-01 | Two |', 'docs/decisions/DECISIONS.md')), /DECISIONS\.md:\d+: duplicate id D-01/));

const DF = 'docs/decisions/DECISIONS.md';
const UPD = '| D-01 | 2026-01-02, 3D-02 | verified | a \\| b |\n';

test('3D-76: decision row under "Open-question status updates" fails (3D-66 merge)', () =>
  expectOne(run(edit(UPD, `${UPD}| D-03 | Three | Owner, dialog, 2026-01-03 |\n`, DF)), /DECISIONS\.md:\d+: D-03 under "## Open-question status updates" is not a status row/));

test('3D-76: status row naming an unknown id fails; known D and Q ids pass', () => {
  expectOne(run(edit(UPD, `${UPD}| Q-09 | 2026-01-03, owner | open | x |\n`, DF)), /status row names unknown id Q-09/);
  expectOne(run(edit(UPD, `${UPD}| D-09 | 2026-01-03, owner | open | x |\n`, DF)), /status row names unknown id D-09/);
});

test('3D-76: status row shape - date and source required', () => {
  for (const bad of ['2026-01-03', '2026-1-3, owner', 'owner, 2026-01-03', '2026-01-03,owner'])
    expectOne(run(edit(UPD, `${UPD}| Q-01 | ${bad} | open | x |\n`, DF)), /Q-01 under .* is not a status row/);
});

test('3D-76: D/Q row outside the three tables fails; provisional status rows need provisional ids', () => {
  expectOne(run(edit('## Decisions\n', '| D-05 | Stray | |\n\n## Decisions\n', DF)), /D-05 row outside "## Decisions"/);
  expectOne(run((x) => { x[DF] += '\n## Later\n\n| Q-01 | Moved | |\n'; }), /DECISIONS\.md:\d+: Q-01 row outside/);
  const prov = `${UPD}| D-3D76-1 | 2026-01-03, 3D-76 | verified | x |\n`;
  expectOne(run(edit(UPD, prov, DF), { allowProvisional: true }), /unknown id D-3D76-1/);
  assert.deepEqual(run((x) => { edit(UPD, prov, DF)(x); edit('| D-02 | Two | |\n', '| D-02 | Two | |\n| D-3D76-1 | New | |\n', DF)(x); }, { allowProvisional: true }), []);
});

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
  edit('    D03["💡 🔧 3D-03 Third"]\n', '    D03["💡 🔧 3D-03 Third"]\n    D03_1["💡 🔧 3D-03.1 Found later"]\n')(f);
  edit('  D02 --> D03\n', '  D02 --> D03\n  D03 --> D03_1\n')(f);
  edit('| 3D-03 | Third | here | tools | 02 | G0 | S | tooling | proposed |\n', '| 3D-03 | Third | here | tools | 02 | G0 | S | tooling | proposed |\n| 3D-03.1 | Found later | here | tools | 03 | G0 | S | tooling | proposed |\n')(f);
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
    edit('    D03["💡 🔧 3D-03 Third"]\n', '    D03["💡 🔧 3D-03 Third"]\n    D04["💡 🔧 3D-04 Fourth"]\n')(x);
    edit('| 3D-03 | Third | here | tools | 02 | G0 | S | tooling | proposed |\n', '| 3D-03 | Third | here | tools | 02 | G0 | S | tooling | proposed |\n| 3D-04 | Fourth | here | tools | 03 | G0 | S | tooling | proposed |\n')(x);
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
    edit('D02["▶️ 📐', 'D02["🚧 📐')(f);
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
    for (const want of ['Updated: 2026-11-24\n', '| Done | 1 / 3 |', '| In progress | 1 |', '| Ready | 0 |', '1/3 rows done', '**Running:** 3D-02 Second.', 'D02["🚧 📐 3D-02 Second"]'])
      assert.ok(text.includes(want), want);
    assert.equal(fixDocs(root, '2026-12-31'), 0, 'a consistent file is left alone, date included');
  }));
