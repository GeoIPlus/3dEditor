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
    expect(urls).toEqual([`https://api.github.com/repos/GeoIPlus/shared_compnents/contents/docs/BACKLOG.md?ref=${SHA}`]);
    expect(msg).toBe(`pins/shared/BACKLOG.snapshot pinned to GeoIPlus/shared_compnents@${SHA}`);
    expect(JSON.parse(readFileSync(join(root, 'pins/shared/provenance.json'), 'utf8')).files[0].sha256).toBe(sha256(REMOTE));
    expect(compare(root, HERE.split('\n'), SOURCES).problems).toHaveLength(2);
    await expect(fetchPin(root, SOURCES, 'shared', 'abc', async () => '')).rejects.toThrow(/full 40-character/);
  });

  describe('SC row ids: bare numbers (3D-73)', () => {
    const SC = { shared: { ...SOURCES.shared, idPattern: '^\\d+$', section: '## Work-package status and PRs' } };
    const SC_REMOTE = `# SC BACKLOG

## Progress overview

| 99 | not a status row | done |

## Work-package status and PRs

| WP | Title | Modules | Depends on | Size | Status |
|---|---|---|---|---|---|
| 75 | Other | x | - | S | done (D-1) |
| 76 | P4 canary scan | tools | - | S | review ([pull request #67](https://example.invalid/67)) |
| WP-77 | Not an SC id | x | - | S | done |

## Details
`;
    /** @param {string} cell @param {string} status */
    const here = (cell, status) => HERE.replace('| shared [WP-71] | tools | 27 | G0 | S | ready |', `| ${cell} | tools | 27 | G0 | S | ${status} |`).split('\n');

    it('reads bare-number ids only from the configured section', () => {
      expect([...remoteStatuses(SC_REMOTE, SC.shared)]).toEqual([['75', 'done'], ['76', 'review']]);
      expect([...remoteStatuses(SC_REMOTE)]).toEqual([['WP-77', 'done']]);
    });

    it('a row 76 in review yields review for shared (76); no drift', () => {
      const root = pinned(SC_REMOTE);
      const lines = here('shared (76)', 'review').map((l) => l.replace(' (WP-70)', ''));
      expect(compare(root, lines, SC)).toMatchObject({ problems: [], summary: '3 mirror rows, 1 linked to an external id, 0 problem(s)' });
    });

    it('drift between here and the pin fails, and --write fixes it', () => {
      const root = pinned(SC_REMOTE);
      const lines = here('shared (76)', 'in-progress (D-1)').map((l) => l.replace(' (WP-70)', ''));
      const r = compare(root, lines, SC);
      expect(r.problems).toEqual(['docs/BACKLOG.md:9: 3D-46 (shared 76): drift - here "in-progress", GeoIPlus/shared_compnents@cc54eb3 says "review"']);
      const fixed = applyUpdates(lines, r.updates);
      expect(fixed[8]).toBe('| 3D-46 | Canary scan | shared (76) | tools | 27 | G0 | S | review (D-1) |');
      expect(compare(root, fixed, SC).problems).toEqual([]);
    });

    it('an id that breaks the source rule fails, before the pin is read', () => {
      const lines = here('shared (WP-76)', 'review').map((l) => l.replace(' (WP-70)', ''));
      expect(compare(pinned(null), lines, SC).problems).toEqual([
        'docs/BACKLOG.md:9: 3D-46 (shared WP-76): "WP-76" is not a GeoIPlus/shared_compnents row id (rule ^\\d+$ in tools/backlog-sync/sources.json)',
      ]);
    });
  });
});
