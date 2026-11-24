// Shared fixture of the check-docs tests (3D-30; split out in 3D-84 for the 300-line limit, AGENTS.md §2.9).
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkDocs, readIdDocs } from './check-docs.mjs';
import { legendLine } from './check-docs-icons.mjs';

export const BACKLOG = `# BACKLOG

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
    D01["✅ 📐 3D-01 First"]
  end
  subgraph g0["G0"]
    D02["▶️ 📐 3D-02 Second"]
    D03["💡 🔧 3D-03 Third"]
  end
  D01 --> D02
  D02 --> D03
\`\`\`

${legendLine()}

## Work-package status

| WP | Title | Repo | Modules | Depends on | Gate | Size | Type | Status |
|---|---|---|---|---|---|---|---|---|
| 3D-01 | First | here | docs | - | G0 | S | spec | done (D-01) |
| 3D-02 | Second | here | docs | 01 | G0 | S | spec | ready (D-02) |
| 3D-03 | Third | here | tools | 02 | G0 | S | tooling | proposed |

## Details

### 3D-01 First
- Accept: something.
### 3D-02 .. 3D-03 Rest (see 3D-99)
- Accept: more.
`;

export const DECISIONS = `# DECISIONS

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

| Q | Date, source | Status | Finding |
|---|---|---|---|
| Q-01 | 2026-01-01, owner | open | repeated id is fine here |
| D-01 | 2026-01-02, 3D-02 | verified | a \\| b |
`;

export const fixture = () => ({ 'docs/BACKLOG.md': BACKLOG, 'docs/decisions/DECISIONS.md': DECISIONS, 'docs/decisions/adr/3D-ADR-0001-first.md': '# ADR 1\n', 'README.md': 'See [backlog](docs/BACKLOG.md) and `[x](nowhere.md)`.\n' });

/**
 * @template T
 * @param {((files: Record<string, string>) => void) | undefined} plant
 * @param {(root: string) => T} fn
 * @returns {T}
 */
export function inRoot(plant, fn) {
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
export const run = (plant, opts) => inRoot(plant, (root) => checkDocs(root, opts));

/** The clean fixture as the base branch's documents (D-179 rule). */
export const BASE = inRoot(undefined, readIdDocs);

/** @param {string[]} problems @param {RegExp} re */
export function expectOne(problems, re) {
  assert.equal(problems.length, 1, `expected one problem, got:\n${problems.join('\n')}`);
  assert.match(problems[0], re);
}

export const edit = (/** @type {string} */ from, /** @type {string} */ to, file = 'docs/BACKLOG.md') =>
  (/** @type {Record<string, string>} */ f) => {
    assert.ok(f[file].includes(from), `fixture lacks ${from}`);
    f[file] = f[file].replace(from, to);
  };

