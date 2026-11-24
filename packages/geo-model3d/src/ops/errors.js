// ops (3D-14): refusals as the contract `error` object (contracts/model3d/error.schema.json; spec §2.4). An operation
// module returns `{ ok: false, refusal }`; the pipeline turns it into a REJECTED / CONFLICT `command-result`.

/** HTTP status of every registry code (spec §2.4; error schema). */
export const HTTP_STATUS = Object.freeze(/** @type {Record<string, number>} */ ({
  INVALID_PAYLOAD: 400, UNAUTHENTICATED: 401, FORBIDDEN: 403, NOT_FOUND: 404, VERSION_CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413, UNDERCONSTRAINED_GEOMETRY: 422, CONSTRAINT_CONFLICT: 422, INVALID_TOPOLOGY: 422,
  INVALID_GEOMETRY: 422, INVALID_MEASUREMENT: 422, UNSUPPORTED_FOOTPRINT: 422, RATE_LIMITED: 429, INTERNAL: 500,
  UNAVAILABLE: 503,
}));

/**
 * @typedef {object} ContractError contract `error`
 * @property {string} code @property {number} httpStatus @property {string} messageKey
 * @property {string} [message] diagnostic text, not UI text
 * @property {string[]} [entityIds]
 * @property {{ admissibleModes?: string[], missingDegreesOfFreedom?: string[] }} [details]
 */

/**
 * Message key `model3d.error.<camelCaseCode>` (pattern of the contract examples; D-91: texts are keys).
 * @param {string} code
 */
export const errorKey = (code) => `model3d.error.${code.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase())}`;

/**
 * @param {string} code registry code
 * @param {string[]} [entityIds]
 * @param {string} [message]
 * @param {ContractError['details']} [details]
 * @returns {ContractError}
 */
export function contractError(code, entityIds, message, details) {
  const httpStatus = HTTP_STATUS[code];
  if (!httpStatus) throw new Error(`ops: unknown error code ${code}`);
  /** @type {ContractError} */
  const e = { code, httpStatus, messageKey: errorKey(code) };
  if (message) e.message = message;
  if (entityIds && entityIds.length > 0) e.entityIds = [...new Set(entityIds)];
  if (details) e.details = details;
  return e;
}

/**
 * A refusal an operation module returns (no partial side effects: the pipeline discards the draft).
 * @param {string} code @param {string[]} [entityIds] @param {string} [message] @param {ContractError['details']} [details]
 * @returns {{ ok: false, refusal: ContractError }}
 */
export const refuse = (code, entityIds, message, details) => ({ ok: false, refusal: contractError(code, entityIds, message, details) });
