// docs/coordination file shapes of check-docs (3D-136, D-475; skill coordinator-handover).
// - handover-YYYY-MM-DD-N.md: title `# Coordinator handover YYYY-MM-DD-N` matching the name, a `From:` line, and exactly
//   the `##` sections of HANDOVER_SECTIONS in that order (no room for conversation history); at most MAX_LINES lines.
// - history/YYYY-MM.md: every list line is one event `- YYYY-MM-DD <kind> <ref>[ <WP ids>]: <text>` dated in the
//   file's month. The date is when the event happened; lines stay in the order they were appended, so dates may step
//   back (a decision recorded after a later one). Append-only is a rule of the skill, not checked here.
// - any other file in docs/coordination fails.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'docs/coordination';
export const HANDOVER_SECTIONS = ['## Running WPs', '## Merges pending', '## Owner actions and questions open', '## Ids', '## Do not repeat'];
const MAX_LINES = 80;
const HANDOVER_NAME = /^handover-(\d{4}-\d{2}-\d{2}-\d+)\.md$/;
const HISTORY_NAME = /^(\d{4}-\d{2})\.md$/;
export const KINDS = ['merge', 'start', 'decision', 'incident', 'rotation'];
const EVENT = new RegExp(`^- (\\d{4}-\\d{2}-\\d{2}) (${KINDS.join('|')}) \\S+(?: 3D-\\d+(?:\\.\\d+)?(?:,3D-\\d+(?:\\.\\d+)?)*)?: \\S`);

/** @param {string} rel @param {string} text @param {string} tag @param {string[]} out */
function checkHandover(rel, text, tag, out) {
  const lines = text.split('\n');
  if (lines[0] !== `# Coordinator handover ${tag}`) out.push(`${rel}:1: title should be "# Coordinator handover ${tag}"`);
  if (!lines.some((l) => /^From: session_\S+ {2}Base: \S+@[0-9a-f]{7,}/.test(l))) out.push(`${rel}: "From: <session>  Base: <branch>@<sha>" line missing`);
  const heads = lines.filter((l) => /^##(?!#)/.test(l)).map((l) => l.trim());
  if (heads.join('|') !== HANDOVER_SECTIONS.join('|')) out.push(`${rel}: sections ${JSON.stringify(heads)} should be exactly ${JSON.stringify(HANDOVER_SECTIONS)}`);
  const n = text.replace(/\n$/, '').split('\n').length;
  if (n > MAX_LINES) out.push(`${rel}: ${n} lines, at most ${MAX_LINES} (facts only, no history)`);
}

/** @param {string} rel @param {string} text @param {string} month @param {string[]} out */
function checkHistory(rel, text, month, out) {
  text.split('\n').forEach((l, i) => {
    if (!l.startsWith('- ')) return;
    const m = EVENT.exec(l);
    if (!m) { out.push(`${rel}:${i + 1}: event line should be "- YYYY-MM-DD <${KINDS.join('|')}> <ref>[ <WP ids>]: <text>"`); return; }
    if (!m[1].startsWith(month)) out.push(`${rel}:${i + 1}: date ${m[1]} outside ${month}`);
  });
}

/**
 * @param {string} root repository root
 * @returns {string[]} problems, one line each
 */
export function checkCoordination(root) {
  /** @type {string[]} */
  const out = [];
  const dir = join(root, DIR);
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const rel = `${DIR}/${name}`;
    if (name === 'history' && statSync(join(dir, name)).isDirectory()) {
      for (const h of readdirSync(join(dir, name))) {
        const m = HISTORY_NAME.exec(h);
        if (!m) { out.push(`${rel}/${h}: history files are named YYYY-MM.md`); continue; }
        checkHistory(`${rel}/${h}`, readFileSync(join(dir, name, h), 'utf8'), m[1], out);
      }
      continue;
    }
    const m = HANDOVER_NAME.exec(name);
    if (!m) { out.push(`${rel}: only handover-YYYY-MM-DD-N.md and history/ belong in ${DIR}`); continue; }
    checkHandover(rel, readFileSync(join(dir, name), 'utf8'), m[1], out);
  }
  return out;
}
