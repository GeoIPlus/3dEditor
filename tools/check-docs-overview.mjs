// BACKLOG "## Progress overview": generated parts (D-180). Counts per status, the prose "N/M rows done", the
// `**Running:**` line (rows with status `in-progress`, labelled by their mermaid node, D-200) and an `Updated:` line
// that is a bare date. `check-docs` reports differences; `check-docs --fix` writes the generated text.
import { cells } from './check-docs-md.mjs';

const BACKLOG = 'docs/BACKLOG.md';
/** @type {Record<string, string>} Overview label (first words) -> row status. */
export const OVERVIEW = { done: 'done', review: 'review', 'in progress': 'in-progress', ready: 'ready', proposed: 'proposed', blocked: 'blocked' };
const DATE_LINE = /^Updated: \d{4}-\d{2}-\d{2}$/;

/** @param {string[]} lines @returns {Map<string, string>} row id -> mermaid label text without the id */
function labels(lines) {
  const map = new Map();
  for (const l of lines) {
    const m = /^\s*D[\d_]+\["(3D-\d+(?:\.\d+)?)\s+([^"]*)"\]/.exec(l);
    if (m) map.set(m[1], m[2].trim());
  }
  return map;
}

/**
 * @param {string[]} lines BACKLOG lines
 * @param {{id: string, status: string}[]} rows
 * @param {{start: number, lines: string[]}} sec the overview section
 * @returns {{problems: string[], edits: Map<number, string>, dateOk: boolean, dateAt: number}}
 *   edits: 0-based line index -> generated text, for every generated line that differs
 */
export function overview(lines, rows, sec) {
  /** @type {string[]} */
  const problems = [];
  /** @type {Map<number, string>} */
  const edits = new Map();
  const count = (/** @type {string} */ s) => rows.filter((r) => r.status === s).length;
  const found = new Set();
  let dateAt = -1;
  let running = false;
  sec.lines.forEach((l, i) => {
    const idx = sec.start + i + 1;
    const at = `${BACKLOG}:${idx + 1}`;
    if (/^\|/.test(l)) {
      const c = cells(l);
      const key = Object.keys(OVERVIEW).find((k) => c[0].toLowerCase().startsWith(k));
      if (!key || c.length < 2) return;
      found.add(key);
      const want = count(OVERVIEW[key]);
      const total = key === 'done' ? ` / ${rows.length}` : '';
      const m = /^(\d+)(?:\s*\/\s*(\d+))?$/.exec(c[1]);
      if (!m) problems.push(`${at}: overview "${c[0]}" has no number`);
      else {
        if (Number(m[1]) !== want) problems.push(`${at}: overview "${c[0]}" says ${m[1]}, table has ${want}`);
        if (m[2] && Number(m[2]) !== rows.length) problems.push(`${at}: overview total says ${m[2]}, table has ${rows.length} rows`);
      }
      const gen = `| ${c[0]} | ${want}${total} |`;
      if (!m || Number(m[1]) !== want || (m[2] && Number(m[2]) !== rows.length)) edits.set(idx, gen);
      return;
    }
    if (/^Updated:/.test(l)) {
      dateAt = idx;
      if (!DATE_LINE.test(l)) problems.push(`${at}: "Updated:" must be a bare date YYYY-MM-DD (D-180; history is in git log)`);
      return;
    }
    if (/^\*\*Running:\*\*/.test(l)) {
      running = true;
      const names = labels(lines);
      const items = rows.filter((r) => r.status === 'in-progress').map((r) => [r.id, names.get(r.id)].filter(Boolean).join(' '));
      const gen = `**Running:** ${items.length ? items.join('; ') : 'none'}.`;
      if (l !== gen) {
        problems.push(`${at}: "Running:" differs from the in-progress rows; run check-docs --fix (D-180)`);
        edits.set(idx, gen);
      }
      return;
    }
    let fixed = l;
    for (const m of l.matchAll(/(\d+)\/(\d+) rows done/g)) {
      if (Number(m[1]) !== count('done') || Number(m[2]) !== rows.length) {
        problems.push(`${at}: "${m[0]}" but table has ${count('done')}/${rows.length}`);
        fixed = fixed.replace(m[0], `${count('done')}/${rows.length} rows done`);
      }
    }
    if (fixed !== l) edits.set(idx, fixed);
  });
  for (const k of Object.keys(OVERVIEW)) if (!found.has(k)) problems.push(`${BACKLOG}: overview row for "${k}" missing`);
  if (dateAt < 0) problems.push(`${BACKLOG}: overview line "Updated: YYYY-MM-DD" missing`);
  if (!running) problems.push(`${BACKLOG}: overview line "**Running:**" missing`);
  return { problems, edits, dateOk: dateAt >= 0 && DATE_LINE.test(lines[dateAt]), dateAt };
}
