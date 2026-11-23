// Tests for the kernel-internal check:arch rules of 3D-09 (module DAG, no I/O; narrowed importers) on planted faults.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkArch } from './cli.mjs';

const FAKE = 'geoiplus-p4-canary:geo-model3d:' + 'fedcba9876543210'.repeat(2);
const SRC = 'packages/geo-model3d/src';

/** @type {string[]} */
const dirs = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** Clean kernel with brep and solve modules plus planted files. @param {Record<string, string>} plant */
async function problems(plant) {
  const root = mkdtempSync(join(tmpdir(), 'check-arch-kernel-'));
  dirs.push(root);
  const files = {
    'packages/geo-model3d/package.json': JSON.stringify({
      name: '@geoiplus/geo-model3d', type: 'module', exports: { '.': './src/index.js' }, sideEffects: ['./src/canary.js'],
    }),
    [`${SRC}/canary.js`]: `export const P4_CANARY = '${FAKE}';\nglobalThis.__geoiplusP4 = P4_CANARY;\n`,
    [`${SRC}/index.js`]: "import './canary.js';\nexport * from './brep/index.js';\nexport * from './solve/index.js';\n",
    [`${SRC}/brep/index.js`]: "import { two } from './two.js';\nexport const one = () => two();\n",
    [`${SRC}/brep/two.js`]: 'export const two = () => 2;\n',
    [`${SRC}/solve/index.js`]: "import { one } from '../brep/index.js';\nimport '../canary.js';\nexport const s = () => one();\n",
    ...plant,
  };
  for (const [f, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, f)), { recursive: true });
    writeFileSync(join(root, f), text);
  }
  return (await checkArch(root, { build: false })).problems;
}

describe('check:arch kernel module DAG (3D-ADR-0002 C1 rule 2)', () => {
  it('passes imports along the DAG, within a module and of the canary', async () => {
    expect(await problems({})).toEqual([]);
  });

  it('fails an import against the DAG, of the root entry, outside src/ and of an unlisted module', async () => {
    const p = await problems({
      [`${SRC}/brep/back.js`]: "import { s } from '../solve/index.js';\nexport const b = s;\n",
      [`${SRC}/solve/root.js`]: "import { one } from '../index.js';\nexport const r = one;\n",
      [`${SRC}/brep/spike.js`]: "import '../../spike/move-edge/index.js';\n",
      [`${SRC}/gadget/index.js`]: "export const g = 1;\n",
    });
    expect(p).toEqual([
      `${SRC}/brep/back.js:1: kernel module "brep" imports "solve", not allowed by the module DAG (3D-ADR-0002 C1 rule 2)`,
      `${SRC}/brep/spike.js:1: kernel source imports "../../spike/move-edge/index.js" outside ${SRC}/ (3D-ADR-0002 C1)`,
      `${SRC}/gadget/index.js:1: kernel module "gadget" is not in the module DAG (3D-ADR-0002 C1 rule 2; tools/check-arch/config.mjs)`,
      `${SRC}/solve/root.js:1: kernel module "solve" imports the root entry "index.js" (3D-ADR-0002 C1 rule 2)`,
    ]);
  });
});

describe('check:arch kernel without I/O (3D-ADR-0002 C1 rule 1)', () => {
  it('fails I/O modules, process/env, timers, clock and randomness in kernel source', async () => {
    const p = await problems({
      [`${SRC}/brep/io.js`]: [
        "import { readFileSync } from 'node:fs';",
        "import http from 'https';",
        "import { exec } from 'child_process';",
        'export const env = () => process.env.X;',
        'export const t = () => Date.now();',
        'export const r = () => Math.random();',
        'export const d = () => new Date();',
        'export const later = (f) => setTimeout(f, 1);',
        'export const g = () => globalThis.process;',
        '',
      ].join('\n'),
    });
    expect(p.map((x) => x.replace(/ \(3D-ADR-0002 C1 rule 1.*$/, ''))).toEqual([
      `${SRC}/brep/io.js:1: kernel imports "node:fs"`,
      `${SRC}/brep/io.js:2: kernel imports "https"`,
      `${SRC}/brep/io.js:3: kernel imports "child_process"`,
      `${SRC}/brep/io.js:4: kernel references "process"`,
      `${SRC}/brep/io.js:8: kernel references "setTimeout"`,
      `${SRC}/brep/io.js:9: kernel references "process"`,
      `${SRC}/brep/io.js:5: kernel calls "Date.now"`,
      `${SRC}/brep/io.js:6: kernel calls "Math.random"`,
      `${SRC}/brep/io.js:7: kernel reads the clock with "new Date()"`,
    ]);
  });

  it('passes pure code: Date with an argument, Math functions, property names, comments and strings', async () => {
    expect(await problems({
      [`${SRC}/brep/pure.js`]: [
        '// Date.now(), process.env, fs',
        'export const parse = (s) => new Date(s).toISOString();',
        'export const h = (a, b) => Math.hypot(a, b);',
        "export const o = (x) => [x.process, x.random, { setTimeout: 1 }, 'Math.random()'];",
        '',
      ].join('\n'),
    })).toEqual([]);
  });

  it('applies to kernel source only: kernel tests may read fixtures', async () => {
    expect(await problems({
      'packages/geo-model3d/test/fixture.test.js': "import { readFileSync } from 'node:fs';\nexport const r = readFileSync;\n",
    })).toEqual([]);
  });
});

describe('check:arch kernel importers (3D-09 narrows them)', () => {
  it('fails tools outside tools/bench and services other than services/kernel', async () => {
    const p = await problems({
      'tools/other/x.mjs': "import '@geoiplus/geo-model3d';\n",
      'services/other/x.js': "import '@geoiplus/geo-model3d';\n",
      'tools/bench/ok.mjs': "import '@geoiplus/geo-model3d';\n",
    });
    expect(p).toEqual([
      'services/other/x.js:1: client code imports the P4 kernel "@geoiplus/geo-model3d" (D-06, STRUCTURE.md §2)',
      'tools/other/x.mjs:1: client code imports the P4 kernel "@geoiplus/geo-model3d" (D-06, STRUCTURE.md §2)',
    ]);
  });
});
