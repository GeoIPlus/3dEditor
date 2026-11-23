// Kernel-internal rules of check:arch (3D-09; 3D-ADR-0002 C1 rules 1 and 2): the module DAG inside
// `packages/geo-model3d/src/`, and no I/O, clock, randomness, environment or process access in kernel code.
import { posix } from 'node:path';
import { isCode } from './scan.mjs';
import { resolveRelative } from './rules.mjs';

/** @typedef {import('./rules.mjs').Ctx} Ctx */

/** @param {string} file @param {string} dir */
const inside = (file, dir) => file.startsWith(`${dir}/`);

/**
 * Module of a file under the kernel source dir: the first directory below it, or `ROOT` for files directly in it
 * (`index.js`, `canary.js`).
 * @param {string} srcDir @param {string} file
 */
function moduleOf(srcDir, file) {
  const rest = file.slice(srcDir.length + 1);
  return rest.includes('/') ? rest.slice(0, rest.indexOf('/')) : 'ROOT';
}

/**
 * Imports between kernel modules follow the DAG of the config and nothing else (C1 rule 2): a module imports itself,
 * the modules listed for it and the canary; only root files (the public entry) import every module; nothing imports
 * the root entry; kernel source imports nothing outside `src/` by relative path. A module directory that the config
 * does not list fails, so a new module needs a DAG entry (and the ADR behind it).
 * @param {Ctx} ctx @returns {string[]}
 */
export function kernelModuleDag(ctx) {
  const { srcDir, modules } = ctx.config.kernel;
  const canary = `${ctx.config.kernel.dir}/${ctx.config.kernel.canaryModule}`;
  /** @type {string[]} */
  const out = [];
  /** @type {Set<string>} */
  const unknown = new Set();
  for (const f of ctx.files) {
    if (!inside(f, srcDir) || !isCode(f, ctx.config.codeExtensions)) continue;
    const from = moduleOf(srcDir, f);
    if (from !== 'ROOT' && !(from in modules)) {
      if (!unknown.has(from)) out.push(`${f}:1: kernel module "${from}" is not in the module DAG (3D-ADR-0002 C1 rule 2; tools/check-arch/config.mjs)`);
      unknown.add(from);
      continue;
    }
    for (const i of ctx.parsed(f).imports) {
      const target = resolveRelative(f, i.specifier);
      if (target === null) continue; // bare specifiers: kernelPurity / kernelNoIo / dependency ADRs
      if (target === canary) continue;
      if (!inside(target, srcDir)) {
        out.push(`${f}:${i.line}: kernel source imports "${i.specifier}" outside ${srcDir}/ (3D-ADR-0002 C1)`);
        continue;
      }
      const to = moduleOf(srcDir, target);
      if (to === from && from !== 'ROOT') continue;
      if (to === 'ROOT') {
        out.push(`${f}:${i.line}: kernel module "${from}" imports the root entry "${posix.basename(target)}" (3D-ADR-0002 C1 rule 2)`);
      } else if (from !== 'ROOT' && !modules[from].includes(to)) {
        out.push(`${f}:${i.line}: kernel module "${from}" imports "${to}", not allowed by the module DAG (3D-ADR-0002 C1 rule 2)`);
      }
    }
  }
  return out;
}

/**
 * No I/O, timers, clock, randomness, environment or process access in kernel source (C1 rule 1): forbidden built-in
 * modules, global identifiers, member calls (`Date.now`, `Math.random`, ...) and `new Date()` without arguments.
 * Tests of the kernel (outside `src/`) may read fixtures.
 * @param {Ctx} ctx @returns {string[]}
 */
export function kernelNoIo(ctx) {
  const { srcDir, ioModules, ioGlobals, ioMembers } = ctx.config.kernel;
  const globals = new Set(ioGlobals);
  const members = new Set(ioMembers);
  /** @type {string[]} */
  const out = [];
  const why = '(3D-ADR-0002 C1 rule 1: no I/O, clock or randomness in the kernel)';
  for (const f of ctx.files) {
    if (!inside(f, srcDir) || !isCode(f, ctx.config.codeExtensions)) continue;
    const p = ctx.parsed(f);
    for (const i of p.imports) if (ioModules.some((re) => re.test(i.specifier))) out.push(`${f}:${i.line}: kernel imports "${i.specifier}" ${why}`);
    for (const id of p.identifiers) if (globals.has(id.name)) out.push(`${f}:${id.line}: kernel references "${id.name}" ${why}`);
    for (const m of p.members) {
      const name = `${m.object}.${m.property}`;
      if (members.has(name)) out.push(`${f}:${m.line}: kernel calls "${name}" ${why}`);
    }
    for (const n of p.news) if (n.name === 'Date' && n.args === 0) out.push(`${f}:${n.line}: kernel reads the clock with "new Date()" ${why}`);
  }
  return out;
}
