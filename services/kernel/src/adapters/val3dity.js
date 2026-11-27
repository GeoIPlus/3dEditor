// val3dity adapter of the `validate` external-validator port (3D-74; 3D-ADR-0008 decision 2, D-148). FINAL_VALIDATION
// awaits `validate({ model, tolerances })`: the model is exported (3D-11, `exportBuilding`), the CityJSON document is
// sent to the val3dity image (its own container, GPL-3.0 isolated, D-109) over the contract `contracts/val3dity`
// (D-446, D-448), and val3dity's report becomes port findings: `externalValidatorCode` = the val3dity code as a
// string, `entityIds` from the val3dity id (val3dity-ids.js). `validate` maps codes and severities (D-162).
// Every failure of the image - refused connection, timeout, non-200 reply, a reply outside the contract, another
// val3dity version than the pin - rejects with `PortUnavailableError` -> `503 UNAVAILABLE`; nothing is changed.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { exportBuilding } from '@geoiplus/geo-model3d';
import { PortUnavailableError } from '../errors.js';
import { entityIdsOf } from './val3dity-ids.js';

/** The pinned validator (D-91, 3D-ADR-0008; tag `2.7.0` = this commit, D-444). */
export const VAL3DITY_PIN = Object.freeze({ version: '2.7.0', commit: 'fbe9e4d65376e1c3f63401f15967485783f78c0a' });

/** val3dity's normals tolerance: the profile has no such field (D-447). */
export const PLANARITY_NORMALS_TOL_DEG = 20;

/** Directory of the wire contract (the service image ships it beside contracts/model3d). */
export const VAL3DITY_CONTRACTS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'contracts', 'val3dity');

/**
 * One port finding (geo-model3d `validate/external.js` ExternalFinding).
 * @typedef {{ externalValidatorCode: string, entityIds?: string[] }} ExternalFinding
 */

const NAMES = ['error', 'validate-request', 'validate-response', 'validator'];

/** @param {string} dir @returns {(name: string, message: unknown) => string | null} the first errors, or null */
function contractChecker(dir) {
  const ajv = new Ajv2020({ strict: true, strictRequired: false, allErrors: true });
  for (const n of NAMES) ajv.addSchema(JSON.parse(readFileSync(join(dir, `${n}.schema.json`), 'utf8')));
  return (name, message) => {
    const v = /** @type {import('ajv').ValidateFunction} */ (ajv.getSchema(`urn:geoiplus:schema:val3dity-${name}:v1`));
    return v(message) ? null : (v.errors ?? []).slice(0, 3).map((e) => `${e.instancePath || '/'} ${e.message}`).join('; ');
  };
}

/**
 * val3dity parameters of a tolerance profile (D-447).
 * @param {{ topologySnapTolM: number, planarTolM: number }} profile contract `tolerance-profile`
 */
export const parametersOf = (profile) => ({
  snapTolM: profile.topologySnapTolM,
  planarityD2pTolM: profile.planarTolM,
  planarityNormalsTolDeg: PLANARITY_NORMALS_TOL_DEG,
});

/**
 * Port findings of a val3dity report: one per feature error and per dataset error.
 * @param {any} model contract `building-model` @param {any} report contract `validate-response.report`
 * @returns {ExternalFinding[]}
 */
export function findingsOf(model, report) {
  const out = [];
  for (const f of report.features) {
    for (const e of f.errors) out.push({ externalValidatorCode: String(e.code), entityIds: entityIdsOf(model, e.id, f.id) });
  }
  for (const e of report.dataset_errors) out.push({ externalValidatorCode: String(e.code), entityIds: [] });
  return out;
}

/**
 * @typedef {object} Val3dityOptions
 * @property {string} url base URL of the image, e.g. `http://val3dity:8080`
 * @property {(model: any) => Promise<any> | any} documentOf the parsed CityJSON document the model was imported from
 *   (the service keeps it, spec §7 rule 4); `exportBuilding` copies opaque data from it
 * @property {number} [timeoutMs] per request, default 60000 [A] (spec §11: FINAL_VALIDATION p95 <= 10 s is an assumption)
 * @property {typeof fetch} [fetch] injected for tests
 * @property {string} [contractsDir]
 */

/**
 * @param {Val3dityOptions} options
 * @returns {{ validate: (input: { model: any, tolerances: any }) => Promise<{ validatorVersion: string,
 *   findings: ExternalFinding[] }>,
 *   version: () => Promise<any> }}
 */
export function createVal3dityValidator(options) {
  const { url, documentOf, timeoutMs = 60000 } = options;
  const http = options.fetch ?? globalThis.fetch;
  const check = contractChecker(options.contractsDir ?? VAL3DITY_CONTRACTS_DIR);
  const base = url.replace(/\/+$/, '');

  /** @param {string} path @param {RequestInit} init @param {string} schema of the 200 body */
  async function call(path, init, schema) {
    let res;
    try {
      res = await http(`${base}${path}`, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      throw new PortUnavailableError(`val3dity unreachable: ${/** @type {any} */ (err)?.cause?.code ?? /** @type {any} */ (err)?.name}`, { cause: err });
    }
    /** @type {any} */
    let body;
    try {
      body = await res.json();
    } catch (err) {
      throw new PortUnavailableError(`val3dity ${path}: ${res.status}, body not JSON`, { cause: err });
    }
    if (res.status !== 200) {
      const why = check('error', body) === null ? `${body.code}: ${body.message}` : 'reply outside the error contract';
      throw new PortUnavailableError(`val3dity ${path}: ${res.status} ${why}`);
    }
    const bad = check(schema, body);
    if (bad !== null) throw new PortUnavailableError(`val3dity ${path}: reply outside ${schema}: ${bad}`);
    const v = schema === 'validator' ? body : body.validator;
    if (v.version !== VAL3DITY_PIN.version || v.commit !== VAL3DITY_PIN.commit) {
      throw new PortUnavailableError(`val3dity ${v.version}@${v.commit} is not the pin ${VAL3DITY_PIN.version}@${VAL3DITY_PIN.commit}`);
    }
    return body;
  }

  return {
    version: () => call('/version', { method: 'GET' }, 'validator'),
    async validate({ model, tolerances }) {
      const { cityjson } = exportBuilding({ model, cityjson: await documentOf(model), toleranceProfile: tolerances });
      const request = { document: cityjson, parameters: parametersOf(tolerances) };
      const bad = check('validate-request', request);
      if (bad !== null) throw new TypeError(`val3dity request outside validate-request: ${bad}`);
      const body = await call('/validate', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request),
      }, 'validate-response');
      return { validatorVersion: `val3dity ${body.validator.version}`, findings: findingsOf(model, body.report) };
    },
  };
}
