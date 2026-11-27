// Helpers of the handler tests (3D-110): a handler over a memory store holding one baseline, static auth with an
// operator, a second operator and a reviewer, a memory lease held by the operator, and request builders.
import { createHistory } from '../src/history.js';
import { createMemoryStore } from '../src/adapters/memory-store.js';
import { createStaticAuth, createMemoryLeases } from '../src/adapters/static-auth.js';
import { createKernelHandler } from '../src/handler.js';
import { ROLES } from '../src/ports/auth.js';
import { PROFILE } from './commit-helpers.js';

export const TOKENS = {
  'tok-op': { actorId: 'usr-operator', roles: [ROLES.OPERATOR] },
  'tok-op2': { actorId: 'usr-other', roles: [ROLES.OPERATOR] },
  'tok-qa': { actorId: 'usr-reviewer', roles: [ROLES.REVIEWER] },
  'tok-none': { actorId: 'usr-norole', roles: [] },
};
export const LEASE = { leaseRef: 'lease-1', leaseEpoch: 3, holderId: 'usr-operator' };

/**
 * @param {any} model baseline of the only building
 * @param {Partial<import('../src/handler.js').KernelPorts>} [over]
 */
export async function handlerWith(model, over = {}) {
  const history = createHistory(createMemoryStore());
  await history.putBaseline(model.projectId, model.buildingId, model);
  const leases = createMemoryLeases();
  leases.set(model.projectId, model.buildingId, LEASE);
  const clock = { t: 0 };
  let n = 0;
  let pv = 0;
  const handle = createKernelHandler({ history, leases, auth: createStaticAuth(TOKENS), toleranceProfile: () => PROFILE,
    clock: () => '2026-11-26T00:00:00Z', now: () => clock.t, newOperationId: () => `op-${++n}`, newPreviewId: () => `pv-${++pv}`, ...over });
  return { handle, history, leases, clock };
}

/** Headers of a request: bearer token and, unless `lease` is null, the lease header. @param {string} token @param {string | null} [lease] */
export const headers = (token, lease = `${LEASE.leaseRef};${LEASE.leaseEpoch}`) => ({
  Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(lease === null ? {} : { 'X-3DQM-Lease': lease }),
});

/** @param {string} url @param {any} body @param {Record<string, string>} h */
export const post = (url, body, h) => ({ method: 'POST', url, headers: h, body: JSON.stringify(body) });
/** @param {string} url @param {Record<string, string>} h */
export const get = (url, h) => ({ method: 'GET', url, headers: h });
/** Body text of a reply (JSON, or the delivered bytes of a result). @param {string | Uint8Array} b */
export const text = (b) => (typeof b === 'string' ? b : new TextDecoder().decode(b));
/** @param {{ status: number, body: string | Uint8Array }} r */
export const json = (r) => ({ status: r.status, body: JSON.parse(text(r.body)) });
