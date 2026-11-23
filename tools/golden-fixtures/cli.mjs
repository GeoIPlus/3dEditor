// node tools/golden-fixtures/cli.mjs [--check]
// Writes fixtures/GT-*/ from the generator; removes stale generated files. --check: exit 1 if any file differs.

import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { generate } from './generate.mjs';
import { ROOT } from './source.mjs';

const check = process.argv.includes('--check');
const files = generate();
const fixtures = join(ROOT, 'fixtures');
const existing = existsSync(fixtures)
  ? readdirSync(fixtures).filter((d) => d.startsWith('GT-')).flatMap((d) => readdirSync(join(fixtures, d)).map((f) => `fixtures/${d}/${f}`))
  : [];
let diff = 0;
for (const [rel, content] of files) {
  const abs = join(ROOT, rel);
  const same = existsSync(abs) && readFileSync(abs, 'utf8') === content;
  if (same) continue;
  diff++;
  if (check) console.error(`differs: ${rel}`);
  else { mkdirSync(dirname(abs), { recursive: true }); writeFileSync(abs, content); }
}
for (const rel of existing.filter((r) => !files.has(r))) {
  diff++;
  if (check) console.error(`stale: ${rel}`);
  else rmSync(join(ROOT, rel));
}
console.log(`${files.size} fixture files, ${diff} ${check ? 'differ' : 'written or removed'}`);
if (check && diff > 0) process.exit(1);
