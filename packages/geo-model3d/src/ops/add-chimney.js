// ops (3D-20): ADD_CHIMNEY (spec §10.11 r2, r3; v0.3 §6 F-37; GT-17): a box chimney as a separate BuildingInstallation
// body. Box axes = local building axes, `widthM` along x, `depthM` along y [A]; base centred on `center` in the roof
// face plane; horizontal top at the lowest base corner z + `heightAboveRoofM` (D-3D20-1). Sizing from the cloud
// (`measurementId`) -> INVALID_MEASUREMENT until the measurement layout is defined (Q-28, D-3D20-4).
import { resolveRoof, localPoint, onRoofPlane, insideRoof } from './installation-place.js';
import { buildInstallation } from './installation-shell.js';
import { zAt } from './geom2.js';
import { refuse } from './errors.js';

/** @typedef {import('./geom2.js').P2} P2 */

const positive = (/** @type {unknown} */ x) => typeof x === 'number' && Number.isFinite(x) && x > 0;

/**
 * @param {import('../brep/types.js').BuildingModel} draft
 * @param {any} payload contract `command-payload-add-chimney`
 * @param {import('./pipeline.js').OpContext} ctx
 * @returns {import('./pipeline.js').OpResult}
 */
export function addChimney(draft, payload, ctx) {
  const tol = ctx.tol;
  if (!payload || typeof payload !== 'object') return refuse('INVALID_PAYLOAD', [], 'payload');
  if (payload.measurementId !== undefined) {
    return refuse('INVALID_MEASUREMENT', [String(payload.measurementId)], 'chimney size from the cloud is not defined yet (Q-28, D-3D20-4)');
  }
  for (const k of ['widthM', 'depthM', 'heightAboveRoofM']) if (!positive(payload[k])) return refuse('INVALID_PAYLOAD', [], k);
  const found = resolveRoof(draft, payload.roofFaceId, tol.numericEpsilon);
  if (!found.ok) return found;
  const roof = found.roof;
  const c = localPoint(payload.center, ctx);
  if (!c) return refuse('INVALID_PAYLOAD', [], 'center');
  const off = onRoofPlane([c], roof, tol.planarTolM);
  if (off) return off;
  const w = payload.widthM / 2, d = payload.depthM / 2;
  /** @type {P2[]} */
  const ring = [[c[0] - w, c[1] - d], [c[0] + w, c[1] - d], [c[0] + w, c[1] + d], [c[0] - w, c[1] + d]];
  const outside = insideRoof(ring, roof, tol.topologySnapTolM);
  if (outside) return outside;
  const zs = ring.map((p) => /** @type {number} */ (zAt(roof.plane, p[0], p[1], 0)));
  const topZ = Math.min(...zs) + payload.heightAboveRoofM;
  if (!(topZ - Math.max(...zs) > tol.planarTolM)) {
    return refuse('INVALID_GEOMETRY', [roof.faceId], 'chimney top not above the uphill base corner (D-3D20-1, D-3D20-4)');
  }
  const built = buildInstallation(draft, { ring, roof: roof.plane, tops: [{ normal: [0, 0, 1], d: -topZ }], ownerId: roof.ownerId }, ctx.ids, tol);
  if (!built.ok) return refuse('INVALID_GEOMETRY', [roof.faceId], built.reason);
  return { ok: true };
}
