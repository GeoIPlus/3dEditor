// `sources` port adapters (3D-133, D-3D133-4): the same behaviour of the store and the memory adapter - `put` is
// create-if-absent, `saved` makes the next basis `tagged`, a source keeps its document; the store adapter writes
// nothing twice (D-84) and keeps one document for buildings of one input file.
import { describe, expect, it } from 'vitest';
import { createMemoryStore } from '../src/adapters/memory-store.js';
import { createMemorySources } from '../src/adapters/memory-sources.js';
import { createStoreSources, sourceKeys } from '../src/adapters/store-sources.js';
import { isSourcesPort } from '../src/ports/sources.js';

const DOC = { type: 'CityJSON', version: '2.0', CityObjects: { a: {}, b: {} }, vertices: [] };
const SRC = { cityjson: DOC, saveRef: 'save-a', basis: /** @type {const} */ ({ kind: 'absent' }) };

for (const [name, make] of /** @type {const} */ ([['store', () => createStoreSources(createMemoryStore())], ['memory', createMemorySources]])) {
  describe(`sources port: ${name} adapter`, () => {
    it('put is create-if-absent; source reads it back; unknown -> undefined', async () => {
      const s = make();
      expect(isSourcesPort(s)).toBe(true);
      expect(await s.source('p', 'a')).toBeUndefined();
      expect(await s.put('p', 'a', SRC)).toBe(true);
      expect(await s.put('p', 'a', { ...SRC, saveRef: 'other', basis: { kind: 'untagged' } })).toBe(false);
      expect(await s.source('p', 'a')).toEqual(SRC);
      expect(await s.source('q', 'a')).toBeUndefined();
    });

    it('saved makes the next basis the last saved tag; saved without a source throws', async () => {
      const s = make();
      await s.put('p', 'a', { ...SRC, basis: { kind: 'tagged', entityTag: '"t0"' } });
      await s.saved('p', 'a', '"t1"');
      await s.saved('p', 'a', '"t2"');
      expect((await s.source('p', 'a'))?.basis).toEqual({ kind: 'tagged', entityTag: '"t2"' });
      await expect(s.saved('p', 'x', '"t1"')).rejects.toThrow();
    });
  });
}

describe('store adapter keys', () => {
  it('one document for two buildings of one file; saves are new generations, nothing overwritten', async () => {
    const store = createMemoryStore();
    const s = createStoreSources(store);
    await s.put('p', 'a', SRC);
    await s.put('p', 'b', { ...SRC, saveRef: 'save-b' });
    expect(store.size()).toBe(3);
    await s.saved('p', 'a', '"t1"');
    await s.saved('p', 'a', '"t2"');
    expect(await store.get(sourceKeys.saved('p', 'a', 0))).toEqual({ entityTag: '"t1"' });
    expect(await store.get(sourceKeys.saved('p', 'a', 1))).toEqual({ entityTag: '"t2"' });
    expect((await s.source('p', 'b'))?.basis).toEqual({ kind: 'absent' });
    expect(() => createStoreSources(/** @type {any} */ ({}))).toThrow(TypeError);
  });
});
