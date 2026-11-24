// solve (3D-13): a refused solve as the contract `error` object (contracts/model3d/error.schema.json; spec §2.4).
// `CONSTRAINT_CONFLICT` names the minimal conflicting constraint ids and their entities (spec §5 r2);
// `UNDERCONSTRAINED_GEOMETRY` names the faces and `details.missingDegreesOfFreedom` (spec §5 r5, D-171).

/** @typedef {import('./solve.js').SolveResult} SolveResult */

/**
 * Message keys follow the existing `model3d.error.<camelCaseCode>` examples of the contract; [A] the key for
 * `UNDERCONSTRAINED_GEOMETRY` is not listed in a source and follows that pattern.
 * @param {SolveResult} r a result with `status !== 'OK'`
 * @returns {{ code: string, httpStatus: 422, messageKey: string, entityIds: string[], details?: { missingDegreesOfFreedom: string[] } }}
 */
export function toSolveError(r) {
  if (r.status === 'CONSTRAINT_CONFLICT') {
    return {
      code: 'CONSTRAINT_CONFLICT',
      httpStatus: 422,
      messageKey: 'model3d.error.constraintConflict',
      entityIds: [...new Set([...r.conflictIds, ...r.entityIds])],
    };
  }
  if (r.status === 'UNDERCONSTRAINED_GEOMETRY') {
    return {
      code: 'UNDERCONSTRAINED_GEOMETRY',
      httpStatus: 422,
      messageKey: 'model3d.error.underconstrainedGeometry',
      entityIds: r.entityIds,
      details: { missingDegreesOfFreedom: r.missingDegreesOfFreedom },
    };
  }
  throw new Error('solve: toSolveError needs a refused result');
}
