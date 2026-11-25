// `export` module of geo-model3d (3D-11; spec §7, F-66): canonical model -> CityJSON. The output holds this building
// only (D-192): the Building and all its descendants, the input root members, the used vertices. Opaque data
// (`GeometryInstance`, `appearance`, extensions, other LoDs, attributes import does not model) are copied from the
// original document the service kept at import (spec §7 rule 4; 3D-10 never writes it). Module DAG: brep, crs only.
// Whether a model may be exported is the service gate (spec §7 rule 5, §11 rule 9); this module exports any model.
// TBD (Q-25): faces tagged OVERHANG have no CityJSON mapping yet; the tag is not written, `surfaceKind` is.
import { createMetricFrame } from '../crs/index.js';
import { localFrame } from '../brep/index.js';
import { selectGeometry } from './geometry.js';
import { bodyGeometry } from './body.js';
import { vertexInfo, writeVertices } from './vertices.js';
import { ExportError } from './errors.js';

export { ExportError } from './errors.js';

/** @typedef {[number, number, number]} P3 */
/** @typedef {import('../brep/types.js').BuildingModel} BuildingModel */
/** @typedef {{ code: string, entityIds: string[] }} Finding `validate` input finding (D-151) */

/** CityObject types import turns into bodies (spec §6 rule 1). */
const BODY_KINDS = new Set(['Building', 'BuildingPart', 'BuildingInstallation']);

/**
 * @typedef {object} ExportInput
 * @property {BuildingModel} model contract `building-model`
 * @property {any} cityjson the parsed CityJSON document the model was imported from (read, never written)
 * @property {{ exportRoundDecimals: number } & Record<string, unknown>} toleranceProfile contract `tolerance-profile`
 */

/**
 * @param {any} doc @param {string} rootId @returns {string[]} the Building and its descendants (`children`, any type)
 */
function descendants(doc, rootId) {
  /** @type {string[]} */
  const out = [];
  const seen = new Set();
  /** @param {string} id */
  const visit = (id) => {
    if (seen.has(id) || !doc.CityObjects[id]) return;
    seen.add(id);
    out.push(id);
    const ch = doc.CityObjects[id].children;
    for (const c of Array.isArray(ch) ? ch : []) visit(c);
  };
  visit(rootId);
  return out;
}

/**
 * @param {ExportInput} input
 * @returns {{ cityjson: any, findings: Finding[] }} CityJSON document; findings for `validateModel` (PRECISION_LOSS)
 */
export function exportModel({ model, cityjson, toleranceProfile }) {
  if (!cityjson || cityjson.type !== 'CityJSON' || typeof cityjson.CityObjects !== 'object' || cityjson.CityObjects === null) {
    throw new ExportError('INVALID_PAYLOAD', 'not a CityJSON document');
  }
  const decimals = toleranceProfile?.exportRoundDecimals;
  if (!Number.isInteger(decimals) || /** @type {number} */ (decimals) < 0) throw new ExportError('INVALID_PAYLOAD', 'exportRoundDecimals missing');
  const bodies = Object.values(model.semantics ?? {}).filter((s) => BODY_KINDS.has(s?.kind));
  const roots = bodies.filter((s) => s.kind === 'Building' && !s.parentId);
  if (roots.length !== 1) throw new ExportError('INVALID_PAYLOAD', `model has ${roots.length} root Building entries`);
  const rootId = roots[0].sourceRef;
  if (cityjson.CityObjects[rootId]?.type !== 'Building') throw new ExportError('NOT_FOUND', `no Building with id ${rootId}`);

  const frame = createMetricFrame(cityjson.metadata?.referenceSystem, model.frame.originWorld);
  const lf = localFrame(model.frame, frame);
  const info = vertexInfo(model, cityjson, lf);
  /** @type {Map<string, number>} */
  const token = new Map();
  /** @type {{ id: string, members: number[], metric: P3 }[]} */
  const changed = [];
  /** @param {string} id @returns {number} */
  const indexOf = (id) => {
    const v = info.get(id);
    if (!v) throw new ExportError('INVALID_PAYLOAD', `vertex ${id} not in the model`);
    if (v.untouched) return v.members[0];
    if (!token.has(id)) {
      changed.push({ id, members: v.members, metric: frame.toMetric(lf.toWorld(model.vertices[id].p)) });
      token.set(id, -changed.length);
    }
    return /** @type {number} */ (token.get(id));
  };

  const keep = new Set(descendants(cityjson, rootId));
  const ids = Object.keys(cityjson.CityObjects).filter((id) => keep.has(id)); // input order
  /** @type {Record<string, any>} */
  const objects = Object.fromEntries(ids.map((id) => [id, structuredClone(cityjson.CityObjects[id])]));
  for (const sem of bodies) {
    const o = objects[sem.sourceRef];
    if (!o || !BODY_KINDS.has(o.type)) throw new ExportError('NOT_FOUND', `${sem.sourceRef}: not a body of ${rootId} in the document`);
    if ((sem.solidIds ?? []).length === 0) continue; // import read no LoD 2.x geometry: the object is copied as is
    const geoms = Array.isArray(o.geometry) ? o.geometry : [];
    const gi = selectGeometry(geoms);
    if (gi < 0) throw new ExportError('INVALID_PAYLOAD', `${sem.sourceRef}: no LoD 2.x geometry in the document`);
    o.geometry[gi] = bodyGeometry(model, sem, cityjson.CityObjects[sem.sourceRef].geometry[gi], gi, info, indexOf).geometry;
    if (sem.attributes && (Object.keys(sem.attributes).length > 0 || 'attributes' in o)) o.attributes = structuredClone(sem.attributes);
  }

  const wb = writeVertices({ objects, changed, cityjson, frame, exportRoundDecimals: /** @type {number} */ (decimals) });
  /** @type {Record<string, any>} */
  const out = {};
  for (const k of Object.keys(cityjson)) {
    out[k] = k === 'CityObjects' ? objects : k === 'vertices' ? wb.vertices : structuredClone(cityjson[k]);
  }
  if (!('vertices' in out)) out.vertices = wb.vertices;
  /** @type {Finding[]} */
  const findings = wb.precisionLoss ? [{ code: 'PRECISION_LOSS', entityIds: changed.map((c) => c.id) }] : [];
  return { cityjson: out, findings };
}
