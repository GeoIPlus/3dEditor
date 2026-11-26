// `datasets` port over an append-only byte store (3D-128; 3D-ADR-0003 §4): the interim adapters (file, memory) are byte
// stores; this module gives them the port's semantics, so `save` is a compare-and-swap whose only write is a create.
import { datasetKeys, entityTag, isDigest, sha256 } from './ports/datasets.js';

/**
 * The port over an append-only byte store. Dataset `ref` holds generations `0, 1, ...`; the current one is the highest.
 * `save(ref, bytes, tag)` checks that `tag` names generation `n` with its digest and is the newest, then creates
 * generation `n + 1` if absent: a compare-and-swap whose only write is a create (no overwrite, D-84).
 * @param {import('./ports/datasets.js').ByteStore} store
 * @returns {import('./ports/datasets.js').DatasetsPort & { createDataset: (ref: string, bytes: Uint8Array) => Promise<boolean> }} `createDataset`:
 *   stands a dataset up (generation 0) for development and tests; it is the DP's act, not a port operation
 */
export function createByteDatasets(store) {
  /** @param {string} ref @returns {Promise<{ n: number, bytes: Uint8Array } | undefined>} */
  async function current(ref) {
    let bytes = await store.get(datasetKeys.generation(ref, 0));
    if (bytes === undefined) return undefined;
    let n = 0;
    for (;;) {
      const next = await store.get(datasetKeys.generation(ref, n + 1));
      if (next === undefined) return { n, bytes };
      n += 1;
      bytes = next;
    }
  }

  return {
    createDataset: (ref, bytes) => store.create(datasetKeys.generation(ref, 0), bytes),
    async read(ref) {
      const c = await current(ref);
      return c && { bytes: c.bytes, entityTag: entityTag.format(c.n, sha256(c.bytes)) };
    },
    async save(ref, bytes, ifMatch) {
      const t = entityTag.parse(ifMatch);
      if (!t) return { status: 'precondition-failed' };
      const at = await store.get(datasetKeys.generation(ref, t.n));
      if (at === undefined || sha256(at) !== t.digest) return { status: 'precondition-failed' };
      if (!(await store.create(datasetKeys.generation(ref, t.n + 1), bytes))) return { status: 'precondition-failed' };
      return { status: 'saved', entityTag: entityTag.format(t.n + 1, sha256(bytes)) };
    },
    async putDelivered(p, bytes) {
      const digest = sha256(bytes);
      return { digest, created: await store.create(datasetKeys.delivered(p, digest), bytes) };
    },
    readDelivered: (p, digest) => (isDigest(digest) ? store.get(datasetKeys.delivered(p, digest)) : Promise.resolve(undefined)),
  };
}
