// metrics (3D-116): the main building body of a model - its solids, shells and faces - read from the model structure
// (semantic node -> solids -> shells), never from `surfaceKind` (D-412). BuildingInstallation bodies are left out;
// a face that also belongs to an installation shell makes the body unsupported. Ring points are given relative to a
// local reference origin (min corner of the body's box) to keep large coordinates out of the sums (MET-19, OVM-18).
import { buildIndex, faceRings, sub } from '../brep/index.js';

/** @typedef {import('../brep/types.js').BuildingModel} BuildingModel */
/** @typedef {[number, number, number]} P3 */

/**
 * @typedef {object} Body
 * @property {BuildingModel} model
 * @property {ReturnType<typeof buildIndex>} index
 * @property {string[]} solidIds main-building solids
 * @property {string[]} shellIds outer and void shells of those solids
 * @property {string[]} faceIds faces of those shells, in shell order, no duplicates
 * @property {Set<string>} faces the same as a set
 * @property {boolean} sharedWithInstallation a face also belongs to an installation shell (unsupported, D-412)
 * @property {boolean} missing a referenced shell or face does not exist
 * @property {P3} origin local reference origin
 * @property {(faceId: string) => P3[][]} rings rings of a face, outer first, relative to `origin`
 */

/**
 * The main building body: every solid not referenced by a `BuildingInstallation` semantic node.
 * @param {BuildingModel} model
 * @returns {Body}
 */
export function mainBody(model) {
  const index = buildIndex(model);
  const installSolids = new Set();
  for (const n of Object.values(model.semantics ?? {})) {
    if (n?.kind === 'BuildingInstallation') for (const s of n.solidIds ?? []) installSolids.add(s);
  }
  const solidIds = Object.keys(model.solids).filter((s) => !installSolids.has(s)).sort();
  let missing = false;
  /** @param {string[]} ids */
  const shellsOf = (ids) => ids.flatMap((s) => {
    const so = model.solids[s];
    return [so.outerShellId, ...(so.voidShellIds ?? [])];
  });
  const shellIds = shellsOf(solidIds);
  const faces = new Set();
  /** @type {string[]} */
  const faceIds = [];
  for (const sh of shellIds) {
    const shell = model.shells[sh];
    if (!shell) { missing = true; continue; }
    for (const f of shell.faceIds) {
      if (!model.faces[f]) { missing = true; continue; }
      if (!faces.has(f)) { faces.add(f); faceIds.push(f); }
    }
  }
  const installFaces = shellsOf([...installSolids].filter((s) => model.solids[s])).flatMap((sh) => model.shells[sh]?.faceIds ?? []);
  const sharedWithInstallation = installFaces.some((f) => faces.has(f));
  /** @type {Map<string, string[][]>} */
  const ringIds = new Map();
  for (const f of faceIds) ringIds.set(f, faceRings(model, index, f));
  /** @type {P3} */
  const origin = [Infinity, Infinity, Infinity];
  for (const rs of ringIds.values()) for (const r of rs) for (const v of r) {
    const p = model.vertices[v].p;
    for (let k = 0; k < 3; k++) origin[k] = Math.min(origin[k], p[k]);
  }
  if (!faceIds.length) origin.fill(0);
  /** @type {Map<string, P3[][]>} */
  const cache = new Map();
  /** @param {string} f */
  const rings = (f) => {
    let r = cache.get(f);
    if (!r) {
      const ids = ringIds.get(f) ?? faceRings(model, index, f);
      cache.set(f, (r = ids.map((ring) => ring.map((v) => /** @type {P3} */ (sub(model.vertices[v].p, origin))))));
    }
    return r;
  };
  return { model, index, solidIds, shellIds, faceIds, faces, sharedWithInstallation, missing, origin, rings };
}

/** @param {BuildingModel} model @param {string} faceId @param {string} tag @returns {boolean} */
export const hasTag = (model, faceId, tag) => (model.faces[faceId].tags ?? []).includes(tag);
