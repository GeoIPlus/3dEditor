// Pure parts of the daily report (3D-137, D-475 part B): day bounds in a time zone, BACKLOG status diff, decisions
// added, open owner actions, ledger rows finalized on the day. Inputs are document texts; git lives in daily-report.mjs.
import { section, cells } from './check-docs-md.mjs';

/**
 * @typedef {{id: string, title: string, status: string, raw: string}} StatusRow
 * @typedef {{wp: string, session: string, kind: string, cost: number|null, out: number|null, cw: number|null,
 *   cr: number|null, ctx: number|null, state: string, source: string, key: string}} LedgerRow
 */

/** @param {number} ms @param {string} tz @returns {number} offset of `tz` from UTC at `ms`, in ms */
function tzOffset(ms, tz) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  /** @type {Record<string, number>} */
  const p = {};
  for (const x of f.formatToParts(new Date(ms))) if (x.type !== 'literal') p[x.type] = Number(x.value);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - ms;
}

/** @param {string} date YYYY-MM-DD @param {string} tz @returns {number} UTC ms of local midnight starting `date` */
function localMidnight(date, tz) {
  const [y, m, d] = date.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d);
  const first = guess - tzOffset(guess, tz);
  return guess - tzOffset(first, tz);
}

/**
 * Start and end of a calendar day in a time zone, as ISO UTC instants.
 * @param {string} date YYYY-MM-DD @param {string} tz IANA zone
 * @returns {{start: string, end: string}}
 */
export function dayBounds(date, tz) {
  if (!/^\d{4}-\d\d-\d\d$/.test(date)) throw new Error(`bad --date "${date}", expected YYYY-MM-DD`);
  const [y, m, d] = date.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  return { start: new Date(localMidnight(date, tz)).toISOString(), end: new Date(localMidnight(next, tz)).toISOString() };
}

/** @param {string} text BACKLOG.md @returns {Map<string, StatusRow>} rows of "## Work-package status" */
export function statusRows(text) {
  const sec = section(text.split('\n'), '## Work-package status').lines;
  /** @type {Map<string, StatusRow>} */
  const rows = new Map();
  for (const l of sec) {
    const m = /^\|\s*(3D-\d+(?:\.\d+)?)\s*\|/.exec(l);
    if (!m) continue;
    const c = cells(l);
    const raw = c[c.length - 1];
    rows.set(m[1], { id: m[1], title: c[1], status: (raw.match(/^[a-z-]+/) || ['?'])[0], raw });
  }
  return rows;
}

/**
 * Rows whose status word differs between two BACKLOG texts (new rows have `from = null`).
 * @param {string} before @param {string} after
 * @returns {{id: string, title: string, from: string|null, to: string, raw: string}[]} in table order of `after`
 */
export function statusChanges(before, after) {
  const a = statusRows(before);
  /** @type {{id: string, title: string, from: string|null, to: string, raw: string}[]} */
  const out = [];
  for (const r of statusRows(after).values()) {
    const from = a.get(r.id)?.status ?? null;
    if (from !== r.status) out.push({ id: r.id, title: r.title, from, to: r.status, raw: r.raw });
  }
  return out;
}

/** @param {string} text DECISIONS.md @returns {Map<string, string>} decision id -> text of "## Decisions" */
export function decisions(text) {
  /** @type {Map<string, string>} */
  const out = new Map();
  for (const l of section(text.split('\n'), '## Decisions').lines) {
    const m = /^\|\s*(D-\d+|D-3D\d+-\d+)\s*\|/.exec(l);
    if (m) out.set(m[1], cells(l)[1] ?? '');
  }
  return out;
}

/** @param {string} before @param {string} after @returns {{id: string, text: string}[]} decisions added */
export function decisionsAdded(before, after) {
  const a = decisions(before);
  return [...decisions(after)].filter(([id]) => !a.has(id)).map(([id, text]) => ({ id, text }));
}

/** @param {string} s @param {number} n @returns {string} */
export const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 3)}...` : s);

/**
 * Owner actions open at the end of the day: rows in review (accept), blocked and proposed rows, open ledger proposals.
 * @param {string} backlog @param {string} ledger
 * @returns {{review: string[], blocked: string[], proposed: string[], proposals: number}}
 */
export function ownerActions(backlog, ledger) {
  const rows = [...statusRows(backlog).values()];
  const ids = (/** @type {string} */ s) => rows.filter((r) => r.status === s).map((r) => r.id);
  const props = section(ledger.split('\n'), '## Improvement proposals').lines
    .filter((l) => /^\|\s*\d{4}-/.test(l) && /^open\b/.test(cells(l).at(-1) ?? '')).length;
  return { review: ids('review'), blocked: ids('blocked'), proposed: ids('proposed'), proposals: props };
}

/** @param {string|undefined} s @returns {number|null} */
const num = (s) => (/^-?\d+(\.\d+)?$/.test((s ?? '').trim()) ? Number(s) : null);

/** @param {string} text LEDGER.md @returns {LedgerRow[]} rows of "## Sessions" */
export function ledgerRows(text) {
  const lines = section(text.split('\n'), '## Sessions').lines;
  const header = lines.find((l) => /^\|\s*date\s*\|/.test(l));
  if (!header) return [];
  const col = cells(header);
  const get = (/** @type {string[]} */ c, /** @type {string} */ n) => (col.includes(n) ? c[col.indexOf(n)] : undefined);
  return lines.filter((l) => /^\|\s*\d{4}-\d\d-\d\d\s*\|/.test(l)).map((l) => {
    const c = cells(l);
    const session = get(c, 'session') ?? '';
    const wp = get(c, 'WP') ?? '';
    return { wp, session, kind: get(c, 'kind') ?? '', cost: num(get(c, 'cost_usd')), out: num(get(c, 'out_k')),
      cw: num(get(c, 'cache_write_k')), cr: num(get(c, 'cache_read_k')), ctx: num(get(c, 'ctx_k')),
      state: get(c, 'state') ?? '', source: get(c, 'source') ?? '',
      key: /^(session_|cse_)/.test(session) ? session : `${get(c, 'date')} ${wp}` };
  });
}

/** Flag limits (D-475 part B): context over 250k; cache writes over twice the context (the context was rebuilt). */
export const CTX_LIMIT_K = 250;

/** @param {LedgerRow} r @returns {string[]} */
export function flags(r) {
  const f = [];
  if (r.ctx !== null && r.ctx > CTX_LIMIT_K) f.push(`ctx>${CTX_LIMIT_K}k`);
  if (r.ctx !== null && r.cw !== null && r.cw > 2 * r.ctx) f.push('cache-write>2x ctx');
  return f;
}

/**
 * Ledger rows that became `final` between two ledger texts, totals by kind, and rows still not final at the end.
 * Cost is per session at its finish (as tools/budget.mjs), so a session counts on the day its row became final.
 * @param {string} before @param {string} after
 */
export function ledgerDay(before, after) {
  const was = new Map(ledgerRows(before).map((r) => [r.key, r]));
  const now = ledgerRows(after);
  const finalized = now.filter((r) => r.state === 'final' && was.get(r.key)?.state !== 'final');
  /** @type {Map<string, {n: number, cost: number, unknown: number, out: number}>} */
  const totals = new Map();
  for (const r of finalized) {
    const t = totals.get(r.kind) ?? { n: 0, cost: 0, unknown: 0, out: 0 };
    t.n += 1;
    if (r.cost === null) t.unknown += 1; else t.cost += r.cost;
    t.out += r.out ?? 0;
    totals.set(r.kind, t);
  }
  return { finalized, totals, notFinal: now.filter((r) => r.state !== 'final') };
}
