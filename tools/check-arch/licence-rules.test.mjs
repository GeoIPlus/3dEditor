// Tests for the licence allow-list of check:arch (3D-67, 3D-ADR-0004 decision 3) on planted dependency trees.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { CONFIG } from './config.mjs';
import { licenceAllowList, licenceProblems, spdxAllowed } from './licence-rules.mjs';
import { STATIC_RULES, context } from './rules.mjs';
import { walk } from './scan.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '../..');
const K = 'packages/geo-model3d';

/** @type {string[]} */
const dirs = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/**
 * Lockfile entries for a kernel that depends on `a`, which depends on `b`; `over` replaces or adds entries.
 * @param {Record<string, object | undefined>} [over]
 */
function lock(over = {}) {
  /** @type {Record<string, object | undefined>} */
  const packages = {
    '': { name: 'repo', workspaces: ['packages/*'] },
    [K]: { version: '0.0.0', dependencies: { a: '1.0.0' } },
    [`node_modules/@geoiplus/geo-model3d`]: { resolved: K, link: true },
    'node_modules/a': { version: '1.0.0', license: 'MIT', dependencies: { b: '^2.0.0' } },
    'node_modules/b': { version: '2.0.0', license: 'ISC' },
    ...over,
  };
  for (const k of Object.keys(packages)) if (packages[k] === undefined) delete packages[k];
  return { lockfileVersion: 3, packages };
}

/** Licence problems of a temp repository built from files. @param {Record<string, unknown>} files */
function problems(files) {
  const root = mkdtempSync(join(tmpdir(), 'check-arch-licence-'));
  dirs.push(root);
  for (const [f, v] of Object.entries(files)) {
    mkdirSync(dirname(join(root, f)), { recursive: true });
    writeFileSync(join(root, f), typeof v === 'string' ? v : JSON.stringify(v));
  }
  return licenceAllowList(context(root, walk(root, CONFIG.skipDirs), CONFIG));
}

const kernelManifest = { name: '@geoiplus/geo-model3d', dependencies: { a: '1.0.0' }, devDependencies: { gpl: '1' } };

describe('check:arch licence allow-list (3D-ADR-0004 decision 3)', () => {
  it('is registered as a check:arch rule', () => expect(STATIC_RULES.licenceAllowList).toBe(licenceAllowList));

  it('passes the current repository tree (proj4, mgrs, wkt-parser: MIT) and visits all three', () => {
    const lockFile = JSON.parse(readFileSync(join(REPO, 'package-lock.json'), 'utf8'));
    const manifest = JSON.parse(readFileSync(join(REPO, K, 'package.json'), 'utf8'));
    const input = { roots: [{ dir: K, manifest }], lockFile: 'package-lock.json', allowed: CONFIG.licences.allowed, readManifest: () => null };
    expect(licenceProblems({ ...input, lock: lockFile })).toEqual([]);
    // Negative control on the real tree: each of the three, made GPL, is reported with its path from the kernel.
    for (const [name, via] of [['proj4', 'proj4'], ['mgrs', 'proj4 > mgrs'], ['wkt-parser', 'proj4 > wkt-parser']]) {
      const planted = structuredClone(lockFile);
      planted.packages[`node_modules/${name}`].license = 'GPL-3.0-only';
      const found = licenceProblems({ ...input, lock: planted });
      expect(found).toHaveLength(1);
      expect(found[0]).toContain(`(${K} > ${via})`);
      expect(found[0]).toContain('copyleft');
    }
  });

  it('passes a permissive tree and ignores devDependencies', () => {
    expect(problems({ [`${K}/package.json`]: kernelManifest, 'package-lock.json': lock() })).toEqual([]);
  });

  it.each(['GPL-3.0-only', 'LGPL-2.1-only', 'AGPL-3.0-or-later', 'GPL-2.0+', 'SSPL-1.0', 'UNLICENSED', 'MIT AND GPL-3.0-only'])(
    'fails on a planted transitive dependency licensed %s',
    (licence) => {
      const found = problems({
        [`${K}/package.json`]: kernelManifest,
        'package-lock.json': lock({ 'node_modules/b': { version: '2.0.0', license: licence } }),
      });
      expect(found).toEqual([expect.stringContaining(`b@2.0.0 (${K} > a > b) licence "${licence}" is not in the allow list`)]);
    },
  );

  it('fails on a dependency without a licence in the lockfile or its installed package.json', () => {
    const found = problems({
      [`${K}/package.json`]: kernelManifest,
      'package-lock.json': lock({ 'node_modules/b': { version: '2.0.0' } }),
      'node_modules/b/package.json': { name: 'b', version: '2.0.0' },
    });
    expect(found).toEqual([expect.stringContaining('b@2.0.0 (packages/geo-model3d > a > b) has no licence')]);
  });

  it('reads the licence from the installed package.json when the lockfile has none (offline fallback)', () => {
    const files = {
      [`${K}/package.json`]: kernelManifest,
      'package-lock.json': lock({ 'node_modules/b': { version: '2.0.0' } }),
    };
    expect(problems({ ...files, 'node_modules/b/package.json': { license: 'BSD-3-Clause' } })).toEqual([]);
    expect(problems({ ...files, 'node_modules/b/package.json': { licenses: [{ type: 'GPL-2.0' }] } }))
      .toEqual([expect.stringContaining('licence "(GPL-2.0)"')]);
  });

  it('resolves nested copies before hoisted ones', () => {
    const found = problems({
      [`${K}/package.json`]: kernelManifest,
      'package-lock.json': lock({
        'node_modules/a/node_modules/b': { version: '1.0.0', license: 'GPL-3.0-only' },
        'node_modules/b': { version: '2.0.0', license: 'MIT' },
      }),
    });
    expect(found).toEqual([expect.stringContaining('b@1.0.0 (packages/geo-model3d > a > b)')]);
  });

  it('checks every services/<name> package, through a linked kernel workspace', () => {
    const found = problems({
      [`${K}/package.json`]: kernelManifest,
      'services/kernel/package.json': { name: 'kernel-service', dependencies: { '@geoiplus/geo-model3d': '*', srv: '1' } },
      'package-lock.json': lock({
        'services/kernel': { dependencies: { '@geoiplus/geo-model3d': '*', srv: '1' } },
        'services/kernel/node_modules/srv': { version: '1.0.0', license: 'AGPL-3.0-only' },
      }),
    });
    expect(found).toEqual([expect.stringContaining('srv@1.0.0 (services/kernel > srv) licence "AGPL-3.0-only"')]);
  });

  it('fails closed: no lockfile, a root or a dependency missing from it', () => {
    expect(problems({ [`${K}/package.json`]: kernelManifest }))
      .toEqual([expect.stringContaining('missing or without "packages"')]);
    expect(problems({ [`${K}/package.json`]: kernelManifest, 'package-lock.json': lock({ [K]: undefined }) }))
      .toEqual([expect.stringContaining(`${K} is not in the lockfile`)]);
    expect(problems({ [`${K}/package.json`]: kernelManifest, 'package-lock.json': lock({ 'node_modules/b': undefined }) }))
      .toEqual([expect.stringContaining('b (needed by packages/geo-model3d > a) is not in the lockfile')]);
  });

  it('skips a missing optional dependency and needs no lockfile for a kernel without dependencies', () => {
    const a = { version: '1.0.0', license: 'MIT', optionalDependencies: { opt: '1' }, peerDependencies: { p: '1' }, peerDependenciesMeta: { p: { optional: true } } };
    expect(problems({ [`${K}/package.json`]: kernelManifest, 'package-lock.json': lock({ 'node_modules/a': a, 'node_modules/b': undefined }) })).toEqual([]);
    expect(problems({ [`${K}/package.json`]: { name: '@geoiplus/geo-model3d' } })).toEqual([]);
  });
});

describe('SPDX expressions', () => {
  const allow = new Set(CONFIG.licences.allowed.map((a) => a.toLowerCase()));
  it.each([
    ['MIT', true], ['Apache-2.0', true], ['BSL-1.0', true], ['Unlicense', true], ['(MIT OR GPL-3.0-only)', true],
    ['MIT AND ISC', true], ['(MIT AND BSD-3-Clause) OR LGPL-2.1-only', true], ['MIT AND GPL-3.0-only', false],
    ['Apache-2.0 WITH LLVM-exception', false], ['GPL-2.0+', false], ['Apache 2.0', false], ['(MIT', false], ['', false],
  ])('%s -> %s', (expr, ok) => expect(spdxAllowed(expr, allow)).toBe(ok));
});
