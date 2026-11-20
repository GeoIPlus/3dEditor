// Negative control of the P4 canary (3D-ADR-0001, D-37): bundle each `exports` entry of the kernel for the browser
// the way a client app would (side-effect-only import, Vite production build, minified, source maps on) and require
// the marker in every output. If it is missing, a clean scan of client bundles proves nothing, so CI fails.
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';
import { exportTargets } from './rules.mjs';

/**
 * @param {string} root repository root
 * @param {import('./config.mjs').ArchConfig} config
 * @returns {Promise<{problems: string[], report: string[]}>}
 */
export async function negativeControl(root, config) {
  const { build } = await import('vite');
  const k = config.kernel;
  const pkg = JSON.parse(readFileSync(join(root, k.dir, 'package.json'), 'utf8'));
  const marker = new RegExp(`geoiplus-p4-canary:${k.canaryPackage}:[0-9a-f]{32}`);
  /** @type {string[]} */
  const problems = [];
  /** @type {string[]} */
  const report = [];
  const work = mkdtempSync(join(tmpdir(), 'p4-negative-control-'));
  try {
    for (const target of [...new Set(exportTargets(pkg.exports))]) {
      const entryFile = join(root, k.dir, target);
      const name = posix.basename(target).replace(/\.[^.]+$/, '');
      const app = join(work, `${name}-app`);
      const out = join(app, 'dist');
      // A client that imports the entry for its side effects only: nothing is used, tree shaking is maximal.
      writeFileSync(join(work, `${name}-main.js`), `import ${JSON.stringify(entryFile)};\n`);
      try {
        await build({
          configFile: false,
          root: work,
          logLevel: 'silent',
          mode: 'production',
          build: {
            outDir: out,
            emptyOutDir: true,
            minify: true,
            sourcemap: true,
            target: 'es2022',
            rollupOptions: { input: join(work, `${name}-main.js`), external: [/^node:/] },
          },
        });
      } catch (err) {
        problems.push(`${k.dir}/${target}:1: negative control build failed: ${/** @type {Error} */ (err).message.split('\n')[0]}`);
        continue;
      }
      const outputs = listFiles(out).filter((f) => /\.(m?js|map)$/.test(f));
      const js = outputs.filter((f) => !f.endsWith('.map'));
      const withMarker = outputs.filter((f) => marker.test(readFileSync(f, 'utf8')));
      const jsMissing = js.filter((f) => !withMarker.includes(f));
      if (js.length === 0 || jsMissing.length > 0)
        problems.push(`${k.dir}/${target}:1: canary missing from the minified browser build of this entry (3D-ADR-0001)`);
      report.push(`${target}: ${withMarker.length}/${outputs.length} outputs (js + map) contain the marker`);
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  return { problems, report };
}

/** @param {string} dir @returns {string[]} */
function listFiles(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => join(d.parentPath, d.name));
}
