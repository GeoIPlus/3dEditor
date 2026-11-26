// ops (3D-14): the command pipeline every operation row uses (spec §3 r1-r6; v0.2 C.0): build the candidate on an
// isolated copy (brep transaction) -> constraint step (hard then soft, spec §5) -> validate for the target state
// (spec §8) -> commit gate "no new errors" through the lineage (spec §3 r4, §8 r7) -> patch, inverse patch, lineage.
// PREVIEW runs the same steps and persists nothing (spec §3 r3): the service stores nothing from a PREVIEW but its
// result; COMMIT of the same command on the same version yields the same patch (ids are deterministic, ids.js).
// Authorisation, idempotency and the stored PREVIEW (`previewId`) are the service's (3D-23); the kernel only refuses a
// version or building that does not match the model it was given.
import { transact } from '../brep/index.js';
import { runChecks, toIssues, buildReport, newErrors, VALIDATOR_VERSION } from '../validate/index.js';
import { contractError } from './errors.js';
import { freshIds } from './ids.js';
import { constraintStep } from './constraints.js';
import { overhangGuard } from './overhang-guard.js';
import { dependentPayload, detachOverhangs, holdConstraints, rebuildOverhangs } from './dependents.js';
import { OPERATIONS, OPERATION_KINDS, OVERHANG_OWNERS, SELF_REBUILD } from './registry.js';

/** @typedef {import('../brep/types.js').BuildingModel} BuildingModel */
/** @typedef {import('./errors.js').ContractError} ContractError */
/** @typedef {import('../validate/report.js').ValidationIssue} ValidationIssue */

/**
 * What an operation module gets besides draft and payload.
 * @typedef {object} OpContext
 * @property {any} tol contract `tolerance-profile`
 * @property {(kind: string) => string} ids
 * @property {'LOCAL' | 'WORLD'} frame the command's `coordinateFrame`
 * @property {(z: number) => number} heightToLocal WORLD height -> local z (building frame)
 * @property {(p: [number, number, number], frame: string) => [number, number, number]} pointToLocal
 * @property {string} actorId the command's `actorId` (measurement `createdBy`, 3D-71)
 * @property {(selection: any) => ({ result: any } | { error: any })} [planeFit] plane fit of the command's points (3D-71)
 */

/**
 * What an operation module returns. `removed`: ids it deleted (for the constraint step); `movableFaceIds`,
 * `conditions`, `targetVertexIds`: its solver targets (spec §10.1 r2, r3). `noChange`: a valid empty operation; when
 * the candidate equals the input a COMMIT keeps the version and writes no journal entry (3D-15 D-301).
 * @typedef {{ ok: true, mapped?: Record<string, string[]>, removed?: Set<string>, movableFaceIds?: string[],
 *   conditions?: any[], targetVertexIds?: string[], warnings?: string[], noChange?: boolean } | { ok: false, refusal: ContractError }} OpResult
 */

/**
 * @typedef {object} PipelineOptions
 * @property {any} toleranceProfile contract `tolerance-profile`
 * @property {() => string} clock injected clock, RFC 3339
 * @property {(kind: string) => string} [ids] entity id source (Q-26); default deterministic (ids.js)
 * @property {string} [previewId] id the service gives a PREVIEW; default `<commandId>-preview` [A]
 * @property {{ code: string, entityIds: string[] }[]} [previousIssues] issues of the input version, if the service keeps
 *   them; else computed (COMMIT_VALIDATION, full solid)
 * @property {(z: number) => number} heightToLocal
 * @property {(p: [number, number, number], frame: string) => [number, number, number]} pointToLocal
 * @property {(selection: any) => ({ result: any } | { error: any })} [planeFit] `fitPlane` on the points the service
 *   read for a FIT_PLANE command (3D-71)
 */

/**
 * @param {BuildingModel} model current version; never modified
 * @param {any} command contract `command`
 * @param {PipelineOptions} opts
 * @returns {{ result: any, model: BuildingModel, journal?: any, modelLevel?: string[] }} on a refusal or PREVIEW `model`
 *   is the input object; on COMMIT the new version, the journal-entry data (the service adds `operationId` and
 *   `actorId`) and the model-level members changed beside the patch (`state`; Q-31)
 */
export function runPipeline(model, command, opts) {
  const tol = opts.toleranceProfile;
  const target = command.targetState;
  const report = (/** @type {number} */ v, /** @type {ValidationIssue[]} */ issues, /** @type {boolean} */ confirms) =>
    buildReport({ modelVersion: v, targetState: target, issues, confirms, validatorVersion: VALIDATOR_VERSION, createdAt: opts.clock() });
  const reject = (/** @type {ContractError} */ error, /** @type {ValidationIssue[]} */ issues = [], /** @type {string[]} */ warnings = []) => ({
    model,
    result: {
      commandId: command.commandId, status: error.code === 'VERSION_CONFLICT' ? 'CONFLICT' : 'REJECTED',
      modelVersion: model.version, validation: report(model.version, issues, false), warnings, error,
    },
  });

  if (!OPERATION_KINDS.has(command.operation)) return reject(contractError('INVALID_PAYLOAD', [], 'unknown operation'));
  const op = OPERATIONS[command.operation];
  if (!op) return reject(contractError('INTERNAL', [], `${command.operation} is not implemented yet`));
  if (command.buildingId !== model.buildingId) return reject(contractError('NOT_FOUND', [command.buildingId]));
  if (command.expectedVersion !== model.version) return reject(contractError('VERSION_CONFLICT', []));
  if (target !== 'VALID_SOLID' && target !== 'DRAFT_SOLID') return reject(contractError('INVALID_PAYLOAD', [], 'targetState'));
  const named = dependentPayload(model, command, OVERHANG_OWNERS); // D-385
  if (named) return reject(named.refusal);

  /** @type {OpContext} */
  const ctx = { tol, ids: opts.ids ?? freshIds(model), frame: command.coordinateFrame, heightToLocal: opts.heightToLocal, pointToLocal: opts.pointToLocal,
    actorId: command.actorId, planeFit: opts.planeFit };
  /** @type {string[]} */
  const warnings = [];
  /** @type {import('../validate/context.js').RawIssue[]} */
  let raw = [];
  let noChange = false;
  const tx = transact(model, (draft) => {
    // 3D-124 (D-384): overhangs come off before the operation and back on after the solve, unless it owns them
    const detached = SELF_REBUILD.has(command.operation) ? [] : detachOverhangs(draft, tol.numericEpsilon);
    const r = op.run(draft, command.payload, ctx);
    if (!r.ok) return /** @type {any} */ (r);
    noChange = r.noChange === true;
    warnings.push(...(r.warnings ?? []));
    const held = holdConstraints(draft, detached);
    const c = constraintStep(draft, r, tol);
    if (!c.ok) return /** @type {any} */ (c);
    warnings.push(...c.warnings);
    if (detached.length > 0) {
      const rebuilt = rebuildOverhangs(model, draft, detached, held, ctx);
      if (!rebuilt.ok) return /** @type {any} */ (rebuilt);
    }
    // 3D-120 (D-373): whatever the rebuild does not cover (self-rebuilding operations) is still refused
    const dependent = overhangGuard(model, draft, tol);
    if (dependent) return /** @type {any} */ (dependent);
    // the same checks in PREVIEW and COMMIT so that both give the same patch (shell closure and state are in it)
    raw = runChecks(draft, { mode: 'COMMIT_VALIDATION', tolerances: tol, fullSolid: true });
    const open = new Set(raw.filter((i) => i.code === 'SHELL_NOT_CLOSED').flatMap((i) => i.entityIds));
    for (const s of Object.values(draft.shells)) s.isClosed = !open.has(s.id);
    const clean = !toIssues(raw, 'VALID_SOLID').some((i) => i.severity === 'ERROR');
    draft.state = target === 'VALID_SOLID' && clean ? 'VALID_SOLID' : 'DRAFT_SOLID';
    return { ok: true, mapped: r.mapped };
  });
  if (!tx.ok) return reject(/** @type {ContractError} */ (tx.refusal), [], warnings);

  const issues = toIssues(raw, target);
  // the input version's issues matter only when the candidate has errors (a new error must be an error first)
  const hasErrors = issues.some((i) => i.severity === 'ERROR');
  const previous = !hasErrors ? [] : /** @type {ValidationIssue[]} */ (opts.previousIssues) ?? toIssues(runChecks(model, { mode: 'COMMIT_VALIDATION', tolerances: tol, fullSolid: true }), target);
  const fresh = hasErrors ? newErrors(previous, issues, tx.topologyLineage) : [];
  if (target === 'VALID_SOLID' && fresh.length > 0) {
    // v0.2 C.0 "GEOMETRY_INVALID" = INVALID_GEOMETRY (spec §2.4); the new errors are in the report
    return reject(contractError('INVALID_GEOMETRY', fresh.flatMap((i) => i.entityIds), 'commit adds new errors (spec §3 r4)'), issues, warnings);
  }
  const common = { commandId: command.commandId, patch: tx.forwardPatch, topologyLineage: tx.topologyLineage, warnings };
  if (command.phase === 'PREVIEW') {
    // a PREVIEW never confirms a valid solid (spec §8 r1)
    const result = { ...common, status: 'PREVIEW', modelVersion: model.version, previewId: opts.previewId ?? `${command.commandId}-preview`, validation: report(model.version, issues, false) };
    return { model, result };
  }
  const p = tx.forwardPatch;
  if (noChange && p.added.length + p.updated.length + p.deleted.length === 0 && (tx.modelLevel ?? []).length === 0) {
    return { model, result: { ...common, status: 'COMMITTED', modelVersion: model.version, validation: report(model.version, issues, true) } };
  }
  const validation = report(tx.model.version, issues, true);
  const result = { ...common, status: 'COMMITTED', modelVersion: tx.model.version, validation };
  const journal = {
    commandId: command.commandId, beforeVersion: model.version, afterVersion: tx.model.version, timestamp: validation.createdAt,
    input: command, affectedEntityIds: tx.affectedEntityIds, forwardPatch: tx.forwardPatch, inversePatch: tx.inversePatch,
    validationSummary: validation, topologyLineage: tx.topologyLineage, warnings,
  };
  return { model: tx.model, result, journal, modelLevel: tx.modelLevel };
}
