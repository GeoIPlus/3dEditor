// brep (3D-09): transactions and versions (K-06; spec §4 rule 9, §3 rules 1, 2, 6). Every mutation runs on an isolated
// copy and produces exactly one new version (`version + 1`) with forward patch, inverse patch and topology lineage.
// A refusal or a thrown error leaves the input untouched: the input is never written (no partial side effects).
import { applyPatch, diffModels, modelLevelChanges } from './patch.js';
import { isolatedCopy } from './serialize.js';

/** @typedef {import('./types.js').BuildingModel} BuildingModel */
/** @typedef {import('./patch.js').ModelPatch} ModelPatch */
/** @typedef {{ mapped: Record<string, string[]>, deleted: string[], preserved: string[] }} TopologyLineage */
/** @typedef {{ code: string, entityIds: string[], details?: Record<string, unknown> }} Refusal */

/**
 * What an operation's mutator returns. `mapped` is the operation's lineage of split / merged / replaced ids
 * (old id -> new ids); the transaction derives `deleted` and `preserved` from the patch.
 * @typedef {{ ok: true, mapped?: Record<string, string[]> } | { ok: false, refusal: Refusal }} MutatorResult
 */

/**
 * @typedef {object} Committed
 * @property {true} ok
 * @property {BuildingModel} model the new version
 * @property {ModelPatch} forwardPatch
 * @property {ModelPatch} inversePatch
 * @property {TopologyLineage} topologyLineage
 * @property {string[]} affectedEntityIds every id the forward patch adds, updates or deletes (sorted)
 * @property {string[]} modelLevel model-level members changed beside the patch (state, frame, ...; Q-31)
 */

/** @typedef {Committed | { ok: false, refusal: Refusal, model: BuildingModel }} TransactionResult */

/** Entity types whose ids the lineage covers (contract topology-lineage: faces, edges, vertices). */
const LINEAGE_TYPES = new Set(['Face', 'HalfEdge', 'Vtx']);

/**
 * Run one mutation as a transaction.
 * @param {BuildingModel} model the current version; never modified
 * @param {(draft: BuildingModel) => MutatorResult} mutate edits the draft in place
 * @returns {TransactionResult} on refusal `model` is the input object itself
 */
export function transact(model, mutate) {
  const draft = isolatedCopy(model);
  const res = mutate(draft);
  if (!res.ok) {
    if (typeof res.refusal?.code !== 'string') throw new Error('brep: refusal without a code');
    return { ok: false, refusal: res.refusal, model };
  }
  draft.version = model.version + 1;
  return finish(model, draft, res.mapped ?? {});
}

/**
 * Apply a patch as a new version (Undo / Redo / Restore are new versions too, spec §4 rule 9; v0.2 §13.6).
 * @param {BuildingModel} model
 * @param {ModelPatch} patch e.g. a journal entry's inverse patch
 * @param {Record<string, string[]>} [mapped] lineage of the patch, if any
 * @returns {Committed}
 */
export function transactPatch(model, patch, mapped = {}) {
  const after = applyPatch(model, patch);
  after.version = model.version + 1;
  return finish(model, after, mapped);
}

/**
 * @param {BuildingModel} before
 * @param {BuildingModel} after
 * @param {Record<string, string[]>} mapped
 * @returns {Committed}
 */
function finish(before, after, mapped) {
  const { forward, inverse } = diffModels(before, after);
  const all = (/** @type {any} */ m) => [...m.added.map((/** @type {any} */ c) => c.entity.id), ...m.updated.map((/** @type {any} */ c) => c.entity.id), ...m.deleted.map((/** @type {any} */ d) => d.id)];
  for (const [oldId, newIds] of Object.entries(mapped)) {
    if (!Array.isArray(newIds) || newIds.length === 0) throw new Error(`brep: lineage of ${oldId} maps to no id`);
    if (!existsIn(before, oldId)) throw new Error(`brep: lineage maps ${oldId}, which is not in version ${before.version}`);
    for (const n of newIds) if (!existsIn(after, n)) throw new Error(`brep: lineage target ${n} is not in the new version`);
  }
  const lineageIds = (/** @type {{ type: string, id: string }[]} */ list) =>
    list.filter((x) => LINEAGE_TYPES.has(x.type) && !(x.id in mapped)).map((x) => x.id);
  const topologyLineage = {
    mapped: Object.fromEntries(Object.keys(mapped).sort().map((k) => [k, [...mapped[k]]])),
    deleted: lineageIds(forward.deleted),
    preserved: lineageIds(forward.updated.map((c) => ({ type: c.type, id: c.entity.id }))),
  };
  return {
    ok: true,
    model: after,
    forwardPatch: forward,
    inversePatch: inverse,
    topologyLineage,
    affectedEntityIds: [...new Set(all(forward))].sort(),
    modelLevel: modelLevelChanges(before, after),
  };
}

/** @param {BuildingModel} m @param {string} id */
function existsIn(m, id) {
  return id in m.faces || id in m.halfEdges || id in m.vertices;
}
