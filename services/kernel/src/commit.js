// COMMIT path and command status of the kernel service (3D-23; spec §11 r1, r3, r4, r7, r10; 3D-ADR-0003 §3;
// GT-13, D-68). Order: idempotency record -> head and `expectedVersion` -> kernel `executeCommand` on the head version
// -> journal append (create-if-absent of `journal/{N+1}`, the commit point). A repeated `commandId` returns the stored
// reply and mutates nothing; a stale `expectedVersion` is `409 VERSION_CONFLICT`. A COMMIT with a `previewId` (3D-109,
// spec §3 r3, §11 r5) applies the kernel outcome stored with the PREVIEW instead of running the kernel again; a
// PREVIEW of another version is `409`. Authorisation and the CP lease (D-69) are 3D-110: `actor` here is already the
// authenticated user.
import { randomUUID } from 'node:crypto';
import { executeCommand, validateModel } from '@geoiplus/geo-model3d';
import { isHistoryPort } from './ports/history.js';
import { errorReply } from './errors.js';

/** History kinds take the journal and the baseline (spec §10.9; D-291..D-294). */
const HISTORY_KINDS = new Set(['UNDO', 'REDO', 'RESTORE_BASELINE']);

/**
 * Reply of the service: HTTP status and a contract body (`command-result`, `command-status` or `error`).
 * @typedef {{ httpStatus: number, body: any }} Reply
 */

/**
 * @typedef {object} CommitDeps
 * @property {import('./ports/history.js').HistoryPort} history
 * @property {(projectId: string) => any} toleranceProfile contract `tolerance-profile` of the project
 * @property {() => string} clock RFC 3339 time of the journal entries and reports
 * @property {() => string} [newOperationId] id of a journal entry (default: a UUID, Q-26)
 * @property {(model: any, command: any) => Promise<Float64Array | undefined>} [pointsFor] points of a `FIT_PLANE`
 *   selection (`commandPoints`, cloud-points.js); wired by the handler (3D-110)
 */

/**
 * Lookup of the PREVIEW a COMMIT names (command-api.js): the stored preview, or the refusal (404 / 400, D-354).
 * @typedef {(command: any) => { preview: import('./preview-store.js').StoredPreview } | { reply: Reply }} PreviewLookup
 */

/** @param {any} result a `command-result`; its HTTP status: the error's, else 200 */
const replyOf = (result) => ({ httpStatus: result.error?.httpStatus ?? 200, body: result });

/** @param {CommitDeps} deps */
export function createCommitService(deps) {
  if (!isHistoryPort(deps.history)) throw new TypeError('commit: deps.history must implement the history port');
  const { history } = deps;
  const newOperationId = deps.newOperationId ?? randomUUID;
  /** @type {Map<string, number>} commands being executed by this instance (`projectId/commandId` -> count) */
  const running = new Map();

  /**
   * COMMIT one command as `actor` (spec §11 r1: authority from the authenticated context, never from `actorId`).
   * @param {any} command contract `command` with `phase: COMMIT` (validated by the caller, 3D-109)
   * @param {{ actorId: string }} actor
   * @param {PreviewLookup} [lookup] given when the command carries a `previewId`
   * @returns {Promise<Reply>}
   */
  async function commit(command, actor, lookup) {
    if (command.phase !== 'COMMIT') return errorReply('INVALID_PAYLOAD', [], 'the commit path takes phase COMMIT');
    const { projectId: p, buildingId: b, commandId } = command;
    const runKey = `${p}/${commandId}`;
    running.set(runKey, (running.get(runKey) ?? 0) + 1);
    try {
      // a concurrent repeat of the same commandId is safe: the journal key admits one of them (repeat, GT-13)
      return await commitOnce({ ...command, actorId: actor.actorId }, p, b, lookup);
    } finally {
      const n = /** @type {number} */ (running.get(runKey)) - 1;
      if (n === 0) running.delete(runKey); else running.set(runKey, n);
    }
  }

  /** @param {any} command @param {string} p @param {string} b @param {PreviewLookup} [lookup] @returns {Promise<Reply>} */
  async function commitOnce(command, p, b, lookup) {
    const { commandId, expectedVersion } = command;
    const stored = await history.findCommand(p, commandId, { buildingId: b, expectedVersion });
    if (stored !== undefined) return replyOf(stored);
    const found = lookup?.(command);
    if (found && 'reply' in found) return found.reply;  // not stored: an unknown preview changes nothing
    const preview = found?.preview;

    const head = await history.head(p, b);
    if (head === undefined) return errorReply('NOT_FOUND', [b], 'unknown building');
    const model = await history.readVersion(p, b, head);
    // spec §3 r1, §11 r4: the version check is the service's, before the kernel (which checks the operation first)
    if (expectedVersion !== head) return replyOf(await history.recordResult(p, b, commandId, await conflictResult(command, model)));
    if (preview && preview.baseVersion !== head) {
      // spec §3 r3: the shown result is applied exactly or refused when the version changed
      const msg = `previewId of version ${preview.baseVersion}, current version ${head}`;
      return replyOf(await history.recordResult(p, b, commandId, await conflictResult(command, model, msg)));
    }
    const out = preview ? rebase(preview.outcome, command) : await execute(model, command);
    if (out.result.status !== 'COMMITTED' || out.journal === undefined) {
      // refusal, conflict or a noChange COMMIT (D-301): nothing changed; the reply is stored for a repeat (S4)
      return replyOf(await history.recordResult(p, b, commandId, out.result));
    }
    const entry = { ...out.journal, operationId: newOperationId(), actorId: command.actorId };
    const done = await history.commit(p, b, entry, out.model);
    if (done.status === 'committed') return replyOf(out.result);
    if (done.status === 'repeat') return replyOf(await history.findCommand(p, commandId, { buildingId: b, expectedVersion }));
    // another command took version head + 1 between our read and our write: run again on the new head, where the
    // kernel refuses the now stale expectedVersion (VERSION_CONFLICT) and the refusal is stored
    return commitOnce(command, p, b, lookup);
  }

  /**
   * Run the kernel on `model` (the head version) with the options of the command's kind: journal and baseline for
   * UNDO / REDO / RESTORE_BASELINE, points for FIT_PLANE. Used by COMMIT and by PREVIEW (command-api.js).
   * @param {any} model @param {any} command (its `actorId` is the authenticated user)
   */
  async function execute(model, command) {
    const { projectId: p, buildingId: b } = command;
    /** @type {any} */
    const options = { toleranceProfile: deps.toleranceProfile(p), clock: deps.clock };
    if (HISTORY_KINDS.has(command.operation)) {
      const [journal, baseline] = await Promise.all([history.readJournal(p, b), history.readBaseline(p, b)]);
      Object.assign(options, { history: { journal, baseline, actorId: command.actorId } });
    } else if (command.operation === 'FIT_PLANE' && deps.pointsFor) {
      Object.assign(options, { points: await deps.pointsFor(model, command) });
    }
    return executeCommand(model, command, options);
  }

  /**
   * The stored COMMIT outcome of a PREVIEW, re-addressed to the COMMIT command: its `commandId` and input; the model,
   * patch, lineage and validation are the stored ones (spec §3 r3). The journal time is the commit's.
   * @param {any} outcome `executeCommand` output, phase COMMIT, on the preview's version @param {any} command
   */
  function rebase(outcome, command) {
    const result = { ...outcome.result, commandId: command.commandId };
    const journal = outcome.journal && { ...outcome.journal, commandId: command.commandId, input: command, timestamp: deps.clock() };
    return { ...outcome, result, journal };
  }

  /**
   * `CONFLICT` result of a stale `expectedVersion` (contract `command-result`): the error and the FAST_PREVIEW report
   * of the current version (no commit gate is run; v0.2 D.4: never re-applied without confirmation).
   * @param {any} command @param {any} model the head version @param {string} [message]
   */
  async function conflictResult(command, model, message) {
    const targetState = command.targetState === 'DRAFT_SOLID' ? 'DRAFT_SOLID' : 'VALID_SOLID';
    const validation = await validateModel(model, { mode: 'FAST_PREVIEW', targetState, tolerances: deps.toleranceProfile(command.projectId), clock: deps.clock });
    const error = errorReply('VERSION_CONFLICT', [], message ?? `expectedVersion ${command.expectedVersion}, current version ${model.version}`).body;
    return { commandId: command.commandId, status: 'CONFLICT', modelVersion: model.version, validation, warnings: [], error };
  }

  /**
   * Status of a command by `commandId` (contract `command-status`; v0.3 §9.2 `GET /api/commands/{commandId}`).
   * @param {string} projectId @param {string} commandId
   * @returns {Promise<Reply>}
   */
  async function status(projectId, commandId) {
    if (running.has(`${projectId}/${commandId}`)) return { httpStatus: 200, body: { commandId, state: 'IN_PROGRESS' } };
    const result = await history.findCommand(projectId, commandId);
    if (result === undefined) return errorReply('NOT_FOUND', [commandId], 'unknown command');
    return { httpStatus: 200, body: { commandId, state: 'DONE', result } };
  }

  return { commit, status, execute, history };
}
