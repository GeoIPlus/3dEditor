// Command API of the kernel service (3D-109; spec §3 r3, §11 r4-r6, r12, §2.4): contract validation of every request
// and reply, PREVIEW with its stored COMMIT outcome by `previewId`, COMMIT by `previewId`, the PREVIEW rate limit, the
// body size limit and the registry reply of every thrown failure. The HTTP server, auth and the lease are 3D-110:
// `actor` is the authenticated user; `authorize` (handler.js) refuses a valid message before the kernel runs.
import { isDeepStrictEqual } from 'node:util';
import { createCommitService } from './commit.js';
import { createContractValidator } from './contracts.js';
import { createPreviewStore } from './preview-store.js';
import { createRateLimiter } from './rate-limit.js';
import { readJsonBody } from './body.js';
import { errorReply, failureReply } from './errors.js';

/** Fields of a COMMIT that must equal those of the PREVIEW it names (D-354). */
const SAME_AS_PREVIEW = ['operation', 'payload', 'targetState', 'coordinateFrame'];

/**
 * @typedef {import('./commit.js').CommitDeps & { now: () => number, newPreviewId?: () => string,
 *   contracts?: ReturnType<typeof createContractValidator> }} CommandApiDeps
 *   `now`: milliseconds of the injected clock (expiry, rate window); `clock` stays the RFC 3339 time of the results
 */

/**
 * The PREVIEW reply of a COMMIT outcome on version `baseVersion` (D-355): the kernel runs once, in phase COMMIT;
 * a PREVIEW differs from its COMMITTED result only in `status`, `modelVersion`, `previewId` and a report on the base
 * version that confirms nothing (kernel ops/pipeline.js, ops/history.js; spec §8 r1). A refusal or conflict is the
 * same in both phases and is returned as is.
 * @param {any} result kernel `command-result` of phase COMMIT @param {number} baseVersion @param {string} previewId
 */
export function previewOf(result, baseVersion, previewId) {
  if (result.status !== 'COMMITTED') return result;
  const validation = { ...result.validation, modelVersion: baseVersion, isValidForTargetState: false };
  return { ...result, status: 'PREVIEW', modelVersion: baseVersion, previewId, validation };
}

/**
 * @typedef {{ authorize?: (command: any) => Promise<import('./commit.js').Reply | undefined> | import('./commit.js').Reply | undefined }} CommandOptions
 */

/** @param {any} result a `command-result` @returns {import('./commit.js').Reply} */
const replyOf = (result) => ({ httpStatus: result.error?.httpStatus ?? 200, body: result });

/** @param {CommandApiDeps} deps */
export function createCommandApi(deps) {
  const service = createCommitService(deps);
  const { history } = service;
  const contracts = deps.contracts ?? createContractValidator();
  const previews = createPreviewStore({ now: deps.now, newId: deps.newPreviewId });
  const rate = createRateLimiter({ now: deps.now });

  /**
   * One `command` message (PREVIEW or COMMIT) as `actor`. `authorize` runs on the valid message, before anything is
   * read or run; a reply from it is returned as is (role, lease: 3D-110, spec §11 r2, r11).
   * @param {unknown} message @param {{ actorId: string }} actor @param {CommandOptions} [options]
   * @returns {Promise<import('./commit.js').Reply>}
   */
  async function command(message, actor, options = {}) {
    return guarded(async () => {
      const bad = contracts.command(message);
      if (bad) return bad;
      const c = /** @type {any} */ (message);
      const refused = await options.authorize?.(c);
      if (refused) return refused;
      return c.phase === 'PREVIEW' ? preview(c, actor) : commit(c, actor);
    });
  }

  /**
   * A request body (stream, chunks or bytes): size limit before parsing (D-317), then `command`.
   * @param {Parameters<typeof readJsonBody>[0]} source @param {{ actorId: string }} actor
   * @param {{ declaredLength?: number } & CommandOptions} [options]
   */
  async function commandBody(source, actor, options = {}) {
    let r;
    try {
      r = await readJsonBody(source, options);
    } catch (err) {
      return contracts.reply(failureReply(err));  // the stream failed while reading
    }
    return r.ok ? command(r.value, actor, options) : contracts.reply(r.reply);
  }

  /** Command status by `commandId` (contract `command-status`). @param {string} projectId @param {string} commandId */
  const status = (projectId, commandId) => guarded(() => service.status(projectId, commandId));

  /** @param {() => Promise<import('./commit.js').Reply>} fn the reply, validated; a throw -> registry (D-353) */
  async function guarded(fn) {
    let r;
    try {
      r = await fn();
    } catch (err) {
      r = failureReply(err);
    }
    return contracts.reply(r);
  }

  /**
   * PREVIEW: rate limit (D-316), the kernel once on the head version in phase COMMIT - the stored outcome (spec §3 r3)
   * and, through `previewOf`, the reply (D-355) - and the store (D-315, D-352). Nothing is persisted.
   * @param {any} message @param {{ actorId: string }} actor
   */
  async function preview(message, actor) {
    const { projectId: p, buildingId: b } = message;
    if (!rate.admit(actor.actorId, p, b)) return errorReply('RATE_LIMITED', [b], 'PREVIEW rate above 20/s');
    const cmd = { ...message, actorId: actor.actorId };
    const head = await history.head(p, b);
    if (head === undefined) return errorReply('NOT_FOUND', [b], 'unknown building');
    const model = await history.readVersion(p, b, head);
    const outcome = await service.execute(model, { ...cmd, phase: 'COMMIT' });
    if (outcome.result.status !== 'COMMITTED') return replyOf(outcome.result);  // refusal or conflict: nothing stored
    const previewId = previews.nextId();
    previews.put({ actorId: actor.actorId, projectId: p, buildingId: b, baseVersion: head, command: cmd, outcome }, previewId);
    return replyOf(previewOf(outcome.result, head, previewId));
  }

  /**
   * COMMIT, with the stored PREVIEW when it names one. The preview is dropped once the commit decided on it.
   * @param {any} message @param {{ actorId: string }} actor
   */
  async function commit(message, actor) {
    if (message.previewId === undefined) return service.commit(message, actor);
    let used = false;
    /** @type {import('./commit.js').PreviewLookup} */
    const lookup = (c) => {
      const pv = previews.get(c.previewId);
      if (!pv || pv.actorId !== actor.actorId || pv.projectId !== c.projectId || pv.buildingId !== c.buildingId) {
        return { reply: errorReply('NOT_FOUND', [c.previewId], 'unknown or expired previewId') };
      }
      const differs = SAME_AS_PREVIEW.filter((f) => !isDeepStrictEqual(c[f], pv.command[f]));
      if (differs.length > 0) return { reply: errorReply('INVALID_PAYLOAD', [], `COMMIT differs from its PREVIEW in ${differs.join(', ')}`) };
      used = true;
      return { preview: pv };
    };
    const r = await service.commit(message, actor, lookup);
    if (used) previews.delete(message.previewId);
    return r;
  }

  return { command, commandBody, status, request: contracts.request, previewCount: previews.size };
}
