// Tests for check:arch on planted faults (3D-05 acceptance). Each test builds a small repository in a temp dir.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkArch } from './cli.mjs';

// A fake id (not the real canary value, which lives only in packages/geo-model3d/src/canary.js).
const FAKE = 'geoiplus-p4-canary:geo-model3d:' + '0123456789abcdef'.repeat(2);
const CANARY_JS = `export const P4_CANARY = '${FAKE}';\nglobalThis.__geoiplusP4 = P4_CANARY;\n`;
const PKG = {
  name: '@geoiplus/geo-model3d',
  type: 'module',
  exports: { '.': './src/index.js' },
  sideEffects: ['./src/canary.js'],
};

/** @type {string[]} */
const dirs = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/**
 * Clean fixture plus planted files (`null` deletes a default file).
 * @param {Record<string, string | null>} [plant]
 */
function repo(plant = {}) {
  const root = mkdtempSync(join(tmpdir(), 'check-arch-test-'));
  dirs.push(root);
  /** @type {Record<string, string | null>} */
  const files = {
    'packages/geo-model3d/package.json': JSON.stringify(PKG),
    'packages/geo-model3d/src/canary.js': CANARY_JS,
    'packages/geo-model3d/src/index.js': "import './canary.js';\nexport const add = (a, b) => a + b;\n",
    ...plant,
  };
  for (const [f, text] of Object.entries(files)) {
    if (text === null) continue;
    mkdirSync(dirname(join(root, f)), { recursive: true });
    writeFileSync(join(root, f), text);
  }
  return root;
}

/** @param {string} root @param {boolean} [build] */
const problems = async (root, build = false) => (await checkArch(root, { build })).problems;
const lines = (/** @type {number} */ n) => Array.from({ length: n }, (_, i) => `export const v${i} = ${i};`).join('\n') + '\n';

describe('check:arch', () => {
  it('passes a clean skeleton, negative control included', async () => {
    const r = await checkArch(repo(), { build: true });
    expect(r.problems).toEqual([]);
    expect(r.report.join('\n')).toMatch(/negativeControl: \.\/src\/index\.js: 2\/2 outputs/);
  });

  it('fails a client-side import of geo-model3d (bare, subpath, relative, dynamic, require, package.json)', async () => {
    const p = await problems(repo({
      'apps/web/src/main.js': "import { add } from '@geoiplus/geo-model3d';\nexport default add;\n",
      'apps/web/src/lazy.js': "export const k = () => import('geo-model3d/src/x.js');\n",
      'packages/ui/src/a.js': "import '../../geo-model3d/src/index.js';\n",
      'packages/ui/src/b.cjs': "require('@geoiplus/geo-model3d');\n",
      'packages/ui/package.json': JSON.stringify({ name: 'ui', dependencies: { '@geoiplus/geo-model3d': '0.0.0' } }),
    }));
    expect(p.filter((x) => /imports the P4 kernel/.test(x))).toHaveLength(4);
    expect(p).toContainEqual(expect.stringMatching(/^packages\/ui\/package.json:1: dependencies names the P4 kernel/));
  });

  it('allows the kernel itself, services/kernel and tools/bench to import it; ignores comments and strings', async () => {
    expect(await problems(repo({
      'services/kernel/src/server.js': "import { add } from '@geoiplus/geo-model3d';\nexport default add;\n",
      'tools/bench/x.mjs': "import '@geoiplus/geo-model3d';\n",
      'apps/web/src/doc.js': "// import '@geoiplus/geo-model3d'\nexport const s = \"import '@geoiplus/geo-model3d'\";\n",
    }))).toEqual([]);
  });

  it('fails a 301-line source file; 300 lines and long documents pass (D-41)', async () => {
    const p = await problems(repo({
      'packages/geo-model3d/src/big.js': lines(301),
      'packages/geo-model3d/src/ok.js': lines(300),
      'docs/long.md': '# x\n'.repeat(900),
    }));
    expect(p).toEqual(['packages/geo-model3d/src/big.js:301: 301 lines, limit is 300 (AGENTS.md §2.9)']);
  });

  it('fails a DOM global or three.js in the kernel; property names, comments and strings pass', async () => {
    const p = await problems(repo({
      'packages/geo-model3d/src/dom.js': 'export const el = () => document.createElement("div");\n',
      'packages/geo-model3d/src/win.js': 'export const w = () => globalThis.window;\n',
      'packages/geo-model3d/src/three.js': "import * as THREE from 'three';\nexport default THREE;\n",
      'packages/geo-model3d/src/fine.js':
        '// document, window\nexport const f = (o) => [o.document, o.window, { navigator: 1 }, "localStorage"];\n',
    }));
    expect(p).toEqual([
      'packages/geo-model3d/src/dom.js:1: kernel references DOM global "document" (AGENTS.md §2.10)',
      'packages/geo-model3d/src/three.js:1: kernel imports forbidden module "three" (AGENTS.md §2.10, STRUCTURE.md §2)',
      'packages/geo-model3d/src/win.js:1: kernel references DOM global "window" (AGENTS.md §2.10)',
    ]);
  });

  it('fails when the P4 canary is planted in a client bundle (any package id, maps included)', async () => {
    const p = await problems(repo({
      'apps/web/dist/assets/index-abc.js': `var a="${FAKE}";`,
      'apps/web/dist/assets/index-abc.js.map': `{"sourcesContent":["geoiplus-p4-canary:other-pkg:${'a'.repeat(32)}"]}`,
      'services/kernel/dist/server.js': `var a="${FAKE}";`,
    }));
    expect(p).toEqual([
      'apps/web/dist/assets/index-abc.js:1: client output contains P4 canary "geoiplus-p4-canary:geo-model3d:<id>" (D-24)',
      'apps/web/dist/assets/index-abc.js.map:1: client output contains P4 canary "geoiplus-p4-canary:other-pkg:<id>" (D-24)',
    ]);
  });

  it('fails an exports entry that does not import the canary module, and a missing sideEffects entry', async () => {
    const pkg = { ...PKG, exports: { '.': './src/index.js', './io': './src/io.js' }, sideEffects: false };
    const p = await problems(repo({
      'packages/geo-model3d/package.json': JSON.stringify(pkg),
      'packages/geo-model3d/src/io.js': 'export const io = 1;\n',
    }));
    expect(p).toEqual([
      'packages/geo-model3d/package.json:1: "sideEffects" does not list ./src/canary.js (3D-ADR-0001)',
      'packages/geo-model3d/src/io.js:1: exports entry does not import ./canary.js (3D-ADR-0001)',
    ]);
  });

  it('negative control fails when the marker does not survive the minified browser build', async () => {
    const p = await problems(repo({ 'packages/geo-model3d/src/canary.js': `export const P4_CANARY = '${FAKE}';\n` }), true);
    expect(p).toEqual([
      'packages/geo-model3d/./src/index.js:1: canary missing from the minified browser build of this entry (3D-ADR-0001)',
    ]);
  });

  it('fails when the canary value appears outside the canary module', async () => {
    const p = await problems(repo({ 'docs/note.md': `The marker is ${FAKE}.\n` }));
    expect(p).toEqual(['docs/note.md:1: contains the canary value; documents may state the format only (3D-ADR-0001)']);
  });
});
