// brep (3D-09): patch between two versions in canonical entities (contract `model-patch`, v0.2 D.2, §13.6): forward
// and inverse patch from a before/after pair, and applying a patch. Model-level members (`state`, `frame`, ...) have no
// entity type in the contract (Q-31): they are reported by `modelLevelChanges`, not put into a patch.
import { isolatedCopy } from './serialize.js';

/** @typedef {import('./types.js').BuildingModel} BuildingModel */
/** @typedef {{ type: string, entity: Record<string, any> & { id: string } }} EntityChange */
/** @typedef {{ added: EntityChange[], updated: EntityChange[], deleted: { type: string, id: string }[], affectedMetrics: string[] }} ModelPatch */

/** Contract `model-patch` `EntityType` -> BuildingModel collection, in a fixed order (determinism). */
export const COLLECTIONS = /** @type {const} */ ([
  ['Footprint', 'footprints'],
  ['ConstructionEntity', 'constructionEntities'],
  ['Vtx', 'vertices'],
  ['HalfEdge', 'halfEdges'],
  ['Face', 'faces'],
  ['Shell', 'shells'],
  ['Solid', 'solids'],
  ['RoofComponent', 'roofComponents'],
  ['Constraint', 'constraints'],
  ['Measurement3D', 'measurements'],
  ['SemanticNode', 'semantics'],
]);
const COLLECTION_OF = new Map(COLLECTIONS);
/** @type {Set<string>} */
const COLLECTION_KEYS = new Set(COLLECTIONS.map(([, c]) => c));

/** @param {string} type */
function collectionOf(type) {
  const c = COLLECTION_OF.get(/** @type {any} */ (type));
  if (!c) throw new Error(`brep: unknown entity type ${type}`);
  return c;
}

/** @param {string[]} a */
const sorted = (a) => [...a].sort();

/**
 * Structural equality of JSON values (key order ignored, 0 equals -0: the same as comparing canonical JSON, without
 * building strings, which cost 5.4 ms per diff on the 199-face bench scene in 3D-09).
 * @param {unknown} a @param {unknown} b
 * @returns {boolean}
 */
export function sameValue(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!sameValue(a[i], b[i])) return false;
    return true;
  }
  if (Array.isArray(b)) return false;
  const ka = Object.keys(a).filter((k) => /** @type {any} */ (a)[k] !== undefined);
  const kb = Object.keys(b).filter((k) => /** @type {any} */ (b)[k] !== undefined);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!sameValue(/** @type {any} */ (a)[k], /** @type {any} */ (b)[k])) return false;
  return true;
}

/**
 * Forward and inverse patch from `before` to `after`. Entities are compared structurally (`sameValue`); ids are listed in
 * collection order, then sorted. `affectedMetrics` is empty: the metric names are TBD (Q-31).
 * @param {BuildingModel} before
 * @param {BuildingModel} after
 * @returns {{ forward: ModelPatch, inverse: ModelPatch }}
 */
export function diffModels(before, after) {
  /** @type {ModelPatch} */
  const forward = { added: [], updated: [], deleted: [], affectedMetrics: [] };
  /** @type {ModelPatch} */
  const inverse = { added: [], updated: [], deleted: [], affectedMetrics: [] };
  for (const [type, key] of COLLECTIONS) {
    /** @type {Record<string, any>} */
    const b = before[key];
    /** @type {Record<string, any>} */
    const a = after[key];
    for (const id of sorted(Object.keys(a))) {
      if (!(id in b)) {
        forward.added.push({ type, entity: isolatedCopy(a[id]) });
        inverse.deleted.push({ type, id });
      } else if (!sameValue(a[id], b[id])) {
        forward.updated.push({ type, entity: isolatedCopy(a[id]) });
        inverse.updated.push({ type, entity: isolatedCopy(b[id]) });
      }
    }
    for (const id of sorted(Object.keys(b))) {
      if (!(id in a)) {
        forward.deleted.push({ type, id });
        inverse.added.push({ type, entity: isolatedCopy(b[id]) });
      }
    }
  }
  return { forward, inverse };
}

/**
 * Apply a patch to a model; returns a new model (the input is not modified). The version is not changed: versions
 * are set by the transaction (spec §4 rule 9). Throws on a patch that does not fit the model.
 * @param {BuildingModel} model
 * @param {ModelPatch} patch
 * @returns {BuildingModel}
 */
export function applyPatch(model, patch) {
  const out = isolatedCopy(model);
  for (const { type, id } of patch.deleted) {
    /** @type {Record<string, any>} */
    const c = out[collectionOf(type)];
    if (!(id in c)) throw new Error(`brep: patch deletes missing ${type} ${id}`);
    delete c[id];
  }
  for (const { type, entity } of patch.updated) {
    /** @type {Record<string, any>} */
    const c = out[collectionOf(type)];
    if (!(entity.id in c)) throw new Error(`brep: patch updates missing ${type} ${entity.id}`);
    c[entity.id] = isolatedCopy(entity);
  }
  for (const { type, entity } of patch.added) {
    /** @type {Record<string, any>} */
    const c = out[collectionOf(type)];
    if (entity.id in c) throw new Error(`brep: patch adds existing ${type} ${entity.id}`);
    c[entity.id] = isolatedCopy(entity);
  }
  return out;
}

/**
 * Names of model-level members (not entity collections, not `version`) that differ between two models. They cannot be
 * expressed in a contract patch today (Q-31).
 * @param {BuildingModel} before
 * @param {BuildingModel} after
 * @returns {string[]}
 */
export function modelLevelChanges(before, after) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return sorted([...keys].filter((k) => !COLLECTION_KEYS.has(k) && k !== 'version'
    && !sameValue(/** @type {any} */ (before)[k] ?? null, /** @type {any} */ (after)[k] ?? null)));
}
