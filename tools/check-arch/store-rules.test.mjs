// Tests for the append-only store rule of check:arch (3D-23; 3D-ADR-0003 §5) on planted adapters.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CONFIG } from './config.mjs';
import { context } from './rules.mjs';
import { storeAppendOnly } from './store-rules.mjs';
import { walk } from './scan.mjs';

/** @type {string[]} */
const dirs = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

/** @param {Record<string, string>} plant */
function problems(plant) {
  const root = mkdtempSync(join(tmpdir(), 'check-arch-store-'));
  dirs.push(root);
  for (const [f, text] of Object.entries(plant)) {
    mkdirSync(dirname(join(root, f)), { recursive: true });
    writeFileSync(join(root, f), text);
  }
  return storeAppendOnly(context(root, walk(root, CONFIG.skipDirs), CONFIG));
}

const A = 'services/kernel/src/adapters';

describe('check:arch append-only stores (3D-ADR-0003 §5)', () => {
  it('fails delete, rename, overwrite and S3 delete in an adapter', () => {
    const p = problems({
      [`${A}/a-store.js`]: "import { unlink, writeFile } from 'node:fs/promises';\nexport const f = (x) => unlink(x).then(() => writeFile(x, ''));\n",
      [`${A}/b-store.js`]: "import fs from 'node:fs';\nexport const g = (x) => fs.rmSync(x);\nexport const m = (map) => map.delete('k');\n",
      [`${A}/c-store.js`]: "import { DeleteObjectCommand } from '@aws-sdk/client-s3';\nexport const d = (s) => s.send(new DeleteObjectCommand({}));\n",
    });
    expect(p.filter((x) => x.startsWith(`${A}/a-store.js`))).toHaveLength(4);
    expect(p).toContainEqual(expect.stringMatching(/b-store\.js:2: calls "fs\.rmSync"/));
    expect(p).toContainEqual(expect.stringMatching(/b-store\.js:3: calls "map\.delete"/));
    expect(p.filter((x) => x.includes('DeleteObjectCommand')).length).toBeGreaterThan(0);
  });

  it('passes the real adapters, a write through a wx handle, comments and code outside adapters', () => {
    expect(problems({
      [`${A}/ok-store.js`]: "import { open } from 'node:fs/promises';\n// never unlink here\nexport const w = async (p) => { const fh = await open(p, 'wx'); await fh.writeFile('x'); await fh.close(); };\n",
      [`${A}/points.js`]: 'export const free = (decoder) => decoder.delete();\n',
      'services/kernel/test/t.js': "import { rm } from 'node:fs/promises';\nexport const c = (d) => rm(d);\n",
    })).toEqual([]);
    expect(storeAppendOnly(context(join(import.meta.dirname, '..', '..'), walk(join(import.meta.dirname, '..', '..'), CONFIG.skipDirs), CONFIG))).toEqual([]);
  });
});
