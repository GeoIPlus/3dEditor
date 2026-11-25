// Helpers for task setup.mjs files (3D-28): build a scenario in the throwaway clone while keeping the
// documents consistent (overview counts match the table, so `check:docs` stays green at the start).
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fixDocs } from '../check-docs.mjs';

/** @param {string} work @param {string} rel @param {string} text */
export function write(work, rel, text) {
  mkdirSync(dirname(join(work, rel)), { recursive: true });
  writeFileSync(join(work, rel), text);
}

/** @param {string} work @param {string} rel @param {(s: string) => string} fn */
export function edit(work, rel, fn) {
  const p = join(work, rel);
  const before = readFileSync(p, 'utf8');
  const after = fn(before);
  if (after === before) throw new Error(`scenario edit changed nothing in ${rel}`);
  writeFileSync(p, after);
}

/** First word of a status cell -> overview label prefix. @param {string} status */
function bucket(status) {
  const s = status.trim().toLowerCase();
  for (const b of ['done', 'review', 'in-progress', 'ready', 'proposed', 'blocked']) if (s.startsWith(b)) return b;
  return 'other';
}

/** Recompute the overview counts from the table. @param {string} text */
export function recount(text) {
  const rows = text.split('\n').filter((l) => /^\| 3D-\d+ \|/.test(l));
  /** @type {Record<string, number>} */
  const n = { done: 0, review: 0, 'in-progress': 0, ready: 0, proposed: 0, blocked: 0 };
  for (const r of rows) {
    const cells = r.split('|').slice(1, -1);
    const b = bucket(cells.at(-1) ?? '');
    if (b in n) n[b] += 1;
  }
  return text
    .replace(/^\| Done \| \d+ \/ \d+ \|$/m, `| Done | ${n.done} / ${rows.length} |`)
    .replace(/^\| Review \| \d+ \|$/m, `| Review | ${n.review} |`)
    .replace(/^\| In progress \| \d+ \|$/m, `| In progress | ${n['in-progress']} |`)
    .replace(/^\| Ready \| \d+ \|$/m, `| Ready | ${n.ready} |`)
    .replace(/^(\| Proposed[^|]*\|) \d+ \|$/m, `$1 ${n.proposed} |`)
    .replace(/^(\| Blocked[^|]*\|) \d+ \|$/m, `$1 ${n.blocked} |`)
    .replace(/\b\d+\/\d+ rows done/, `${n.done}/${rows.length} rows done`);
}

/**
 * Regenerate what `check-docs --fix` owns (graph icons and legend, overview counts, `Running:` line; D-180, D-200,
 * D-208), so the start state passes `check:docs`. The `Updated:` date of the clone is kept: start states stay the
 * same whatever day they are built.
 * @param {string} work
 */
function regenerate(work) {
  const date = /^Updated: (\d{4}-\d{2}-\d{2})$/m.exec(readFileSync(join(work, 'docs/BACKLOG.md'), 'utf8'))?.[1];
  fixDocs(work, date ?? '2026-01-01');
}

/** Row ids reserved for scenario rows, far above the real backlog (D-264, D-3D102-1). Real rows never use them. */
export const SCENARIO_IDS = { min: 900, max: 999 };

/** @param {string} id */
const idNumber = (id) => Number(/^3D-(\d+)$/.exec(id)?.[1] ?? NaN);

/**
 * Scenario row ids declared by the tasks' setup.mjs (`id: '3D-NNN'` passed to addRow), with their task.
 * @param {string} evalsDir
 * @returns {{task: string, id: string}[]}
 */
export function scenarioRowIds(evalsDir) {
  return readdirSync(evalsDir)
    .filter((n) => existsSync(join(evalsDir, n, 'setup.mjs')))
    .sort()
    .flatMap((task) => [...readFileSync(join(evalsDir, task, 'setup.mjs'), 'utf8').matchAll(/\bid: '(3D-\d+)'/g)]
      .map((m) => ({ task, id: m[1] })));
}

/**
 * Problems of scenario ids against a backlog text: an id outside the reserved range, or equal to a real row id.
 * @param {string} backlog
 * @param {{task: string, id: string}[]} ids
 * @returns {string[]}
 */
export function scenarioIdProblems(backlog, ids) {
  const real = new Set([...backlog.matchAll(/^\| (3D-\d+) \|/gm)].map((m) => m[1]));
  return ids.flatMap(({ task, id }) => {
    const n = idNumber(id);
    const out = [];
    if (!(n >= SCENARIO_IDS.min && n <= SCENARIO_IDS.max)) out.push(`${task}: ${id} outside 3D-${SCENARIO_IDS.min}..3D-${SCENARIO_IDS.max}`);
    if (real.has(id)) out.push(`${task}: ${id} is a real row in docs/BACKLOG.md`);
    return out;
  });
}

/**
 * Add a scenario WP: table row (after the last row, with the `Type` cell of D-221), Details entry, mermaid node;
 * generated parts regenerated as `check-docs --fix` writes them.
 * @param {string} work
 * @param {{id: string, title: string, modules: string, deps: string, size: string, type?: string, status: string, details: string}} row
 *   `type`: one of the BACKLOG types (spec, kernel, service, tests, tooling, mirror); default `kernel`.
 */
export function addRow(work, row) {
  const problems = scenarioIdProblems(readFileSync(join(work, 'docs/BACKLOG.md'), 'utf8'), [{ task: 'setup', id: row.id }]);
  if (problems.length) throw new Error(`scenario row id: ${problems.join('; ')}`);
  insertRow(work, row);
}

/**
 * addRow without the id guard; tests use it to plant a real row. @param {string} work
 * @param {{id: string, title: string, modules: string, deps: string, size: string, type?: string, status: string, details: string}} row
 */
export function insertRow(work, row) {
  edit(work, 'docs/BACKLOG.md', (s) => {
    const lines = s.split('\n');
    const last = lines.findLastIndex((l) => /^\| 3D-\d+ \|/.test(l));
    const type = row.type ?? 'kernel';
    lines.splice(last + 1, 0, `| ${row.id} | ${row.title} | here | ${row.modules} | ${row.deps} | G1 | ${row.size} | ${type} | ${row.status} |`);
    let out = lines.join('\n');
    const node = `D${row.id.slice(3)}`;
    out = out.replace('  subgraph ready["READY"]\n', `  subgraph ready["READY"]\n    ${node}["${row.id} ${row.title.slice(0, 40)}"]\n`);
    return `${out.trimEnd()}\n\n### ${row.id} ${row.title}\n${row.details.trim()}\n`;
  });
  regenerate(work);
}

/** Set the status cell of an existing row; generated parts regenerated. @param {string} work @param {string} id @param {string} status */
export function setStatus(work, id, status) {
  edit(work, 'docs/BACKLOG.md', (s) => s.replace(new RegExp(`^(\\| ${id} \\|.*\\|) [^|]+ \\|$`, 'm'), `$1 ${status} |`));
  regenerate(work);
}
