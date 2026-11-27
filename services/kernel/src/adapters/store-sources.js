// Store adapter of the `sources` port (3D-133, D-3D133-4): the import's source over the history's append-only object
// store (3D-ADR-0003, D-85), so it survives a restart. Nothing is overwritten or deleted (D-84):
// - `p/{p}/doc/{sha256}.json`: the parsed CityJSON document, content-addressed (buildings of one input file share it);
// - `p/{p}/b/{b}/source.json`: `{ document, saveRef, basis }` written once by the import (the import read's basis);
// - `p/{p}/b/{b}/saved/{n}.json`: `{ entityTag }` of the n-th `SAVED` export; the highest one is the next basis.
import { sha256 } from '../ports/datasets.js';
import { isObjectStore, keys, segment } from '../ports/history.js';

const encoder = new TextEncoder();

/** Key layout of this adapter (beside the 3D-ADR-0003 §2 keys of a building). */
export const sourceKeys = {
  document: (/** @type {string} */ p, /** @type {string} */ digest) => `p/${segment(p)}/doc/${digest}.json`,
  source: (/** @type {string} */ p, /** @type {string} */ b) => `${keys.building(p, b)}/source.json`,
  savedDir: (/** @type {string} */ p, /** @type {string} */ b) => `${keys.building(p, b)}/saved`,
  saved: (/** @type {string} */ p, /** @type {string} */ b, /** @type {number} */ n) => `${sourceKeys.savedDir(p, b)}/${n}.json`,
};

/** Concurrent `saved` calls of one building that may collide on a generation before one gives up. */
const SAVED_ATTEMPTS = 16;

/**
 * @param {import('../ports/history.js').ObjectStore} store
 * @returns {import('../ports/sources.js').SourcesPort}
 */
export function createStoreSources(store) {
  if (!isObjectStore(store)) throw new TypeError('sources: the store must implement create, get, list');

  /** @param {string} p @param {string} b @returns {Promise<number[]>} generations of `saved/`, ascending */
  const generations = async (p, b) => (await store.list(sourceKeys.savedDir(p, b)))
    .map((n) => /^(0|[1-9]\d*)\.json$/.exec(n)).filter((m) => m !== null)
    .map((m) => Number(/** @type {RegExpExecArray} */ (m)[1])).sort((x, y) => x - y);

  return {
    async source(p, b) {
      const s = await store.get(sourceKeys.source(p, b));
      if (s === undefined) return undefined;
      const cityjson = await store.get(sourceKeys.document(p, s.document));
      if (cityjson === undefined) throw new Error(`sources: document ${s.document} of ${b} is missing`);
      const g = await generations(p, b);
      const last = g.length > 0 ? await store.get(sourceKeys.saved(p, b, g[g.length - 1])) : undefined;
      const basis = last ? { kind: /** @type {const} */ ('tagged'), entityTag: last.entityTag } : s.basis;
      return { cityjson, saveRef: s.saveRef, basis };
    },
    async put(p, b, source) {
      if (await store.get(sourceKeys.source(p, b)) !== undefined) return false;
      const document = sha256(encoder.encode(JSON.stringify(source.cityjson)));
      await store.create(sourceKeys.document(p, document), source.cityjson);  // `false`: the same document is there
      return store.create(sourceKeys.source(p, b), { document, saveRef: source.saveRef, basis: source.basis });
    },
    async saved(p, b, entityTag) {
      if (await store.get(sourceKeys.source(p, b)) === undefined) throw new Error(`sources: no source of ${b}`);
      for (let i = 0; i < SAVED_ATTEMPTS; i += 1) {
        const g = await generations(p, b);
        const n = g.length > 0 ? g[g.length - 1] + 1 : 0;
        if (await store.create(sourceKeys.saved(p, b, n), { entityTag })) return;
      }
      throw new Error(`sources: could not record the save of ${b}`);
    },
  };
}
