// Request / reply validation of the kernel service against contracts/model3d/ (3D-109; spec §11 r12, 3D-ADR-0002
// Checks): every message is checked by its JSON Schema 2020-12 (Ajv, runtime dependency by D-351). An invalid
// request is `400 INVALID_PAYLOAD`; an invalid reply is a service defect and becomes `500 INTERNAL` (never sent).
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';
import { errorReply } from './errors.js';

/** Directory of the contract schemas (the image must ship it beside the service, 3D-110). */
export const CONTRACTS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'contracts', 'model3d');

/** @param {string} name schema name, e.g. `command` or `command-payload-move-vertex` */
export const schemaId = (name) => `urn:geoiplus:schema:model3d-${name}:v1`;

/** @param {string} kind e.g. MOVE_VERTEX -> command-payload-move-vertex */
export const payloadSchema = (kind) => `command-payload-${kind.toLowerCase().replace(/_/g, '-')}`;

/**
 * @param {{ dir?: string }} [options]
 * @returns {{ names: string[], check: (name: string, message: unknown) => string | null,
 *   request: (name: string, message: unknown) => { httpStatus: number, body: any } | null,
 *   command: (message: any) => { httpStatus: number, body: any } | null,
 *   reply: (reply: { httpStatus: number, body: any }) => { httpStatus: number, body: any } }}
 */
export function createContractValidator(options = {}) {
  const dir = options.dir ?? CONTRACTS_DIR;
  const addFormats = /** @type {any} */ (addFormatsModule).default ?? addFormatsModule;
  const ajv = new Ajv2020({ strict: true, strictRequired: false, allErrors: true });
  addFormats(ajv);
  const names = readdirSync(dir).filter((f) => f.endsWith('.schema.json')).sort().map((f) => f.replace(/\.schema\.json$/, ''));
  for (const n of names) ajv.addSchema(JSON.parse(readFileSync(join(dir, `${n}.schema.json`), 'utf8')));
  const known = new Set(names);

  /** @param {string} name @param {unknown} message @returns {string | null} the first errors, or null when valid */
  function check(name, message) {
    if (!known.has(name)) throw new Error(`contracts: unknown schema ${name}`);
    const v = /** @type {import('ajv').ValidateFunction} */ (ajv.getSchema(schemaId(name)));
    if (v(message)) return null;
    return (v.errors ?? []).slice(0, 3).map((e) => `${e.instancePath || '/'} ${e.message}`).join('; ');
  }

  /** @param {string} name @param {unknown} message */
  const request = (name, message) => {
    const why = check(name, message);
    return why === null ? null : errorReply('INVALID_PAYLOAD', [], `${name}: ${why}`);
  };

  /** The envelope, then the payload by the schema of its `operation` (also when the envelope has no branch for it). @param {any} message */
  function command(message) {
    const bad = request('command', message);
    if (bad) return bad;
    const p = payloadSchema(message.operation);
    return known.has(p) ? request(p, message.payload) : null;
  }

  /** The schema of a reply body: `command-status`, `command-result` or `error`. @param {any} body */
  const replySchema = (body) => (body?.state ? 'command-status' : body?.status ? 'command-result' : 'error');

  /** @param {{ httpStatus: number, body: any }} r */
  function reply(r) {
    const why = check(replySchema(r.body), r.body);
    return why === null ? r : errorReply('INTERNAL', [], `invalid reply (${replySchema(r.body)}): ${why}`);
  }

  return { names, check, request, command, reply };
}
