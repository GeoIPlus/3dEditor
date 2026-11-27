// Access checks of the kernel service (3D-110; spec §11 r1, r2, r11; D-69, D-403): bearer token -> user
// (`401 UNAUTHENTICATED`), role per action (`403 FORBIDDEN`), and for every command the CP assignment lease named by
// the request header against the building's current lease (`403 FORBIDDEN`). Nothing is read or run before these pass.
import { errorReply } from './errors.js';
import { LEASE_HEADER, ROLES, parseLeaseHeader } from './ports/auth.js';

/** Actions of spec §11 r2 (3D-110; approve and export 3D-24; import 3D-133, D-3D133-3). FINAL_VALIDATION changes no model: VIEW (D-451). */
export const ACTIONS = Object.freeze({
  VIEW: [ROLES.OPERATOR, ROLES.REVIEWER],
  EDIT: [ROLES.OPERATOR],
  IMPORT: [ROLES.OPERATOR],
  APPROVE: [ROLES.REVIEWER],
  EXPORT: [ROLES.REVIEWER],
});

/**
 * Bearer token of an `Authorization` header. @param {string | undefined} header
 * @returns {string | undefined}
 */
export function bearerToken(header) {
  const m = typeof header === 'string' ? /^Bearer[ ]+([^\s]+)\s*$/i.exec(header) : null;
  return m ? m[1] : undefined;
}

/**
 * The authenticated user, or the refusal.
 * @param {import('./ports/auth.js').AuthPort} auth @param {Record<string, string | undefined>} headers lower-case names
 * @returns {Promise<{ user: import('./ports/auth.js').AuthUser } | { reply: import('./commit.js').Reply }>}
 */
export async function authenticate(auth, headers) {
  const token = bearerToken(headers.authorization);
  const user = token === undefined ? undefined : await auth.authenticate(token);
  if (!user || typeof user.actorId !== 'string' || user.actorId === '') {
    return { reply: errorReply('UNAUTHENTICATED', [], 'no valid session') };
  }
  return { user: { actorId: user.actorId, roles: Array.isArray(user.roles) ? user.roles : [] } };
}

/**
 * `403` unless the user has one of the action's roles.
 * @param {import('./ports/auth.js').AuthUser} user @param {readonly string[]} action
 * @returns {import('./commit.js').Reply | undefined}
 */
export function requireRole(user, action) {
  return user.roles.some((r) => action.includes(r)) ? undefined : errorReply('FORBIDDEN', [], 'role not allowed for this action');
}

/**
 * `403` unless the request's lease is the building's current lease and the user holds it (spec §11 r11, D-69).
 * @param {import('./ports/auth.js').LeasesPort} leases @param {import('./ports/auth.js').AuthUser} user
 * @param {Record<string, string | undefined>} headers @param {string} projectId @param {string} buildingId
 * @returns {Promise<import('./commit.js').Reply | undefined>}
 */
export async function checkLease(leases, user, headers, projectId, buildingId) {
  const held = parseLeaseHeader(headers[LEASE_HEADER]);
  if (!held) return errorReply('FORBIDDEN', [buildingId], 'no lease in the request');
  const current = await leases.current(projectId, buildingId);
  if (!current) return errorReply('FORBIDDEN', [buildingId], 'the building has no current lease');
  if (current.leaseRef !== held.leaseRef || current.leaseEpoch !== held.leaseEpoch || current.holderId !== user.actorId) {
    return errorReply('FORBIDDEN', [buildingId], 'the session does not hold the current lease');
  }
  return undefined;
}
