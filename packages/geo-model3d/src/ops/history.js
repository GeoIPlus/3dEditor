// ops (3D-18): history commands `UNDO`, `REDO`, `RESTORE_BASELINE` (spec §10.9; v0.2 §13.6; v0.3 §6 F-75, F-08).
// Linear history per building: the journal the service passes in is replayed into an undo and a redo stack (an edit
// pushes and clears redo, UNDO moves the top to redo, REDO moves it back; RESTORE_BASELINE is an edit, D-294).
// UNDO applies the stored inverse patch (original ids, GT-12), REDO the forward patch, RESTORE_BASELINE the imported
// state; each is a new version (spec §4 r9). No commit gate: the target content is restored exactly, `state` comes
// from validation for the command's `targetState` (D-291). Only the stack top of the requesting actor (D-292).
// Idempotency on `commandId` is the service's (3D-23, D-68); the kernel is deterministic for the same input.
import { transact, applyPatch, sameValue, isolatedCopy } from '../brep/index.js';
import { runChecks, toIssues, buildReport, VALIDATOR_VERSION } from '../validate/index.js';
import { contractError } from './errors.js';

/** @typedef {import('../brep/types.js').BuildingModel} BuildingModel */
/** @typedef {import('./errors.js').ContractError} ContractError */

/** Operation kinds of this module. */
export const HISTORY_KINDS = new Set(['UNDO', 'REDO', 'RESTORE_BASELINE']);

/**
 * What the service passes for a history command (spec §3 API). `journal`: the building's journal entries (contract
 * `journal-entry`, with `actorId`), oldest first, the last one ending at the model's version; `baseline`: the
 * immutable imported model (RESTORE_BASELINE); `actorId`: the authenticated user (spec §11 r1), not the envelope's.
 * @typedef {{ journal?: any[], baseline?: BuildingModel, actorId?: string }} HistoryInput
 */

/**
 * Replay a journal into the undo and redo stacks (spec §10.9 r1). Throws on a journal that does not replay (an UNDO or
 * REDO with an empty stack, versions out of order): that is a service fault, not a user refusal.
 * @param {any[]} journal oldest first
 * @returns {{ undo: any[], redo: any[] }} stack tops last
 */
export function historyStacks(journal) {
  /** @type {any[]} */
  const undo = [];
  /** @type {any[]} */
  let redo = [];
  let prev = /** @type {number | null} */ (null);
  for (const e of journal) {
    if (prev !== null && e.beforeVersion !== prev) throw new Error(`history: journal gap at version ${e.beforeVersion}`);
    prev = e.afterVersion;
    const op = e.input?.operation;
    if (op === 'UNDO' || op === 'REDO') {
      const from = op === 'UNDO' ? undo : redo;
      const to = op === 'UNDO' ? redo : undo;
      const top = from.pop();
      if (!top) throw new Error(`history: ${op} at version ${e.afterVersion} with an empty stack`);
      to.push(top);
    } else {
      undo.push(e);
      redo = [];
    }
  }
  return { undo, redo };
}

/**
 * The entity collections and model-level members of `target` put onto a copy of `model` (version and state are set
 * by the transaction and by validation).
 * @param {BuildingModel} draft mutated
 * @param {BuildingModel} target
 */
function becomeTarget(draft, target) {
  const d = /** @type {Record<string, any>} */ (draft);
  const t = /** @type {Record<string, any>} */ (target);
  for (const k of Object.keys(t)) if (k !== 'version' && k !== 'state') d[k] = isolatedCopy(t[k]);
  for (const k of Object.keys(d)) if (!(k in t)) delete d[k];
}

/** Model content without version and state (for "already equal to the baseline"). @param {BuildingModel} m */
const content = (m) => ({ ...m, version: 0, state: null });

/**
 * The model the command returns to, or a refusal (D-292, D-293).
 * @param {BuildingModel} model @param {string} operation @param {HistoryInput} h
 * @returns {{ ok: true, target: BuildingModel } | { ok: false, error: ContractError }}
 */
function resolveTarget(model, operation, h) {
  const no = (/** @type {string} */ code, /** @type {string} */ msg, /** @type {string[]} */ ids = []) => ({ ok: /** @type {false} */ (false), error: contractError(code, ids, msg) });
  if (operation === 'RESTORE_BASELINE') {
    const b = h.baseline;
    if (!b || b.buildingId !== model.buildingId || b.projectId !== model.projectId) return no('INTERNAL', 'RESTORE_BASELINE needs the baseline of this building');
    if (sameValue(content(model), content(b))) return no('INVALID_PAYLOAD', 'the model already equals the baseline (D-293)');
    return { ok: true, target: b };
  }
  const journal = h.journal ?? [];
  if (journal.length > 0 && journal[journal.length - 1].afterVersion !== model.version) return no('INTERNAL', 'the journal does not end at the model version');
  /** @type {{ undo: any[], redo: any[] }} */
  let stacks;
  try { stacks = historyStacks(journal); } catch (e) { return no('INTERNAL', /** @type {Error} */ (e).message); }
  const stack = operation === 'UNDO' ? stacks.undo : stacks.redo;
  const top = stack[stack.length - 1];
  if (!top) return no('INVALID_PAYLOAD', `nothing to ${operation === 'UNDO' ? 'undo' : 'redo'} (D-293)`);
  if (!h.actorId || top.actorId !== h.actorId) return no('FORBIDDEN', `the ${operation === 'UNDO' ? 'undo' : 'redo'} stack top is another actor's operation (spec §10.9 r5, D-292)`, [top.commandId]);
  try {
    return { ok: true, target: applyPatch(model, operation === 'UNDO' ? top.inversePatch : top.forwardPatch) };
  } catch (e) {
    return no('INTERNAL', `stored patch of ${top.commandId} does not fit: ${/** @type {Error} */ (e).message}`);
  }
}

/**
 * Run a history command (PREVIEW or COMMIT). Same output shape as `runPipeline` (ops/pipeline.js).
 * @param {BuildingModel} model current version; never modified
 * @param {any} command contract `command` with `operation` in HISTORY_KINDS
 * @param {{ toleranceProfile: any, clock: () => string, previewId?: string, history?: HistoryInput }} opts
 * @returns {{ result: any, model: BuildingModel, journal?: any, modelLevel?: string[] }}
 */
export function runHistory(model, command, opts) {
  const tol = opts.toleranceProfile;
  const target = command.targetState;
  const report = (/** @type {number} */ v, /** @type {any[]} */ issues, /** @type {boolean} */ confirms) =>
    buildReport({ modelVersion: v, targetState: target, issues, confirms, validatorVersion: VALIDATOR_VERSION, createdAt: opts.clock() });
  const reject = (/** @type {ContractError} */ error) => ({
    model,
    result: { commandId: command.commandId, status: error.code === 'VERSION_CONFLICT' ? 'CONFLICT' : 'REJECTED', modelVersion: model.version, validation: report(model.version, [], false), warnings: [], error },
  });
  if (command.buildingId !== model.buildingId) return reject(contractError('NOT_FOUND', [command.buildingId]));
  if (command.expectedVersion !== model.version) return reject(contractError('VERSION_CONFLICT', []));
  if (target !== 'VALID_SOLID' && target !== 'DRAFT_SOLID') return reject(contractError('INVALID_PAYLOAD', [], 'targetState'));
  const p = command.payload;
  if (!p || typeof p !== 'object' || Array.isArray(p) || Object.keys(p).length > 0) return reject(contractError('INVALID_PAYLOAD', [], 'payload must be empty (spec §10.9 r1)'));

  const resolved = resolveTarget(model, command.operation, opts.history ?? {});
  if (!resolved.ok) return reject(resolved.error);
  /** @type {import('../validate/context.js').RawIssue[]} */
  let raw = [];
  const tx = transact(model, (draft) => {
    becomeTarget(draft, resolved.target);
    raw = runChecks(draft, { mode: 'COMMIT_VALIDATION', tolerances: tol, fullSolid: true });
    const open = new Set(raw.filter((i) => i.code === 'SHELL_NOT_CLOSED').flatMap((i) => i.entityIds));
    for (const s of Object.values(draft.shells)) s.isClosed = !open.has(s.id);
    const clean = !toIssues(raw, 'VALID_SOLID').some((i) => i.severity === 'ERROR');
    draft.state = target === 'VALID_SOLID' && clean ? 'VALID_SOLID' : 'DRAFT_SOLID';
    return { ok: true };
  });
  if (!tx.ok) return reject(/** @type {ContractError} */ (tx.refusal));
  const issues = toIssues(raw, target);
  const common = { commandId: command.commandId, patch: tx.forwardPatch, topologyLineage: tx.topologyLineage, warnings: [] };
  if (command.phase === 'PREVIEW') {
    const result = { ...common, status: 'PREVIEW', modelVersion: model.version, previewId: opts.previewId ?? `${command.commandId}-preview`, validation: report(model.version, issues, false) };
    return { model, result };
  }
  const validation = report(tx.model.version, issues, true);
  const result = { ...common, status: 'COMMITTED', modelVersion: tx.model.version, validation };
  const journal = {
    commandId: command.commandId, beforeVersion: model.version, afterVersion: tx.model.version, timestamp: validation.createdAt,
    input: command, affectedEntityIds: tx.affectedEntityIds, forwardPatch: tx.forwardPatch, inversePatch: tx.inversePatch,
    validationSummary: validation, topologyLineage: tx.topologyLineage, warnings: [],
  };
  return { model: tx.model, result, journal, modelLevel: tx.modelLevel };
}
