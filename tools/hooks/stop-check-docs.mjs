#!/usr/bin/env node
// Stop hook (3D-30): run tools/check-docs.mjs only when docs/ changed in this checkout.
// "Changed" = uncommitted changes under docs/, or docs/ touched by commits not yet on any remote.
// Quiet on success. On problems: one line each on stderr, exit 2 (Claude sees them and continues).
// If the hook already blocked once this stop (stop_hook_active), it reports to the user and lets the
// session stop, so an unfixable problem cannot loop. Provisional ids are allowed here (D-38): the
// merge-wp skill runs the strict check on the base.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkDocs } from '../check-docs.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
/** @param {string[]} args */
const git = (args) => {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
};

let input = {};
try {
  input = JSON.parse(readFileSync(0, 'utf8') || '{}');
} catch {
  /* no or invalid stdin: treat as a first stop */
}

const changed =
  git(['status', '--porcelain', '--', 'docs']) !== '' ||
  git(['log', 'HEAD', '--not', '--remotes', '--format=%H', '--', 'docs']) !== '';
if (!changed) process.exit(0);

const problems = checkDocs(root, { allowProvisional: true });
if (problems.length === 0) process.exit(0);

const lines = problems.map((p) => `check-docs: ${p}`);
if (/** @type {{stop_hook_active?: boolean}} */ (input).stop_hook_active) {
  process.stdout.write(JSON.stringify({ systemMessage: `${lines.join('\n')}\n(check-docs: still failing; stop allowed)` }));
  process.exit(0);
}
process.stderr.write(`${lines.join('\n')}\n`);
process.exit(2);
