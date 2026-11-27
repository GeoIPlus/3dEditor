// Helpers of the QC / export tests (3D-24): a handler over one store with several baselines, static auth (operator,
// second operator, reviewer, second reviewer), memory leases, a stub external validator, memory datasets and sources.
import { createHistory } from '../src/history.js';
import { createMemoryStore } from '../src/adapters/memory-store.js';
import { createMemoryByteStore } from '../src/adapters/memory-datasets-store.js';
import { createMemorySources } from '../src/adapters/memory-sources.js';
import { createStaticAuth, createMemoryLeases } from '../src/adapters/static-auth.js';
import { createByteDatasets } from '../src/datasets.js';
import { createKernelHandler } from '../src/handler.js';
import { ROLES } from '../src/ports/auth.js';
import { PROFILE } from './commit-helpers.js';
import { headers, json, post } from './handler-helpers.js';

export const QC_TOKENS = {
  'tok-op': { actorId: 'usr-operator', roles: [ROLES.OPERATOR] },
  'tok-qa': { actorId: 'usr-reviewer', roles: [ROLES.REVIEWER] },
  'tok-qa2': { actorId: 'usr-reviewer-2', roles: [ROLES.REVIEWER] },
  'tok-both': { actorId: 'usr-both', roles: [ROLES.OPERATOR, ROLES.REVIEWER] },
};
export const PUBLIC_BASE = 'https://kernel.test';

/** Stub of the external validator port (the real one is 3D-74): no findings, counts its calls. */
export function stubValidator() {
  const calls = { n: 0 };
  return { calls, validate: async () => { calls.n += 1; return { validatorVersion: 'stub-1', findings: [] }; } };
}

/**
 * @param {any[]} models baselines (one per building)
 * @param {{ store?: import('../src/ports/history.js').ObjectStore, over?: Partial<import('../src/handler.js').KernelPorts> }} [o]
 */
export async function qcHandler(models, o = {}) {
  const history = createHistory(o.store ?? createMemoryStore());
  for (const m of models) await history.putBaseline(m.projectId, m.buildingId, m);
  const leases = createMemoryLeases();
  const validator = stubValidator();
  const datasets = createByteDatasets(createMemoryByteStore());
  const sources = createMemorySources();
  let n = 0;
  const handle = createKernelHandler({ history, leases, auth: createStaticAuth(QC_TOKENS), toleranceProfile: () => PROFILE,
    clock: () => '2026-11-26T00:00:00Z', now: () => 0, newOperationId: () => `op-${++n}`,
    externalValidator: validator, datasets, sources, publicBase: PUBLIC_BASE, ...o.over });
  return { handle, history, leases, validator, datasets, sources };
}

/** Gives `actorId` the building's lease (D-403). @param {ReturnType<typeof createMemoryLeases>} leases @param {any} m @param {string} actorId @param {number} epoch */
export const lease = (leases, m, actorId, epoch) => {
  leases.set(m.projectId, m.buildingId, { leaseRef: `lease-${actorId}`, leaseEpoch: epoch, holderId: actorId });
  return `lease-${actorId};${epoch}`;
};

/** @param {string} p @param {string} b @param {string} leaf */
export const bUrl = (p, b, leaf) => `/api/projects/${encodeURIComponent(p)}/buildings/${encodeURIComponent(b)}/${leaf}`;

/** FINAL_VALIDATION request. @param {any} handle @param {any} m @param {string} token */
export const finalValidation = async (handle, m, token) => json(await handle(post(bUrl(m.projectId, m.buildingId, 'final-validation'), {}, headers(token, null))));

/** Approval request. @param {any} handle @param {any} m @param {string} token @param {number} expectedVersion @param {string | null} leaseHeader */
export const approve = async (handle, m, token, expectedVersion, leaseHeader) =>
  json(await handle(post(bUrl(m.projectId, m.buildingId, 'approval'), { expectedVersion }, headers(token, leaseHeader))));

/** Batch export. @param {any} handle @param {string} p @param {string[]} buildingIds @param {string} token */
export const exportBatch = async (handle, p, buildingIds, token) =>
  json(await handle(post(`/api/projects/${encodeURIComponent(p)}/export`, { buildingIds }, headers(token, null))));
