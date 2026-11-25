// Parsers for the backlog forecast (3D-86, D-236): session ledger, BACKLOG status table and Details estimates.
// Method: docs/metrics/README.md §1-§4. Node built-ins only.
import { section, cells } from './check-docs-md.mjs';

/**
 * @typedef {{date: string, wp: string, session: string, kind: string, cost: number|null, apiMin: number|null,
 *   spanH: number|null, review: string, reviewCost: number}} LedgerRow
 * @typedef {{id: string, size: string, type: string, status: string}} BacklogRow
 * @typedef {{p50: number, p80: number|null}} Est
 * @typedef {{est0: Est|null, est0Prior: boolean, current: Est|null}} Estimates
 */

/** @param {string} s @returns {number|null} a ledger number, null for `?`, `-` or empty */
function num(s) {
  const t = (s ?? '').trim();
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null;
}

/** @param {string} text LEDGER.md @returns {LedgerRow[]} rows of "## Sessions" */
export function parseLedger(text) {
  const lines = section(text.split('\n'), '## Sessions').lines;
  const header = lines.find((l) => /^\|\s*date\s*\|/.test(l));
  if (!header) return [];
  const col = cells(header);
  const at = (/** @type {string} */ name) => col.indexOf(name);
  /** @type {LedgerRow[]} */
  const rows = [];
  for (const l of lines) {
    if (!/^\|\s*\d{4}-\d\d-\d\d\s*\|/.test(l)) continue;
    const c = cells(l);
    const review = c[at('review')] ?? '';
    const rc = /\$\s*(\d+(?:\.\d+)?)/.exec(review);
    rows.push({
      date: c[at('date')],
      wp: c[at('WP')],
      session: c[at('session')],
      kind: c[at('kind')],
      cost: num(c[at('cost_usd')]),
      apiMin: num(c[at('api_min')]),
      spanH: num(c[at('span_h')]),
      review,
      reviewCost: rc ? Number(rc[1]) : 0,
    });
  }
  return rows;
}

/** @param {string[]} lines BACKLOG lines @returns {BacklogRow[]} rows of "## Work-package status" */
export function parseStatusTable(lines) {
  const sec = section(lines, '## Work-package status').lines;
  const header = sec.find((l) => /^\|\s*WP\s*\|/.test(l));
  if (!header) return [];
  const col = cells(header);
  /** @type {BacklogRow[]} */
  const rows = [];
  for (const l of sec) {
    const m = /^\|\s*(3D-\d+(?:\.\d+)?)\s*\|/.exec(l);
    if (!m) continue;
    const c = cells(l);
    rows.push({
      id: m[1],
      size: c[col.indexOf('Size')] ?? '',
      type: col.includes('Type') ? c[col.indexOf('Type')] : '',
      status: (c[c.length - 1].match(/^[a-z-]+/) || [''])[0],
    });
  }
  return rows;
}

/** @param {string} text the part after `Estimate:` @returns {Est|null} */
function money(text) {
  const p50 = /\$\s*(\d+(?:\.\d+)?)/.exec(text);
  if (!p50) return null;
  const p80 = /p80\s*\$\s*(\d+(?:\.\d+)?)/.exec(text);
  return { p50: Number(p50[1]), p80: p80 ? Number(p80[1]) : null };
}

/**
 * Estimates per row id from "## Details" (README §3). Only entries whose heading names exactly one id are read.
 * `current` is the newest `Re-estimate` with a figure, else `est0` unless that is a `prior` line.
 * @param {string[]} lines BACKLOG lines
 * @returns {Map<string, Estimates>}
 */
export function parseEstimates(lines) {
  const sec = section(lines, '## Details').lines;
  /** @type {Map<string, Estimates>} */
  const out = new Map();
  /** @type {string|null} */
  let id = null;
  for (const l of sec) {
    const h = /^### (3D-\d+(?:\.\d+)?)(\s+(.*))?$/.exec(l);
    if (h) {
      id = /^(\.\.|,)/.test((h[3] ?? '').trim()) ? null : h[1];
      if (id) out.set(id, { est0: null, est0Prior: false, current: null });
      continue;
    }
    if (/^#{1,3} /.test(l)) id = null;
    const e = id ? out.get(id) : undefined;
    if (!e) continue;
    const est = /^- Estimate:\s*(.*)$/.exec(l);
    if (est && !e.est0) {
      e.est0 = money(est[1]);
      e.est0Prior = /^prior\b/i.test(est[1].trim());
      if (e.est0 && !e.est0Prior) e.current = e.est0;
    }
    const re = /^- Re-estimate \d{4}-\d\d-\d\d:\s*(.*)$/.exec(l);
    if (re && !/^prior\b/i.test(re[1].trim()) && money(re[1])) e.current = money(re[1]);
  }
  return out;
}
