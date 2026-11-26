// Auth and lease ports of the kernel service (3D-110; spec §11 r1, r2, r11; D-69, D-3D110-2). The service never takes
// authority from a message's `actorId`: the user is the one the bearer token names. Roles come from the CP workplace
// (D-09, D-10). The lease is the CP assignment lease; 3DQM keeps no lock of its own (D-69).

/** CP workplace roles (spec §11 r2). */
export const ROLES = Object.freeze({ OPERATOR: '3dqm.production', REVIEWER: '3dqm.qa' });

/**
 * The authenticated user of a request.
 * @typedef {{ actorId: string, roles: string[] }} AuthUser
 */

/**
 * Token -> user. `undefined` for an unknown, expired or malformed token (-> `401 UNAUTHENTICATED`).
 * @typedef {{ authenticate: (token: string) => Promise<AuthUser | undefined> | AuthUser | undefined }} AuthPort
 */

/**
 * The current CP assignment lease of a building, or `undefined` when nobody holds one.
 * @typedef {{ leaseRef: string, leaseEpoch: number, holderId: string }} Lease
 * @typedef {{ current: (projectId: string, buildingId: string) => Promise<Lease | undefined> | Lease | undefined }} LeasesPort
 */

/** @param {any} x @returns {x is AuthPort} */
export const isAuthPort = (x) => typeof x?.authenticate === 'function';

/** @param {any} x @returns {x is LeasesPort} */
export const isLeasesPort = (x) => typeof x?.current === 'function';

/** Request header that carries the session's lease (D-3D110-2): `<leaseRef>;<leaseEpoch>`. */
export const LEASE_HEADER = 'x-3dqm-lease';

/**
 * Parse the lease header. @param {string | undefined} value
 * @returns {{ leaseRef: string, leaseEpoch: number } | undefined} undefined when missing or malformed
 */
export function parseLeaseHeader(value) {
  if (typeof value !== 'string') return undefined;
  const i = value.lastIndexOf(';');
  if (i <= 0) return undefined;
  const leaseRef = value.slice(0, i).trim();
  const epoch = value.slice(i + 1).trim();
  if (leaseRef === '' || !/^(0|[1-9][0-9]*)$/.test(epoch)) return undefined;
  const leaseEpoch = Number(epoch);
  return Number.isSafeInteger(leaseEpoch) ? { leaseRef, leaseEpoch } : undefined;
}
