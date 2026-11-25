// Row dates from the git history of BACKLOG.md for the forecast growth g (3D-89, D-250). Node built-ins and git only.
// Every commit reachable from HEAD is read once (one `git cat-file --batch`); each distinct blob is parsed once.
import { execFileSync } from 'node:child_process';
import { parseStatusTable } from './budget-parse.mjs';

const BACKLOG = 'docs/BACKLOG.md';

/**
 * @typedef {{
 *   baseline: {sha: string, date: string},
 *   first: Map<string, string>,
 *   done: Map<string, string>
 * }} RowHistory
 * `baseline`: the earliest commit holding BACKLOG.md; `first` / `done`: per row id, the UTC day of the earliest commit
 * whose status table holds the id / holds it with status `done`.
 */

/** @param {string} root @param {string[]} args @param {string} [input] @returns {string} */
const git = (root, args, input) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8', input, maxBuffer: 1 << 30 });

/**
 * Parse the output of `git cat-file --batch`: `<oid> <type> <size>\n<content>\n` per object, `<name> missing\n` else.
 * @param {Buffer} buf @returns {(string|null)[]} contents in input order, null for a missing object
 */
export function splitBatch(buf) {
  /** @type {(string|null)[]} */
  const res = [];
  let i = 0;
  while (i < buf.length) {
    const nl = buf.indexOf(10, i);
    const head = buf.toString('utf8', i, nl);
    i = nl + 1;
    if (/ missing$/.test(head)) { res.push(null); continue; }
    const size = Number(head.split(' ')[2]);
    res.push(buf.toString('utf8', i, i + size));
    i += size + 1;
  }
  return res;
}

/**
 * Walk the BACKLOG history of HEAD once.
 * @param {string} root repository root
 * @returns {RowHistory|null} null when HEAD has no commit with BACKLOG.md
 * @throws {Error} on a shallow clone (dates of the cut-off history would be wrong, D-251)
 */
export function rowHistory(root) {
  if (git(root, ['rev-parse', '--is-shallow-repository']).trim() === 'true') {
    throw new Error('budget: shallow clone - growth g needs the full BACKLOG history; run `git fetch --unshallow`');
  }
  const log = git(root, ['log', '--format=%H %ct', 'HEAD']).trim();
  if (!log) return null;
  const commits = log.split('\n').map((l) => {
    const [sha, t] = l.split(' ');
    return { sha, t: Number(t) };
  });
  const oids = git(root, ['cat-file', '--batch-check=%(objectname)'], commits.map((c) => `${c.sha}:${BACKLOG}`).join('\n') + '\n')
    .trim().split('\n').map((l) => (/ missing$/.test(l) ? null : l));
  const unique = [...new Set(oids.filter((o) => o !== null))];
  const texts = splitBatch(execFileSync('git', ['cat-file', '--batch'], { cwd: root, input: unique.join('\n') + '\n', maxBuffer: 1 << 30 }));
  /** @type {Map<string, {id: string, status: string}[]>} */
  const tables = new Map(unique.map((o, n) => [o, parseStatusTable((texts[n] ?? '').split('\n'))]));
  /** @type {Map<string, number>} */
  const first = new Map();
  /** @type {Map<string, number>} */
  const done = new Map();
  /** @type {{sha: string, t: number}|null} */
  let base = null;
  const keepMin = (/** @type {Map<string, number>} */ m, /** @type {string} */ id, /** @type {number} */ t) => {
    if (!m.has(id) || t < /** @type {number} */ (m.get(id))) m.set(id, t);
  };
  commits.forEach((c, n) => {
    const oid = oids[n];
    if (oid === null) return;
    if (!base || c.t < base.t || (c.t === base.t && c.sha < base.sha)) base = c;
    for (const r of tables.get(oid) ?? []) {
      keepMin(first, r.id, c.t);
      if (r.status === 'done') keepMin(done, r.id, c.t);
    }
  });
  if (!base) return null;
  const day = (/** @type {number} */ t) => new Date(t * 1000).toISOString().slice(0, 10);
  const days = (/** @type {Map<string, number>} */ m) => new Map([...m].map(([id, t]) => [id, day(t)]));
  const b = /** @type {{sha: string, t: number}} */ (base);
  return { baseline: { sha: b.sha.slice(0, 7), date: day(b.t) }, first: days(first), done: days(done) };
}
