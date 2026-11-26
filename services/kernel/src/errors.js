// Error replies of the kernel service (3D-23, 3D-109): the contract `error` object of the registry (spec §2.4,
// contracts/model3d/error.schema.json) for refusals the service makes itself, and the mapping of thrown adapter and
// runtime failures to the registry (D-353). The model is unchanged in every case (spec §11 r7).
import { LasFormatError } from './adapters/las-format.js';

/** HTTP status of every registry code (spec §2.4; the error schema binds each code to it). */
export const HTTP_STATUS = Object.freeze(/** @type {Record<string, number>} */ ({
  INVALID_PAYLOAD: 400, UNAUTHENTICATED: 401, FORBIDDEN: 403, NOT_FOUND: 404, VERSION_CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413, UNDERCONSTRAINED_GEOMETRY: 422, CONSTRAINT_CONFLICT: 422, INVALID_TOPOLOGY: 422,
  INVALID_GEOMETRY: 422, INVALID_MEASUREMENT: 422, UNSUPPORTED_FOOTPRINT: 422, INVALID_CRS: 422, RATE_LIMITED: 429, INTERNAL: 500,
  UNAVAILABLE: 503,
}));

/** Message key `model3d.error.<camelCaseCode>`, as the kernel writes it (D-91: texts are keys). @param {string} code */
export const errorKey = (code) => `model3d.error.${code.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase())}`;

/**
 * @param {string} code registry code
 * @param {string[]} [entityIds]
 * @param {string} [message] diagnostic text, not UI text
 * @param {Record<string, unknown>} [details] contract `error.details`
 * @returns {{ httpStatus: number, body: any }} body: contract `error`
 */
export function errorReply(code, entityIds = [], message, details) {
  const httpStatus = HTTP_STATUS[code];
  if (!httpStatus) throw new Error(`errors: unknown code ${code}`);
  /** @type {any} */
  const body = { code, httpStatus, messageKey: errorKey(code) };
  if (message) body.message = message;
  if (entityIds.length > 0) body.entityIds = [...new Set(entityIds)];
  if (details) body.details = details;
  return { httpStatus, body };
}

/** Abort / timeout names of a failed read (`AbortSignal.timeout`, `fetch`). */
const READ_ABORTS = new Set(['AbortError', 'TimeoutError']);

/**
 * A read failure: a Node system error (`code` such as `ENOENT`, `EIO`, `ETIMEDOUT`, with `syscall` or an `E*` code)
 * or an aborted / timed-out read. @param {any} err
 */
const isReadFailure = (err) => READ_ABORTS.has(err?.name)
  || (typeof err?.code === 'string' && /^E[A-Z0-9]+$/.test(err.code) && (err.syscall !== undefined || err.errno !== undefined));

/** A kernel `CrsError` (crs/registry.js; not exported by the package): `code` INVALID_CRS, `details.reason`. @param {any} e */
const isCrsError = (e) => e?.name === 'CrsError' && e.code === 'INVALID_CRS' && typeof e.details?.reason === 'string';

/**
 * Registry reply of a thrown failure (D-353): a kernel `CrsError` (the cloud's CRS cannot be mapped to the building's,
 * D-197, D-198) -> `422 INVALID_CRS` with `details.crsReason` (D-406); `LasFormatError` (corrupt or unsupported
 * point file) -> `500 INTERNAL`,
 * a read failure -> `503 UNAVAILABLE`, anything else -> `500 INTERNAL`. The message is diagnostic, not UI text.
 * @param {unknown} err
 * @returns {{ httpStatus: number, body: any }}
 */
export function failureReply(err) {
  const e = /** @type {any} */ (err);
  if (isCrsError(e)) return errorReply('INVALID_CRS', [], e.message, { crsReason: e.details.reason });
  if (e instanceof LasFormatError) return errorReply('INTERNAL', [], `point file: ${e.message}`);
  if (isReadFailure(e)) return errorReply('UNAVAILABLE', [], `read failed: ${e.code ?? e.name}`);
  return errorReply('INTERNAL', [], 'unexpected failure');
}
