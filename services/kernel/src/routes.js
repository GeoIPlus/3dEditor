// Routes of the kernel service's HTTPS + JSON wire binding (3D-110; 3D-ADR-0002 A.4; v0.2 D.1; D-404; QC and export 3D-24). Paths are
// matched on decoded segments; a segment that is not valid percent-encoding is no route.

/**
 * @typedef {{ name: 'command', projectId: string }
 *   | { name: 'status', projectId: string, commandId: string }
 *   | { name: 'heatmap', projectId: string }
 *   | { name: 'model', projectId: string, buildingId: string, version: string | null }
 *   | { name: 'finalValidation' | 'approval', projectId: string, buildingId: string }
 *   | { name: 'export', projectId: string }
 *   | { name: 'result', projectId: string, digest: string }} Route
 */

/** @param {string} s @returns {string | undefined} */
function decode(s) {
  try {
    const d = decodeURIComponent(s);
    return d === '' ? undefined : d;
  } catch {
    return undefined;
  }
}

/**
 * @param {string} method @param {string} url path and query of the request
 * @returns {Route | undefined}
 */
export function matchRoute(method, url) {
  const q = url.indexOf('?');
  const path = q < 0 ? url : url.slice(0, q);
  const query = new URLSearchParams(q < 0 ? '' : url.slice(q + 1));
  const raw = path.split('/');
  if (raw[0] !== '' || raw[1] !== 'api' || raw[2] !== 'projects') return undefined;
  const seg = raw.slice(3).map(decode);
  if (seg.some((s) => s === undefined)) return undefined;
  const [p, kind, id, leaf] = /** @type {string[]} */ (seg);
  if (method === 'POST' && seg.length === 2 && kind === 'commands') return { name: 'command', projectId: p };
  if (method === 'GET' && seg.length === 3 && kind === 'commands') return { name: 'status', projectId: p, commandId: id };
  if (method === 'POST' && seg.length === 2 && kind === 'heatmap') return { name: 'heatmap', projectId: p };
  if (method === 'GET' && seg.length === 4 && kind === 'buildings' && leaf === 'model') {
    return { name: 'model', projectId: p, buildingId: id, version: query.get('version') };
  }
  if (method === 'POST' && seg.length === 4 && kind === 'buildings' && leaf === 'final-validation') return { name: 'finalValidation', projectId: p, buildingId: id };
  if (method === 'POST' && seg.length === 4 && kind === 'buildings' && leaf === 'approval') return { name: 'approval', projectId: p, buildingId: id };
  if (method === 'POST' && seg.length === 2 && kind === 'export') return { name: 'export', projectId: p };
  if (method === 'GET' && seg.length === 3 && kind === 'results') return { name: 'result', projectId: p, digest: id };
  return undefined;
}

/** Route list for the module card and tests. */
export const ROUTES = Object.freeze([
  'POST /api/projects/{projectId}/commands',
  'GET /api/projects/{projectId}/commands/{commandId}',
  'POST /api/projects/{projectId}/heatmap',
  'GET /api/projects/{projectId}/buildings/{buildingId}/model?version=N',
  'POST /api/projects/{projectId}/buildings/{buildingId}/final-validation',
  'POST /api/projects/{projectId}/buildings/{buildingId}/approval',
  'POST /api/projects/{projectId}/export',
  'GET /api/projects/{projectId}/results/{sha256}',
]);
