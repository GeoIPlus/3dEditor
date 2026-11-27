// `createKernelHandler(ports)` - the kernel service as one plain-Node function (3D-110; spec §11 API; 3D-ADR-0002 C2,
// D-51): `(request) => reply`, mountable in-process by a host (GV test host, 3D-50) and wrapped by server.js in the
// container (D-33). Order per request: route -> bearer token (401) -> role (403) -> body (413 / 400) -> contract ->
// lease for commands and approval (403) -> command API / status / heatmap / model read / QC and export (3D-24,
// qc-routes.js). Every reply is contract-validated JSON, except the delivered result bytes.
import { ACTIONS, authenticate, checkLease, requireRole } from './access.js';
import { readJsonBody } from './body.js';
import { createCommandApi } from './command-api.js';
import { commandPoints } from './cloud-points.js';
import { createContractValidator } from './contracts.js';
import { errorReply, failureReply } from './errors.js';
import { heatmap } from './heatmap.js';
import { createQc } from './qc.js';
import { createQcRoutes } from './qc-routes.js';
import { isDatasetsPort } from './ports/datasets.js';
import { isHistoryPort } from './ports/history.js';
import { isAuthPort, isLeasesPort } from './ports/auth.js';
import { isSourcesPort } from './ports/sources.js';
import { matchRoute } from './routes.js';

/**
 * @typedef {object} KernelPorts
 * @property {import('./ports/history.js').HistoryPort} history
 * @property {import('./ports/auth.js').AuthPort} auth
 * @property {import('./ports/auth.js').LeasesPort} leases
 * @property {(projectId: string) => any} toleranceProfile contract `tolerance-profile` of the project
 * @property {() => string} clock RFC 3339 time of results
 * @property {() => number} now milliseconds (PREVIEW expiry, rate window)
 * @property {import('./heatmap.js').HeatmapDeps['pointsDataset']} [pointsDataset] opened point dataset of a building (D-196)
 * @property {() => string} [newOperationId]
 * @property {() => string} [newPreviewId]
 * @property {ReturnType<typeof createContractValidator>} [contracts]
 * @property {import('./qc.js').QcDeps['externalValidator']} [externalValidator] FINAL_VALIDATION port (3D-74)
 * @property {import('./ports/datasets.js').DatasetsPort} [datasets] export: saves and delivered bytes (3D-128)
 * @property {import('./ports/sources.js').SourcesPort} [sources] export: source document, `progress.save`, basis
 * @property {string} [publicBase] `https` origin of the delivered addresses
 * @property {import('./export.js').ExportDeps['projectSettings']} [projectSettings] `exportRequiresApproval` (D-90)
 */

/**
 * @typedef {{ method: string, url: string, headers: Record<string, string | string[] | undefined>,
 *   body?: Parameters<typeof readJsonBody>[0] }} KernelRequest  header names in any case; `url` = path + query
 * @typedef {{ status: number, headers: Record<string, string>, body: string | Uint8Array }} KernelReply
 */

const JSON_HEADERS = Object.freeze({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });

/** @param {import('./qc-routes.js').RouteReply} r @returns {KernelReply} */
const wire = (r) => ('raw' in r
  ? { status: r.httpStatus, headers: { 'content-type': r.contentType, 'cache-control': 'no-store' }, body: r.raw }
  : { status: r.httpStatus, headers: { ...JSON_HEADERS }, body: JSON.stringify(r.body) });

/** Lower-case header names, first value of a list. @param {KernelRequest['headers']} h @returns {Record<string, string | undefined>} */
function headersOf(h) {
  /** @type {Record<string, string | undefined>} */
  const out = {};
  for (const [k, v] of Object.entries(h ?? {})) out[k.toLowerCase()] = Array.isArray(v) ? v[0] : v;
  return out;
}

/** @param {string | undefined} v @returns {number | undefined} */
const declaredLength = (v) => (v !== undefined && /^[0-9]+$/.test(v) ? Number(v) : undefined);

/** @param {KernelPorts} ports @returns {(request: KernelRequest) => Promise<KernelReply>} */
export function createKernelHandler(ports) {
  if (!isHistoryPort(ports.history)) throw new TypeError('handler: ports.history must implement the history port');
  if (!isAuthPort(ports.auth)) throw new TypeError('handler: ports.auth must implement the auth port');
  if (!isLeasesPort(ports.leases)) throw new TypeError('handler: ports.leases must implement the leases port');
  if (ports.datasets !== undefined && !isDatasetsPort(ports.datasets)) throw new TypeError('handler: ports.datasets must implement the datasets port');
  if (ports.sources !== undefined && !isSourcesPort(ports.sources)) throw new TypeError('handler: ports.sources must implement the sources port');
  const contracts = ports.contracts ?? createContractValidator();
  /** @param {any} model @param {any} command */
  const pointsFor = async (model, command) => {
    const dataset = await ports.pointsDataset?.(command.projectId, command.buildingId);
    return dataset ? commandPoints(dataset, model, command) : undefined;
  };
  const api = createCommandApi({ ...ports, contracts, pointsFor });
  const qc = createQc(ports);
  const qcRoute = createQcRoutes(ports, qc, contracts);

  /** @param {KernelRequest} request */
  async function handle(request) {
    try {
      return wire(await route(request));
    } catch (err) {
      return wire(contracts.reply(failureReply(err)));
    }
  }

  /** @param {KernelRequest} request @returns {Promise<import('./qc-routes.js').RouteReply>} */
  async function route(request) {
    const r = matchRoute(String(request.method ?? '').toUpperCase(), String(request.url ?? ''));
    if (!r) return errorReply('NOT_FOUND', [], 'no such route');
    const headers = headersOf(request.headers);
    const auth = await authenticate(ports.auth, headers);
    if ('reply' in auth) return auth.reply;
    const { user } = auth;
    const actor = { actorId: user.actorId };
    const body = () => readJsonBody(request.body ?? '', { declaredLength: declaredLength(headers['content-length']) });

    if (r.name === 'command') {
      const refused = requireRole(user, ACTIONS.EDIT);
      if (refused) return refused;
      /** @param {any} c */
      const authorize = (c) => (c.projectId !== r.projectId
        ? errorReply('INVALID_PAYLOAD', [], 'projectId of the body differs from the path')
        : checkLease(ports.leases, user, headers, c.projectId, c.buildingId));
      return api.commandBody(request.body ?? '', actor, { declaredLength: declaredLength(headers['content-length']), authorize });
    }
    const qcReply = await qcRoute(r, user, headers, body);
    if (qcReply) return qcReply;
    const refused = requireRole(user, ACTIONS.VIEW);
    if (refused) return refused;
    if (r.name === 'status') return api.status(r.projectId, r.commandId);
    if (r.name === 'model') return contracts.reply(await readModel(r.projectId, r.buildingId, r.version), 'building-model');
    const b = await body();
    if (!b.ok) return b.reply;
    const bad = contracts.request('heatmap-request', b.value);
    if (bad) return bad;
    return contracts.reply(await heatmap(ports, r.projectId, b.value), 'heatmap-result');
  }

  /** v0.2 D.1 model read by version; head when no version is named. @param {string} p @param {string} b @param {string | null} v */
  async function readModel(p, b, v) {
    if (v !== null && !/^(0|[1-9][0-9]*)$/.test(v)) return errorReply('INVALID_PAYLOAD', [], 'version must be a non-negative integer');
    const n = v === null ? await ports.history.head(p, b) : Number(v);
    const model = n === undefined ? undefined : await qc.modelAt(p, b, n);
    return model === undefined ? errorReply('NOT_FOUND', [b], 'unknown building or version') : { httpStatus: 200, body: model };
  }

  return handle;
}
