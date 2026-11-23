// validate (3D-12): raw issues -> contract `ValidationIssue` / `ValidationReport` (v0.2 B.5; spec §8). Scope and
// severity come only from codes.js; issues are de-duplicated and sorted so a report is deterministic for a given input.
import { CODES, scopeOf, severityOf } from './codes.js';
import { unsign0 } from '../brep/index.js';

/** @typedef {import('./context.js').RawIssue} RawIssue */
/**
 * @typedef {object} ValidationIssue contract `validation-report` `$defs/ValidationIssue`
 * @property {string} code
 * @property {string} scope
 * @property {string} severity
 * @property {string[]} entityIds
 * @property {[number, number, number]} [location]
 * @property {string} message
 * @property {string} [externalValidatorCode]
 * @property {string} [suggestedFix]
 */

/**
 * @typedef {object} ValidationReport contract `validation-report`
 * @property {number} modelVersion
 * @property {string} targetState
 * @property {boolean} isValidForTargetState
 * @property {ValidationIssue[]} issues
 * @property {string} validatorVersion
 * @property {string} createdAt
 */

/** Version of this validator in reports [A] (format not specified; bumped when a check changes its results). */
export const VALIDATOR_VERSION = 'geo-model3d-validate/1';

/**
 * Localisation key of a code (D-91: error texts are keys). [A] Prefix `model3d.validation.` after the error keys of the
 * contract examples (`model3d.error.<camelCase>`).
 * @param {string} code @returns {string}
 */
export const messageKey = (code) => `model3d.validation.${code.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase())}`;

const ORDER = new Map(CODES.map((c, i) => [c, i]));

/**
 * @param {RawIssue[]} raw
 * @param {string} targetState
 * @returns {ValidationIssue[]}
 */
export function toIssues(raw, targetState) {
  /** @type {Map<string, ValidationIssue>} */
  const byKey = new Map();
  for (const r of raw) {
    const entityIds = [...new Set(r.entityIds)];
    const key = `${r.code}|${[...entityIds].sort().join(',')}|${r.externalValidatorCode ?? ''}`;
    if (byKey.has(key)) continue;
    /** @type {ValidationIssue} */
    const issue = { code: r.code, scope: scopeOf(r.code), severity: severityOf(r.code, targetState), entityIds, message: messageKey(r.code) };
    if (r.location) issue.location = [unsign0(r.location[0]), unsign0(r.location[1]), unsign0(r.location[2])];
    if (r.externalValidatorCode) issue.externalValidatorCode = r.externalValidatorCode;
    if (r.suggestedFix) issue.suggestedFix = r.suggestedFix;
    byKey.set(key, issue);
  }
  return [...byKey.entries()]
    .sort(([ka, a], [kb, b]) => (/** @type {number} */ (ORDER.get(a.code)) - /** @type {number} */ (ORDER.get(b.code))) || (ka < kb ? -1 : ka > kb ? 1 : 0))
    .map(([, v]) => v);
}

/**
 * @param {object} p
 * @param {number} p.modelVersion
 * @param {string} p.targetState
 * @param {ValidationIssue[]} p.issues
 * @param {boolean} p.confirms false in FAST_PREVIEW: it never confirms a valid solid (spec §8 rule 1)
 * @param {string} p.validatorVersion
 * @param {string} p.createdAt
 * @returns {ValidationReport}
 */
export function buildReport({ modelVersion, targetState, issues, confirms, validatorVersion, createdAt }) {
  return {
    modelVersion,
    targetState,
    isValidForTargetState: confirms && !issues.some((i) => i.severity === 'ERROR'),
    issues,
    validatorVersion,
    createdAt,
  };
}
