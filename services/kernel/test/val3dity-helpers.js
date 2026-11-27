// Shared fixtures of the val3dity adapter tests (3D-74): golden inputs imported with the default profile, their
// exports, and the image's recorded replies (test/data/val3dity-*.response.json; README in test/data).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importBuilding } from '@geoiplus/geo-model3d';
import { PROFILE as BASE } from './commit-helpers.js';

/** The D-13 profile with the id the golden steps name (`default`). */
export const PROFILE = Object.freeze({ id: 'default', ...BASE });

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
/** @param {string} p */
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

/** @param {string} gt e.g. `GT-I2` @returns {{ cityjson: any, model: any }} the fixture document and its imported model */
export function golden(gt) {
  const step = readJson(join(ROOT, 'fixtures', gt, 'steps.json')).find((/** @type {any} */ s) => s.step === 'IMPORT');
  const cityjson = readJson(join(ROOT, 'fixtures', gt, step.document));
  const { model } = importBuilding({ cityjson, cityObjectId: step.cityObjectId, toleranceProfile: PROFILE, projectId: 'prj-val3dity' });
  return { cityjson, model };
}

/** @param {string} name e.g. `gt-i2` @returns {any} the image's recorded 200 reply */
export const recorded = (name) => readJson(join(HERE, 'data', `val3dity-${name}.response.json`));
