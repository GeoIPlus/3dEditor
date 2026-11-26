// `datasets` port of the kernel service (3D-128; 3D-ADR-0003 §1, §4; D-35, D-82, D-83, D-85): the Operaflow side of the
// data. Reading the input CityJSON named by the document (with the strong entity tag of that read), saving to a
// `progress.save` `location` dataset (whole-body `PUT` + `If-Match`, OF `progress.md:26`), and putting / reading result
// bytes in the service's own store under a content-addressed key (OF `acceptance.md:17`, `:20`). Points are a separate
// port (ports/points.js). `createByteDatasets` (../datasets.js) builds the port over a byte store: file
// (adapters/file-datasets-store.js), memory (adapters/memory-datasets-store.js, tests). The crowdsource
// adapter of 3D-63 implements the same port and runs the same contract suite (test/datasets-contract.js).
// No operation deletes; `save` replaces a dataset's content only as a compare-and-swap on the entity tag, and an
// adapter keeps every earlier representation (D-84).
import { createHash } from 'node:crypto';
import { segment } from './history.js';

/**
 * @typedef {{ bytes: Uint8Array, entityTag: string }} DatasetRead
 *   `entityTag`: strong entity tag of this representation, quoted as in an HTTP `ETag` header (RFC 9110 §8.8.3)
 */

/**
 * @typedef {{ status: 'saved', entityTag: string } | { status: 'precondition-failed' }} SaveOutcome
 *   `precondition-failed`: the `If-Match` tag is not the dataset's current one (HTTP `412`); nothing was written
 */

/**
 * @typedef {object} DatasetsPort
 * @property {(ref: string) => Promise<DatasetRead | undefined>} read current bytes of dataset `ref` with their entity
 *   tag; `undefined` if the dataset does not exist
 * @property {(ref: string, bytes: Uint8Array, ifMatch: string) => Promise<SaveOutcome>} save whole-body `PUT` of
 *   `bytes` with `If-Match: ifMatch`. Of concurrent saves with the same `ifMatch` at most one is `saved`
 * @property {(p: string, bytes: Uint8Array) => Promise<{ digest: string, created: boolean }>} putDelivered write-once
 *   under the key of the bytes' digest (lower-case hex SHA-256); `created: false` when the digest is already stored
 *   (a no-op, the stored bytes are unchanged)
 * @property {(p: string, digest: string) => Promise<Uint8Array | undefined>} readDelivered the stored bytes, or
 *   `undefined`
 */

/** Operations of the port (start-up check of a host, adapter tests). */
export const DATASETS_OPERATIONS = Object.freeze(['read', 'save', 'putDelivered', 'readDelivered']);

/** @param {unknown} port @returns {port is DatasetsPort} */
export const isDatasetsPort = (port) => typeof port === 'object' && port !== null
  && DATASETS_OPERATIONS.every((k) => typeof /** @type {any} */ (port)[k] === 'function');

/** Lower-case hex SHA-256 of `bytes`. @param {Uint8Array} bytes */
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** @param {unknown} d @returns {d is string} */
export const isDigest = (d) => typeof d === 'string' && /^[0-9a-f]{64}$/.test(d);

/**
 * Entity tags of the interim adapters: generation `n` of a dataset and the digest of its bytes, quoted. A generation
 * number makes a tag unique even when a later save repeats earlier bytes.
 */
export const entityTag = {
  /** @param {number} n @param {string} digest */
  format: (n, digest) => `"${n}.${digest}"`,
  /** @param {unknown} tag @returns {{ n: number, digest: string } | undefined} */
  parse(tag) {
    const m = typeof tag === 'string' ? /^"(0|[1-9]\d{0,14})\.([0-9a-f]{64})"$/.exec(tag) : null;
    return m ? { n: Number(m[1]), digest: m[2] } : undefined;
  },
};

/** Key layout of the interim adapters (one segment per id, as in ports/history.js). */
export const datasetKeys = {
  generation: (/** @type {string} */ ref, /** @type {number} */ n) => `ds/${segment(ref)}/${n}.bin`,
  delivered: (/** @type {string} */ p, /** @type {string} */ digest) => {
    if (!isDigest(digest)) throw new TypeError(`datasets: invalid digest ${JSON.stringify(digest)}`);
    return `p/${segment(p)}/delivered/${digest}.bin`;
  },
};

/**
 * Append-only byte store: what the interim `datasets` adapters need from storage.
 * @typedef {object} ByteStore
 * @property {(key: string, bytes: Uint8Array) => Promise<boolean>} create create-if-absent; `false` when the key exists
 * @property {(key: string) => Promise<Uint8Array | undefined>} get
 */
