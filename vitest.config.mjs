import { defineConfig } from 'vitest/config';

// `unit` runs with `npm test`; `golden` (v0.3 §12 golden tests, from 3D-07) with `npm run golden`.
// tools/check-docs.test.mjs uses node:test and runs under `node --test` (see package.json "test").
const GOLDEN = '**/*.golden.test.{js,mjs}';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['packages/*/test/**/*.test.js', 'tools/**/*.test.mjs', 'services/*/test/**/*.test.js'],
          exclude: ['**/node_modules/**', GOLDEN, 'tools/check-docs.test.mjs'],
        },
      },
      { test: { name: 'golden', include: [GOLDEN], exclude: ['**/node_modules/**'] } },
    ],
  },
});
