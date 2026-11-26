// Append-only stores of the kernel service (3D-23; 3D-ADR-0003 "Checks", D-84, D-85): no store adapter (`*-store.js`) deletes,
// renames, truncates or overwrites. Flags references to the Node `fs` calls and the S3 commands that do, by name
// (identifiers and `x.name` members); writing through a handle opened with `wx` (`fh.writeFile`) stays allowed.
// [A] A renamed import (`import { unlink as u }`) is not caught: the rule is a guard for review, not a proof.
import { isCode } from './scan.mjs';

/** @typedef {import('./rules.mjs').Ctx} Ctx */

/** @param {Ctx} ctx @returns {string[]} */
export function storeAppendOnly(ctx) {
  const { files, names, memberNames } = ctx.config.appendOnly;
  const bad = new Set(names), badMembers = new Set(memberNames);
  /** @type {string[]} */
  const out = [];
  const why = 'stores are append-only: no delete, rename, truncate or overwrite (3D-ADR-0003 §5, D-84, D-85)';
  for (const f of ctx.files) {
    if (!files.test(f) || !isCode(f, ctx.config.codeExtensions)) continue;
    const p = ctx.parsed(f);
    for (const id of p.identifiers) if (bad.has(id.name)) out.push(`${f}:${id.line}: references "${id.name}"; ${why}`);
    for (const m of p.members) if (badMembers.has(m.property)) out.push(`${f}:${m.line}: calls "${m.object}.${m.property}"; ${why}`);
  }
  return out;
}
