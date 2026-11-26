// ops (3D-19): SET_OVERHANG (spec §10.10 r1; v0.3 §6 F-30; v0.2 C.13; D-336, D-337). `overhangM` is the absolute
// width in plan: the same width again changes nothing, 0 removes the overhang, another width rebuilds it with the same
// ids. Each `eaveEdgeIds` entry is the main-roof half-edge of a structural eave (edge role EAVE). Topology and planes:
// overhang.js. Unsupported junctions (hip, valley, eave end not on one end wall) refuse the whole command (D-336).
import { findOverhang, removeOverhang, addOverhang } from './overhang.js';
import { refuse } from './errors.js';

/** @typedef {import('./pipeline.js').OpContext} OpContext */
/** @typedef {import('./pipeline.js').OpResult} OpResult */

/** @type {(draft: any, payload: any, ctx: OpContext) => OpResult} */
export function setOverhang(draft, payload, ctx) {
  const p = payload ?? {};
  const ids = p.eaveEdgeIds;
  if (!Array.isArray(ids) || ids.length === 0 || new Set(ids).size !== ids.length) return refuse('INVALID_PAYLOAD', [], 'eaveEdgeIds');
  const w = p.overhangM;
  if (typeof w !== 'number' || !Number.isFinite(w) || w < 0) return refuse('INVALID_PAYLOAD', [], 'overhangM');
  /** @type {Set<string>} */
  const removed = new Set();
  for (const hId of ids) {
    const check = structuralEave(draft, hId);
    if (check) return check;
    const found = findOverhang(draft, hId);
    if (!found.ok) return found;
    const f = found.found;
    // same width (within the snap tolerance of positions) -> nothing to do
    if (f && Math.abs(f.width - w) <= ctx.tol.numericEpsilon) continue;
    if (!f && w === 0) continue;
    const slots = f ? removeOverhang(draft, hId, f, ctx.tol.numericEpsilon) : undefined;
    if (w === 0) {
      if (slots) for (const x of [slots.strip, slots.soffit, slots.capA, slots.capB, slots.oA, slots.oB, slots.sA, slots.sB, ...Object.values(slots.he)]) removed.add(x);
      continue;
    }
    const r = addOverhang(draft, hId, w, ctx, slots);
    if (!r.ok) return r;
  }
  return { ok: true, removed };
}

/**
 * The half-edge must be a structural eave on a main roof face (D-338 terms).
 * @param {any} draft @param {unknown} hId
 */
export function structuralEave(draft, hId) {
  const he = typeof hId === 'string' ? draft.halfEdges[hId] : undefined;
  if (!he) return refuse('INVALID_PAYLOAD', hId ? [String(hId)] : [], 'unknown eave half-edge');
  const f = draft.faces[he.faceId];
  if (he.edgeRole !== 'EAVE' || f.surfaceKind !== 'RoofSurface' || f.tags.includes('OVERHANG')) {
    return refuse('INVALID_PAYLOAD', [he.id], 'not the main-roof half-edge of a structural eave (D-338)');
  }
  return null;
}
