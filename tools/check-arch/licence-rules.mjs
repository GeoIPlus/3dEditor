// Licence allow-list of check:arch (3D-67): every runtime dependency (transitive) of the kernel and of each service has
// a licence from 3D-ADR-0004 decision 3 (D-109). Offline: licences come from package-lock.json (lockfile v3 `license`),
// else from the installed package.json. Fails closed: a dependency whose licence cannot be read is a problem.
// Code licences only; the EPSG data terms (Q-43) are not decided here.
import { readFileSync } from 'node:fs';
import { join, posix } from 'node:path';

/**
 * @typedef {{version?: string, license?: string, link?: boolean, resolved?: string, dependencies?: Record<string, string>,
 *   optionalDependencies?: Record<string, string>, peerDependencies?: Record<string, string>,
 *   peerDependenciesMeta?: Record<string, {optional?: boolean}>}} LockEntry
 * @typedef {{packages?: Record<string, LockEntry>}} Lock
 * @typedef {{name?: string, license?: unknown, licenses?: unknown, dependencies?: Record<string, string>,
 *   optionalDependencies?: Record<string, string>, peerDependencies?: Record<string, string>,
 *   peerDependenciesMeta?: Record<string, {optional?: boolean}>}} Manifest
 * @typedef {{roots: {dir: string, manifest: Manifest}[], lock: Lock | null, lockFile: string, allowed: string[],
 *   readManifest: (key: string) => Manifest | null}} LicenceInput
 */

const RULE = '3D-ADR-0004 decision 3, D-109';

/** @param {Ctx} ctx @returns {string[]} */
export function licenceAllowList(ctx) {
  const c = ctx.config.licences;
  const serviceManifest = new RegExp(`^${c.servicesDir}/[^/]+/package\\.json$`);
  const dirs = [ctx.config.kernel.dir, ...ctx.files.filter((f) => serviceManifest.test(f)).map((f) => posix.dirname(f))];
  /** @param {string} file */
  const json = (file) => {
    try {
      const text = ctx.text(file);
      return text === null ? null : JSON.parse(text);
    } catch {
      return null;
    }
  };
  const roots = [...new Set(dirs)].flatMap((dir) => {
    const manifest = json(`${dir}/package.json`);
    return manifest ? [{ dir, manifest }] : [];
  });
  const input = {
    roots, lock: json(c.lockFile), lockFile: c.lockFile, allowed: c.allowed,
    readManifest: (/** @type {string} */ key) => readJson(join(ctx.root, key, 'package.json')),
  };
  return [...plantedControl(c.allowed, c.lockFile), ...licenceProblems(input)];
}

/**
 * Walk the runtime dependency tree of each root through the lockfile and check each package's licence.
 * @param {LicenceInput} input
 * @returns {string[]}
 */
export function licenceProblems({ roots, lock, lockFile, allowed, readManifest }) {
  /** @type {string[]} */
  const problems = [];
  const at = `${lockFile}:1`;
  const packages = lock?.packages;
  const withDeps = roots.filter((r) => Object.keys(runtimeDeps(r.manifest)).length > 0);
  if (withDeps.length === 0) return problems;
  if (!packages) return withDeps.map((r) => `${at}: missing or without "packages" (lockfile v2+); runtime dependencies of ${r.dir} cannot be checked (${RULE})`);
  const allow = new Set(allowed.map((a) => a.toLowerCase()));
  /** @type {Set<string>} */
  const seen = new Set();
  for (const root of withDeps) {
    /** @type {{key: string, entry: LockEntry | Manifest, via: string[]}[]} */
    const queue = [{ key: root.dir, entry: packages[root.dir] ?? root.manifest, via: [root.dir] }];
    if (!packages[root.dir]) problems.push(`${at}: ${root.dir} is not in the lockfile; run npm install at the repository root (${RULE})`);
    while (queue.length > 0) {
      const { key, entry, via } = /** @type {(typeof queue)[number]} */ (queue.shift());
      const deps = runtimeDeps(entry);
      for (const [name, optional] of Object.entries(deps)) {
        const found = resolve(packages, key, name);
        if (!found) {
          if (!optional) problems.push(`${at}: ${name} (needed by ${via.join(' > ')}) is not in the lockfile; its licence cannot be checked (${RULE})`);
          continue;
        }
        if (seen.has(found.key)) continue;
        seen.add(found.key);
        const chain = [...via, name];
        if (!found.workspace) {
          const licence = found.entry.license ?? manifestLicence(readManifest(found.key));
          const verdict = licence ? spdxAllowed(licence, allow) : false;
          if (!verdict) problems.push(`${at}: ${name}@${found.entry.version ?? '?'} (${chain.join(' > ')}) ${describe(licence)} (${RULE})`);
        }
        queue.push({ key: found.key, entry: found.entry, via: chain });
      }
    }
  }
  return problems;
}

/** @param {string | null} licence */
function describe(licence) {
  if (!licence) return 'has no licence in the lockfile or its package.json';
  const copyleft = /\b(A|L)?GPL/i.test(licence) ? '; copyleft: no GPL, LGPL or AGPL' : '';
  return `licence "${licence}" is not in the allow list${copyleft}`;
}

/**
 * Runtime dependency names -> optional? (devDependencies are out of scope).
 * @param {LockEntry | Manifest} entry
 * @returns {Record<string, boolean>}
 */
function runtimeDeps(entry) {
  /** @type {Record<string, boolean>} */
  const out = {};
  for (const n of Object.keys(entry.dependencies ?? {})) out[n] = false;
  for (const n of Object.keys(entry.peerDependencies ?? {})) out[n] = entry.peerDependenciesMeta?.[n]?.optional === true;
  for (const n of Object.keys(entry.optionalDependencies ?? {})) out[n] = true;
  return out;
}

/**
 * Node resolution over lockfile keys: `<from>/node_modules/<name>`, then each ancestor, then the root; links followed.
 * @param {Record<string, LockEntry>} packages
 * @param {string} from lockfile key of the dependent
 * @param {string} name
 * @returns {{key: string, entry: LockEntry, workspace: boolean} | null}
 */
function resolve(packages, from, name) {
  let dir = from;
  for (;;) {
    const key = dir ? `${dir}/node_modules/${name}` : `node_modules/${name}`;
    const entry = packages[key];
    if (entry) {
      if (!entry.link) return { key, entry, workspace: false };
      const target = entry.resolved ?? '';
      return packages[target] ? { key: target, entry: packages[target], workspace: !target.includes('node_modules/') } : null;
    }
    if (!dir) return null;
    // `a/node_modules/@s/b` -> `a`; `node_modules/b` and a workspace dir -> the repository root.
    dir = /^(.*)\/node_modules\/(@[^/]+\/)?[^/]+$/.exec(dir)?.[1] ?? '';
  }
}

/** @param {Manifest | null} m @returns {string | null} */
function manifestLicence(m) {
  const l = m?.license ?? m?.licenses;
  if (typeof l === 'string') return l;
  if (l && typeof l === 'object' && !Array.isArray(l) && typeof (/** @type {{type?: unknown}} */ (l).type) === 'string') return /** @type {{type: string}} */ (l).type;
  if (Array.isArray(l)) {
    const types = l.map((x) => (typeof x === 'string' ? x : x?.type)).filter((t) => typeof t === 'string');
    return types.length > 0 ? `(${types.join(' OR ')})` : null;
  }
  return null;
}

/**
 * SPDX expression against the allow list: OR passes if one side passes, AND needs both, WITH (an exception) and `+`
 * never pass (not in the list). An unparsable expression does not pass.
 * @param {string} expr
 * @param {Set<string>} allow lower-case ids
 * @returns {boolean}
 */
export function spdxAllowed(expr, allow) {
  const tokens = expr.replace(/[()]/g, ' $& ').trim().split(/\s+/);
  let i = 0;
  /** @returns {boolean} */
  const orExpr = () => {
    let v = andExpr();
    while (tokens[i]?.toUpperCase() === 'OR') { i++; v = andExpr() || v; }
    return v;
  };
  /** @returns {boolean} */
  const andExpr = () => {
    let v = atom();
    while (tokens[i]?.toUpperCase() === 'AND') { i++; v = atom() && v; }
    return v;
  };
  /** @returns {boolean} */
  const atom = () => {
    const t = tokens[i++];
    if (t === '(') {
      const v = orExpr();
      if (tokens[i++] !== ')') throw new Error('unbalanced');
      return v;
    }
    if (!t || /^(AND|OR|WITH|\))$/i.test(t)) throw new Error('unexpected token');
    if (tokens[i]?.toUpperCase() === 'WITH') { i += 2; return false; }
    return allow.has(t.toLowerCase());
  };
  try {
    const v = orExpr();
    return i === tokens.length && v;
  } catch {
    return false;
  }
}

/**
 * Built-in negative control: the rule must report a planted GPL dependency, else its clean result proves nothing.
 * @param {string[]} allowed
 * @param {string} lockFile
 * @returns {string[]}
 */
function plantedControl(allowed, lockFile) {
  const found = licenceProblems({
    roots: [{ dir: 'k', manifest: { dependencies: { ok: '1.0.0' } } }],
    lock: { packages: {
      k: { dependencies: { ok: '1.0.0' } },
      'node_modules/ok': { version: '1.0.0', license: 'MIT', dependencies: { planted: '1.0.0' } },
      'node_modules/planted': { version: '1.0.0', license: 'GPL-3.0-only' },
    } },
    lockFile, allowed, readManifest: () => null,
  });
  return found.some((p) => p.includes('planted@1.0.0')) ? [] : [`${lockFile}:1: licence negative control failed: a planted GPL-3.0-only dependency was not reported (${RULE})`];
}

/** @param {string} file @returns {Manifest | null} */
function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** @typedef {import('./rules.mjs').Ctx} Ctx */
