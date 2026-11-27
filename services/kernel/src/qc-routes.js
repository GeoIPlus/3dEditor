// QC and export routes of the handler (3D-24; spec §11 r2, r8, r9): FINAL_VALIDATION (VIEW roles, no lease, D-3D24-2),
// approval (reviewer, lease, D-3D24-5), batch export (reviewer, no lease), delivered bytes (VIEW roles; the address
// carries no secret, read access is the bearer token, 3D-ADR-0003 §4). Role and token are checked before the body.
import { ACTIONS, checkLease, requireRole } from './access.js';
import { errorReply } from './errors.js';
import { createExport } from './export.js';
import { isDigest } from './ports/datasets.js';

/**
 * @typedef {import('./commit.js').Reply | { httpStatus: number, raw: Uint8Array, contentType: string }} RouteReply
 */

/**
 * @param {import('./handler.js').KernelPorts} ports @param {ReturnType<typeof import('./qc.js').createQc>} qc
 * @param {ReturnType<typeof import('./contracts.js').createContractValidator>} contracts
 */
export function createQcRoutes(ports, qc, contracts) {
  const exporter = ports.datasets && ports.sources && ports.publicBase
    ? createExport({ history: ports.history, datasets: ports.datasets, sources: ports.sources, publicBase: ports.publicBase,
      toleranceProfile: ports.toleranceProfile, projectSettings: ports.projectSettings })
    : undefined;

  /**
   * @param {import('./routes.js').Route} r @param {import('./ports/auth.js').AuthUser} user
   * @param {Record<string, string | undefined>} headers
   * @param {() => Promise<{ ok: true, value: any } | { ok: false, reply: import('./commit.js').Reply }>} body
   * @returns {Promise<RouteReply | undefined>} `undefined`: not a QC route
   */
  return async function qcRoute(r, user, headers, body) {
    if (r.name === 'finalValidation') {
      return requireRole(user, ACTIONS.VIEW) ?? contracts.reply(await qc.finalValidation(r.projectId, r.buildingId), 'validation-report');
    }
    if (r.name === 'approval') {
      const refused = requireRole(user, ACTIONS.APPROVE);
      if (refused) return refused;
      const b = await body();
      if (!b.ok) return b.reply;
      const bad = contracts.request('approval-request', b.value);
      if (bad) return bad;
      const noLease = await checkLease(ports.leases, user, headers, r.projectId, r.buildingId);
      if (noLease) return noLease;
      return contracts.reply(await qc.approve(user, r.projectId, r.buildingId, b.value), 'approval');
    }
    if (r.name === 'export') {
      const refused = requireRole(user, ACTIONS.EXPORT);
      if (refused) return refused;
      const b = await body();
      if (!b.ok) return b.reply;
      const bad = contracts.request('export-request', b.value);
      if (bad) return bad;
      if (!exporter) return errorReply('UNAVAILABLE', [], 'export is not configured (datasets, sources, publicBase)');
      return contracts.reply({ httpStatus: 200, body: await exporter.exportBatch(r.projectId, b.value) }, 'export-result');
    }
    if (r.name === 'result') {
      const refused = requireRole(user, ACTIONS.VIEW);
      if (refused) return refused;
      const bytes = isDigest(r.digest) && ports.datasets ? await ports.datasets.readDelivered(r.projectId, r.digest) : undefined;
      if (!bytes) return errorReply('NOT_FOUND', [], 'no such result');
      return { httpStatus: 200, raw: bytes, contentType: 'application/json' };
    }
    return undefined;
  };
}
