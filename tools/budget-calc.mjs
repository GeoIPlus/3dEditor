// Backlog forecast formulas (3D-86, D-236): docs/metrics/README.md §3 (class estimates) and §4 (ETC, overhead,
// growth, throughput, accuracy). Pure functions over parsed data; no I/O.

/** @typedef {import('./budget-parse.mjs').LedgerRow} LedgerRow */
/** @typedef {import('./budget-parse.mjs').BacklogRow} BacklogRow */
/** @typedef {import('./budget-parse.mjs').Estimates} Estimates */

const CLOSED = new Set(['done', 'superseded', 'dropped']);
const MIN_CLASS = 5;
const DAY = 86400000;

/**
 * Quantile by linear interpolation between order statistics.
 * @param {number[]} xs @param {number} q 0..1 @returns {number|null}
 */
export function quantile(xs, q) {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

/** @param {LedgerRow[]} ledger @returns {Map<string, number>} known cost of `wp` sessions per WP id */
export function spentByWp(ledger) {
  /** @type {Map<string, number>} */
  const m = new Map();
  for (const r of ledger) if (r.kind === 'wp' && r.cost !== null) m.set(r.wp, (m.get(r.wp) ?? 0) + r.cost);
  return m;
}

/**
 * Actual cost of every finished (`done`) WP with ledger data, with its class.
 * @param {BacklogRow[]} rows @param {Map<string, number>} spent
 * @returns {{id: string, size: string, type: string, cost: number}[]}
 */
export function samples(rows, spent) {
  return rows.filter((r) => r.status === 'done' && spent.has(r.id))
    .map((r) => ({ id: r.id, size: r.size, type: r.type, cost: /** @type {number} */ (spent.get(r.id)) }));
}

/**
 * Class estimate of README §3: Size x Type with n >= 5, else Size with n >= 5, else all WPs.
 * @param {{size: string, type: string}} row @param {ReturnType<typeof samples>} done
 * @returns {{p50: number, p80: number, basis: string}|null}
 */
export function classEstimate(row, done) {
  const tries = [
    { basis: `${row.size} ${row.type}`, xs: done.filter((d) => d.size === row.size && d.type === row.type) },
    { basis: row.size, xs: done.filter((d) => d.size === row.size) },
  ];
  const hit = tries.find((t) => t.xs.length >= MIN_CLASS) ?? { basis: 'all', xs: done };
  if (hit.xs.length === 0) return null;
  const c = hit.xs.map((d) => d.cost);
  return { p50: /** @type {number} */ (quantile(c, 0.5)), p80: /** @type {number} */ (quantile(c, 0.8)), basis: `${hit.basis} n=${c.length}` };
}

/** @param {string} today YYYY-MM-DD @param {number} days @returns {string} the date `days` before */
export function daysBefore(today, days) {
  return new Date(Date.parse(`${today}T00:00:00Z`) - days * DAY).toISOString().slice(0, 10);
}

/**
 * @typedef {{
 *   today: string, ledger: LedgerRow[], rows: BacklogRow[], estimates: Map<string, Estimates>,
 *   then: {rows: BacklogRow[], date: string}, windowDays?: number
 * }} Input
 * `then`: the status table of the newest BACKLOG commit before the window (or the oldest one inside it) and its date.
 */

/** @param {Input} inp */
export function forecast(inp) {
  const windowDays = inp.windowDays ?? 14;
  const spent = spentByWp(inp.ledger);
  const done = samples(inp.rows, spent);
  const classes = new Map();
  for (const d of done) classes.set(`${d.size} ${d.type}`, (classes.get(`${d.size} ${d.type}`) ?? 0) + 1);
  const bigClasses = [...classes].filter(([, n]) => n >= MIN_CLASS).map(([c, n]) => `${c} n=${n}`).sort();

  // §4.1 known remaining work
  let p50 = 0;
  let p80 = 0;
  let open = 0;
  let unestimated = 0;
  for (const r of inp.rows) {
    if (CLOSED.has(r.status)) continue;
    open++;
    const cls = classEstimate(r, done);
    const cur = inp.estimates.get(r.id)?.current ?? null;
    const e50 = cur?.p50 ?? cls?.p50;
    const e80 = cur?.p80 ?? cls?.p80 ?? e50;
    if (e50 === undefined || e80 === undefined) { unestimated++; continue; }
    const s = spent.get(r.id) ?? 0;
    p50 += Math.max(e50 - s, 0);
    p80 += Math.max(e80 - s, 0);
  }

  // §4.2 overhead, §4.5 throughput: ledger rows inside the window
  const from = daysBefore(inp.today, windowDays);
  const recent = inp.ledger.filter((r) => r.date >= from && r.date <= inp.today);
  const sum = (/** @type {LedgerRow[]} */ xs, /** @type {(r: LedgerRow) => number} */ f) => xs.reduce((a, r) => a + f(r), 0);
  const review = sum(recent.filter((r) => r.kind === 'wp'), (r) => r.reviewCost);
  const wpCost = sum(recent.filter((r) => r.kind === 'wp'), (r) => r.cost ?? 0) - review;
  const overheadCost = sum(recent.filter((r) => r.kind === 'coord' || r.kind === 'evals'), (r) => r.cost ?? 0) + review;
  const k = wpCost > 0 ? 1 + overheadCost / wpCost : null;

  // §4.3 growth from the status-table snapshot at the start of the window
  const before = new Map(inp.then.rows.map((r) => [r.id, r.status]));
  const added = inp.rows.filter((r) => !before.has(r.id)).length;
  const finished = inp.rows.filter((r) => r.status === 'done' && before.get(r.id) !== 'done').length;
  const g = finished > 0 ? added / finished : added > 0 ? Infinity : 0;
  const days = Math.max((Date.parse(inp.today) - Date.parse(inp.then.date)) / DAY, 1);
  const growth = g < 1 ? 1 / (1 - g) : null;

  // §4.5 throughput and waiting
  const apiMin = sum(recent, (r) => r.apiMin ?? 0);
  const timed = recent.filter((r) => r.apiMin !== null && r.spanH !== null);
  const span = sum(timed, (r) => /** @type {number} */ (r.spanH));
  const wait = sum(timed, (r) => /** @type {number} */ (r.spanH) - /** @type {number} */ (r.apiMin) / 60);

  // §4.6 accuracy: last 10 finished WPs with est0 and actual
  const lastDate = new Map();
  for (const r of inp.ledger) if (r.kind === 'wp' && r.date > (lastDate.get(r.wp) ?? '')) lastDate.set(r.wp, r.date);
  const ratios = done.filter((d) => inp.estimates.get(d.id)?.est0)
    .sort((a, b) => (lastDate.get(a.id) ?? '').localeCompare(lastDate.get(b.id) ?? '') || a.id.localeCompare(b.id))
    .slice(-10)
    .map((d) => d.cost / /** @type {number} */ (inp.estimates.get(d.id)?.est0?.p50));

  return {
    today: inp.today, ledgerWps: spent.size, classes: bigClasses, open, unestimated, known: { p50, p80 },
    k, g, added, finished, windowDays: Math.min(windowDays, Math.round(days)), growth,
    etc: k !== null && growth !== null ? { p50: p50 * k * growth, p80: p80 * k * growth } : null,
    perWeek: { rows: (finished * 7) / Math.min(days, windowDays), apiMin: (apiMin * 7) / Math.min(days, windowDays) },
    waitShare: span > 0 ? wait / span : null,
    accuracy: { n: ratios.length, median: quantile(ratios, 0.5), min: ratios.length ? Math.min(...ratios) : null, max: ratios.length ? Math.max(...ratios) : null },
  };
}

/** @param {number|null} x @param {number} d @returns {string} */
const fx = (x, d) => (x === null || !Number.isFinite(x) ? 'TBD' : x.toFixed(d));

/** @param {ReturnType<typeof forecast>} f @returns {string} the output block of README §4 (without fences) */
export function formatBlock(f) {
  const etc = f.etc
    ? `ETC: $${fx(f.etc.p50, 0)} / $${fx(f.etc.p80, 0)}`
    : f.growth === null ? `ETC: not converging (g >= 1)` : 'ETC: TBD (overhead k unknown)';
  const acc = f.accuracy.n
    ? `median ratio ${fx(f.accuracy.median, 2)} (last ${f.accuracy.n}, range ${fx(f.accuracy.min, 2)}..${fx(f.accuracy.max, 2)})`
    : 'TBD (no finished WP with est0 and actual)';
  return [
    `Forecast ${f.today} (ledger n=${f.ledgerWps} WPs, classes with n>=5: ${f.classes.join(', ') || 'none'})`,
    `Known remaining: $${fx(f.known.p50, 0)} / $${fx(f.known.p80, 0)} over ${f.open} rows` +
      (f.unestimated ? ` (${f.unestimated} without estimate)` : '') +
      `   Overhead k=${fx(f.k, 2)}   Growth g=${fx(f.g, 2)} (${f.added} added / ${f.finished} finished, ${f.windowDays} d)`,
    etc,
    `Throughput: ${fx(f.perWeek.rows, 1)} rows/week, ${fx(f.perWeek.apiMin, 0)} model min/week; waiting share ` +
      `${f.waitShare === null ? 'TBD' : fx(f.waitShare * 100, 0)} %   Accuracy: ${acc}`,
  ].join('\n');
}
