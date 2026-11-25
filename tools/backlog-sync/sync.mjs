// `npm run backlog:sync` core (3D-05, D-25). Mirror rows here (`repo: shared` / `geoviewer`) store the external id in
// the repo cell, e.g. `shared (WP-70)`; their status is copied from the other repository's BACKLOG at a pinned commit.
// [A] The pinned BACKLOG is vendored as a snapshot with provenance (repository, full SHA, sha256), the 3D-ADR-0001
// pattern, so the check runs offline and needs no token. Refreshing a snapshot is a deliberate step (`--fetch`).
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseRows, section } from '../check-docs.mjs';

/** Row id rule when a source sets no `idPattern`: `<letters>-<n>`, e.g. `WP-70` (3D-05). */
export const DEFAULT_ID = '^[A-Za-z][A-Za-z0-9._-]*-\\d+$';
/** Status table heading when a source sets no `section`. */
export const DEFAULT_SECTION = '## Work-package status';

export const STATUSES = ['proposed', 'ready', 'blocked', 'in-progress', 'review', 'done', 'superseded', 'dropped'];

/**
 * @typedef {{repository: string, dir: string, statusMap?: Record<string, string>, idPattern?: string, section?: string}} Source
 * @typedef {{id: string, line: number, repo: string, external: string, status: string}} MirrorRow
 * @typedef {{repository: string, revision: string, files: {file: string, donorPath: string, sha256: string}[]}} Provenance
 */

/** @param {string} line */
const cells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

/**
 * Mirror rows of this BACKLOG: rows whose repo cell is a key of `sources`; `external` is '' until linked.
 * @param {string[]} lines
 * @param {Record<string, Source>} sources
 * @returns {MirrorRow[]}
 */
export function mirrorRows(lines, sources) {
  return parseRows(lines).flatMap((r) => {
    const repoCell = cells(lines[r.line - 1])[2] ?? '';
    const m = /^([a-z_]+)\s*(?:[([]\s*([A-Za-z0-9._-]+)\s*[)\]])?$/.exec(repoCell);
    if (!m || !(m[1] in sources)) return [];
    return [{ id: r.id, line: r.line, repo: m[1], external: m[2] ?? '', status: r.status }];
  });
}

/**
 * Status of each row of the other BACKLOG: `| <id> | ... | <status> ... |` in its status section (`section`, default
 * "## Work-package status"; whole file when that heading is absent), where `<id>` matches the source's row id rule
 * (`idPattern`, default `<letters>-<n>`; SC writes bare numbers, `^\d+$`, 3D-73).
 * Status = first word of the last cell, lower case; '' when empty.
 * @param {string} text
 * @param {{idPattern?: string, section?: string}} [rule]
 * @returns {Map<string, string>}
 */
export function remoteStatuses(text, rule = {}) {
  const lines = text.split('\n');
  const sec = section(lines, rule.section ?? DEFAULT_SECTION);
  const id = new RegExp(rule.idPattern ?? DEFAULT_ID);
  /** @type {Map<string, string>} */
  const out = new Map();
  for (const l of sec.start >= 0 ? sec.lines : lines) {
    if (!/^\|/.test(l)) continue;
    const c = cells(l);
    if (c.length < 2 || !id.test(c[0])) continue;
    out.set(c[0], ((c[c.length - 1].match(/^[A-Za-z-]+/) || [''])[0]).toLowerCase());
  }
  return out;
}

/** @param {string} text */
export const sha256 = (text) => createHash('sha256').update(text).digest('hex');

/**
 * Load and verify the pinned snapshot of one source.
 * @param {string} root
 * @param {string} key
 * @param {Source} src
 * @returns {{statuses: Map<string, string>, revision: string} | {error: string}}
 */
export function loadSnapshot(root, key, src) {
  const provFile = join(root, src.dir, 'provenance.json');
  if (!existsSync(provFile)) return { error: `${src.dir}/provenance.json: no pinned snapshot for "${key}" (run backlog:sync --fetch ${key} <sha>)` };
  /** @type {Provenance} */
  const prov = JSON.parse(readFileSync(provFile, 'utf8'));
  if (prov.repository !== src.repository) return { error: `${src.dir}/provenance.json: repository ${prov.repository}, expected ${src.repository}` };
  if (!/^[0-9a-f]{40}$/.test(prov.revision)) return { error: `${src.dir}/provenance.json: revision must be a full commit SHA` };
  const entry = prov.files?.[0];
  if (!entry) return { error: `${src.dir}/provenance.json: no files entry` };
  const snapFile = join(root, src.dir, entry.file);
  if (!existsSync(snapFile)) return { error: `${src.dir}/${entry.file}: missing` };
  const text = readFileSync(snapFile, 'utf8');
  if (sha256(text) !== entry.sha256) return { error: `${src.dir}/${entry.file}: sha256 differs from provenance.json (snapshot edited?)` };
  return { statuses: remoteStatuses(text, src), revision: prov.revision };
}

/**
 * Compare mirror rows with the pinned snapshots.
 * @param {string} root
 * @param {string[]} lines this BACKLOG
 * @param {Record<string, Source>} sources
 * @returns {{problems: string[], updates: {row: MirrorRow, to: string}[], summary: string}}
 */
export function compare(root, lines, sources) {
  const rows = mirrorRows(lines, sources);
  const linked = rows.filter((r) => r.external);
  /** @type {string[]} */
  const problems = [];
  /** @type {{row: MirrorRow, to: string}[]} */
  const updates = [];
  /** @type {Map<string, ReturnType<typeof loadSnapshot>>} */
  const snaps = new Map();
  for (const r of linked) {
    const src = sources[r.repo];
    const at = `docs/BACKLOG.md:${r.line}: ${r.id} (${r.repo} ${r.external})`;
    if (!new RegExp(src.idPattern ?? DEFAULT_ID).test(r.external)) {
      problems.push(`${at}: "${r.external}" is not a ${src.repository} row id (rule ${src.idPattern ?? DEFAULT_ID} in tools/backlog-sync/sources.json)`);
      continue;
    }
    if (!snaps.has(r.repo)) snaps.set(r.repo, loadSnapshot(root, r.repo, src));
    const snap = /** @type {ReturnType<typeof loadSnapshot>} */ (snaps.get(r.repo));
    if ('error' in snap) {
      problems.push(`${at}: ${snap.error}`);
      continue;
    }
    if (!snap.statuses.has(r.external)) {
      problems.push(`${at}: no row ${r.external} in ${src.repository}@${snap.revision.slice(0, 7)}`);
      continue;
    }
    const raw = /** @type {string} */ (snap.statuses.get(r.external));
    const to = src.statusMap?.[raw] ?? raw;
    if (!STATUSES.includes(to)) {
      problems.push(`${at}: remote status "${raw}" has no mapping; add it to statusMap in tools/backlog-sync/sources.json`);
      continue;
    }
    if (to !== r.status) {
      problems.push(`${at}: drift - here "${r.status}", ${src.repository}@${snap.revision.slice(0, 7)} says "${to}"`);
      updates.push({ row: r, to });
    }
  }
  const summary = `${rows.length} mirror rows, ${linked.length} linked to an external id, ${problems.length} problem(s)`;
  return { problems, updates, summary };
}

/**
 * Apply status updates: replace the leading status word of the last cell, keep the rest of the cell.
 * @param {string[]} lines
 * @param {{row: MirrorRow, to: string}[]} updates
 */
export function applyUpdates(lines, updates) {
  const out = [...lines];
  for (const { row, to } of updates) {
    const l = out[row.line - 1];
    const cut = l.trimEnd().replace(/\|$/, '').lastIndexOf('|');
    const last = l.slice(cut + 1).replace(/\|\s*$/, '');
    const rest = last.trim().replace(/^[a-z-]+/, '');
    out[row.line - 1] = `${l.slice(0, cut + 1)} ${to}${rest} |`;
  }
  return out;
}
