// Planted-fault tests for the BACKLOG graph icons (3D-84). Run: node --test tools/check-docs-icons.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkDocs, fixDocs } from './check-docs.mjs';
import { legendLine } from './check-docs-icons.mjs';
import { inRoot, run, expectOne, edit } from './check-docs-fixture.mjs';

test('3D-84: a planted wrong icon fails', () => {
  expectOne(run(edit('D01["✅ 📐', 'D01["✅ 🔧')), /node 3D-01 icons "✅ 🔧" should be "✅ 📐" \(status done, type spec\)/);
  expectOne(run(edit('D03["💡 🔧', 'D03["▶️ 🔧')), /node 3D-03 icons "▶️ 🔧" should be "💡 🔧"/);
});

test('3D-84: a node without icons fails (hand-written node)', () =>
  expectOne(run(edit('D03["💡 🔧 3D-03', 'D03["3D-03')), /node 3D-03 icons "" should be "💡 🔧"/));

test('3D-84: a status change leaves a stale icon; --fix moves it', () =>
  inRoot((f) => {
    edit('| proposed |\n', '| blocked (data) |\n')(f);
    edit('| Proposed (waiting) | 1 |', '| Proposed (waiting) | 0 |')(f);
    edit('| Blocked (data) | 0 |', '| Blocked (data) | 1 |')(f);
    edit('  subgraph g0["G0"]\n    D02["▶️ 📐 3D-02 Second"]\n    D03["💡 🔧 3D-03 Third"]\n  end',
      '  subgraph g0["G0"]\n    D02["▶️ 📐 3D-02 Second"]\n  end\n  subgraph blocked["BLOCKED"]\n    D03["💡 🔧 3D-03 Third"]\n  end')(f);
  }, (root) => {
    expectOne(checkDocs(root), /node 3D-03 icons "💡 🔧" should be "⛔ 🔧"/);
    assert.equal(fixDocs(root, '2026-11-24'), 1);
    assert.deepEqual(checkDocs(root), []);
    const text = readFileSync(join(root, 'docs/BACKLOG.md'), 'utf8');
    assert.ok(text.includes('subgraph blocked["BLOCKED"]\n    D03["⛔ 🔧 3D-03 Third"]'), 'icon moved, subgraph kept');
  }));

test('3D-84: unknown or missing type fails', () => {
  const p = run(edit('| tooling | proposed |', '| docs | proposed |'));
  assert.equal(p.length, 1, p.join('\n'));
  assert.match(p[0], /3D-03 has unknown type "docs" \(one of spec, kernel, service, tests, tooling, mirror/);
});

test('3D-84: legend missing or hand-edited fails; --fix writes it', () => {
  expectOne(run(edit(`${legendLine()}\n\n`, '')), /icon legend missing under the graph/);
  expectOne(run(edit('✅ done ·', '✅ finished ·')), /icon legend differs/);
  inRoot(edit(`${legendLine()}\n\n`, ''), (root) => {
    assert.equal(fixDocs(root, '2026-01-01'), 1);
    assert.deepEqual(checkDocs(root), []);
    assert.ok(readFileSync(join(root, 'docs/BACKLOG.md'), 'utf8').includes(`\`\`\`\n\n${legendLine()}\n\n## Work-package status`));
  });
});

test('3D-84: --fix adds both icons to nodes that have none; Running line stays without icons', () =>
  inRoot((f) => {
    f['docs/BACKLOG.md'] = f['docs/BACKLOG.md'].replace(/D(\d+)\["\S+ \S+ 3D-/g, 'D$1["3D-');
    edit('| ready (D-02) |', '| in-progress (wp/3d-02-x) |')(f);
    edit('| In progress | 0 |', '| In progress | 1 |')(f);
    edit('| Ready | 1 |', '| Ready | 0 |')(f);
    edit('**Running:** none.', '**Running:** 3D-02 Second.')(f);
  }, (root) => {
    assert.equal(checkDocs(root).length, 3);
    assert.equal(fixDocs(root, '2026-01-01'), 3);
    assert.deepEqual(checkDocs(root), []);
    const text = readFileSync(join(root, 'docs/BACKLOG.md'), 'utf8');
    for (const want of ['D01["✅ 📐 3D-01 First"]', 'D02["🚧 📐 3D-02 Second"]', 'D03["💡 🔧 3D-03 Third"]', '**Running:** 3D-02 Second.'])
      assert.ok(text.includes(want), want);
  }));
