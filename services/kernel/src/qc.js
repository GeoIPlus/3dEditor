// QC rules of the kernel service (3D-24; spec §11 r2, r8; v0.3 §8.1): FINAL_VALIDATION of the head version as its own
// request, stored per version (D-451); approval of the head version as a mark on it (D-450), by a reviewer who
// authored no version after the baseline (separation of duties is enforced here: the Operaflow format has none);
// the building reads APPROVED while its head version has the mark, so any edit (a new version) resets it.
import { validateModel } from '@geoiplus/geo-model3d';
import { errorReply } from './errors.js';

/**
 * @typedef {object} QcDeps
 * @property {import('./ports/history.js').HistoryPort} history
 * @property {(projectId: string) => any} toleranceProfile
 * @property {() => string} clock
 * @property {{ validate: (input: { model: any, tolerances: object }) => Promise<{ validatorVersion: string, findings: any[] }> }} [externalValidator] FINAL_VALIDATION
 *   port (real adapter: 3D-74)
 */

/** `true` when the stored FINAL_VALIDATION report of a version passed for `VALID_SOLID`. @param {any} report */
export const passed = (report) => report?.isValidForTargetState === true && report?.targetState === 'VALID_SOLID';

/** @param {QcDeps} deps */
export function createQc(deps) {
  const { history } = deps;

  /** The model at `n` with its QC state (APPROVED when version `n` has an approval). @param {string} p @param {string} b @param {number} n */
  async function modelAt(p, b, n) {
    const model = await history.readVersion(p, b, n);
    if (model === undefined) return undefined;
    return (await history.readApproval(p, b, n)) ? { ...model, state: 'APPROVED' } : model;
  }

  /**
   * FINAL_VALIDATION of the head version for target `VALID_SOLID`; a version keeps its first report (a repeat returns it,
   * the validator is not called again). A validator failure throws: nothing is stored.
   * @param {string} p @param {string} b @returns {Promise<import('./commit.js').Reply>}
   */
  async function finalValidation(p, b) {
    const n = await history.head(p, b);
    if (n === undefined) return errorReply('NOT_FOUND', [b], 'unknown building');
    const stored = await history.readFinalValidation(p, b, n);
    if (stored !== undefined) return { httpStatus: 200, body: stored };
    if (!deps.externalValidator) return errorReply('UNAVAILABLE', [b], 'no external validator configured');
    const model = await history.readVersion(p, b, n);
    const report = await validateModel(model, { mode: 'FINAL_VALIDATION', targetState: 'VALID_SOLID', fullSolid: true,
      tolerances: deps.toleranceProfile(p), clock: deps.clock, externalValidator: deps.externalValidator });
    return { httpStatus: 200, body: await history.putFinalValidation(p, b, n, report) };
  }

  /**
   * Approval of the head version (spec §11 r8). Role and lease are checked by the caller.
   * @param {{ actorId: string }} user @param {string} p @param {string} b @param {{ expectedVersion: number }} request
   * @returns {Promise<import('./commit.js').Reply>}
   */
  async function approve(user, p, b, request) {
    const n = await history.head(p, b);
    if (n === undefined) return errorReply('NOT_FOUND', [b], 'unknown building');
    if (request.expectedVersion !== n) return errorReply('VERSION_CONFLICT', [b], `head is version ${n}`);
    const journal = await history.readJournal(p, b);
    if (journal.some((e) => e.actorId === user.actorId)) {
      return errorReply('FORBIDDEN', [b], 'the reviewer is an author of a version after the baseline');
    }
    const held = await history.readApproval(p, b, n);
    if (held !== undefined) return { httpStatus: 200, body: held };
    const model = await history.readVersion(p, b, n);
    if (model.state !== 'VALID_SOLID') return errorReply('NOT_APPROVABLE', [b], `state ${model.state}`, { approvalReason: 'NOT_VALID_SOLID' });
    if (!passed(await history.readFinalValidation(p, b, n))) {
      return errorReply('NOT_APPROVABLE', [b], 'no passed FINAL_VALIDATION of the head version', { approvalReason: 'NO_FINAL_VALIDATION' });
    }
    const approval = { projectId: p, buildingId: b, modelVersion: n, actorId: user.actorId, timestamp: deps.clock() };
    return { httpStatus: 200, body: await history.putApproval(p, b, n, approval) };
  }

  return { modelAt, finalValidation, approve };
}
