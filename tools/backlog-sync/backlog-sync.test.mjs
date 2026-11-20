// backlog:sync on fixtures (3D-05, D-25): pinned snapshot, no network.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fetchPin } from './cli.mjs';
import { applyUpdates, compare, mirrorRows, remoteStatuses, sha256 } from './sync.mjs';

const SHA = 'cc54eb3'.padEnd(40, '0');
const SOURCES = {
  shared: { repository: 'GeoIPlus/shared_compnents', path: 'docs/BACKLOG.md', dir: 'pins/shared', statusMap: { started: 'in-progress' } },
  geoviewer: { repository: 'GeoIPlus/geoviewer', path: 'BACKLOG.md', dir: 'pins/geoviewer' },
};
const HERE = `# BACKLOG

## Work-package status

| ID | Title | Repo | Module | Depends | Gate | Size | Status |
|---|---|---|---|---|---|---|---|
| 3D-01 | Local | here | docs | - | G0 | S | done |
| 3D-45 | Pinned schemas | shared (WP-70) | contracts | 06 | G3 | S | proposed (D-37) |
| 3D-46 | Canary scan | shared [WP-71] | tools | 27 | G0 | S | ready |
| 3D-47 | Not linked yet | shared | x | - | G3 | S | proposed |
| 3D-50 | Host adapter | geoviewer | host | 23 | G5 | M | proposed |
`;
const REMOTE = `# SC BACKLOG

## Work-package status

| ID | Title | Status |
|---|---|---|
| WP-70 | Vendor 3deditor schemas | in-progress (wp/70) |
| WP-71 | Canary scan | started |
| WP-72 | Other | |
`;

/** @type {string[]} */
const dirs = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** @param {string | null} snapshot @param {object} [provPatch] */
function pinned(snapshot = REMOTE, provPatch = {}) {
  const root = mkdtempSync(join(tmpdir(), 'backlog-sync-test-'));
  dirs.push(root);
  if (snapshot !== null) {
    mkdirSync(join(root, 'pins/shared'), { recursive: true });
    writeFileSync(join(root, 'pins/shared/BACKLOG.snapshot'), snapshot);
    const prov = { repository: 'GeoIPlus/shared_compnents', revision: SHA,
      files: [{ file: 'BACKLOG.snapshot', donorPath: 'docs/BACKLOG.md', sha256: sha256(snapshot) }], ...provPatch };
    writeFileSync(join(root, 'pins/shared/provenance.json'), JSON.stringify(prov));
  }
  return root;
}

describe('backlog:sync', () => {
  it('finds mirror rows and their external ids', () => {
    const rows = mirrorRows(HERE.split('\n'), SOURCES);
    expect(rows.map((r) => [r.id, r.repo, r.external, r.status])).toEqual([
      ['3D-45', 'shared', 'WP-70', 'proposed'], ['3D-46', 'shared', 'WP-71', 'ready'],
      ['3D-47', 'shared', '', 'proposed'], ['3D-50', 'geoviewer', '', 'proposed'],
    ]);
  });

  it('reads statuses of the other BACKLOG, empty when blank', () => {
    expect([...remoteStatuses(REMOTE)]).toEqual([['WP-70', 'in-progress'], ['WP-71', 'started'], ['WP-72', '']]);
  });

  it('reports drift against the pinned snapshot (mapped statuses), CI fails', () => {
    const r = compare(pinned(), HERE.split('\n'), SOURCES);
    expect(r.problems).toEqual([
      'docs/BACKLOG.md:8: 3D-45 (shared WP-70): drift - here "proposed", GeoIPlus/shared_compnents@cc54eb3 says "in-progress"',
      'docs/BACKLOG.md:9: 3D-46 (shared WP-71): drift - here "ready", GeoIPlus/shared_compnents@cc54eb3 says "in-progress"',
    ]);
    expect(r.summary).toBe('4 mirror rows, 2 linked to an external id, 2 problem(s)');
  });

  it('--write copies the status and keeps the note; then no drift', () => {
    const root = pinned();
    const lines = HERE.split('\n');
    const fixed = applyUpdates(lines, compare(root, lines, SOURCES).updates);
    expect(fixed[7]).toBe('| 3D-45 | Pinned schemas | shared (WP-70) | contracts | 06 | G3 | S | in-progress (D-37) |');
    expect(fixed[8]).toBe('| 3D-46 | Canary scan | shared [WP-71] | tools | 27 | G0 | S | in-progress |');
    expect(compare(root, fixed, SOURCES).problems).toEqual([]);
  });

  it('fails on an edited snapshot, a short revision, a missing pin, an unknown id and an unmapped status', () => {
    const lines = HERE.split('\n');
    const edited = pinned(REMOTE);
    writeFileSync(join(edited, 'pins/shared/BACKLOG.snapshot'), REMOTE.replace('started', 'done'));
    expect(compare(edited, lines, SOURCES).problems[0]).toMatch(/sha256 differs from provenance.json/);
    expect(compare(pinned(REMOTE, { revision: 'cc54eb3' }), lines, SOURCES).problems[0]).toMatch(/full commit SHA/);
    expect(compare(pinned(null), lines, SOURCES).problems[0]).toMatch(/no pinned snapshot for "shared"/);
    const unknown = lines.map((l) => l.replace('WP-71', 'WP-99'));
    expect(compare(pinned(), unknown, SOURCES).problems[1]).toMatch(/no row WP-99 in GeoIPlus\/shared_compnents@cc54eb3/);
    const blank = lines.map((l) => l.replace('WP-71', 'WP-72'));
    expect(compare(pinned(), blank, SOURCES).problems[1]).toMatch(/remote status "" has no mapping/);
  });

  it('passes when nothing is linked yet (today: no external ids)', () => {
    const lines = HERE.split('\n').map((l) => l.replace(/ (\(WP-70\)|\[WP-71\])/, ''));
    expect(compare(pinned(null), lines, SOURCES)).toMatchObject({ problems: [], summary: '4 mirror rows, 0 linked to an external id, 0 problem(s)' });
  });

  it('--fetch pins a downloaded BACKLOG with provenance (fetcher injected, no network)', async () => {
    const root = pinned(null);
    /** @type {string[]} */
    const urls = [];
    const msg = await fetchPin(root, SOURCES, 'shared', SHA, async (url) => (urls.push(url), REMOTE));
    expect(urls).toEqual([`https://raw.githubusercontent.com/GeoIPlus/shared_compnents/${SHA}/docs/BACKLOG.md`]);
    expect(msg).toBe(`pins/shared/BACKLOG.snapshot pinned to GeoIPlus/shared_compnents@${SHA}`);
    expect(JSON.parse(readFileSync(join(root, 'pins/shared/provenance.json'), 'utf8')).files[0].sha256).toBe(sha256(REMOTE));
    expect(compare(root, HERE.split('\n'), SOURCES).problems).toHaveLength(2);
    await expect(fetchPin(root, SOURCES, 'shared', 'abc', async () => '')).rejects.toThrow(/full 40-character/);
  });
});
