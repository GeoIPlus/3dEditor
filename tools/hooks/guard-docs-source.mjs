#!/usr/bin/env node
// PreToolUse hook (3D-30): refuse Edit/Write/MultiEdit/NotebookEdit under docs/source/ (read-only, D-20).
// Quiet when the path is elsewhere; one line on stderr and exit 2 when refused.
// Not covered: writes through Bash (e.g. sed -i); AGENTS.md §6 still forbids them.
import { readFileSync } from 'node:fs';
import { dirname, resolve, relative, sep, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const guarded = resolve(root, 'docs/source');

/** @type {{tool_input?: {file_path?: string, notebook_path?: string}, cwd?: string}} */
let input = {};
try {
  input = JSON.parse(readFileSync(0, 'utf8') || '{}');
} catch {
  process.exit(0);
}
const target = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
if (!target) process.exit(0);
const abs = isAbsolute(target) ? resolve(target) : resolve(input.cwd ?? root, target);
const rel = relative(guarded, abs);
if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
  process.stderr.write(
    `docs/source is read-only (D-20, AGENTS.md §6): ${relative(root, abs).split(sep).join('/')}; record corrections in docs/decisions/DECISIONS.md\n`,
  );
  process.exit(2);
}
process.exit(0);
