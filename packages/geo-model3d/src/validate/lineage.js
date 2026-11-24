// validate (3D-12): "new" issues (spec §8 Accept 2; v0.3 §6 "commit adds no new errors for the current state"). An
// issue of the current version is old when the previous version had an issue of the same code on an entity that the
// operation's lineage (contract `topology-lineage`, v0.2 B.6) maps onto one of the current issue's entities.
// [A] The contract `validation-report` has no "new" flag; newness is an internal result for the commit gate (rule 7).

/** @typedef {{ mapped: Record<string, string[]>, deleted: string[], preserved: string[] }} TopologyLineage */
/** @typedef {{ code: string, entityIds: string[] }} IssueKey */

/**
 * Successors of an old id: `mapped` targets, nothing when deleted, else the same id (preserved and untouched entities
 * keep their ids, spec §4 rule 9).
 * @param {TopologyLineage} lineage
 * @returns {(id: string) => string[]}
 */
export function successors(lineage) {
  const deleted = new Set(lineage.deleted);
  return (id) => {
    const m = lineage.mapped[id];
    if (m) return m;
    return deleted.has(id) ? [] : [id];
  };
}

/**
 * Flags, per current issue, whether it is new.
 * @param {IssueKey[]} previous issues of the previous version (any target state)
 * @param {IssueKey[]} current issues of this version
 * @param {TopologyLineage} lineage of the operation previous -> current
 * @returns {boolean[]} same order as `current`
 */
export function newIssueFlags(previous, current, lineage) {
  const next = successors(lineage);
  /** @type {Map<string, Set<string>>} code -> successor ids of every previous issue of that code */
  const old = new Map();
  for (const p of previous) {
    let s = old.get(p.code);
    if (!s) old.set(p.code, (s = new Set()));
    for (const id of p.entityIds) for (const n of next(id)) s.add(n);
  }
  return current.map((c) => {
    const s = old.get(c.code);
    return !s || !c.entityIds.some((id) => s.has(id));
  });
}

/**
 * The new issues among `current`.
 * @template {IssueKey} T
 * @param {IssueKey[]} previous @param {T[]} current @param {TopologyLineage} lineage
 * @returns {T[]}
 */
export function newIssues(previous, current, lineage) {
  const flags = newIssueFlags(previous, current, lineage);
  return current.filter((_, i) => flags[i]);
}
