// `validate` module of geo-model3d (3D-12; spec §8): progressive validation (K-07) and severity by state. Imports only
// `brep` (3D-ADR-0002 C1 rule 2); no I/O - the clock and the external validator are injected (C1 rule 1).
import { runChecks, MODES } from './modes.js';
import { toIssues, buildReport, VALIDATOR_VERSION } from './report.js';
import { externalIssues } from './external.js';
import { newIssues } from './lineage.js';
import { CODE_TABLE, column } from './codes.js';

export { runChecks, MODES, readTolerances } from './modes.js';
export { CODE_TABLE, CODES, severityOf, scopeOf, column } from './codes.js';
export { toIssues, buildReport, messageKey, VALIDATOR_VERSION } from './report.js';
export { newIssues, newIssueFlags, successors } from './lineage.js';
export { VAL3DITY_CODES, externalIssues } from './external.js';
export { TOPOLOGY_KIND_CODE } from './structure.js';

/** @typedef {import('./context.js').RawIssue} RawIssue */
/** @typedef {import('./report.js').ValidationIssue} ValidationIssue */
/** @typedef {import('./external.js').ExternalValidatorPort} ExternalValidatorPort */

/**
 * A finding of another kernel module (solve, crs, export, cloud, import) handed to validation (D-3D12-4).
 * @typedef {object} Finding
 * @property {string} code contract `ValidationCode`
 * @property {string[]} entityIds
 * @property {[number, number, number]} [location]
 * @property {string} [suggestedFix]
 */

/**
 * @typedef {object} ValidateOptions
 * @property {'FAST_PREVIEW' | 'COMMIT_VALIDATION' | 'FINAL_VALIDATION'} mode
 * @property {string} targetState contract `ModelState`
 * @property {import('./context.js').ValidateTolerances} tolerances contract `tolerance-profile` (extra fields ignored)
 * @property {() => string} clock injected clock, RFC 3339 (spec §1.2)
 * @property {string[]} [affectedEntityIds]
 * @property {boolean} [fullSolid]
 * @property {Finding[]} [findings]
 * @property {ExternalValidatorPort} [externalValidator] required in FINAL_VALIDATION
 */

/** @param {Finding[] | undefined} findings @returns {RawIssue[]} */
function foreign(findings) {
  return (findings ?? []).map((f) => {
    if (!CODE_TABLE[f.code]) throw new RangeError(`unknown validation code ${f.code}`);
    /** @type {RawIssue} */
    const raw = { code: f.code, entityIds: [...f.entityIds] };
    if (f.location) raw.location = f.location;
    if (f.suggestedFix) raw.suggestedFix = f.suggestedFix;
    return raw;
  });
}

/**
 * Validate a model for a target state; contract `validation-report` out.
 * @param {import('../brep/types.js').BuildingModel} model
 * @param {ValidateOptions} opts
 * @returns {Promise<import('./report.js').ValidationReport>} contract `ValidationReport`
 */
export async function validateModel(model, opts) {
  if (typeof opts?.clock !== 'function') throw new TypeError('validateModel needs an injected clock');
  column(opts.targetState); // throws on an unknown state
  const raw = [...runChecks(model, opts), ...foreign(opts.findings)];
  let validatorVersion = VALIDATOR_VERSION;
  if (opts.mode === 'FINAL_VALIDATION') {
    const port = opts.externalValidator;
    if (!port || typeof port.validate !== 'function') throw new TypeError('FINAL_VALIDATION needs an external validator port');
    const ext = await port.validate({ model, tolerances: opts.tolerances });
    if (typeof ext?.validatorVersion !== 'string' || !ext.validatorVersion) throw new TypeError('external validator gave no version');
    raw.push(...externalIssues(ext.findings ?? []));
    validatorVersion = `${VALIDATOR_VERSION}+${ext.validatorVersion}`;
  }
  return buildReport({
    modelVersion: model.version,
    targetState: opts.targetState,
    issues: toIssues(raw, opts.targetState),
    confirms: opts.mode !== 'FAST_PREVIEW' && MODES.includes(opts.mode),
    validatorVersion,
    createdAt: opts.clock(),
  });
}

/**
 * Commit gate (spec §8 rule 7): the ERROR issues of `current` that are new against `previous` through the lineage.
 * A `VALID_SOLID` commit with any of them is refused; for a draft target the caller only reports them.
 * @param {ValidationIssue[]} previous issues of the previous version
 * @param {ValidationIssue[]} current issues of the candidate version (severities for the target state)
 * @param {import('./lineage.js').TopologyLineage} lineage
 * @returns {ValidationIssue[]}
 */
export function newErrors(previous, current, lineage) {
  return newIssues(previous, current.filter((i) => i.severity === 'ERROR'), lineage);
}
