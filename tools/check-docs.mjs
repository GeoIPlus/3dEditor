#!/usr/bin/env node
// Document consistency check for 3DQM (3D-30, D-46). Node built-ins only.
// Usage: node tools/check-docs.mjs [--root <dir>] [--allow-provisional] [--fix]
// Exit 0 and no output when consistent; exit 1 with one line per problem otherwise. `--fix` first rewrites the
// generated parts of the BACKLOG (graph icons and legend, D-208, tools/check-docs-icons.mjs; overview, D-180,
// tools/check-docs-overview.mjs), then checks.
// 3D-05 folds this script into `npm run check` (`npm run check:docs`).
import { readFileSync, readdirSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { section, cells } from './check-docs-md.mjs';
import { PROVISIONAL, PROVISIONAL_ADR, definedFinalIds, newFinalIds } from './check-docs-ids.mjs';
import { overview } from './check-docs-overview.mjs';
import { checkDecisionTables } from './check-docs-decisions.mjs';
import { icons, TYPES } from './check-docs-icons.mjs';
import { checkQuestions } from './check-docs-questions.mjs';
import { QUESTIONS } from './questions-parse.mjs';

export { section };

const BACKLOG = 'docs/BACKLOG.md';
const DECISIONS = 'docs/decisions/DECISIONS.md';
const STATUSES = ['proposed', 'ready', 'blocked', 'in-progress', 'review', 'done', 'superseded', 'dropped'];
/** Mermaid subgraphs whose members must carry exactly this status. */
const STATUS_GROUPS = ['done', 'review', 'blocked'];
const SKIP_DIRS = new Set(['.git', 'node_modules']);

/**
 * @param {string[]} lines BACKLOG lines
 * @returns {{id: string, num: number, status: string, type: string, line: number}[]}
 *   type: the `Type` cell (D-221), '' when the table has no such column
 */
export function parseRows(lines) {
  const sec = section(lines, '## Work-package status');
  /** @type {{id: string, num: number, status: string, type: string, line: number}[]} */
  const rows = [];
  const header = sec.lines.find((l) => /^\|\s*WP\s*\|/.test(l));
  const typeAt = header ? cells(header).indexOf('Type') : -1;
  sec.lines.forEach((l, i) => {
    const m = /^\|\s*3D-(\d+(?:\.\d+)?)\s*\|/.exec(l);
    if (!m) return;
    const c = cells(l);
    const word = (c[c.length - 1].match(/^[a-z-]+/) || [''])[0];
    const type = typeAt >= 0 ? (c[typeAt] ?? '') : '';
    rows.push({ id: `3D-${m[1]}`, num: Number(m[1]), status: word, type, line: sec.start + i + 2 });
  });
  return rows;
}

/** @param {string[]} lines @param {ReturnType<typeof parseRows>} rows @param {string[]} out */
function checkRows(lines, rows, out) {
  const seen = new Set();
  for (const r of rows) {
    if (seen.has(r.id)) out.push(`${BACKLOG}:${r.line}: duplicate row ${r.id}`);
    seen.add(r.id);
    if (!STATUSES.includes(r.status)) out.push(`${BACKLOG}:${r.line}: ${r.id} has unknown status "${r.status}"`);
    if (!TYPES.includes(r.type)) out.push(`${BACKLOG}:${r.line}: ${r.id} has unknown type "${r.type}" (one of ${TYPES.join(', ')}; D-221)`);
  }
}

/** @param {string[]} lines @param {ReturnType<typeof parseRows>} rows @param {string[]} out */
function checkOverview(lines, rows, out) {
  const sec = section(lines, '## Progress overview');
  if (sec.start < 0) return void out.push(`${BACKLOG}: section "## Progress overview" missing`);
  out.push(...overview(lines, rows, sec).problems);
}

/** @param {string[]} lines @param {ReturnType<typeof parseRows>} rows @param {string[]} out */
function checkMermaid(lines, rows, out) {
  const open = lines.findIndex((l) => l.trim() === '```mermaid');
  if (open < 0) return void out.push(`${BACKLOG}: mermaid block missing`);
  /** @type {Map<string, {group: string, line: number}>} */
  const nodes = new Map();
  /** @type {{a: string, b: string, line: number}[]} */
  const edges = [];
  let group = '';
  for (let i = open + 1; i < lines.length && lines[i].trim() !== '```'; i++) {
    const l = lines[i].trim();
    const at = `${BACKLOG}:${i + 1}`;
    let m;
    if ((m = /^subgraph\s+([\w-]+)/.exec(l))) group = m[1];
    else if (l === 'end') group = '';
    else if ((m = /^D(\d+(?:_\d+)?)\["[^"]*?3D-(\d+(?:\.\d+)?)(?![\d.])/.exec(l))) {
      const key = m[1].replace('_', '.');
      if (key !== m[2]) out.push(`${at}: node D${m[1]} is labelled 3D-${m[2]}`);
      if (nodes.has(key)) out.push(`${at}: duplicate mermaid node D${m[1]}`);
      nodes.set(key, { group, line: i + 1 });
    } else if ((m = /^D(\d+(?:_\d+)?)\s*-->\s*D(\d+(?:_\d+)?)$/.exec(l)))
      edges.push({ a: m[1].replace('_', '.'), b: m[2].replace('_', '.'), line: i + 1 });
  }
  const byNum = new Map(rows.map((r) => [r.id.slice(3), r]));
  for (const r of rows) {
    const n = nodes.get(r.id.slice(3));
    if (!n) { out.push(`${BACKLOG}:${r.line}: row ${r.id} has no mermaid node`); continue; }
    if ((STATUS_GROUPS.includes(r.status) || STATUS_GROUPS.includes(n.group)) && n.group !== r.status)
      out.push(`${BACKLOG}:${n.line}: ${r.id} is ${r.status} but its node is in subgraph "${n.group}"`);
  }
  for (const [num, n] of nodes) if (!byNum.has(num)) out.push(`${BACKLOG}:${n.line}: mermaid node D${num.replace('.', '_')} has no row`);
  for (const e of edges)
    for (const x of [e.a, e.b]) if (!nodes.has(x)) out.push(`${BACKLOG}:${e.line}: edge uses undefined node D${x.replace('.', '_')}`);
}

/** @param {string[]} lines @param {ReturnType<typeof parseRows>} rows @param {string[]} out */
function checkDetails(lines, rows, out) {
  const sec = section(lines, '## Details');
  const covered = new Set();
  for (const l of sec.lines) {
    if (!/^### /.test(l)) continue;
    const title = l.replace(/\(.*$/, '');
    for (const m of title.matchAll(/3D-(\d+)(\.\d+)?(?:\s*\.\.\s*3D-(\d+))?/g)) {
      if (m[2]) { covered.add(`3D-${m[1]}${m[2]}`); continue; }
      const a = Number(m[1]);
      const b = m[3] ? Number(m[3]) : a;
      for (let n = a; n <= b; n++) covered.add(`3D-${String(n).padStart(m[1].length, '0')}`);
    }
  }
  for (const r of rows) if (!covered.has(r.id)) out.push(`${BACKLOG}:${r.line}: row ${r.id} has no Details entry`);
}

/** @param {string} root @param {string[]} out */
function checkDecisionIds(root, out) {
  const file = join(root, DECISIONS);
  if (!existsSync(file)) return void out.push(`${DECISIONS}: missing`);
  out.push(...checkDecisionTables(readFileSync(file, 'utf8')));
}

/**
 * Markdown files to scan, relative to root; docs/source is read-only input and excluded.
 * @param {string} root
 * @returns {string[]}
 */
export function markdownFiles(root) {
  /** @type {string[]} */
  const files = [];
  const walk = (/** @type {string} */ dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      const rel = relative(root, p).split(sep).join('/');
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name) && rel !== 'docs/source') walk(p);
      } else if (e.name.endsWith('.md')) files.push(rel);
    }
  };
  walk(root);
  return files.sort();
}

/** Text with fenced code blocks blanked and inline code removed, line numbers kept. @param {string} text */
function proseLines(text) {
  let fenced = false;
  return text.split('\n').map((l) => {
    if (/^\s*```/.test(l)) { fenced = !fenced; return ''; }
    return fenced ? '' : l.replace(/`[^`]*`/g, '');
  });
}

/** @param {string} root @param {string[]} files @param {boolean} allowProvisional @param {string[]} out */
function checkFiles(root, files, allowProvisional, out) {
  for (const rel of files) {
    const text = readFileSync(join(root, rel), 'utf8');
    // docs/QUESTIONS.md is generated and lists unmerged WPs by their provisional ids (D-3D138-2).
    if (!allowProvisional && rel.startsWith('docs/') && rel !== QUESTIONS) {
      text.split('\n').forEach((l, i) => {
        for (const m of l.matchAll(PROVISIONAL)) out.push(`${rel}:${i + 1}: provisional id ${m[0]} (D-38: final ids on the base)`);
      });
      const name = rel.split('/').pop() ?? '';
      if (rel.startsWith('docs/decisions/adr/') && PROVISIONAL_ADR.test(name)) out.push(`${rel}: provisional ADR file name (D-179: final ids on the base)`);
    }
    proseLines(text).forEach((l, i) => {
      for (const m of l.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
        const target = m[1];
        if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#')) continue;
        let path = target.replace(/[#?].*$/, '');
        try { path = decodeURIComponent(path); } catch { /* keep raw */ }
        const abs = path.startsWith('/') ? join(root, path) : resolve(root, dirname(rel), path);
        if (!existsSync(abs)) out.push(`${rel}:${i + 1}: broken link ${target}`);
      }
    });
  }
}

/**
 * Run all checks.
 * @param {string} root repository root
 * @param {{allowProvisional?: boolean, base?: {backlog: string, decisions: string, adrFiles: string[]}}} [opts]
 *   base: the base branch's documents; given on a WP branch, a final id the base lacks is a problem (D-179)
 * @returns {string[]} problems, one line each; empty when consistent
 */
export function checkDocs(root, opts = {}) {
  /** @type {string[]} */
  const out = [];
  const backlog = join(root, BACKLOG);
  if (!existsSync(backlog)) out.push(`${BACKLOG}: missing`);
  else {
    const lines = readFileSync(backlog, 'utf8').split('\n');
    const rows = parseRows(lines);
    if (rows.length === 0) out.push(`${BACKLOG}: no rows in "## Work-package status"`);
    checkRows(lines, rows, out);
    checkOverview(lines, rows, out);
    checkMermaid(lines, rows, out);
    out.push(...icons(lines, rows).problems);
    checkDetails(lines, rows, out);
  }
  checkDecisionIds(root, out);
  out.push(...checkQuestions(root));
  checkFiles(root, markdownFiles(root), Boolean(opts.allowProvisional), out);
  if (opts.base) out.push(...newFinalIds(definedFinalIds(readIdDocs(root)), definedFinalIds(opts.base)));
  return out;
}

/** @param {string} root @returns {{backlog: string, decisions: string, adrFiles: string[]}} */
export function readIdDocs(root) {
  const read = (/** @type {string} */ p) => (existsSync(join(root, p)) ? readFileSync(join(root, p), 'utf8') : '');
  const adr = join(root, 'docs/decisions/adr');
  return { backlog: read(BACKLOG), decisions: read(DECISIONS), adrFiles: existsSync(adr) ? readdirSync(adr) : [] };
}

/**
 * Rewrite the generated parts of the BACKLOG: graph icons and legend (D-208), then the overview (D-180). `Updated:`
 * becomes `today` when an overview line changed or the line is not a bare date.
 * @param {string} root
 * @param {string} today YYYY-MM-DD
 * @returns {number} lines changed
 */
export function fixDocs(root, today) {
  const file = join(root, BACKLOG);
  if (!existsSync(file)) return 0;
  const before = readFileSync(file, 'utf8').split('\n');
  const { fixed: lines, problems: iconFixes } = icons(before, parseRows(before));
  const sec = section(lines, '## Progress overview');
  if (sec.start < 0) return 0;
  const { edits, dateOk, dateAt } = overview(lines, parseRows(lines), sec);
  if (dateAt >= 0 && (edits.size > 0 || !dateOk) && lines[dateAt] !== `Updated: ${today}`) edits.set(dateAt, `Updated: ${today}`);
  for (const [i, text] of edits) lines[i] = text;
  if (edits.size > 0 || iconFixes.length > 0) writeFileSync(file, lines.join('\n'));
  return edits.size + iconFixes.length;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const r = args.indexOf('--root');
  const root = r >= 0 ? resolve(args[r + 1]) : resolve(dirname(fileURLToPath(import.meta.url)), '..');
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    console.error(`check-docs: root ${root} is not a directory`);
    process.exit(2);
  }
  if (args.includes('--fix')) fixDocs(root, new Date().toISOString().slice(0, 10));
  const problems = checkDocs(root, { allowProvisional: args.includes('--allow-provisional') });
  for (const p of problems) console.log(p);
  process.exit(problems.length ? 1 : 0);
}
