// GT-13 (v0.3 §12; spec §11 r3, r4, §13; row 3D-23, D-68): repeated `commandId` -> one commit, the same reply; stale
// `expectedVersion` -> `409 VERSION_CONFLICT`. The fixture's three COMMIT steps run through the kernel service's
// COMMIT path on both interim stores (memory, file); the number of commits is counted in the journal.
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readFixture, serviceWith, validReply } from './commit-helpers.js';
import { createMemoryStore } from '../src/adapters/memory-store.js';
import { createFileStore } from '../src/adapters/file-store.js';

const ACTOR = { actorId: 'usr-operator' };
const STORES = {
  memory: async () => createMemoryStore(),
  file: async () => createFileStore({ root: await mkdtemp(join(tmpdir(), 'gt-13-')) }),
};

for (const [name, makeStore] of Object.entries(STORES)) {
  describe(`GT-13 idempotent commandId, stale expectedVersion (${name} store)`, () => {
    const model = readFixture('GT-13', 'input.model.json');
    const steps = readFixture('GT-13', 'steps.json');
    const expected = readFixture('GT-13', 'expected.json');
    const a = expected.assert;

    it('fixture: the same ALIGN_RIDGE twice, then another command on the old version', () => {
      expect(expected.owner.row).toBe('3D-23 (D-68)');
      expect(steps.map((/** @type {any} */ s) => [s.command.commandId, s.command.expectedVersion]))
        .toEqual([['cmd-gt-13-1', 1], ['cmd-gt-13-1', 1], ['cmd-gt-13-2', 1]]);
    });

    it('one commit, the same reply, 409 VERSION_CONFLICT', async () => {
      const { service, history } = await serviceWith(model, await makeStore());
      /** @type {{ httpStatus: number, body: any }[]} */
      const replies = [];
      for (const s of steps) replies.push(validReply(await service.commit(s.command, ACTOR)));
      const journal = await history.readJournal(model.projectId, model.buildingId);
      console.log(`GT-13 ${name}`, JSON.stringify({ commits: journal.length, statuses: replies.map((r) => r.httpStatus), code: replies[2].body.error?.code }));

      expect(replies[0].httpStatus).toBe(200);
      expect(replies[0].body.status).toBe('COMMITTED');
      expect(journal).toHaveLength(a.commits);
      expect(a.sameReply).toBe(true);
      expect(replies[1]).toEqual(replies[0]);
      expect(replies[2].httpStatus).toBe(a.httpStatus);
      expect(replies[2].body.status).toBe('CONFLICT');
      expect(replies[2].body.error.code).toBe(a.code);
      expect(await history.head(model.projectId, model.buildingId)).toBe(2);
      // the conflict is stored too: its repeat returns it and still changes nothing (spec §11 r3, v0.2 D.4)
      expect(await service.commit(steps[2].command, ACTOR)).toEqual(replies[2]);
      expect(await history.readJournal(model.projectId, model.buildingId)).toHaveLength(1);
    });
  });
}
