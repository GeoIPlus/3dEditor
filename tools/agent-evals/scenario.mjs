// Helpers for task setup.mjs files (3D-28): build a scenario in the throwaway clone while keeping the
// documents consistent (overview counts match the table, so `check:docs` stays green at the start).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

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
 * Add a scenario WP: table row (after the last row), Details entry, mermaid node; counts recomputed.
 * @param {string} work
 * @param {{id: string, title: string, modules: string, deps: string, size: string, status: string, details: string}} row
 */
export function addRow(work, row) {
  edit(work, 'docs/BACKLOG.md', (s) => {
    const lines = s.split('\n');
    const last = lines.findLastIndex((l) => /^\| 3D-\d+ \|/.test(l));
    lines.splice(last + 1, 0, `| ${row.id} | ${row.title} | here | ${row.modules} | ${row.deps} | G1 | ${row.size} | ${row.status} |`);
    let out = lines.join('\n');
    const node = `D${row.id.slice(3)}`;
    out = out.replace('  subgraph ready["READY"]\n', `  subgraph ready["READY"]\n    ${node}["${row.id} ${row.title.slice(0, 40)}"]\n`);
    out = `${out.trimEnd()}\n\n### ${row.id} ${row.title}\n${row.details.trim()}\n`;
    return recount(out);
  });
}

/** Set the status cell of an existing row; counts recomputed. @param {string} work @param {string} id @param {string} status */
export function setStatus(work, id, status) {
  edit(work, 'docs/BACKLOG.md', (s) =>
    recount(s.replace(new RegExp(`^(\\| ${id} \\|.*\\|) [^|]+ \\|$`, 'm'), `$1 ${status} |`)),
  );
}
