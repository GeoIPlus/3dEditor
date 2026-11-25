// DECISIONS.md table rules of check-docs (3D-30, 3D-76, D-167).
// - "## Decisions" holds `D-` rows, "## Open questions" holds `Q-` rows; an id appears once in its table.
// - "## Open-question status updates" holds status rows only: second cell `YYYY-MM-DD, <source>`, and the id names a
//   row of "## Decisions" (`D-`) or "## Open questions" (`Q-`). A decision row pasted there (3D-66 merge) fails.
// - A `D-` / `Q-` row in any other part of the file fails.
import { section, cells } from './check-docs-md.mjs';

const DECISIONS = 'docs/decisions/DECISIONS.md';
const UPDATES = '## Open-question status updates';
/** Final or provisional decision / question id at the start of a table row (D-179). */
const ROW_ID = /^\|\s*([A-Z]-(?:3D\d+-)?\d+)\s*\|/;
const STATUS_CELL = /^\d{4}-\d{2}-\d{2}, \S/;

/**
 * @param {string} text DECISIONS.md
 * @returns {string[]} problems, one line each
 */
export function checkDecisionTables(text) {
  const lines = text.split('\n');
  /** @type {string[]} */
  const out = [];
  /** @type {Map<string, number>} id -> line, over both id tables */
  const defined = new Map();
  /** @type {Set<number>} line indexes of the three tables' sections */
  const owned = new Set();
  for (const [heading, prefix] of [['## Decisions', 'D'], ['## Open questions', 'Q']]) {
    const sec = section(lines, heading);
    if (sec.start < 0) { out.push(`${DECISIONS}: section "${heading}" missing`); continue; }
    sec.lines.forEach((l, i) => {
      owned.add(sec.start + 1 + i);
      const m = ROW_ID.exec(l);
      if (!m) return;
      const line = sec.start + i + 2;
      const at = `${DECISIONS}:${line}`;
      if (!m[1].startsWith(`${prefix}-`)) out.push(`${at}: ${m[1]} listed under "${heading}"`);
      if (defined.has(m[1])) out.push(`${at}: duplicate id ${m[1]} (first at line ${defined.get(m[1])})`);
      else defined.set(m[1], line);
    });
  }
  const upd = section(lines, UPDATES);
  upd.lines.forEach((l, i) => {
    owned.add(upd.start + 1 + i);
    const m = ROW_ID.exec(l);
    if (!m) return;
    const at = `${DECISIONS}:${upd.start + i + 2}`;
    if (!/^[DQ]-/.test(m[1])) return void out.push(`${at}: ${m[1]} listed under "${UPDATES}"`);
    const second = cells(l)[1] ?? '';
    if (!STATUS_CELL.test(second))
      out.push(`${at}: ${m[1]} under "${UPDATES}" is not a status row (second cell "${second}", expected "YYYY-MM-DD, <source>"); a decision row belongs in "## Decisions" (D-167)`);
    else if (!defined.has(m[1])) out.push(`${at}: status row names unknown id ${m[1]} (not in "## Decisions" / "## Open questions")`);
  });
  lines.forEach((l, i) => {
    if (owned.has(i)) return;
    const m = ROW_ID.exec(l);
    if (m && /^[DQ]-/.test(m[1])) out.push(`${DECISIONS}:${i + 1}: ${m[1]} row outside "## Decisions" / "## Open questions" / "${UPDATES}"`);
  });
  return out;
}
