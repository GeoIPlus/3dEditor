// GT-22 (v0.3 §12; spec §11 r2, r8, §13; row 3D-24): two users - the operator edits, then tries to set APPROVED ->
// `403 FORBIDDEN`; a reviewer who authored no version approves (after FINAL_VALIDATION, D-3D24-2); a later edit resets
// the status (the approval is a mark on its version, D-3D24-1). Runs through the handler on both interim stores.
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readFixture } from './commit-helpers.js';
import { get, headers, json, post } from './handler-helpers.js';
import { approve, bUrl, finalValidation, lease, qcHandler } from './qc-helpers.js';
import { createMemoryStore } from '../src/adapters/memory-store.js';
import { createFileStore } from '../src/adapters/file-store.js';

const STORES = {
  memory: async () => createMemoryStore(),
  file: async () => createFileStore({ root: await mkdtemp(join(tmpdir(), 'gt-22-')) }),
};
const TOKEN = { 'usr-operator': 'tok-op', 'usr-reviewer': 'tok-qa' };

for (const [name, makeStore] of Object.entries(STORES)) {
  describe(`GT-22 operator cannot approve, non-author reviewer can, a later edit resets (${name} store)`, () => {
    const model = readFixture('GT-22', 'input.model.json');
    const steps = readFixture('GT-22', 'steps.json');
    const context = readFixture('GT-22', 'input.context.json');
    const a = readFixture('GT-22', 'expected.json').assert;
    const p = model.projectId;
    const b = model.buildingId;

    it('fixture: edit, operator approve, FINAL_VALIDATION, reviewer approve, edit', () => {
      expect(steps.map((/** @type {any} */ s) => s.step === 'COMMAND' ? s.command.operation : `${s.name}:${s.actorId}`))
        .toEqual(['ALIGN_RIDGE', 'SET_STATUS:usr-operator', 'FINAL_VALIDATION:usr-reviewer', 'SET_STATUS:usr-reviewer', 'TRANSLATE_BUILDING']);
      // independent of the service code: the operator lacks the 3dqm.qa role, the reviewer has it (spec §11 r2)
      const roles = Object.fromEntries(context.actors.map((/** @type {any} */ x) => [x.id, x.roles]));
      expect(roles['usr-operator']).not.toContain('3dqm.qa');
      expect(roles['usr-reviewer']).toContain('3dqm.qa');
    });

    it('403 for the operator, APPROVED by the reviewer, reset by the next edit', async () => {
      const { handle, history, leases } = await qcHandler([model], { store: await makeStore() });
      const stateOf = async () => json(await handle(get(bUrl(p, b, 'model'), headers('tok-qa', null)))).body.state;
      const command = async (/** @type {any} */ s) => {
        const h = lease(leases, model, s.command.actorId, 1);
        return json(await handle(post(`/api/projects/${p}/commands`, s.command, headers(TOKEN[/** @type {'usr-operator'} */ (s.command.actorId)], h))));
      };

      const edit1 = await command(steps[0]);
      expect(edit1.status).toBe(200);
      expect(edit1.body.status).toBe('COMMITTED');
      const v = edit1.body.modelVersion;

      const opHeader = lease(leases, model, 'usr-operator', 2);
      const byOperator = await approve(handle, model, 'tok-op', v, opHeader);
      expect(byOperator.status).toBe(a.operatorApprove.httpStatus);
      expect(byOperator.body.code).toBe(a.operatorApprove.code);
      expect(await stateOf()).toBe('VALID_SOLID');

      const fv = await finalValidation(handle, model, 'tok-qa');
      expect(fv.status).toBe(200);
      expect(fv.body.isValidForTargetState).toBe(true);

      // the reviewer authored no version after the baseline (journal actors, independent of the approval code)
      const authors = (await history.readJournal(p, b)).map((e) => e.actorId);
      expect(authors).toEqual(['usr-operator']);
      const qaHeader = lease(leases, model, 'usr-reviewer', 3); // QA task of the CP holds the lease (D-3D24-5)
      const byReviewer = await approve(handle, model, 'tok-qa', v, qaHeader);
      expect(byReviewer.status).toBe(200);
      expect(byReviewer.body).toMatchObject({ buildingId: b, modelVersion: v, actorId: 'usr-reviewer' });
      expect(a.reviewerNonAuthorApproves).toBe(true);
      expect(await stateOf()).toBe('APPROVED');
      expect(await history.head(p, b)).toBe(v); // approval made no model version (D-3D24-1)

      const edit2 = await command(steps[4]);
      expect(edit2.body.status).toBe('COMMITTED');
      expect(edit2.body.modelVersion).toBe(v + 1);
      expect(a.laterEditResetsStatus).toBe(true);
      expect(await stateOf()).toBe('VALID_SOLID');
      // the approved version keeps its mark; only the head changed
      expect(json(await handle(get(`${bUrl(p, b, 'model')}?version=${v}`, headers('tok-qa', null)))).body.state).toBe('APPROVED');
      console.log(`GT-22 ${name}`, JSON.stringify({ operator: byOperator.status, reviewer: byReviewer.status, afterEdit: await stateOf() }));
    });
  });
}
