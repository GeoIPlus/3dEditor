// ops (3D-15): OFFSET_FACE (spec §10.6 r1; v0.2 F-31; owner decisions 03, 04): the support plane moves parallel to
// itself, `d_new = d - offsetM` along the unit normal, the normal is unchanged; every vertex of the face is re-derived
// from its planes (neighbour planes fixed). fixedMode (D-3D15-4): FIXED_RIDGE / FIXED_EAVE need a RIDGE / EAVE edge on
// the face, FIXED_BOUNDARY any boundary, else INVALID_PAYLOAD (no fallback to NONE); with a non-zero offset a fixed
// edge cannot stay on the moved plane (n·p + d_new = -offsetM for every old point p), so CONSTRAINT_CONFLICT naming the
// fixed edges. offsetM = 0 is a valid empty operation (D-3D15-5); no tolerance turns a small offset into zero.
import { refuse } from './errors.js';
import { loopEdges } from './face-cut.js';
import { pinPlane } from './plane-pin.js';

const ROLE = /** @type {Record<string, string>} */ ({ FIXED_RIDGE: 'RIDGE', FIXED_EAVE: 'EAVE' });
const MODES = new Set(['NONE', 'FIXED_BOUNDARY', 'FIXED_RIDGE', 'FIXED_EAVE']);

/** @type {import('./registry.js').Operation['run']} */
export function offsetFace(draft, payload, ctx) {
  const f = draft.faces[payload?.faceId];
  if (!f) return refuse('INVALID_PAYLOAD', payload?.faceId ? [payload.faceId] : [], 'unknown faceId');
  const s = payload.offsetM;
  if (typeof s !== 'number' || !Number.isFinite(s)) return refuse('INVALID_PAYLOAD', [], 'offsetM');
  if (!MODES.has(payload.fixedMode)) return refuse('INVALID_PAYLOAD', [], 'fixedMode');
  if (payload.fixedMode !== 'NONE') {
    const edges = [f.outerLoopId, ...f.innerLoopIds].flatMap((st) => loopEdges(draft, st));
    const role = ROLE[payload.fixedMode];
    const fixed = role ? edges.filter((h) => draft.halfEdges[h].edgeRole === role) : edges;
    if (fixed.length === 0) return refuse('INVALID_PAYLOAD', [f.id], `${payload.fixedMode} does not apply: the face has no ${role} edge`);
    if (s !== 0) return refuse('CONSTRAINT_CONFLICT', [f.id, ...fixed], `${payload.fixedMode}: a parallel offset moves every edge of the plane`);
  }
  if (s === 0) return { ok: true, noop: true };
  const plane = { normal: [...f.supportPlane.normal], d: f.supportPlane.d - s };
  return { ok: true, movableFaceIds: [f.id], conditions: pinPlane(draft, f.id, /** @type {any} */ (plane), 'OFFSET_FACE:plane', ctx.tol.planarTolM) };
}
