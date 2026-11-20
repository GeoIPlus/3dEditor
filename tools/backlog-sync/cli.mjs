#!/usr/bin/env node
// `npm run backlog:sync` (3D-05, D-25): status of mirror rows from the other repositories' BACKLOGs at a pinned commit.
// Usage:
//   node tools/backlog-sync/cli.mjs [--check]        report drift; exit 1 on drift or a broken pin (CI runs this)
//   node tools/backlog-sync/cli.mjs --write          copy remote statuses into docs/BACKLOG.md
//   node tools/backlog-sync/cli.mjs --fetch <key> <full-sha>
//        download that BACKLOG at the commit (network; GITHUB_TOKEN if the repository is private) and pin it
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyUpdates, compare, sha256 } from './sync.mjs';

const SNAPSHOT = 'BACKLOG.snapshot';

/**
 * @param {string} root
 * @param {Record<string, import('./sync.mjs').Source & {path: string}>} sources
 * @param {string} key
 * @param {string} revision
 * @param {(url: string, headers: Record<string, string>) => Promise<string>} get
 */
export async function fetchPin(root, sources, key, revision, get) {
  const src = sources[key];
  if (!src) throw new Error(`unknown source "${key}"; known: ${Object.keys(sources).join(', ')}`);
  if (!/^[0-9a-f]{40}$/.test(revision)) throw new Error('revision must be a full 40-character commit SHA');
  /** @type {Record<string, string>} */
  const headers = process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {};
  const text = await get(`https://raw.githubusercontent.com/${src.repository}/${revision}/${src.path}`, headers);
  mkdirSync(join(root, src.dir), { recursive: true });
  writeFileSync(join(root, src.dir, SNAPSHOT), text);
  const prov = { repository: src.repository, revision, files: [{ file: SNAPSHOT, donorPath: src.path, sha256: sha256(text) }] };
  writeFileSync(join(root, src.dir, 'provenance.json'), `${JSON.stringify(prov, null, 2)}\n`);
  return `${src.dir}/${SNAPSHOT} pinned to ${src.repository}@${revision}`;
}

/** @param {string} url @param {Record<string, string>} headers */
async function httpGet(url, headers) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`GET ${url}: HTTP ${res.status}`);
  return res.text();
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const args = process.argv.slice(2);
  const sources = JSON.parse(readFileSync(join(root, 'tools/backlog-sync/sources.json'), 'utf8'));
  const fetchAt = args.indexOf('--fetch');
  if (fetchAt >= 0) {
    console.log(`backlog:sync: ${await fetchPin(root, sources, args[fetchAt + 1], args[fetchAt + 2], httpGet)}`);
  } else {
    const file = join(root, 'docs/BACKLOG.md');
    const lines = readFileSync(file, 'utf8').split('\n');
    const { problems, updates, summary } = compare(root, lines, sources);
    if (args.includes('--write') && updates.length > 0) {
      writeFileSync(file, applyUpdates(lines, updates).join('\n'));
      console.log(`backlog:sync: wrote ${updates.length} status update(s); recount the overview (npm run check:docs)`);
      const rest = problems.length - updates.length;
      if (rest > 0) for (const p of problems.filter((x) => !/: drift - /.test(x))) console.error(`backlog:sync: ${p}`);
      process.exit(rest > 0 ? 1 : 0);
    }
    for (const p of problems) console.error(`backlog:sync: ${p}`);
    console.log(`backlog:sync: ${summary}`);
    process.exit(problems.length > 0 ? 1 : 0);
  }
}
