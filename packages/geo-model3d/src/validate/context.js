// validate (3D-12): shared state of one validation run - topology index, ring points, the faces a mode checks, and the
// raw issue shape every detector returns (scope and severity are added once, in report.js, from codes.js).
import { buildIndex, faceRings, edgeFaceIds } from '../brep/index.js';

/** @typedef {import('../brep/types.js').BuildingModel} BuildingModel */
/** @typedef {import('../brep/halfedge.js').TopologyIndex} TopologyIndex */
/** @typedef {[number, number, number]} P3 */

/**
 * The tolerance values `validate` reads (contract `tolerance-profile`, defaults spec §2.3, D-13).
 * @typedef {object} ValidateTolerances
 * @property {number} numericEpsilon
 * @property {number} topologySnapTolM
 * @property {number} planarTolM
 * @property {number} minEdgeLengthM
 * @property {number} minFaceAreaM2
 */

/**
 * A detected or reported issue before scope and severity are assigned.
 * @typedef {object} RawIssue
 * @property {string} code contract `ValidationCode`
 * @property {string[]} entityIds
 * @property {P3} [location] local frame
 * @property {string} [detail] internal explanation (tests, logs); not in the report (D-91: texts are keys)
 * @property {string} [externalValidatorCode]
 * @property {string} [suggestedFix]
 */

/**
 * @typedef {object} Ctx
 * @property {BuildingModel} model
 * @property {ValidateTolerances} tol
 * @property {TopologyIndex} index
 * @property {Set<string>} faces faces a check of this run looks at (all, or the affected neighbourhood)
 * @property {boolean} all true when `faces` is every face of the model
 * @property {(faceId: string) => string[][]} ringIds vertex ids of each ring, outer first
 * @property {(faceId: string) => P3[][]} ringPts points of each ring, outer first
 * @property {<T>(key: string, make: () => T) => T} memo per-run cache (2D views, boxes) shared by the checks
 */

/**
 * Faces touched by the given entity ids (face, its half-edges, its vertices) plus the faces across their edges.
 * [A] spec §8 rule 1 says "affected elements" without a radius; one ring of neighbours covers the shared edges.
 * @param {BuildingModel} model @param {TopologyIndex} index @param {Iterable<string>} ids
 * @returns {Set<string>}
 */
export function affectedFaces(model, index, ids) {
  /** @type {Set<string>} */
  const seed = new Set();
  for (const id of ids) {
    if (model.faces[id]) seed.add(id);
    else if (model.halfEdges[id]) edgeFaceIds(model, id).forEach((f) => seed.add(f));
    else if (model.vertices[id]) index.facesOfVertex.get(id)?.forEach((f) => seed.add(f));
  }
  const out = new Set(seed);
  for (const f of seed) {
    const rings = [index.outer.get(f) ?? [], ...(index.inner.get(f) ?? [])];
    for (const r of rings) {
      for (const h of r) {
        const tw = model.halfEdges[h].twinId;
        const tf = tw ? model.halfEdges[tw]?.faceId : undefined;
        if (tf && model.faces[tf]) out.add(tf);
      }
    }
  }
  return out;
}

/**
 * @param {BuildingModel} model
 * @param {ValidateTolerances} tol
 * @param {Iterable<string> | undefined} affected entity ids; undefined = every face
 * @returns {Ctx}
 */
export function makeContext(model, tol, affected) {
  const index = buildIndex(model);
  const faces = affected ? affectedFaces(model, index, affected) : new Set(Object.keys(model.faces));
  /** @type {Map<string, string[][]>} */
  const idCache = new Map();
  /** @type {Map<string, P3[][]>} */
  const ptCache = new Map();
  /** @param {string} f */
  const ringIds = (f) => {
    let r = idCache.get(f);
    if (!r) idCache.set(f, (r = faceRings(model, index, f)));
    return r;
  };
  /** @param {string} f */
  const ringPts = (f) => {
    let r = ptCache.get(f);
    if (!r) ptCache.set(f, (r = ringIds(f).map((ring) => ring.map((v) => /** @type {P3} */ (model.vertices[v].p)))));
    return r;
  };
  /** @type {Map<string, any>} */
  const memoMap = new Map();
  /** @template T @param {string} key @param {() => T} make @returns {T} */
  const memo = (key, make) => {
    if (!memoMap.has(key)) memoMap.set(key, make());
    return memoMap.get(key);
  };
  return { model, tol, index, faces, all: !affected, ringIds, ringPts, memo };
}

/** Faces of a shell that exist. @param {Ctx} ctx @param {string} shellId @returns {string[]} */
export const shellFaces = (ctx, shellId) => (ctx.model.shells[shellId]?.faceIds ?? []).filter((f) => ctx.model.faces[f]);
