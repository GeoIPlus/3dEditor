// Results of the export action through the `datasets` port (3D-128; 3D-ADR-0003 §4, Operaflow groups C and D-bytes;
// D-51, D-83). The export gate and the action itself are 3D-24's; this module is what they call.
// - Save (C): whole-body `PUT` to a `progress.save` `location` dataset with `If-Match` = the stored entity tag of the
//   import read (OF `progress.md:26`). No stored tag -> nothing is sent, the operator is told (`:31`). `412` -> the
//   result is kept (bytes in the own store), the operator is told, nothing is overwritten (`:42`).
// - Deliver (D, bytes): write-once under the bytes' digest; the address is `https`, carries no secret, no query string,
//   no credential and no fragment (OF `acceptance.md:17`, 3D-ADR-0003 §4: no pre-signed URLs). Read access is by the
//   caller's bearer token at the serving route (3D-24).
import { isDigest } from './ports/datasets.js';
import { segment } from './ports/history.js';

/**
 * Outcome of `saveResult`; `reason` is the code the client shows to the operator (`NOT_SAVED`, `KEPT`).
 * @typedef {{ status: 'SAVED', entityTag: string }
 *   | { status: 'NOT_SAVED', reason: 'NO_ENTITY_TAG' }
 *   | { status: 'KEPT', reason: 'PRECONDITION_FAILED', digest: string }} SaveResult
 */

/**
 * Saves `bytes` to dataset `ref`. `entityTag` is the tag stored at the import read; without it no `PUT` is sent.
 * @param {{ datasets: import('./ports/datasets.js').DatasetsPort, projectId: string, ref: string, bytes: Uint8Array,
 *   entityTag?: string | null }} args
 * @returns {Promise<SaveResult>}
 */
export async function saveResult({ datasets, projectId, ref, bytes, entityTag }) {
  if (typeof entityTag !== 'string' || entityTag.length === 0) return { status: 'NOT_SAVED', reason: 'NO_ENTITY_TAG' };
  const out = await datasets.save(ref, bytes, entityTag);
  if (out.status === 'saved') return { status: 'SAVED', entityTag: out.entityTag };
  const { digest } = await datasets.putDelivered(projectId, bytes);
  return { status: 'KEPT', reason: 'PRECONDITION_FAILED', digest };
}

/**
 * Puts the result bytes in the own store and returns their address. A second delivery of the same bytes is a no-op
 * (`created: false`, same digest and address).
 * @param {{ datasets: import('./ports/datasets.js').DatasetsPort, publicBase: string, projectId: string,
 *   bytes: Uint8Array }} args
 */
export async function deliverResult({ datasets, publicBase, projectId, bytes }) {
  const { digest, created } = await datasets.putDelivered(projectId, bytes);
  return { digest, created, address: deliveredAddress(publicBase, projectId, digest) };
}

/**
 * `https` address of delivered bytes: `{publicBase}/api/projects/{projectId}/results/{digest}` (route path of this
 * service, served by 3D-24). `publicBase` must be an `https` origin with an optional path and nothing else.
 * @param {string} publicBase @param {string} projectId @param {string} digest
 */
export function deliveredAddress(publicBase, projectId, digest) {
  if (!isDigest(digest)) throw new TypeError(`results: invalid digest ${JSON.stringify(digest)}`);
  const base = checkPublicBase(publicBase);
  const path = `${base.pathname.replace(/\/+$/, '')}/api/projects/${segment(projectId)}/results/${digest}`;
  return `${base.origin}${path}`;
}

/** @param {string} publicBase */
function checkPublicBase(publicBase) {
  let u;
  try {
    u = new URL(publicBase);
  } catch {
    throw new TypeError(`results: publicBase is not a URL: ${JSON.stringify(publicBase)}`);
  }
  if (u.protocol !== 'https:') throw new TypeError('results: publicBase must be https');
  if (u.username || u.password) throw new TypeError('results: publicBase must not carry a credential');
  if (u.search || u.hash || publicBase.includes('?') || publicBase.includes('#')) throw new TypeError('results: publicBase must not carry a query or fragment');
  return u;
}
