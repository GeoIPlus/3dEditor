// Rules of `npm run check:arch` (3D-05). Paths are relative to the repository root.
// [A] The package layout is decided by 3D-02 (ADR, running in parallel); change paths here, not in the checks.

/** @typedef {typeof CONFIG} ArchConfig */

export const CONFIG = {
  /** Source files counted by the line limit (code only; documents are exempt, D-41). */
  codeExtensions: ['.js', '.mjs', '.cjs', '.jsx', '.ts', '.mts', '.cts', '.tsx'],
  /** AGENTS.md §2.9. */
  maxLines: 300,
  /** Directories never scanned. */
  skipDirs: ['.git', 'node_modules', '.cache', 'coverage'],

  kernel: {
    /** The P4 package (D-06, D-07). */
    dir: 'packages/geo-model3d',
    /** Specifiers that name it (bare package names). */
    names: ['@geoiplus/geo-model3d', 'geo-model3d'],
    /** Unscoped name used in the canary literal (3D-ADR-0001). */
    canaryPackage: 'geo-model3d',
    /** Module every `exports` target must import. */
    canaryModule: 'src/canary.js',
    /**
     * Who may import the kernel: itself (its tests included), the kernel service (3D-23; 3D-ADR-0002 C1, narrowed by
     * 3D-09) and the latency bench, which drives the kernel in-process (3D-ADR-0006) [A]. Every other file counts as
     * client code.
     */
    allowedImporters: ['packages/geo-model3d/', 'services/kernel/', 'tools/bench/'],
    /** Kernel source: the module DAG and the no-I/O rule apply here (3D-09). */
    srcDir: 'packages/geo-model3d/src',
    /**
     * Module DAG, 3D-ADR-0002 C1 rule 2: module -> modules it may import. Root files (`index.js`) import all.
     * `crs` (3D-32, branch wp/3d-32-crs-support): a leaf that `brep`, `import`, `export` may import, as its accepted ADR
     * amends C1 rule 2; listed here so that its merge does not break this rule.
     * @type {Record<string, string[]>}
     */
    modules: {
      brep: ['crs'],
      crs: [],
      solve: ['brep'],
      import: ['brep', 'crs'],
      export: ['brep', 'crs'],
      validate: ['brep'],
      cloud: ['brep'],
      ops: ['brep', 'solve', 'validate'],
      metrics: ['brep', 'validate'],
    },
    /** C1 rule 1: Node built-ins for I/O, processes, timers, clock, environment. */
    ioModules: [/^(node:)?(fs|fs\/promises|net|http|https|http2|child_process|dgram|dns|tls|cluster|worker_threads|os|process|perf_hooks|timers|timers\/promises|readline|inspector|vm)$/],
    /** C1 rule 1: globals that reach I/O, timers, clock, randomness, environment or process. */
    ioGlobals: ['process', 'fetch', 'WebSocket', 'setTimeout', 'setInterval', 'setImmediate', 'queueMicrotask', 'performance', 'crypto', 'require'],
    /** C1 rule 1: member calls that read the clock or randomness (`process.*` is caught by `ioGlobals`). */
    ioMembers: ['Date.now', 'Math.random'],
    /** Modules the kernel must not import (AGENTS.md §2.10, STRUCTURE.md §2.1). */
    forbiddenModules: [/^three(\/|$)/, /^@geoiplus\/(?!geo-model3d(\/|$))/, /^(jsdom|happy-dom)(\/|$)/],
    /** Browser globals the kernel must not reference (AGENTS.md §2.10). */
    domGlobals: [
      'window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'requestAnimationFrame',
      'cancelAnimationFrame', 'customElements', 'getComputedStyle', 'DOMParser', 'XMLHttpRequest', 'HTMLElement',
      'HTMLCanvasElement', 'CanvasRenderingContext2D', 'WebGLRenderingContext', 'WebGL2RenderingContext',
      'OffscreenCanvas', 'MutationObserver', 'ResizeObserver', 'IntersectionObserver',
    ],
  },

  /** 3D-ADR-0001 scanner pattern, identical in every repository. */
  canaryPattern: /geoiplus-p4-canary:[a-z0-9-]+:[0-9a-f]{32}/,

  /**
   * Browser-facing outputs of this repository; the marker must be absent (3D-ADR-0001: none planned, D-17).
   * Any directory with one of these names outside `serverDirs` is scanned too.
   */
  clientOutputs: /** @type {string[]} */ ([]),
  clientOutputDirNames: ['dist', 'build', 'public', 'storybook-static'],
  /**
   * Licence allow-list (3D-67): runtime dependencies of the kernel and of every `services/<name>` package
   * (3D-ADR-0004 decision 3, D-109). SPDX ids; read offline from the lockfile.
   */
  licences: {
    allowed: ['MIT', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', 'Unlicense', 'BSL-1.0'],
    servicesDir: 'services',
    lockFile: 'package-lock.json',
  },

  /**
   * Images of programs outside the licence allow-list, reached over the network only (3D-74; 3D-ADR-0008, D-148):
   * no npm package inside, no import into them from packages/ or services/, Dockerfile and SOURCE.md present.
   */
  isolatedImages: [{ dir: 'images/val3dity', licence: 'GPL-3.0' }],

  /**
   * Append-only stores (3D-23; 3D-ADR-0003 §5, D-84, D-85): in store adapters (`files`; points adapters are not
   * stores and may free decoder memory with `.delete()`) no code references a call that
   * deletes, renames, truncates or overwrites stored objects. `names`: identifiers (imported functions, S3 commands);
   * `memberNames`: `x.name` calls (`fh.writeFile` on a `wx` handle is allowed, so write calls are names only).
   */
  appendOnly: {
    files: /^services\/kernel\/src\/adapters\/[^/]+-store\.[cm]?js$/,
    names: ['unlink', 'unlinkSync', 'rm', 'rmSync', 'rmdir', 'rmdirSync', 'rename', 'renameSync', 'truncate', 'truncateSync',
      'ftruncate', 'ftruncateSync', 'writeFile', 'writeFileSync', 'appendFile', 'appendFileSync', 'copyFile', 'copyFileSync',
      'cp', 'cpSync', 'createWriteStream', 'DeleteObjectCommand', 'DeleteObjectsCommand', 'PutObjectCommand'],
    memberNames: ['unlink', 'unlinkSync', 'rm', 'rmSync', 'rmdir', 'rmdirSync', 'rename', 'renameSync', 'truncate',
      'truncateSync', 'ftruncate', 'deleteObject', 'deleteObjects', 'delete', 'clear'],
  },

  /** Server artefacts legitimately carry the marker (3D-ADR-0001 Q-09 point 3). */
  serverDirs: ['packages/geo-model3d/', 'services/'],
};
