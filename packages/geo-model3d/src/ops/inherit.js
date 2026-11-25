// ops (3D-15): what happens to model constraints when a face is split or faces are merged (D-3D15-2, owner decision
// 02). One policy per constraint kind and per role of the entity in it (spec §5 per-kind table, D-169):
//   COPY_TO_CHILDREN      a copy with a new constraint id names the new part / new edge fragment instead of the old one
//   REBIND_TO_CHILD       the constraint is rewritten to name the surviving entity (merge only)
//   PRESERVE_ORIGINAL     unchanged (the entity it names keeps its id and its meaning)
//   TRANSFORM_PARAMETERS  copy whose geometric parameters are restated for the new entity (none needed by today's
//                         kinds: FIXED_LINE / FIXED_EAVE / FIXED_RIDGE fix the edge's current points, so a copy on the
//                         new fragment fixes that fragment's points; `target` of FIXED_LINE is the same line)
//   REJECT_IF_UNSUPPORTED hard constraint whose meaning cannot be kept -> CONSTRAINT_CONFLICT; soft one -> kept as is
// The contract has no area or length constraint kinds; such a kind would fall under REJECT_IF_UNSUPPORTED.
import { refuse } from './errors.js';

/** @typedef {import('../brep/types.js').BuildingModel} BuildingModel */

/** Kinds whose face entity means "the support plane of that face" (spec §5 table). */
const PLANE_KINDS = new Set(['ON_PLANE', 'PLANAR_FACE', 'HORIZONTAL', 'VERTICAL', 'PARALLEL', 'PERPENDICULAR', 'ROOF_SLOPE',
  'SYMMETRY', 'MINIMIZE_DISPLACEMENT']);
/** Kinds whose half-edge entity means "the line of that edge" or "that edge's current points". */
const EDGE_KINDS = new Set(['FIXED_LINE', 'FIXED_EAVE', 'FIXED_RIDGE', 'SHARED_EDGE', 'HORIZONTAL', 'VERTICAL', 'PARALLEL',
  'PERPENDICULAR', 'PREFERRED_AXIS']);
/** Kinds on vertices only: a split or merge keeps every vertex id it does not delete (D-3D15-3). */
const VERTEX_KINDS = new Set(['FIXED_POINT', 'COINCIDENT', 'EQUAL_Z']);
/** Kinds `solve` does not apply yet (D-169: footprint segment and measurement layout TBD). */
const TBD_KINDS = new Set(['BOUNDARY_ON_FOOTPRINT', 'CLOSE_TO_MEASUREMENT']);
/** Relations that hold trivially when both entities become one after a merge; PERPENDICULAR of one entity cannot. */
const SELF_TRIVIAL = new Set(['PARALLEL', 'SYMMETRY', 'COINCIDENT', 'EQUAL_Z', 'MINIMIZE_DISPLACEMENT']);

/** Policy table, exported for the module card and tests. */
export const SPLIT_POLICY = Object.freeze({
  face: { plane: 'COPY_TO_CHILDREN', breakMoving: 'PRESERVE_ORIGINAL', tbd: 'REJECT_IF_UNSUPPORTED', other: 'REJECT_IF_UNSUPPORTED' },
  edge: { fixed: 'TRANSFORM_PARAMETERS', line: 'COPY_TO_CHILDREN', tbd: 'REJECT_IF_UNSUPPORTED', other: 'REJECT_IF_UNSUPPORTED' },
  vertex: 'PRESERVE_ORIGINAL',
});
export const MERGE_POLICY = Object.freeze({ face: 'REBIND_TO_CHILD', edge: 'REBIND_TO_CHILD', duplicate: 'dropped (lineage to the kept one)',
  selfTrivial: 'dropped', selfPerpendicular: 'REJECT_IF_UNSUPPORTED', removed: 'D-213 (hard -> CONSTRAINT_CONFLICT, soft dropped)' });

/** @param {any} c @param {Set<string>} ids */
const names = (c, ids) => (c.entityIds ?? []).some((/** @type {string} */ e) => ids.has(e));

/**
 * Split: copy constraints to the new part and to new edge fragments.
 * @param {BuildingModel} draft mutated (constraints added)
 * @param {{ faceId: string, newFaceId: string, splitEdges: [string, string][], planeMoves: boolean }} s `planeMoves`:
 *   the new part gets a new plane (INSERT_ROOF_BREAK), so plane constraints stay on the part that keeps the old plane
 * @param {(kind: string) => string} ids
 * @returns {{ ok: true, lineage: Record<string, string[]> } | { ok: false, refusal: any }}
 */
export function inheritOnSplit(draft, s, ids) {
  const edgeMap = new Map(s.splitEdges);
  const affected = new Set([s.faceId, ...edgeMap.keys()]);
  /** @type {Record<string, string[]>} */
  const lineage = {};
  /** @type {string[]} */
  const rejected = [];
  for (const c of Object.values(draft.constraints).sort((x, y) => (x.id < y.id ? -1 : 1))) {
    if (!names(c, affected) || VERTEX_KINDS.has(c.kind)) continue;
    if (TBD_KINDS.has(c.kind) || !(PLANE_KINDS.has(c.kind) || EDGE_KINDS.has(c.kind))) {
      if (c.hard) rejected.push(c.id);
      continue;
    }
    /** @type {string[][]} */
    const variants = [];
    c.entityIds.forEach((/** @type {string} */ e, /** @type {number} */ i) => {
      let to = null;
      if (e === s.faceId && PLANE_KINDS.has(c.kind) && !s.planeMoves) to = s.newFaceId;
      if (edgeMap.has(e) && EDGE_KINDS.has(c.kind)) to = /** @type {string} */ (edgeMap.get(e));
      if (to) variants.push(c.entityIds.map((/** @type {string} */ x, /** @type {number} */ j) => (j === i ? to : x)));
    });
    for (const entityIds of variants) {
      const id = ids('constraint');
      draft.constraints[id] = { ...c, id, entityIds };
      (lineage[c.id] ??= [c.id]).push(id);
    }
  }
  if (rejected.length > 0) return refuse('CONSTRAINT_CONFLICT', rejected, 'hard constraints whose meaning a split cannot keep (D-3D15-2)');
  return { ok: true, lineage };
}

/** Comparable key of a constraint without its id. @param {any} c */
const key = (c) => JSON.stringify([c.kind, !!c.hard, c.weight ?? null, c.target ?? null, c.measurementId ?? null, c.entityIds]);

/**
 * Merge: rewrite references to merged faces and dissolved half-edges to the survivors; drop self relations that hold
 * trivially and exact duplicates; refuse hard self relations that cannot hold.
 * @param {BuildingModel} draft mutated
 * @param {Map<string, string>} rebind old entity id -> surviving id
 * @returns {{ ok: true, lineage: Record<string, string[]> } | { ok: false, refusal: any }}
 */
export function inheritOnMerge(draft, rebind) {
  /** @type {Record<string, string[]>} */
  const lineage = {};
  /** @type {string[]} */
  const rejected = [];
  /** @type {Map<string, string>} key -> constraint id kept */
  const seen = new Map();
  const old = new Set(rebind.keys());
  const all = Object.values(draft.constraints).sort((x, y) => (x.id < y.id ? -1 : 1));
  for (const c of all) if (!names(c, old)) seen.set(key(c), c.id);
  for (const c of all) {
    if (!names(c, old)) continue;
    const entityIds = c.entityIds.map((/** @type {string} */ e) => rebind.get(e) ?? e);
    const self = entityIds.length >= 2 && entityIds.every((/** @type {string} */ e) => e === entityIds[0]) && c.kind !== 'MINIMIZE_DISPLACEMENT';
    if (self && !SELF_TRIVIAL.has(c.kind)) { if (c.hard) rejected.push(c.id); else delete draft.constraints[c.id]; continue; }
    if (self) { delete draft.constraints[c.id]; continue; }
    const next = { ...c, entityIds: c.kind === 'MINIMIZE_DISPLACEMENT' ? [...new Set(entityIds)] : entityIds };
    const dup = seen.get(key(next));
    if (dup) { delete draft.constraints[c.id]; lineage[c.id] = [dup]; continue; }
    draft.constraints[c.id] = next;
    seen.set(key(next), c.id);
  }
  if (rejected.length > 0) return refuse('CONSTRAINT_CONFLICT', rejected, 'hard relation between faces that the merge makes one (D-3D15-2)');
  return { ok: true, lineage };
}
