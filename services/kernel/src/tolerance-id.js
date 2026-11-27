// Tolerance profile identity by content (3D-135; D-473): `toleranceProfileId` = `sha256:` + lower-case hex SHA-256 of
// the canonical JSON of the profile. Canonical JSON: an object of exactly the tolerance members of the
// `tolerance-profile` contract (its `required` list, 14 members; `id` and any other member excluded), keys sorted by
// UTF-16 code units, no whitespace, numbers as ECMAScript `Number::toString` (`JSON.stringify`, the RFC 8785 number
// form: 1.0 -> `1`, 1e-9 -> `1e-9`), encoded as UTF-8. The label `id` never enters the id, so the same numbers under
// another or no label give the same id, and one changed number gives another id.
// Test vector (the D-13 default profile): see README "Tolerance profile id" and test/tolerance-id.test.js.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONTRACTS_DIR } from './contracts.js';

/** The tolerance members, from the contract (sorted): one list, no copy of the schema. */
export const TOLERANCE_MEMBERS = Object.freeze(
  /** @type {string[]} */ (JSON.parse(readFileSync(join(CONTRACTS_DIR, 'tolerance-profile.schema.json'), 'utf8')).required).slice().sort(),
);

/**
 * Canonical JSON of a tolerance profile. A member that is missing or not a finite number is a host defect (the
 * profile is not contract-valid) and throws, so no id is made from a partial profile.
 * @param {Record<string, unknown>} profile contract `tolerance-profile`
 * @returns {string}
 */
export function canonicalTolerances(profile) {
  const parts = TOLERANCE_MEMBERS.map((k) => {
    const v = profile?.[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`tolerance profile: member ${k} is not a finite number`);
    return `${JSON.stringify(k)}:${JSON.stringify(v)}`;
  });
  return `{${parts.join(',')}}`;
}

/**
 * The id of a tolerance profile by its content. @param {Record<string, unknown>} profile @returns {string} `sha256:<64 hex>`
 */
export const toleranceProfileId = (profile) =>
  `sha256:${createHash('sha256').update(canonicalTolerances(profile), 'utf8').digest('hex')}`;
