#!/usr/bin/env node
// Document consistency check for 3DQM (3D-30, D-46). Node built-ins only.
// Usage: node tools/check-docs.mjs [--root <dir>] [--allow-provisional]
// Exit 0 and no output when consistent; exit 1 with one line per problem otherwise.
// 3D-05 folds this script into `npm run check` (`npm run check:docs`).
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const BACKLOG = 'docs/BACKLOG.md';
const DECISIONS = 'docs/decisions/DECISIONS.md';
const STATUSES = ['proposed', 'ready', 'blocked', 'in-progress', 'review', 'done', 'superseded', 'dropped'];
/** Overview label (first words) -> row status. */
const OVERVIEW = { done: 'done', review: 'review', 'in progress': 'in-progress', ready: 'ready', proposed: 'proposed', blocked: 'blocked' };
/** Mermaid subgraphs whose members must carry exactly this status. */
const STATUS_GROUPS = ['done', 'review', 'blocked'];
const PROVISIONAL = /\b[DQ]-3D\d+-\d+\b/g;
const SKIP_DIRS = new Set(['.git', 'node_modules']);

/**
 * Lines of the section that starts with `heading` (a `## ` line), up to the next `## ` heading.
 * @param {string[]} lines
 * @param {string} heading
 * @returns {{start: number, lines: string[]}}
 */
export function section(lines, heading) {
  const start = lines.findIndex((l) => l.trim() === heading);
  if (start < 0) return { start: -1, lines: [] };
  let end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  if (end < 0) end = lines.length;
  return { start, lines: lines.slice(start + 1, end) };
}

/** @param {string} line @returns {string[]} cells of a markdown table row */
function cells(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

/**
 * @param {string[]} lines BACKLOG lines
 * @returns {{id: string, num: number, status: string, line: number}[]}
 */
export function parseRows(lines) {
  const sec = section(lines, '## Work-package status');
  const rows = [];
  sec.lines.forEach((l, i) => {
    const m = /^\|\s*3D-(\d+)\s*\|/.exec(l);
    if (!m) return;
    const c = cells(l);
    const word = (c[c.length - 1].match(/^[a-z-]+/) || [''])[0];
    rows.push({ id: `3D-${m[1]}`, num: Number(m[1]), status: word, line: sec.start + i + 2 });
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
  }
}

/** @param {string[]} lines @param {ReturnType<typeof parseRows>} rows @param {string[]} out */
function checkOverview(lines, rows, out) {
  const sec = section(lines, '## Progress overview');
  if (sec.start < 0) return void out.push(`${BACKLOG}: section "## Progress overview" missing`);
  const count = (/** @type {string} */ s) => rows.filter((r) => r.status === s).length;
  const found = new Set();
  sec.lines.forEach((l, i) => {
    const at = `${BACKLOG}:${sec.start + i + 2}`;
    if (/^\|/.test(l)) {
      const c = cells(l);
      const key = Object.keys(OVERVIEW).find((k) => c[0].toLowerCase().startsWith(k));
      if (!key || c.length < 2) return;
      found.add(key);
      const m = /^(\d+)(?:\s*\/\s*(\d+))?$/.exec(c[1]);
      if (!m) return void out.push(`${at}: overview "${c[0]}" has no number`);
      const want = count(OVERVIEW[key]);
      if (Number(m[1]) !== want) out.push(`${at}: overview "${c[0]}" says ${m[1]}, table has ${want}`);
      if (m[2] && Number(m[2]) !== rows.length) out.push(`${at}: overview total says ${m[2]}, table has ${rows.length} rows`);
    }
    for (const m of l.matchAll(/(\d+)\/(\d+) rows done/g)) {
      if (Number(m[1]) !== count('done') || Number(m[2]) !== rows.length)
        out.push(`${at}: "${m[0]}" but table has ${count('done')}/${rows.length}`);
    }
  });
  for (const k of Object.keys(OVERVIEW)) if (!found.has(k)) out.push(`${BACKLOG}: overview row for "${k}" missing`);
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
    else if ((m = /^D(\d+)\["3D-(\d+)\b/.exec(l))) {
      if (m[1] !== m[2]) out.push(`${at}: node D${m[1]} is labelled 3D-${m[2]}`);
      if (nodes.has(m[1])) out.push(`${at}: duplicate mermaid node D${m[1]}`);
      nodes.set(m[1], { group, line: i + 1 });
    } else if ((m = /^D(\d+)\s*-->\s*D(\d+)$/.exec(l))) edges.push({ a: m[1], b: m[2], line: i + 1 });
  }
  const byNum = new Map(rows.map((r) => [r.id.slice(3), r]));
  for (const r of rows) {
    const n = nodes.get(r.id.slice(3));
    if (!n) { out.push(`${BACKLOG}:${r.line}: row ${r.id} has no mermaid node`); continue; }
    if ((STATUS_GROUPS.includes(r.status) || STATUS_GROUPS.includes(n.group)) && n.group !== r.status)
      out.push(`${BACKLOG}:${n.line}: ${r.id} is ${r.status} but its node is in subgraph "${n.group}"`);
  }
  for (const [num, n] of nodes) if (!byNum.has(num)) out.push(`${BACKLOG}:${n.line}: mermaid node D${num} has no row`);
  for (const e of edges)
    for (const x of [e.a, e.b]) if (!nodes.has(x)) out.push(`${BACKLOG}:${e.line}: edge uses undefined node D${x}`);
}

/** @param {string[]} lines @param {ReturnType<typeof parseRows>} rows @param {string[]} out */
function checkDetails(lines, rows, out) {
  const sec = section(lines, '## Details');
  const covered = new Set();
  for (const l of sec.lines) {
    if (!/^### /.test(l)) continue;
    const title = l.replace(/\(.*$/, '');
    for (const m of title.matchAll(/3D-(\d+)(?:\s*\.\.\s*3D-(\d+))?/g)) {
      const a = Number(m[1]);
      const b = m[2] ? Number(m[2]) : a;
      for (let n = a; n <= b; n++) covered.add(n);
    }
  }
  for (const r of rows) if (!covered.has(r.num)) out.push(`${BACKLOG}:${r.line}: row ${r.id} has no Details entry`);
}

/** @param {string} root @param {string[]} out */
function checkDecisionIds(root, out) {
  const file = join(root, DECISIONS);
  if (!existsSync(file)) return void out.push(`${DECISIONS}: missing`);
  const lines = readFileSync(file, 'utf8').split('\n');
  for (const [heading, prefix] of [['## Decisions', 'D'], ['## Open questions', 'Q']]) {
    const sec = section(lines, heading);
    if (sec.start < 0) { out.push(`${DECISIONS}: section "${heading}" missing`); continue; }
    const seen = new Map();
    sec.lines.forEach((l, i) => {
      const m = /^\|\s*([A-Z]-\d+)\s*\|/.exec(l);
      if (!m) return;
      const at = `${DECISIONS}:${sec.start + i + 2}`;
      if (!m[1].startsWith(`${prefix}-`)) out.push(`${at}: ${m[1]} listed under "${heading}"`);
      if (seen.has(m[1])) out.push(`${at}: duplicate id ${m[1]} (first at line ${seen.get(m[1])})`);
      else seen.set(m[1], sec.start + i + 2);
    });
  }
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
    if (!allowProvisional && rel.startsWith('docs/')) {
      text.split('\n').forEach((l, i) => {
        for (const m of l.matchAll(PROVISIONAL)) out.push(`${rel}:${i + 1}: provisional id ${m[0]} (D-38: final ids on the base)`);
      });
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
 * @param {{allowProvisional?: boolean}} [opts]
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
    checkDetails(lines, rows, out);
  }
  checkDecisionIds(root, out);
  checkFiles(root, markdownFiles(root), Boolean(opts.allowProvisional), out);
  return out;
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
  const problems = checkDocs(root, { allowProvisional: args.includes('--allow-provisional') });
  for (const p of problems) console.log(p);
  process.exit(problems.length ? 1 : 0);
}
