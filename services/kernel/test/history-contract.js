// Port contract suite of `history` (3D-23; 3D-ADR-0003 "Checks"): one suite, run against every object store adapter
// (memory, file; S3 in 3D-111, the crowdsource-era store never - D-82). `makeStore()` returns a fresh, empty store.
import { describe, expect, it } from 'vitest';
import { createHistory } from '../src/history.js';
import { isHistoryPort, keys } from '../src/ports/history.js';

const P = 'prj-c', B = 'bld/1 é';  // a building id with `/` and a non-ASCII letter: one key segment (Q-26)

/** @param {number} v */
const model = (v, tag = 'm') => ({ projectId: P, buildingId: B, version: v, state: 'VALID_SOLID', tag });
/** @param {string} commandId @param {number} before */
const entry = (commandId, before) => ({
  operationId: `op-${commandId}`, commandId, beforeVersion: before, afterVersion: before + 1, actorId: 'usr-a',
  timestamp: '2026-11-26T00:00:00Z', input: { commandId }, affectedEntityIds: [], forwardPatch: { added: [], updated: [], deleted: [], affectedMetrics: [] },
  inversePatch: { added: [], updated: [], deleted: [], affectedMetrics: [] }, validationSummary: { modelVersion: before + 1 },
  topologyLineage: { mapped: {}, deleted: [], preserved: [] }, warnings: [],
});

/**
 * @param {string} name
 * @param {() => Promise<import('../src/ports/history.js').ObjectStore> | import('../src/ports/history.js').ObjectStore} makeStore
 */
export function historyContract(name, makeStore) {
  describe(`history port contract: ${name}`, () => {
    const fresh = async () => {
      const store = await makeStore();
      const h = createHistory(store);
      expect(await h.putBaseline(P, B, model(1, 'base'))).toBe(true);
      return { store, h };
    };

    it('implements the port; an unknown building has no head, version or journal', async () => {
      const h = createHistory(await makeStore());
      expect(isHistoryPort(h)).toBe(true);
      expect(await h.head(P, B)).toBeUndefined();
      expect(await h.readVersion(P, B, 1)).toBeUndefined();
      expect(await h.readJournal(P, B)).toEqual([]);
    });

    it('putBaseline twice -> conflict, the first baseline stays (S1)', async () => {
      const { h } = await fresh();
      expect(await h.putBaseline(P, B, model(1, 'other'))).toBe(false);
      expect((await h.readBaseline(P, B)).tag).toBe('base');
      expect(await h.head(P, B)).toBe(1);
      expect((await h.readVersion(P, B, 1)).tag).toBe('base');
    });

    it('commit makes version N+1: head, readVersion (snapshot), readJournal, findCommand', async () => {
      const { h } = await fresh();
      expect((await h.commit(P, B, entry('c1', 1), model(2, 'v2'))).status).toBe('committed');
      expect((await h.commit(P, B, entry('c2', 2), model(3, 'v3'))).status).toBe('committed');
      expect(await h.head(P, B)).toBe(3);
      expect((await h.readVersion(P, B, 2)).tag).toBe('v2');
      expect(await h.readVersion(P, B, 4)).toBeUndefined();
      expect((await h.readJournal(P, B)).map((e) => e.commandId)).toEqual(['c1', 'c2']);
      expect((await h.readJournal(P, B, 3)).map((e) => e.commandId)).toEqual(['c2']);
      const r = await h.findCommand(P, 'c1');
      expect(r).toMatchObject({ commandId: 'c1', status: 'COMMITTED', modelVersion: 2 });
    });

    it('two concurrent commits on version N: exactly one succeeds, the other is a conflict', async () => {
      const { h } = await fresh();
      const outs = await Promise.all([h.commit(P, B, entry('ca', 1), model(2, 'a')), h.commit(P, B, entry('cb', 1), model(2, 'b'))]);
      expect(outs.map((o) => o.status).sort()).toEqual(['committed', 'conflict']);
      const won = outs.find((o) => o.status === 'committed');
      expect((await h.readJournal(P, B)).map((e) => e.commandId)).toEqual([won?.entry.commandId]);
      expect((await h.readVersion(P, B, 2)).tag).toBe(won?.entry.commandId === 'ca' ? 'a' : 'b');
      expect(outs.find((o) => o.status === 'conflict')?.entry.commandId).toBe(won?.entry.commandId);
    });

    it('a repeat with the same commandId -> repeat, one journal entry (GT-13)', async () => {
      const { h } = await fresh();
      await h.commit(P, B, entry('c1', 1), model(2));
      const again = await h.commit(P, B, { ...entry('c1', 1), operationId: 'op-other' }, model(2));
      expect(again.status).toBe('repeat');
      expect(again.entry.operationId).toBe('op-c1');
      expect(await h.readJournal(P, B)).toHaveLength(1);
    });

    it('crash after the journal write and before cmd/: the repeat is still idempotent', async () => {
      const store = await makeStore();
      let fail = true;
      const crashing = { ...store, create: async (/** @type {string} */ k, /** @type {unknown} */ v) => {
        if (fail && k === keys.command(P, 'c1')) { fail = false; throw new Error('injected crash'); }
        return store.create(k, v);
      } };
      const h = createHistory(crashing);
      await h.putBaseline(P, B, model(1));
      await expect(h.commit(P, B, entry('c1', 1), model(2))).rejects.toThrow('injected crash');
      expect(await h.findCommand(P, 'c1')).toBeUndefined();  // no record, no hint
      const found = await h.findCommand(P, 'c1', { buildingId: B, expectedVersion: 1 });
      expect(found).toMatchObject({ commandId: 'c1', status: 'COMMITTED', modelVersion: 2 });
      expect(await h.findCommand(P, 'c1')).toEqual(found);   // record repaired
      expect(await h.findCommand(P, 'other', { buildingId: B, expectedVersion: 1 })).toBeUndefined();
      expect(await h.readJournal(P, B)).toHaveLength(1);
    });

    it('recordResult stores a result that changed nothing; a second record keeps the first', async () => {
      const { h } = await fresh();
      const r = { commandId: 'cr', status: 'REJECTED', modelVersion: 1, error: { code: 'INVALID_PAYLOAD' } };
      expect(await h.recordResult(P, B, 'cr', r)).toEqual(r);
      expect(await h.recordResult(P, B, 'cr', { ...r, status: 'CONFLICT' })).toEqual(r);
      expect(await h.findCommand(P, 'cr')).toEqual(r);
      expect(await h.head(P, B)).toBe(1);
    });

    it('QC records (3D-24): one FINAL_VALIDATION report and one approval per version, the first kept', async () => {
      const { h } = await fresh();
      expect(await h.readFinalValidation(P, B, 1)).toBeUndefined();
      expect(await h.readApproval(P, B, 1)).toBeUndefined();
      expect(await h.putFinalValidation(P, B, 1, { tag: 'fv-1' })).toEqual({ tag: 'fv-1' });
      expect(await h.putFinalValidation(P, B, 1, { tag: 'fv-2' })).toEqual({ tag: 'fv-1' });
      expect(await h.putApproval(P, B, 1, { actorId: 'r1' })).toEqual({ actorId: 'r1' });
      expect(await h.putApproval(P, B, 1, { actorId: 'r2' })).toEqual({ actorId: 'r1' });
      expect(await h.readApproval(P, B, 1)).toEqual({ actorId: 'r1' });
      expect(await h.readApproval(P, B, 2)).toBeUndefined();
      expect(await h.head(P, B)).toBe(1); // a QC record makes no version (D-450)
    });

    it('the store never overwrites: create of an existing key is false and keeps the value', async () => {
      const store = await makeStore();
      expect(await store.create('a/b.json', { v: 1 })).toBe(true);
      expect(await store.create('a/b.json', { v: 2 })).toBe(false);
      expect(await store.get('a/b.json')).toEqual({ v: 1 });
      expect(await store.list('a')).toEqual(['b.json']);
      expect(await store.list('none')).toEqual([]);
      const results = await Promise.all(Array.from({ length: 8 }, (_, i) => store.create('race.json', { i })));
      expect(results.filter(Boolean)).toHaveLength(1);
    });
  });
}
