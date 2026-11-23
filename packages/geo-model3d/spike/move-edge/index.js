// 3D-08 latency spike (throwaway, server-only, P4): kernel side of a MOVE_EDGE PREVIEW. Not in package.json
// "exports"; 3D-09 / 3D-13 / 3D-15 rebuild the kernel from the spec and the accepted ADRs, they do not import this.
// Imports the canary so that any bundle that reaches this file carries the P4 marker (3D-ADR-0001).
import '../../src/canary.js';
import { fastPreview } from './checks.js';
import { moveEdge } from './move-edge.js';
import { buildIndex } from './topology.js';

export { solvePlane, derive } from './planes.js';

const HTTP = { INVALID_PAYLOAD: 400, CONSTRAINT_CONFLICT: 422, UNDERCONSTRAINED_GEOMETRY: 422, INVALID_GEOMETRY: 422 };
/** @param {string} code */
const messageKey = (code) => `model3d.error.${code.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase())}`;

/**
 * PREVIEW of a MOVE_EDGE command on a model: candidate, FAST_PREVIEW, `command-result` object (contracts/model3d).
 * Pure: clock and preview id are injected (3D-ADR-0002 C1: no clock or randomness in the kernel).
 * @param {any} model canonical BuildingModel of `command.expectedVersion` (not modified)
 * @param {any} command `command` with `operation: MOVE_EDGE`, `phase: PREVIEW`
 * @param {import('./move-edge.js').Tol} tol
 * @param {{ now: string, previewId: string }} ctx
 * @returns {any} a `command-result` object (validated against the schema by the bench service and the tests)
 */
export function previewMoveEdge(model, command, tol, ctx) {
  const idx = buildIndex(model);
  const targetState = command.targetState ?? model.state;
  const base = { commandId: command.commandId, modelVersion: model.version, warnings: [] };
  /** @param {any[]} issues */
  const report = (issues) => ({
    modelVersion: model.version, targetState, isValidForTargetState: false, // [A] FAST_PREVIEW never confirms (spec §8 r1)
    issues, validatorVersion: 'geo-model3d spike 3D-08', createdAt: ctx.now,
  });
  /** @param {{ code: string, entityIds: string[] }} r */
  const reject = (r) => ({
    ...base, status: 'REJECTED', validation: report([]),
    error: { code: r.code, httpStatus: /** @type {Record<string, number>} */ (HTTP)[r.code], messageKey: messageKey(r.code), entityIds: r.entityIds },
  });
  const res = moveEdge(model, idx, command.payload, tol);
  if (!res.ok) return reject(res.refusal);
  const cand = res.candidate;
  const issues = fastPreview(model, idx, cand, tol, targetState);
  const errors = issues.filter((i) => i.severity === 'ERROR');
  // Spec §10.4 rule 8: any failed check is a refusal, model unchanged. [A] code INVALID_GEOMETRY (op row decides).
  if (errors.length) return { ...reject({ code: 'INVALID_GEOMETRY', entityIds: [...new Set(errors.flatMap((i) => i.entityIds))] }), validation: report(issues) };
  const updated = [
    ...[...cand.planes].map(([id, supportPlane]) => ({ type: 'Face', entity: { ...model.faces[id], supportPlane } })),
    ...[...cand.vertices].map(([id, p]) => ({ type: 'Vtx', entity: { ...model.vertices[id], p, positionMode: 'DERIVED' } })),
  ];
  return {
    ...base, status: 'PREVIEW', previewId: ctx.previewId,
    patch: { added: [], updated, deleted: [], affectedMetrics: [] }, // affectedMetrics names: TBD (Q-31)
    topologyLineage: { mapped: {}, deleted: [], preserved: updated.map((u) => u.entity.id) },
    validation: report(issues),
  };
}
