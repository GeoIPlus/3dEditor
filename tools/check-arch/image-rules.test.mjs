// Tests for the isolated-image rule of check:arch (3D-74; 3D-ADR-0008, D-109) on planted trees, and the real tree.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { CONFIG } from './config.mjs';
import { context } from './rules.mjs';
import { isolatedImages } from './image-rules.mjs';
import { walk } from './scan.mjs';

/** @type {string[]} */
const dirs = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

/** @param {Record<string, string>} plant */
function problems(plant) {
  const root = mkdtempSync(join(tmpdir(), 'check-arch-image-'));
  dirs.push(root);
  for (const [f, text] of Object.entries(plant)) {
    mkdirSync(dirname(join(root, f)), { recursive: true });
    writeFileSync(join(root, f), text);
  }
  return isolatedImages(context(root, walk(root, CONFIG.skipDirs), CONFIG));
}

const OK = { 'images/val3dity/Dockerfile': 'FROM x\n', 'images/val3dity/SOURCE.md': '# source\n', 'images/val3dity/server.py': 'x = 1\n' };

describe('check:arch isolated images (3D-ADR-0008)', () => {
  it('passes an image with Dockerfile and SOURCE.md that nothing imports', () => {
    expect(problems({ ...OK, 'services/kernel/src/a.js': "import { x } from './b.js';\n" })).toEqual([]);
  });
  it('has nothing to check in a tree without the image', () => {
    expect(problems({ 'services/kernel/src/a.js': 'export {};\n' })).toEqual([]);
  });
  it('fails a missing SOURCE.md or Dockerfile', () => {
    const p = problems({ 'images/val3dity/Dockerfile': 'FROM x\n' });
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/^images\/val3dity\/SOURCE\.md:1: missing/);
  });
  it('fails an npm package inside the image', () => {
    expect(problems({ ...OK, 'images/val3dity/wrapper/package.json': '{}' })[0]).toMatch(/npm package inside the isolated GPL-3.0 image/);
  });
  it('fails an import into the image from services/ or packages/', () => {
    const p = problems({
      ...OK,
      'services/kernel/src/a.js': "import x from '../../../images/val3dity/lib.js';\n",
      'packages/geo-model3d/src/b.js': "const y = require('../../../images/val3dity/y.cjs');\n",
    });
    expect(p).toHaveLength(2);
    expect(p.some((x) => /^services\/kernel\/src\/a\.js:1: imports/.test(x))).toBe(true);
    expect(p.some((x) => /^packages\/geo-model3d\/src\/b\.js:1: imports/.test(x))).toBe(true);
  });
  it('the repository tree passes', () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
    expect(isolatedImages(context(root, walk(root, CONFIG.skipDirs), CONFIG))).toEqual([]);
  });
});
