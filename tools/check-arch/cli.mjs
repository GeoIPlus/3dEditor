#!/usr/bin/env node
// `npm run check:arch` (3D-05): 300-line limit, kernel purity (no DOM, no three), no client import of the P4 kernel,
// canary wiring and leak, client output scan, and the negative-control browser build (3D-ADR-0001).
// Usage: node tools/check-arch/cli.mjs [--root <dir>] [--no-build]
// Exit 0 with a short summary when clean; exit 1 with one line per problem otherwise.
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG } from './config.mjs';
import { negativeControl } from './negative-control.mjs';
import { STATIC_RULES, context } from './rules.mjs';
import { walk } from './scan.mjs';

/**
 * @param {string} root
 * @param {{config?: import('./config.mjs').ArchConfig, build?: boolean}} [opts]
 * @returns {Promise<{problems: string[], report: string[]}>}
 */
export async function checkArch(root, opts = {}) {
  const config = opts.config ?? CONFIG;
  const files = walk(root, config.skipDirs);
  const ctx = context(root, files, config);
  /** @type {string[]} */
  const problems = [];
  /** @type {string[]} */
  const report = [`${files.length} files scanned`];
  for (const [name, rule] of Object.entries(STATIC_RULES)) {
    const found = rule(ctx);
    problems.push(...found);
    report.push(`${name}: ${found.length === 0 ? 'ok' : `${found.length} problem(s)`}`);
  }
  const wiringOk = !problems.some((p) => p.includes('3D-ADR-0001') && p.startsWith(config.kernel.dir));
  if (opts.build !== false && wiringOk) {
    const nc = await negativeControl(root, config);
    problems.push(...nc.problems);
    report.push(...nc.report.map((r) => `negativeControl: ${r}`));
  }
  return { problems, report };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--root');
  const root = at >= 0 ? resolve(args[at + 1]) : resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const { problems, report } = await checkArch(root, { build: !args.includes('--no-build') });
  if (problems.length > 0) {
    for (const p of problems) console.error(`check:arch: ${p}`);
    process.exit(1);
  }
  console.log(`check:arch: ok (${report.join('; ')})`);
}
