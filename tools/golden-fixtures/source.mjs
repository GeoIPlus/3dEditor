// Reads the golden-test rows verbatim from v0.3 §12 (read-only source) and the module/row map from spec §13.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const V03 = 'docs/source/fullSpecsV0.3.md';
const SPEC = 'docs/specs/3dqm-spec.md';

/** @param {string} rel @param {string} heading @param {string} end */
function section(rel, heading, end) {
  const text = readFileSync(join(ROOT, rel), 'utf8');
  const a = text.indexOf(heading);
  if (a < 0) throw new Error(`${rel}: heading not found: ${heading}`);
  const b = text.indexOf(end, a + heading.length);
  return text.slice(a, b < 0 ? undefined : b);
}

/** @param {string} line */
const cells = (line) => line.slice(1, -1).split('|').map((c) => c.trim());

/**
 * @typedef {{ id: string, gate: string, input: string, expected: string }} V03Row
 * @returns {{ rows: Map<string, V03Row>, preamble: string, checks: string }}
 */
export function readV03() {
  const sec = section(V03, '## 12. Golden tests P0', '\n---');
  const lines = sec.split('\n');
  /** @type {Map<string, V03Row>} */
  const rows = new Map();
  for (const l of lines.filter((x) => /^\| GT-/.test(x))) {
    const [id, gate, input, expected] = cells(l);
    rows.set(id, { id, gate, input, expected });
  }
  const preamble = /** @type {string} */ (lines.find((l) => l.startsWith('Допуск метрик')));
  const checks = /** @type {string} */ (lines.find((l) => l.startsWith('Проверка эталонов')));
  return { rows, preamble, checks };
}

/** Row cell marker of a spec §13 golden test whose fixture is not generated yet (owner, 3D-104). */
export const PENDING = 'fixtures pending';

/**
 * GT id -> module and BACKLOG row (spec §13). Rows whose row cell carries `PENDING` are left out unless asked for:
 * their fixtures come with the row that builds them.
 * @param {{ includePending?: boolean }} [opts]
 * @returns {Map<string, { module: string, row: string }>}
 */
export function readSpec13(opts = {}) {
  const sec = section(SPEC, '## 13. Golden tests', '\n---');
  /** @type {Map<string, { module: string, row: string }>} */
  const out = new Map();
  for (const l of sec.split('\n').filter((x) => /^\| GT-/.test(x))) {
    const c = cells(l);
    const pending = c[4].includes(PENDING);
    if (pending && !opts.includePending) continue;
    out.set(c[0], { module: c[3], row: c[4] });
  }
  return out;
}
