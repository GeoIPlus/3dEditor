// check-docs rules for owner questions (3D-138, D-3D138-2): the shape of docs/decisions/RISKS.md and the section
// "## Open questions" of the WP checkpoints; a provisional line names a risk that RISKS.md has. Freshness of the
// generated docs/QUESTIONS.md is not checked (the coordinator regenerates it, merge-wp).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RISKS, parseRisks, parseOpenQuestions } from './questions-parse.mjs';

/**
 * @param {string} root
 * @returns {string[]} problems
 */
export function checkQuestions(root) {
  /** @type {string[]} */
  const out = [];
  const risksFile = join(root, RISKS);
  const known = new Set();
  if (existsSync(risksFile)) {
    const r = parseRisks(readFileSync(risksFile, 'utf8'));
    out.push(...r.problems);
    for (const x of r.risks) known.add(x.id);
  }
  const dir = join(root, '.agent/checkpoints');
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.md')).sort()) {
    const rel = `.agent/checkpoints/${f}`;
    const r = parseOpenQuestions(readFileSync(join(dir, f), 'utf8'), rel);
    out.push(...r.problems);
    for (const q of r.items) {
      if (q.kind === 'provisional' && !known.has(q.risk)) out.push(`${rel}:${q.line}: ${q.risk} is not in ${RISKS}`);
    }
  }
  return out;
}
