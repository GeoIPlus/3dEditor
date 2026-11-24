// import (3D-10): pick the CityObjects and the geometry to import from a CityJSON 2.0 document (spec §6 rules 1, 12,
// 13). The document is read only; nothing here writes it. GeometryInstance, appearance and extension members are not
// read: export (3D-11) writes them from the original document (spec §6 rule 12).
import { ImportError } from './errors.js';

/**
 * One input surface: rings of file vertex indices (outer first), its semantic type and its source reference.
 * @typedef {{ rings: number[][], semanticType: string | null, ref: string }} InSurface
 */
/** @typedef {{ surfaces: InSurface[] }} InShell first shell of a solid is the outer one, the rest are voids */
/** @typedef {{ shells: InShell[] }} InSolid */
/**
 * A body: one CityObject's selected geometry (spec §6 rule 13: each BuildingPart is its own body).
 * @typedef {object} InBody
 * @property {string} objectId CityObject id
 * @property {string} objectType Building | BuildingPart | BuildingInstallation
 * @property {string | null} parentObjectId
 * @property {Record<string, unknown>} attributes CityObject `attributes` (copied)
 * @property {string} lod
 * @property {string} geometryType
 * @property {InSolid[]} solids empty when the object has no LoD 2.x geometry
 */

const KINDS = new Set(['Building', 'BuildingPart', 'BuildingInstallation']);
/** Preference within one LoD [A]: a Solid before a MultiSurface (spec §6 rule 1); composite before multi. */
const TYPE_RANK = ['Solid', 'CompositeSolid', 'MultiSolid', 'CompositeSurface', 'MultiSurface'];

/** @param {unknown} lod @returns {number} the LoD as a number, NaN when not given */
const lodValue = (lod) => (typeof lod === 'number' ? lod : typeof lod === 'string' ? Number(lod) : NaN);

/**
 * Rule 1: the highest LoD in the 2.x range; at equal LoD by TYPE_RANK; at equal rank the first in the array.
 * @param {any[]} geoms @returns {number} index, -1 when none qualifies
 */
export function selectGeometry(geoms) {
  let best = -1;
  for (let i = 0; i < geoms.length; i++) {
    const g = geoms[i], lod = lodValue(g?.lod), rank = TYPE_RANK.indexOf(g?.type);
    if (!(lod >= 2 && lod < 3) || rank < 0) continue;
    if (best < 0) { best = i; continue; }
    const b = geoms[best], bl = lodValue(b.lod);
    if (lod > bl || (lod === bl && rank < TYPE_RANK.indexOf(b.type))) best = i;
  }
  return best;
}

/** @param {unknown} v @param {string} what @returns {any[]} */
function arr(v, what) {
  if (!Array.isArray(v)) throw new ImportError('INVALID_PAYLOAD', `${what} is not an array`);
  return v;
}

/**
 * @param {any} surface boundaries of one surface: rings of vertex indices
 * @param {any} sem semantics value of the surface (index into `surfaces` or null)
 * @param {any[]} semSurfaces
 * @param {string} ref
 * @param {number} nVertices
 * @returns {InSurface}
 */
function readSurface(surface, sem, semSurfaces, ref, nVertices) {
  const rings = arr(surface, ref).map((ring, r) => arr(ring, `${ref}/${r}`).map((ix) => {
    if (!Number.isInteger(ix) || ix < 0 || ix >= nVertices) throw new ImportError('INVALID_PAYLOAD', `${ref}: vertex index ${ix} out of range`);
    return /** @type {number} */ (ix);
  }));
  if (rings.length === 0) throw new ImportError('INVALID_PAYLOAD', `${ref}: surface without rings`);
  const t = Number.isInteger(sem) ? semSurfaces[sem]?.type : null;
  return { rings, semanticType: typeof t === 'string' ? t : null, ref };
}

/**
 * @param {any} g geometry object @param {string} base reference prefix @param {number} nVertices
 * @returns {InSolid[]}
 */
function readGeometry(g, base, nVertices) {
  const semSurfaces = Array.isArray(g.semantics?.surfaces) ? g.semantics.surfaces : [];
  const values = g.semantics?.values;
  /** @param {any[]} shell @param {any} sv @param {string} ref @returns {InShell} */
  const shellOf = (shell, sv, ref) => ({
    surfaces: arr(shell, ref).map((s, i) => readSurface(s, Array.isArray(sv) ? sv[i] : null, semSurfaces, `${ref}/${i}`, nVertices)),
  });
  /** @param {any[]} solid @param {any} sv @param {string} ref @returns {InSolid} */
  const solidOf = (solid, sv, ref) => ({
    shells: arr(solid, ref).map((sh, k) => shellOf(sh, Array.isArray(sv) ? sv[k] : null, `${ref}/${k}`)),
  });
  const b = arr(g.boundaries, `${base}/boundaries`);
  const ref = `${base}/boundaries`;
  if (g.type === 'Solid') return [solidOf(b, values, ref)];
  if (g.type === 'MultiSolid' || g.type === 'CompositeSolid') {
    return b.map((s, i) => solidOf(s, Array.isArray(values) ? values[i] : null, `${ref}/${i}`));
  }
  // MultiSurface / CompositeSurface: one open or closed shell [A]
  return [{ shells: [shellOf(b, values, ref)] }];
}

/**
 * Bodies of the Building and its BuildingPart / BuildingInstallation descendants, depth first in `children` order.
 * @param {any} doc CityJSON document
 * @param {string} cityObjectId
 * @returns {InBody[]}
 */
export function readBodies(doc, cityObjectId) {
  if (!doc || doc.type !== 'CityJSON' || typeof doc.CityObjects !== 'object' || doc.CityObjects === null) {
    throw new ImportError('INVALID_PAYLOAD', 'not a CityJSON document');
  }
  const nVertices = arr(doc.vertices, 'vertices').length;
  const root = doc.CityObjects[cityObjectId];
  if (!root || root.type !== 'Building') throw new ImportError('NOT_FOUND', `no Building with id ${cityObjectId}`);
  /** @type {InBody[]} */
  const out = [];
  const seen = new Set();
  /** @param {string} id @param {string | null} parent */
  const visit = (id, parent) => {
    const o = doc.CityObjects[id];
    if (!o || !KINDS.has(o.type) || seen.has(id)) return;
    seen.add(id);
    const geoms = Array.isArray(o.geometry) ? o.geometry : [];
    const gi = selectGeometry(geoms);
    out.push({
      objectId: id, objectType: o.type, parentObjectId: parent,
      attributes: o.attributes && typeof o.attributes === 'object' ? structuredClone(o.attributes) : {},
      lod: gi < 0 ? '' : String(geoms[gi].lod), geometryType: gi < 0 ? '' : geoms[gi].type,
      solids: gi < 0 ? [] : readGeometry(geoms[gi], `${id}/geometry/${gi}`, nVertices),
    });
    for (const c of Array.isArray(o.children) ? o.children : []) visit(c, id);
  };
  visit(cityObjectId, null);
  if (!out.some((b) => b.solids.length > 0)) throw new ImportError('INVALID_GEOMETRY', `${cityObjectId}: no LoD 2.x geometry`);
  return out;
}
