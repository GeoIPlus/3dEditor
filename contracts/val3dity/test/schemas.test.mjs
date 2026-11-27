// Contract tests of contracts/val3dity (3D-74, D-3D74-5): every schema compiles in Ajv strict mode, has its `$id`,
// and accepts its valid examples and rejects its invalid ones (each invalid example states why).
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const NAMES = ['error', 'validate-request', 'validate-response', 'validator'];
/** @param {string} p */
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

/** @returns {Ajv2020} every schema of this directory added (refs resolve by `$id`) */
export function createVal3dityAjv() {
  const ajv = new Ajv2020({ strict: true, strictRequired: false, allErrors: true });
  for (const n of NAMES) ajv.addSchema(readJson(join(DIR, `${n}.schema.json`)));
  return ajv;
}

describe('contracts/val3dity', () => {
  const ajv = createVal3dityAjv();

  it('holds exactly the four accepted schemas (D-3D74-5)', () => {
    const files = readdirSync(DIR).filter((f) => f.endsWith('.schema.json')).map((f) => f.replace('.schema.json', ''));
    expect(files.sort()).toEqual(NAMES);
  });

  for (const name of NAMES) {
    it(`${name}: 2020-12, $id, examples`, () => {
      const s = readJson(join(DIR, `${name}.schema.json`));
      expect(s.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
      expect(s.$id).toBe(`urn:geoiplus:schema:val3dity-${name}:v1`);
      const validate = /** @type {import('ajv').ValidateFunction} */ (ajv.getSchema(s.$id));
      const ex = readJson(join(DIR, 'examples', `${name}.json`));
      expect(ex.valid.length).toBeGreaterThan(0);
      expect(ex.invalid.length).toBeGreaterThan(0);
      for (const v of ex.valid) expect(validate(v), JSON.stringify(validate.errors)).toBe(true);
      for (const { why, instance } of ex.invalid) {
        expect(typeof why).toBe('string');
        expect(validate(instance), why).toBe(false);
      }
    });
  }
});
