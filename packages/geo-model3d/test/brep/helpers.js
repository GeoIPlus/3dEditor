// Test helpers for brep (3D-09): golden inputs (fixtures/, 3D-07), default tolerances (spec §2.3, D-13), Ajv with the
// model3d contracts. Tests may read files; the kernel code under src/ may not (3D-ADR-0002 C1 rule 1).
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
export const FIXTURES = join(ROOT, 'fixtures');

/** Default tolerance profile values the core reads (contract tolerance-profile example, spec §2.3). */
export const TOL = { numericEpsilon: 1e-9, topologySnapTolM: 0.01, planarTolM: 0.02 };

/** @param {string} gt @param {string} file @returns {any} */
export const readFixture = (gt, file) => JSON.parse(readFileSync(join(FIXTURES, gt, file), 'utf8'));

/** @returns {{ gt: string, model: any }[]} every golden test with a canonical input model, in name order */
export function goldenModels() {
  return readdirSync(FIXTURES)
    .filter((d) => d.startsWith('GT-') && existsSync(join(FIXTURES, d, 'input.model.json')))
    .sort()
    .map((gt) => ({ gt, model: readFixture(gt, 'input.model.json') }));
}

/** Deep-freeze a value (proves the code under test does not write it). @template T @param {T} v @returns {T} */
export function deepFreeze(v) {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const k of Object.keys(v)) deepFreeze(/** @type {any} */ (v)[k]);
  }
  return v;
}
