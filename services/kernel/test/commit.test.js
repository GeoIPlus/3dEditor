// COMMIT path of the kernel service (3D-23; spec §11 r1, r3, r4, r7, r10; D-291..D-294, D-301): kernel results are
// journalled, repeats return the stored reply, refusals and no-ops write no version, command status by commandId.
import { describe, expect, it } from 'vitest';
import { readFixture, serviceWith, command, validReply, contractValid } from './commit-helpers.js';
import { createFileStore } from '../src/adapters/file-store.js';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OP = { actorId: 'usr-operator' };
const ALIGN = { edgeId: 'he-f-roof-s-2', mode: 'KEEP_EAVES', targetLine: [[0, 4, 8.5], [10, 4, 8.5]] };
const base = () => readFixture('GT-13', 'input.model.json');

describe('COMMIT path', () => {
  it('a commit appends one journal entry with operationId and the authenticated actor; replies are contract-valid', async () => {
    const m = base();
    const { service, history } = await serviceWith(m);
    const r = validReply(await service.commit(command(m, 'c1', 'ALIGN_RIDGE', ALIGN, { actorId: 'usr-forged' }), OP));
    expect(r.httpStatus).toBe(200);
    expect(r.body).toMatchObject({ status: 'COMMITTED', modelVersion: 2 });
    const [e] = await history.readJournal(m.projectId, m.buildingId);
    contractValid('journal-entry', e);
    expect(e).toMatchObject({ operationId: 'op-1', actorId: 'usr-operator', beforeVersion: 1, afterVersion: 2 });
    expect(e.input.actorId).toBe('usr-operator');  // spec §11 r1: never the envelope's actorId
    contractValid('building-model', await history.readVersion(m.projectId, m.buildingId, 2));
  });

  it('UNDO and REDO get the journal and the baseline; RESTORE_BASELINE returns to it (D-291..D-294)', async () => {
    const m = base();
    const { service, history } = await serviceWith(m);
    await service.commit(command(m, 'c1', 'ALIGN_RIDGE', ALIGN), OP);
    const undo = validReply(await service.commit(command(m, 'c2', 'UNDO', {}, { expectedVersion: 2 }), OP));
    expect(undo.body).toMatchObject({ status: 'COMMITTED', modelVersion: 3 });
    const v3 = await history.readVersion(m.projectId, m.buildingId, 3);
    expect(v3.vertices).toEqual(m.vertices);
    const redo = validReply(await service.commit(command(m, 'c3', 'REDO', {}, { expectedVersion: 3 }), OP));
    expect(redo.body.modelVersion).toBe(4);
    const other = validReply(await service.commit(command(m, 'c4', 'UNDO', {}, { expectedVersion: 4 }), { actorId: 'usr-other' }));
    expect(other.httpStatus).toBe(403);  // D-292: the stack top is another actor's
    const back = validReply(await service.commit(command(m, 'c5', 'RESTORE_BASELINE', {}, { expectedVersion: 4 }), OP));
    expect(back.body.modelVersion).toBe(5);
    expect((await history.readVersion(m.projectId, m.buildingId, 5)).vertices).toEqual(m.vertices);
    expect((await history.readJournal(m.projectId, m.buildingId)).map((e) => e.input.operation)).toEqual(['ALIGN_RIDGE', 'UNDO', 'REDO', 'RESTORE_BASELINE']);
  });

  it('a refusal writes no version; its reply is stored and repeated', async () => {
    const m = base();
    const { service, history } = await serviceWith(m);
    const bad = command(m, 'cx', 'OFFSET_FACE', { faceId: 'f-wall-s', offsetM: 0.1, fixedMode: 'FIXED_RIDGE' });
    const r = validReply(await service.commit(bad, OP));
    expect(r.httpStatus).toBe(400);
    expect(r.body.status).toBe('REJECTED');
    expect(await service.commit(bad, OP)).toEqual(r);
    expect(await history.head(m.projectId, m.buildingId)).toBe(1);
  });

  it('a stale expectedVersion is 409 before the kernel runs, even for an operation the kernel lacks', async () => {
    const m = base();
    const { service, history } = await serviceWith(m);
    await service.commit(command(m, 'c1', 'ALIGN_RIDGE', ALIGN), OP);
    const r = validReply(await service.commit(command(m, 'c2', 'TRANSLATE_BUILDING', { vector: [1, 0, 0] }), OP));
    expect(r.httpStatus).toBe(409);
    expect(r.body).toMatchObject({ status: 'CONFLICT', modelVersion: 2, error: { code: 'VERSION_CONFLICT' } });
    expect(r.body.validation.modelVersion).toBe(2);
    expect(await history.head(m.projectId, m.buildingId)).toBe(2);
  });

  it('a noChange COMMIT (OFFSET_FACE 0, D-301) writes no journal entry and keeps the version', async () => {
    const m = base();
    const { service, history } = await serviceWith(m);
    const r = validReply(await service.commit(command(m, 'c0', 'OFFSET_FACE', { faceId: 'f-roof-s', offsetM: 0, fixedMode: 'NONE' }), OP));
    expect(r.body).toMatchObject({ status: 'COMMITTED', modelVersion: 1 });
    expect(await history.readJournal(m.projectId, m.buildingId)).toEqual([]);
  });

  it('unknown building -> 404; a PREVIEW is not taken by the commit path (3D-23.1)', async () => {
    const m = base();
    const { service } = await serviceWith(m);
    expect(validReply(await service.commit(command(m, 'c1', 'ALIGN_RIDGE', ALIGN, { buildingId: 'bld-none' }), OP)).httpStatus).toBe(404);
    expect(validReply(await service.commit(command(m, 'c1', 'ALIGN_RIDGE', ALIGN, { phase: 'PREVIEW' }), OP)).httpStatus).toBe(400);
  });

  it('two concurrent commits of different commands on one version: one commits, the other gets 409 (file store)', async () => {
    const m = base();
    const { service, history } = await serviceWith(m, createFileStore({ root: await mkdtemp(join(tmpdir(), 'commit-')) }));
    const offset = command(m, 'cb', 'OFFSET_FACE', { faceId: 'f-roof-s', offsetM: 0.1, fixedMode: 'NONE' });
    const rs = await Promise.all([service.commit(command(m, 'ca', 'ALIGN_RIDGE', ALIGN), OP), service.commit(offset, OP)]);
    rs.forEach(validReply);
    expect(rs.map((r) => r.httpStatus).sort()).toEqual([200, 409]);
    expect(rs.find((r) => r.httpStatus === 409)?.body.error.code).toBe('VERSION_CONFLICT');
    expect(await history.readJournal(m.projectId, m.buildingId)).toHaveLength(1);
  });

  it('a concurrent repeat of one commandId commits once and both get the same reply', async () => {
    const m = base();
    const { service, history } = await serviceWith(m);
    const c = command(m, 'c1', 'ALIGN_RIDGE', ALIGN);
    const [a, b] = await Promise.all([service.commit(c, OP), service.commit(c, OP)]);
    expect(a.httpStatus).toBe(200);
    expect(b).toEqual(a);
    expect(await history.readJournal(m.projectId, m.buildingId)).toHaveLength(1);
  });
});

describe('command status by commandId (command-status)', () => {
  it('DONE with the stored result; unknown -> 404 NOT_FOUND', async () => {
    const m = base();
    const { service } = await serviceWith(m);
    const r = await service.commit(command(m, 'c1', 'ALIGN_RIDGE', ALIGN), OP);
    const s = validReply(await service.status(m.projectId, 'c1'));
    expect(s.body).toEqual({ commandId: 'c1', state: 'DONE', result: r.body });
    const none = validReply(await service.status(m.projectId, 'c-none'));
    expect(none.httpStatus).toBe(404);
    expect(none.body.code).toBe('NOT_FOUND');
  });

  it('IN_PROGRESS while this instance executes the command', async () => {
    const m = base();
    const { service } = await serviceWith(m);
    const running = service.commit(command(m, 'c1', 'ALIGN_RIDGE', ALIGN), OP);
    expect(validReply(await service.status(m.projectId, 'c1')).body).toEqual({ commandId: 'c1', state: 'IN_PROGRESS' });
    await running;
    expect((await service.status(m.projectId, 'c1')).body.state).toBe('DONE');
  });
});
