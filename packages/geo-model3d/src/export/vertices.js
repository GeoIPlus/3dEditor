// export (3D-11): vertex state and the output `vertices` list (spec §7 rule 2; D-70, D-92, D-123, D-3D11-3/4).
// Untouched vertex = EXPLICIT with file indices as `sourceRef` (import 3D-10) and still at the position of its first
// file index; it keeps its file integers. Every other vertex is "changed": its local position goes through
// `crs.writeBackVertices` (rounding by `exportRoundDecimals`, file `transform` kept, PRECISION_LOSS).
import { decodeVertex, writeBackVertices } from '../crs/index.js';
import { distance } from '../brep/index.js';
import { eachIndex, mapIndices } from './geometry.js';
import { ExportError } from './errors.js';

/** @typedef {[number, number, number]} P3 */
/** @typedef {import('../brep/types.js').BuildingModel} BuildingModel */
/** @typedef {import('./rings.js').VertexInfo} VertexInfo */

/** [A] Distance below which an EXPLICIT vertex still sits at its file position (float noise of world <-> local). */
export const AT_FILE_POSITION_M = 1e-6;

/**
 * @param {BuildingModel} model @param {any} cityjson
 * @param {{ toLocal: (w: P3) => P3 }} lf local frame of the model (metric mapping of `crs`)
 * @returns {Map<string, VertexInfo>}
 */
export function vertexInfo(model, cityjson, lf) {
  const n = Array.isArray(cityjson.vertices) ? cityjson.vertices.length : 0;
  const t = cityjson.transform ?? { scale: [1, 1, 1], translate: [0, 0, 0] };
  /** @type {Map<string, VertexInfo>} */
  const out = new Map();
  for (const v of Object.values(model.vertices)) {
    const parts = typeof v.sourceRef === 'string' && v.sourceRef !== '' ? v.sourceRef.split(',') : [];
    const members = parts.every((s) => /^\d+$/.test(s)) ? parts.map(Number).filter((i) => i < n) : [];
    const ok = members.length === parts.length && members.length > 0;
    const untouched = ok && v.positionMode === 'EXPLICIT'
      && distance(lf.toLocal(decodeVertex(cityjson.vertices[members[0]], t)), v.p) <= AT_FILE_POSITION_M;
    out.set(v.id, { members: ok ? members : [], untouched });
  }
  return out;
}

/**
 * Output vertices. `objects` hold geometries with file indices and, for changed vertices, tokens `-(k + 1)`
 * (k = index into `changed`). A changed vertex takes its first file index when nothing else in the output uses that
 * index, else a new vertex is appended (D-3D11-3). The list keeps only used vertices, ascending by file index, then the
 * appended ones (D-3D11-4); every geometry is re-indexed in place.
 * @param {object} a
 * @param {Record<string, any>} a.objects output CityObjects (written)
 * @param {{ id: string, members: number[], metric: P3 }[]} a.changed
 * @param {any} a.cityjson input document (read only)
 * @param {import('../crs/frame.js').MetricFrame} a.frame
 * @param {number} a.exportRoundDecimals
 * @returns {{ vertices: P3[], precisionLoss: null | object, maxErrorM: number }}
 */
export function writeVertices({ objects, changed, cityjson, frame, exportRoundDecimals }) {
  const geoms = Object.values(objects).flatMap((o) => (Array.isArray(o.geometry) ? o.geometry : []));
  /** @type {Set<number>} */
  const used = new Set();
  for (const g of geoms) eachIndex(g?.boundaries, (i) => { if (i >= 0) used.add(i); });
  const inPlace = changed.map((c) => (c.members.length > 0 && !used.has(c.members[0]) ? c.members[0] : -1));
  for (const i of inPlace) if (i >= 0) used.add(i);
  const order = [...used].sort((a, b) => a - b);
  /** @type {Map<number, number>} */
  const newOf = new Map(order.map((old, k) => [old, k]));
  let next = order.length;
  const tokenNew = inPlace.map((i) => (i >= 0 ? /** @type {number} */ (newOf.get(i)) : next++));
  for (const old of order) {
    if (!Array.isArray(cityjson.vertices?.[old])) throw new ExportError('INVALID_PAYLOAD', `vertex index ${old} out of range`);
  }
  /** @type {P3[]} */
  const fileVertices = order.map((old) => cityjson.vertices[old]);
  for (let k = order.length; k < next; k++) fileVertices.push([0, 0, 0]);
  if (changed.length > 0 && !cityjson.transform) {
    // CityJSON 2.0 requires `transform`; without it no grid is known to write onto (spec §7 rule 2)
    throw new ExportError('INVALID_PAYLOAD', 'CityJSON without transform: changed vertices cannot be written');
  }
  const wb = writeBackVertices({
    frame, transform: cityjson.transform ?? { scale: [1, 1, 1], translate: [0, 0, 0] }, fileVertices,
    changed: new Map(changed.map((c, k) => [tokenNew[k], c.metric])), exportRoundDecimals,
  });
  for (const g of geoms) {
    if (g && 'boundaries' in g) g.boundaries = mapIndices(g.boundaries, (i) => (i >= 0 ? /** @type {number} */ (newOf.get(i)) : tokenNew[-i - 1]));
  }
  return { vertices: wb.vertices, precisionLoss: changed.length > 0 ? wb.precisionLoss : null, maxErrorM: wb.maxErrorM };
}
