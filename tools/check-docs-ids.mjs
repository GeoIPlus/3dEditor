// Id rules of check-docs (D-38, D-179). A WP branch writes provisional ids only: decisions `D-3D<wp>-n`, questions
// `Q-3D<wp>-n`, backlog rows `3D-<wp>.n`, ADRs `3D-ADR-<wp>-n` (also the file name). The coordinator assigns the final
// `D-NN`, `Q-NN`, `3D-NN`, `3D-ADR-NNNN` at merge. On the base, provisional ids are rejected (strict mode).
import { section } from './check-docs-md.mjs';

/** Any provisional id (wp numbers have at most 3 digits, final ADR numbers exactly 4). */
export const PROVISIONAL = /\b(?:[DQ]-3D\d+-\d+|3D-\d+\.\d+|3D-ADR-\d{1,3}-\d+)\b/g;
/** Final ADR file name. */
export const FINAL_ADR = /^(3D-ADR-\d{4})-/;
/** Provisional ADR file name. */
export const PROVISIONAL_ADR = /^3D-ADR-\d{1,3}-\d+-/;

/**
 * Final ids defined by the documents (rows, decision/question rows, ADR files) -> where they are defined.
 * @param {{backlog: string, decisions: string, adrFiles: string[]}} docs
 * @returns {Map<string, string>}
 */
export function definedFinalIds(docs) {
  /** @type {Map<string, string>} */
  const ids = new Map();
  const scan = (/** @type {string} */ file, /** @type {string} */ text, /** @type {string} */ heading, /** @type {RegExp} */ re) => {
    const sec = section(text.split('\n'), heading);
    sec.lines.forEach((l, i) => {
      const m = re.exec(l);
      if (m && !ids.has(m[1])) ids.set(m[1], `${file}:${sec.start + i + 2}`);
    });
  };
  scan('docs/BACKLOG.md', docs.backlog, '## Work-package status', /^\|\s*(3D-\d+)\s*\|/);
  scan('docs/decisions/DECISIONS.md', docs.decisions, '## Decisions', /^\|\s*(D-\d+)\s*\|/);
  scan('docs/decisions/DECISIONS.md', docs.decisions, '## Open questions', /^\|\s*(Q-\d+)\s*\|/);
  for (const f of docs.adrFiles) {
    const m = FINAL_ADR.exec(f);
    if (m && !ids.has(m[1])) ids.set(m[1], `docs/decisions/adr/${f}`);
  }
  return ids;
}

const HINT = { D: 'D-3D<wp>-n', Q: 'Q-3D<wp>-n', '3D-ADR': '3D-ADR-<wp>-n', '3D': '3D-<wp>.n' };

/**
 * Problems for final ids on this branch that the base does not have (D-179).
 * @param {Map<string, string>} current
 * @param {Map<string, string>} base
 * @returns {string[]}
 */
export function newFinalIds(current, base) {
  /** @type {string[]} */
  const out = [];
  for (const [id, at] of current) {
    if (base.has(id)) continue;
    const kind = id.startsWith('3D-ADR') ? '3D-ADR' : id.startsWith('3D-') ? '3D' : id[0];
    out.push(`${at}: new final id ${id} on a WP branch; use ${HINT[/** @type {keyof typeof HINT} */ (kind)]} (D-179, the coordinator assigns final ids)`);
  }
  return out;
}
