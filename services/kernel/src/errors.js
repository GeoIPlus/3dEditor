// Error replies of the kernel service (3D-23): the contract `error` object of the registry (spec §2.4,
// contracts/model3d/error.schema.json) for refusals the service makes itself (unknown building or command, wrong
// phase). The full mapping of adapter and transport failures is row 3D-109.

/** HTTP status of every registry code (spec §2.4; the error schema binds each code to it). */
export const HTTP_STATUS = Object.freeze(/** @type {Record<string, number>} */ ({
  INVALID_PAYLOAD: 400, UNAUTHENTICATED: 401, FORBIDDEN: 403, NOT_FOUND: 404, VERSION_CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413, UNDERCONSTRAINED_GEOMETRY: 422, CONSTRAINT_CONFLICT: 422, INVALID_TOPOLOGY: 422,
  INVALID_GEOMETRY: 422, INVALID_MEASUREMENT: 422, UNSUPPORTED_FOOTPRINT: 422, RATE_LIMITED: 429, INTERNAL: 500,
  UNAVAILABLE: 503,
}));

/** Message key `model3d.error.<camelCaseCode>`, as the kernel writes it (D-91: texts are keys). @param {string} code */
export const errorKey = (code) => `model3d.error.${code.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase())}`;

/**
 * @param {string} code registry code
 * @param {string[]} [entityIds]
 * @param {string} [message] diagnostic text, not UI text
 * @returns {{ httpStatus: number, body: any }} body: contract `error`
 */
export function errorReply(code, entityIds = [], message) {
  const httpStatus = HTTP_STATUS[code];
  if (!httpStatus) throw new Error(`errors: unknown code ${code}`);
  /** @type {any} */
  const body = { code, httpStatus, messageKey: errorKey(code) };
  if (message) body.message = message;
  if (entityIds.length > 0) body.entityIds = [...new Set(entityIds)];
  return { httpStatus, body };
}
