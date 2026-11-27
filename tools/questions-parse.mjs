// Parsers for owner questions (3D-138, D-475 part C): the risk register `docs/decisions/RISKS.md` and the section
// "## Open questions" of a WP checkpoint. Used by tools/questions.mjs (generates docs/QUESTIONS.md) and check-docs.
import { section, cells } from './check-docs-md.mjs';

export const RISKS = 'docs/decisions/RISKS.md';
export const QUESTIONS = 'docs/QUESTIONS.md';
/** Risk id: `R-<wp>-<n>`, final when written (the WP number makes it unique; not renamed at merge). */
export const RISK_ID = /^R-(\d+(?:\.\d+)?)-(\d+)$/;
/** Decision id: final `D-NN` or provisional `D-3D<wp>-n`. */
const DECISION_ID = /^D-(?:\d+|3D\d+-\d+)$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const REVIEW_STATUSES = ['confirmed', 'overridden'];

/**
 * @typedef {{id: string, wp: string, decision: string, date: string, options: string, chosen: string, line: number}} Risk
 * @typedef {{risk: string, date: string, status: string, decision: string, by: string, line: number}} Review
 */

/**
 * Rows of the first table in a section (header and separator skipped).
 * @param {string[]} lines @param {string} heading
 * @returns {{cells: string[], line: number}[]} line: 1-based
 */
function tableRows(lines, heading) {
  const sec = section(lines, heading);
  /** @type {{cells: string[], line: number}[]} */
  const rows = [];
  let seenHeader = false;
  sec.lines.forEach((l, i) => {
    if (!l.trim().startsWith('|')) return;
    if (!seenHeader) { seenHeader = true; return; }
    if (/^\|[\s:|-]+\|$/.test(l.trim())) return;
    rows.push({ cells: cells(l), line: sec.start + i + 2 });
  });
  return rows;
}

/**
 * Parse RISKS.md. Register columns: Risk | WP | Decision | Date | Options | Chosen and why | Review.
 * Reviews columns: Risk | Date | Status | Decision | By.
 * @param {string} text
 * @returns {{risks: Risk[], reviews: Review[], problems: string[]}}
 */
export function parseRisks(text) {
  const lines = text.split('\n');
  /** @type {string[]} */
  const problems = [];
  /** @type {Risk[]} */
  const risks = [];
  /** @type {Review[]} */
  const reviews = [];
  const at = (/** @type {number} */ n) => `${RISKS}:${n}`;
  if (section(lines, '## Register').start < 0) problems.push(`${RISKS}: section "## Register" missing`);
  if (section(lines, '## Reviews').start < 0) problems.push(`${RISKS}: section "## Reviews" missing`);
  const ids = new Set();
  for (const r of tableRows(lines, '## Register')) {
    const [id = '', wp = '', decision = '', date = '', options = '', chosen = '', review = ''] = r.cells;
    if (r.cells.length !== 7) problems.push(`${at(r.line)}: register row needs 7 cells, has ${r.cells.length}`);
    const m = RISK_ID.exec(id);
    if (!m) problems.push(`${at(r.line)}: risk id "${id}" is not R-<wp>-<n>`);
    else if (wp !== `3D-${m[1]}`) problems.push(`${at(r.line)}: ${id} belongs to 3D-${m[1]}, row says "${wp}"`);
    if (ids.has(id)) problems.push(`${at(r.line)}: duplicate risk ${id}`);
    ids.add(id);
    if (!DECISION_ID.test(decision)) problems.push(`${at(r.line)}: ${id} decision "${decision}" is not D-NN or D-3D<wp>-n`);
    if (!DATE.test(date)) problems.push(`${at(r.line)}: ${id} date "${date}" is not YYYY-MM-DD`);
    if (!options || !chosen) problems.push(`${at(r.line)}: ${id} needs options and the chosen option`);
    if (review !== 'provisional') problems.push(`${at(r.line)}: ${id} review is "${review}"; a register row is written "provisional", reviews are appended below`);
    risks.push({ id, wp, decision, date, options, chosen, line: r.line });
  }
  for (const r of tableRows(lines, '## Reviews')) {
    const [risk = '', date = '', status = '', decision = '', by = ''] = r.cells;
    if (r.cells.length !== 5) problems.push(`${at(r.line)}: review row needs 5 cells, has ${r.cells.length}`);
    if (!ids.has(risk)) problems.push(`${at(r.line)}: review of unknown risk "${risk}"`);
    if (!DATE.test(date)) problems.push(`${at(r.line)}: review date "${date}" is not YYYY-MM-DD`);
    if (!REVIEW_STATUSES.includes(status)) problems.push(`${at(r.line)}: review status "${status}" (one of ${REVIEW_STATUSES.join(', ')})`);
    if (!DECISION_ID.test(decision)) problems.push(`${at(r.line)}: review decision "${decision}" is not D-NN or D-3D<wp>-n`);
    reviews.push({ risk, date, status, decision, by, line: r.line });
  }
  return { risks, reviews, problems };
}

/**
 * @typedef {{kind: 'blocking' | 'provisional', decision: string, risk: string, text: string, since: string, line: number}} OpenItem
 */

const ITEM = /^- (blocking|provisional)(?: (D-(?:\d+|3D\d+-\d+)) \((R-\d+(?:\.\d+)?-\d+)\))?: (.+?) \| since: (\d{4}-\d{2}-\d{2})$/;

/**
 * Parse the section "## Open questions" of a checkpoint. Allowed lines: blank, HTML comments (also multi-line), `- none`,
 * `- blocking: <question> | since: YYYY-MM-DD`,
 * `- provisional D-3D<wp>-n (R-<wp>-n): <decision taken> | since: YYYY-MM-DD`.
 * A checkpoint without the section has no open questions.
 * @param {string} text @param {string} file
 * @returns {{items: OpenItem[], problems: string[]}}
 */
export function parseOpenQuestions(text, file) {
  const sec = section(text.split('\n'), '## Open questions');
  /** @type {OpenItem[]} */
  const items = [];
  /** @type {string[]} */
  const problems = [];
  let comment = false;
  sec.lines.forEach((l, i) => {
    const t = l.trim();
    if (comment || t.startsWith('<!--')) { comment = !t.endsWith('-->'); return; }
    if (!t || t === '- none') return;
    const m = ITEM.exec(t);
    const n = sec.start + i + 2;
    if (!m) return void problems.push(`${file}:${n}: open-question line not in the form of docs/templates/checkpoint.md`);
    const [, kind, decision = '', risk = '', q, since] = m;
    if (kind === 'provisional' && !risk) return void problems.push(`${file}:${n}: provisional line needs "D-.. (R-..)"`);
    if (kind === 'blocking' && risk) return void problems.push(`${file}:${n}: a blocking line names no decision`);
    items.push({ kind: /** @type {'blocking' | 'provisional'} */ (kind), decision, risk, text: q, since, line: n });
  });
  return { items, problems };
}
