// ops (3D-15): SPLIT_FACE (spec §10.6 r2; v0.2 C.5, §13.5): two coplanar parts on exactly the same support plane, no
// new slope, boundary, semantics and lineage kept. Ids (D-3D15-3): the part that holds the start of the face's first
// outer half-edge keeps the face id; lineage face -> [face, new]. Constraints follow the policy table (inherit.js).
import { refuse } from './errors.js';
import { cutFace } from './face-cut.js';
import { inheritOnSplit, lineageWarnings } from './inherit.js';

/** @param {any} p @returns {p is [number, number, number]} */
export const isV3 = (p) => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);

/** @type {import('./registry.js').Operation['run']} */
export function splitFace(draft, payload, ctx) {
  const f = draft.faces[payload?.faceId];
  if (!f) return refuse('INVALID_PAYLOAD', payload?.faceId ? [payload.faceId] : [], 'unknown faceId');
  const line = payload.splitLine;
  if (!Array.isArray(line) || !isV3(line[0]) || !isV3(line[1])) return refuse('INVALID_PAYLOAD', [], 'splitLine');
  const local = /** @type {[any, any]} */ (line.map((p) => ctx.pointToLocal(p, ctx.frame)));
  const cut = cutFace(draft, f.id, local, ctx.tol, ctx.ids, (firstSign) => firstSign);
  if (!cut.ok) return cut;
  const inh = inheritOnSplit(draft, { faceId: f.id, newFaceId: cut.newFaceId, splitEdges: cut.splitEdges, planeMoves: false }, ctx.ids);
  if (!inh.ok) return inh;
  return { ok: true, mapped: cut.mapped, warnings: lineageWarnings(inh.lineage) };
}
