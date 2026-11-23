// Static rules of check:arch (3D-05): line limit, kernel purity, who imports the kernel, canary wiring,
// canary value leak, client output scan. Each rule returns problems as `path:line: message`.
import { existsSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { isCode, lineCount, parseSource, readText } from './scan.mjs';
import { kernelModuleDag, kernelNoIo } from './kernel-rules.mjs';

/**
 * @typedef {import('./config.mjs').ArchConfig} ArchConfig
 * @typedef {{root: string, files: string[], config: ArchConfig, text: (f: string) => string | null,
 *   parsed: (f: string) => import('./scan.mjs').Parsed}} Ctx
 */

/**
 * @param {string} root
 * @param {string[]} files
 * @param {ArchConfig} config
 * @returns {Ctx}
 */
export function context(root, files, config) {
  /** @type {Map<string, string | null>} */
  const texts = new Map();
  /** @type {Map<string, import('./scan.mjs').Parsed>} */
  const parsedCache = new Map();
  /** @param {string} f */
  const text = (f) => {
    if (!texts.has(f)) texts.set(f, readText(join(root, f)));
    return texts.get(f) ?? null;
  };
  /** @param {string} f */
  const parsed = (f) => {
    let p = parsedCache.get(f);
    if (!p) parsedCache.set(f, (p = parseSource(f, text(f) ?? '')));
    return p;
  };
  return { root, files, config, text, parsed };
}

/** @param {string} file @param {string} prefix */
const under = (file, prefix) => file === prefix.replace(/\/$/, '') || file.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`);

/** Resolve a relative specifier against the importing file (POSIX, repository-relative). */
/** @param {string} from @param {string} spec */
export function resolveRelative(from, spec) {
  return spec.startsWith('.') ? posix.normalize(posix.join(posix.dirname(from), spec)) : null;
}

/** @param {Ctx} ctx @param {string} from @param {string} spec */
function importsKernel(ctx, from, spec) {
  const k = ctx.config.kernel;
  if (k.names.some((n) => spec === n || spec.startsWith(`${n}/`))) return true;
  const rel = resolveRelative(from, spec);
  return rel !== null && under(rel, k.dir);
}

/** @param {Ctx} ctx @returns {string[]} */
export function lineLimit(ctx) {
  const { maxLines, codeExtensions } = ctx.config;
  return ctx.files.filter((f) => isCode(f, codeExtensions)).flatMap((f) => {
    const n = lineCount(ctx.text(f) ?? '');
    return n > maxLines ? [`${f}:${maxLines + 1}: ${n} lines, limit is ${maxLines} (AGENTS.md §2.9)`] : [];
  });
}

/** @param {Ctx} ctx @returns {string[]} */
export function kernelPurity(ctx) {
  const k = ctx.config.kernel;
  const dom = new Set(k.domGlobals);
  /** @type {string[]} */
  const out = [];
  for (const f of ctx.files) {
    if (!under(f, k.dir) || !isCode(f, ctx.config.codeExtensions)) continue;
    const p = ctx.parsed(f);
    for (const i of p.imports)
      if (k.forbiddenModules.some((re) => re.test(i.specifier)))
        out.push(`${f}:${i.line}: kernel imports forbidden module "${i.specifier}" (AGENTS.md §2.10, STRUCTURE.md §2)`);
    for (const id of p.identifiers)
      if (dom.has(id.name)) out.push(`${f}:${id.line}: kernel references DOM global "${id.name}" (AGENTS.md §2.10)`);
  }
  return out;
}

/** @param {Ctx} ctx @returns {string[]} */
export function kernelImporters(ctx) {
  const k = ctx.config.kernel;
  const allowed = (/** @type {string} */ f) => k.allowedImporters.some((a) => under(f, a));
  /** @type {string[]} */
  const out = [];
  for (const f of ctx.files) {
    if (allowed(f)) continue;
    if (isCode(f, ctx.config.codeExtensions)) {
      for (const i of ctx.parsed(f).imports)
        if (importsKernel(ctx, f, i.specifier))
          out.push(`${f}:${i.line}: client code imports the P4 kernel "${i.specifier}" (D-06, STRUCTURE.md §2)`);
    } else if (posix.basename(f) === 'package.json') {
      const pkg = JSON.parse(ctx.text(f) ?? '{}');
      for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'])
        for (const name of Object.keys(pkg[field] ?? {}))
          if (k.names.includes(name)) out.push(`${f}:1: ${field} names the P4 kernel "${name}" (D-06)`);
    }
  }
  return out;
}

/**
 * All string targets of a package.json `exports` value (conditions and subpaths flattened).
 * @param {unknown} exp
 * @returns {string[]}
 */
export function exportTargets(exp) {
  if (typeof exp === 'string') return [exp];
  if (Array.isArray(exp)) return exp.flatMap(exportTargets);
  if (exp && typeof exp === 'object') return Object.values(exp).flatMap(exportTargets);
  return [];
}

/** @param {Ctx} ctx @returns {string[]} */
export function canaryWiring(ctx) {
  const k = ctx.config.kernel;
  const pkgFile = `${k.dir}/package.json`;
  const canary = `${k.dir}/${k.canaryModule}`;
  if (!existsSync(join(ctx.root, pkgFile))) return [`${pkgFile}: missing (the P4 kernel package)`];
  const pkg = JSON.parse(readFileSync(join(ctx.root, pkgFile), 'utf8'));
  /** @type {string[]} */
  const out = [];
  const marker = new RegExp(`geoiplus-p4-canary:${k.canaryPackage}:[0-9a-f]{32}`);
  if (!marker.test(ctx.text(canary) ?? '')) out.push(`${canary}:1: no canary literal for "${k.canaryPackage}" (3D-ADR-0001)`);
  const side = Array.isArray(pkg.sideEffects) ? pkg.sideEffects.map((/** @type {string} */ s) => posix.normalize(s)) : [];
  if (pkg.sideEffects !== true && !side.includes(k.canaryModule))
    out.push(`${pkgFile}:1: "sideEffects" does not list ./${k.canaryModule} (3D-ADR-0001)`);
  const targets = exportTargets(pkg.exports);
  if (targets.length === 0) out.push(`${pkgFile}:1: no "exports" map; entries must be closed (3D-ADR-0001)`);
  for (const t of targets) {
    const file = posix.normalize(posix.join(k.dir, t));
    if (file === canary) continue;
    if (!existsSync(join(ctx.root, file))) {
      out.push(`${pkgFile}:1: exports target ${t} does not exist`);
      continue;
    }
    const ok = ctx.parsed(file).imports.some((i) => resolveRelative(file, i.specifier) === canary);
    if (!ok) out.push(`${file}:1: exports entry does not import ./${posix.relative(posix.dirname(file), canary)} (3D-ADR-0001)`);
  }
  return out;
}

/**
 * The canary value must appear only in the canary module ("documents state the format, never the value").
 * Build outputs are left to clientOutputScan (client) or expected to carry it (server).
 */
/** @param {Ctx} ctx @returns {string[]} */
export function canaryValueLeak(ctx) {
  const k = ctx.config.kernel;
  const canary = `${k.dir}/${k.canaryModule}`;
  const m = ctx.config.canaryPattern.exec(ctx.text(canary) ?? '');
  if (!m) return [];
  const inOutput = (/** @type {string} */ f) => f.split('/').slice(0, -1).some((s) => ctx.config.clientOutputDirNames.includes(s));
  return ctx.files.filter((f) => f !== canary && !inOutput(f) && (ctx.text(f) ?? '').includes(m[0]))
    .map((f) => `${f}:1: contains the canary value; documents may state the format only (3D-ADR-0001)`);
}

/** Browser-facing outputs must not contain any P4 canary (3D-ADR-0001, D-24). */
/** @param {Ctx} ctx @returns {string[]} */
export function clientOutputScan(ctx) {
  const c = ctx.config;
  const isOutput = (/** @type {string} */ f) =>
    c.clientOutputs.some((d) => under(f, d)) ||
    (!c.serverDirs.some((d) => under(f, d)) && f.split('/').slice(0, -1).some((s) => c.clientOutputDirNames.includes(s)));
  return ctx.files.filter(isOutput).flatMap((f) => {
    const m = c.canaryPattern.exec(ctx.text(f) ?? '');
    return m ? [`${f}:1: client output contains P4 canary "${m[0].replace(/:[0-9a-f]{32}$/, ':<id>')}" (D-24)`] : [];
  });
}

export const STATIC_RULES = {
  lineLimit, kernelPurity, kernelImporters, canaryWiring, canaryValueLeak, clientOutputScan, kernelModuleDag, kernelNoIo,
};
