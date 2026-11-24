// ops (3D-14): REBUILD_ENVELOPE (spec §10.3; v0.3 §6 C-12; v0.2 §11.4): rebuild walls and ground under the current
// roof and footprint, base at constant Z (P0). The roof faces keep their planes and ids; the wall footprint is the
// reference: every footprint corner must be a roof vertex and every roof boundary edge must run over the footprint
// outline, else INVALID_GEOMETRY (D-3D14-3: the roof does not sit on the outline - gap or overhang).
import { buildIndex, faceRings } from '../brep/index.js';
import { resolveFootprint, footprintError } from './footprint.js';
import { buildEnvelope } from './envelope.js';
import { refuse } from './errors.js';

/** @typedef {import('./pipeline.js').OpContext} OpContext */
/** @typedef {import('./pipeline.js').OpResult} OpResult */
/** @typedef {import('./geom2.js').P2} P2 */

/**
 * @param {import('../brep/types.js').BuildingModel} draft
 * @param {any} payload contract `command-payload-rebuild-envelope`
 * @param {OpContext} ctx
 * @returns {OpResult}
 */
export function rebuildEnvelope(draft, payload, ctx) {
  // the payload names no footprint: the building's own (not a BuildingPart's); not unique -> D-3D14-7
  const fps = Object.values(draft.footprints).filter((f) => !f.buildingPartId);
  if (fps.length !== 1) return refuse('INVALID_TOPOLOGY', fps.map((f) => f.id), 'building footprint is not unique (D-3D14-7)');
  const found = resolveFootprint(draft, fps[0].id);
  if (!found.ok) return found;
  const body = found.body;
  const why = footprintError(body, ctx.tol);
  if (why) return refuse('INVALID_GEOMETRY', [body.footprintId], why);
  if (payload?.baseZ !== undefined) {
    if (typeof payload.baseZ !== 'number' || !Number.isFinite(payload.baseZ)) return refuse('INVALID_PAYLOAD', [], 'baseZ');
    body.baseZ = ctx.frame === 'WORLD' ? ctx.heightToLocal(payload.baseZ) : payload.baseZ;
  }
  const shell = draft.shells[body.shellId];
  const roofIds = shell.faceIds.filter((f) => draft.faces[f].surfaceKind === 'RoofSurface');
  const bad = (/** @type {string} */ reason) => refuse('INVALID_GEOMETRY', [body.footprintId, ...roofIds], reason);
  if (roofIds.length === 0) return bad('no roof over the footprint');
  const corners = body.rings.flat();
  const index = buildIndex(draft);
  const cells = [];
  for (const f of roofIds) {
    const plane = draft.faces[f].supportPlane;
    if (!(plane.normal[2] > ctx.tol.numericEpsilon)) return bad(`roof face ${f} gives no z(x, y)`);
    const rings = faceRings(draft, index, f);
    if (rings.some((r) => r.some((v) => !(draft.vertices[v].p[2] > body.baseZ)))) return bad('roof at or below the base');
    cells.push({
      plane, faceId: f, vertexIds: rings,
      rings: rings.map((r) => r.map((v) => snap(draft.vertices[v].p, corners, ctx.tol.topologySnapTolM))),
    });
  }
  draft.footprints[body.footprintId].baseElevationM = body.baseZ;
  const env = buildEnvelope(draft, body, cells, ctx);
  if (!env.ok) return bad(env.reason);
  return { ok: true, mapped: env.mapped, removed: env.removed };
}

/**
 * Plan position of a roof vertex, snapped onto a footprint corner within `tol` so walls and roof share it.
 * @param {number[]} p @param {P2[]} corners @param {number} tol
 * @returns {P2}
 */
function snap(p, corners, tol) {
  const c = corners.find((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) <= tol);
  return c ?? [p[0], p[1]];
}
