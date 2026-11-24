// ops (3D-14): REPLACE_ROOF (spec §10.3; v0.3 §6 C-05; v0.2 C.1-C.4): replace the roof of the footprint's body by
// template R-01..R-04 and rebuild walls and ground under it (one-shot generator, no template instance is stored).
// Heights in a WORLD command are mapped to local z; a WORLD `roofPlane` is refused (D-3D14-6).
import { resolveFootprint, footprintError } from './footprint.js';
import { flatCells, shedCells, shedFromPoints, gableCells, hipCells } from './templates.js';
import { buildEnvelope } from './envelope.js';
import { refuse } from './errors.js';

/** @typedef {import('./pipeline.js').OpContext} OpContext */
/** @typedef {import('./pipeline.js').OpResult} OpResult */

const TEMPLATES = new Set(['FLAT', 'SHED', 'GABLE', 'HIP']);
const HEIGHTS = ['roofZ', 'eaveZ', 'ridgeZ', 'zLow', 'zHigh'];

/**
 * @param {import('../brep/types.js').BuildingModel} draft
 * @param {any} payload contract `command-payload-replace-roof`
 * @param {OpContext} ctx
 * @returns {OpResult}
 */
export function replaceRoof(draft, payload, ctx) {
  if (!payload || !TEMPLATES.has(payload.template)) return refuse('INVALID_PAYLOAD', [], 'template');
  const found = resolveFootprint(draft, payload.footprintId);
  if (!found.ok) return found;
  const body = found.body;
  const why = footprintError(body, ctx.tol);
  if (why) return refuse('INVALID_GEOMETRY', [body.footprintId], why);
  const p = { ...payload };
  for (const k of HEIGHTS) {
    if (p[k] === undefined) continue;
    if (typeof p[k] !== 'number' || !Number.isFinite(p[k])) return refuse('INVALID_PAYLOAD', [], k);
    if (ctx.frame === 'WORLD') p[k] = ctx.heightToLocal(p[k]);
  }
  if (p.roofPlane && ctx.frame === 'WORLD') return refuse('INVALID_PAYLOAD', [], 'roofPlane needs coordinateFrame LOCAL (D-3D14-6)');
  const cells = templateCells(draft, body, p, ctx);
  if (!cells.ok) return cells;
  const env = buildEnvelope(draft, body, cells.cells, ctx);
  if (!env.ok) return refuse('INVALID_GEOMETRY', [body.footprintId], env.reason);
  return { ok: true, mapped: env.mapped, removed: env.removed };
}

/**
 * @param {import('../brep/types.js').BuildingModel} draft
 * @param {import('./footprint.js').FootprintBody} body @param {any} p heights local @param {OpContext} ctx
 * @returns {import('./templates.js').CellsResult}
 */
function templateCells(draft, body, p, ctx) {
  const need = (/** @type {string[]} */ ks) => ks.every((k) => p[k] !== undefined);
  switch (p.template) {
    case 'FLAT':
      if (!need(['roofZ']) && !p.roofPlane) return refuse('INVALID_PAYLOAD', [], 'FLAT needs roofZ or roofPlane');
      return flatCells(body, p, ctx.tol);
    case 'SHED': {
      if (need(['slopeAxis', 'zLow', 'zHigh'])) return shedCells(body, p, ctx.tol);
      if (!Array.isArray(p.measurementIds)) return refuse('UNDERCONSTRAINED_GEOMETRY', [body.footprintId], 'SHED needs slope axis and eave heights or three roof points');
      const pts = [];
      for (const id of p.measurementIds) {
        const m = draft.measurements[id];
        if (!m) return refuse('INVALID_PAYLOAD', [id], 'unknown measurement');
        const q = m.geometry?.coordinates?.[0];
        if (m.geometry?.kind !== 'POINT' || !Array.isArray(q) || q.length !== 3 || !q.every(Number.isFinite)) {
          return refuse('INVALID_MEASUREMENT', [id], 'SHED needs POINT measurements [[x, y, z]] (D-3D14-4)');
        }
        pts.push(ctx.pointToLocal(/** @type {[number, number, number]} */ (q), m.frame));
      }
      return shedFromPoints(body, pts, ctx.tol);
    }
    case 'GABLE':
      if (!need(['ridgeAxis', 'eaveZ', 'symmetric']) || (p.ridgeZ === undefined && typeof p.slopeDeg !== 'number')) {
        return refuse('INVALID_PAYLOAD', [], 'GABLE needs ridgeAxis, eaveZ, symmetric and ridgeZ or slopeDeg');
      }
      return gableCells(body, p, ctx.tol);
    default:
      if (!need(['ridgeAxis', 'eaveZ']) || !Array.isArray(p.slopesDeg) || p.slopesDeg.length !== 4) {
        return refuse('INVALID_PAYLOAD', [], 'HIP needs ridgeAxis, eaveZ and four slopesDeg');
      }
      return hipCells(body, p, ctx.tol);
  }
}
