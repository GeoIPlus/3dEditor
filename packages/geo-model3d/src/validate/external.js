// validate (3D-12): the external validator port of FINAL_VALIDATION (spec §8 API; 3D-ADR-0002 C1: the validator is a
// port supplied by the service, not code here). The real binding - val3dity in its own container, version pinned - is
// D-148 / 3D-ADR-0008, built by the row that follows 3D-23 (D-149). This file holds the port type and the map of
// val3dity error codes (val3dity docs `errors.rst`, 2.7.0) to contract codes.

/** @typedef {import('./context.js').RawIssue} RawIssue */
/** @typedef {[number, number, number]} P3 */

/**
 * One finding of the external validator, as the service adapter reports it.
 * @typedef {object} ExternalFinding
 * @property {string} externalValidatorCode the validator's own code, e.g. "203" (val3dity)
 * @property {string[]} [entityIds] kernel entity ids the adapter could resolve (from `sourceRef` of the export)
 * @property {P3} [location] local frame
 * @property {string} [suggestedFix]
 */

/**
 * The port. `validate` receives the model as the kernel holds it; the adapter exports it (3D-11) and runs the validator.
 * @typedef {object} ExternalValidatorPort
 * @property {(input: { model: import('../brep/types.js').BuildingModel, tolerances: object }) =>
 *   Promise<{ validatorVersion: string, findings: ExternalFinding[] }>} validate
 */

/**
 * val3dity code -> contract `ValidationCode`. (D-162): the spec maps nothing; each line reads the val3dity
 * meaning onto the nearest code. Codes without a counterpart (503 disconnected solids of a CompositeSolid, 7xx
 * IndoorGML, 9xx input / format) and unknown codes become EXPORT_SCHEMA_ERROR: the exported file fails the
 * independent check.
 * @type {Readonly<Record<string, string>>}
 */
export const VAL3DITY_CODES = Object.freeze({
  101: 'DEGENERATE_FACE', // TOO_FEW_POINTS
  102: 'DEGENERATE_EDGE', // CONSECUTIVE_POINTS_SAME
  103: 'OPEN_BOUNDARY', // RING_NOT_CLOSED
  104: 'SELF_INTERSECTION', // RING_SELF_INTERSECTION
  201: 'SELF_INTERSECTION', // INTERSECTION_RINGS
  202: 'SELF_INTERSECTION', // DUPLICATED_RINGS
  203: 'NON_PLANAR_FACE', // NON_PLANAR_POLYGON_DISTANCE_PLANE
  204: 'NON_PLANAR_FACE', // NON_PLANAR_POLYGON_NORMALS_DEVIATION
  205: 'SELF_INTERSECTION', // POLYGON_INTERIOR_DISCONNECTED
  206: 'SELF_INTERSECTION', // INNER_RING_OUTSIDE
  207: 'SELF_INTERSECTION', // INNER_RINGS_NESTED
  208: 'INCONSISTENT_RING_ORIENTATION', // ORIENTATION_RINGS_SAME
  300: 'NON_MANIFOLD_EDGE', // NOT_VALID_2_MANIFOLD
  301: 'SHELL_NOT_CLOSED', // TOO_FEW_POLYGONS
  302: 'SHELL_NOT_CLOSED', // SHELL_NOT_CLOSED
  303: 'NON_MANIFOLD_EDGE', // NON_MANIFOLD_CASE (edge or vertex; the report does not say which)
  305: 'SHELL_NOT_CLOSED', // MULTIPLE_CONNECTED_COMPONENTS
  306: 'SELF_INTERSECTION', // SHELL_SELF_INTERSECTION
  307: 'SHELL_ORIENTATION', // POLYGON_WRONG_ORIENTATION
  401: 'SELF_INTERSECTION', // INTERSECTION_SHELLS (outer and void shells of one solid)
  402: 'SELF_INTERSECTION', // DUPLICATED_SHELLS
  403: 'SELF_INTERSECTION', // INNER_SHELL_OUTSIDE
  404: 'SELF_INTERSECTION', // SOLID_INTERIOR_DISCONNECTED
  405: 'SHELL_ORIENTATION', // WRONG_ORIENTATION_SHELL
  501: 'SOLID_OVERLAP', // INTERSECTION_SOLIDS
  502: 'SOLID_OVERLAP', // DUPLICATED_SOLIDS
  601: 'SOLID_OVERLAP', // BUILDINGPARTS_OVERLAP
});

/** Contract code of an external finding without a counterpart in `VAL3DITY_CODES` [A]. */
export const EXTERNAL_FALLBACK_CODE = 'EXPORT_SCHEMA_ERROR';

/**
 * Map the port's findings to raw issues.
 * @param {ExternalFinding[]} findings
 * @returns {RawIssue[]}
 */
export function externalIssues(findings) {
  return findings.map((f) => {
    if (typeof f.externalValidatorCode !== 'string' || !f.externalValidatorCode) {
      throw new TypeError('external finding without externalValidatorCode');
    }
    /** @type {RawIssue} */
    const raw = {
      code: VAL3DITY_CODES[f.externalValidatorCode] ?? EXTERNAL_FALLBACK_CODE,
      entityIds: [...(f.entityIds ?? [])],
      externalValidatorCode: f.externalValidatorCode,
      detail: 'external validator',
    };
    if (f.location) raw.location = f.location;
    if (f.suggestedFix) raw.suggestedFix = f.suggestedFix;
    return raw;
  });
}
