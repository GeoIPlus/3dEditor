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
     * [A] Who may import the kernel: itself, the kernel service (3D-23) and repository tools/tests.
     * Every other file counts as client code.
     */
    allowedImporters: ['packages/geo-model3d/', 'services/', 'tools/'],
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
  /** Server artefacts legitimately carry the marker (3D-ADR-0001 Q-09 point 3). */
  serverDirs: ['packages/geo-model3d/', 'services/'],
};
