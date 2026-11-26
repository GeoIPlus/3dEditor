// Command API (3D-109): PREVIEW stored by previewId, COMMIT of the stored result (spec §3 r3, §11 r5), the version
// check of a preview (spec §11 Accept), D-3D109-4, expiry (D-315) and eviction (D-3D109-2) with an injected clock.
import { describe, expect, it, vi } from 'vitest';
import * as kernel from '@geoiplus/geo-model3d';
import { readFixture, apiWith, command, validReply, contractValid, PROFILE } from './commit-helpers.js';
import { previewOf } from '../src/command-api.js';

vi.mock('@geoiplus/geo-model3d', async (orig) => {
  const m = /** @type {any} */ (await orig());
  return { ...m, executeCommand: vi.fn(m.executeCommand) };
});

const OP = { actorId: 'usr-operator' };
const ALIGN = { edgeId: 'he-f-roof-s-2', mode: 'KEEP_EAVES', targetLine: [[0, 4, 8.5], [10, 4, 8.5]] };
const base = () => readFixture('GT-13', 'input.model.json');
const preview = (/** @type {any} */ m, /** @type {string} */ id, over = {}) => command(m, id, 'ALIGN_RIDGE', ALIGN, { phase: 'PREVIEW', ...over });

describe('PREVIEW and COMMIT by previewId', () => {
  it('spec §3: PREVIEW then COMMIT with its previewId yields the same patch; the kernel does not run again', async () => {
    const m = base();
    const { api, history } = await apiWith(m);
    const p = validReply(await api.command(preview(m, 'c-pv'), OP));
    expect(p.httpStatus).toBe(200);
    expect(p.body).toMatchObject({ status: 'PREVIEW', previewId: 'pv-1', modelVersion: 1 });
    expect(await history.head(m.projectId, m.buildingId)).toBe(1);  // a PREVIEW persists nothing
    const runs = vi.mocked(kernel.executeCommand).mock.calls.length;
    const c = validReply(await api.command(command(m, 'c-commit', 'ALIGN_RIDGE', ALIGN, { previewId: 'pv-1' }), OP));
    expect(vi.mocked(kernel.executeCommand).mock.calls.length).toBe(runs);  // applied from the store
    expect(c.body).toMatchObject({ status: 'COMMITTED', modelVersion: 2, commandId: 'c-commit' });
    expect(c.body.patch).toEqual(p.body.patch);
    expect(c.body.topologyLineage).toEqual(p.body.topologyLineage);
    const [e] = await history.readJournal(m.projectId, m.buildingId);
    contractValid('journal-entry', e);
    expect(e).toMatchObject({ commandId: 'c-commit', actorId: 'usr-operator', beforeVersion: 1, afterVersion: 2 });
    expect(e.forwardPatch).toEqual(p.body.patch);
    expect(e.input).toMatchObject({ previewId: 'pv-1', phase: 'COMMIT' });
    // a repeat of the COMMIT returns the stored result (GT-13), although the preview is consumed
    expect((await api.command(command(m, 'c-commit', 'ALIGN_RIDGE', ALIGN, { previewId: 'pv-1' }), OP)).body).toEqual(c.body);
    // another COMMIT of the consumed preview: 404
    expect((await api.command(command(m, 'c-again', 'ALIGN_RIDGE', ALIGN, { previewId: 'pv-1', expectedVersion: 2 }), OP)).body.code).toBe('NOT_FOUND');
  });

  it('spec §11: a PREVIEW, a competing COMMIT, then COMMIT of the first previewId -> 409 VERSION_CONFLICT', async () => {
    const m = base();
    const { api, history } = await apiWith(m);
    await api.command(preview(m, 'c-pv'), OP);
    await api.command(preview(m, 'c-pv2'), OP);
    expect((await api.command(command(m, 'c-other', 'ALIGN_RIDGE', ALIGN), { actorId: 'usr-2' })).body.status).toBe('COMMITTED');
    const r = validReply(await api.command(command(m, 'c-late', 'ALIGN_RIDGE', ALIGN, { previewId: 'pv-1' }), OP));
    expect(r.httpStatus).toBe(409);
    expect(r.body).toMatchObject({ status: 'CONFLICT', error: { code: 'VERSION_CONFLICT' } });
    // also with expectedVersion moved to the head: the preview was made on version 1
    const moved = await api.command(command(m, 'c-late2', 'ALIGN_RIDGE', ALIGN, { previewId: 'pv-2', expectedVersion: 2 }), OP);
    expect(moved.httpStatus).toBe(409);
    expect(await history.head(m.projectId, m.buildingId)).toBe(2);
  });

  it('a PREVIEW refused by the kernel or on a stale version stores nothing; unknown building -> 404', async () => {
    const m = base();
    const { api } = await apiWith(m);
    const stale = validReply(await api.command(preview(m, 'c-s', { expectedVersion: 7 }), OP));
    expect(stale.httpStatus).toBe(409);
    expect((await api.command(preview(m, 'c-n', { buildingId: 'bld-none' }), OP)).httpStatus).toBe(404);
    expect(api.previewCount()).toBe(0);
  });

  it('D-3D109-4: a preview of another user or building -> 404; a different payload or targetState -> 400', async () => {
    const m = base();
    const { api, history } = await apiWith(m);
    await api.command(preview(m, 'c-pv'), OP);
    const foreign = validReply(await api.command(command(m, 'c1', 'ALIGN_RIDGE', ALIGN, { previewId: 'pv-1' }), { actorId: 'usr-2' }));
    expect(foreign.body).toMatchObject({ code: 'NOT_FOUND', httpStatus: 404, entityIds: ['pv-1'] });
    const other = { ...ALIGN, targetLine: [[0, 4, 8.6], [10, 4, 8.6]] };
    const payload = validReply(await api.command(command(m, 'c2', 'ALIGN_RIDGE', other, { previewId: 'pv-1' }), OP));
    expect(payload.body).toMatchObject({ code: 'INVALID_PAYLOAD', httpStatus: 400 });
    const state = await api.command(command(m, 'c3', 'ALIGN_RIDGE', ALIGN, { previewId: 'pv-1', targetState: 'DRAFT_SOLID' }), OP);
    expect(state.httpStatus).toBe(400);
    expect(await history.head(m.projectId, m.buildingId)).toBe(1);
    // the refusals were not stored: the right COMMIT still applies the preview
    expect((await api.command(command(m, 'c4', 'ALIGN_RIDGE', ALIGN, { previewId: 'pv-1' }), OP)).body.status).toBe('COMMITTED');
  });

  it('D-315: a preview expires 10 min after its creation -> 404 (injected clock)', async () => {
    const m = base();
    const { api, clock } = await apiWith(m);
    clock.t = 1_000;
    await api.command(preview(m, 'c-pv'), OP);
    clock.t = 1_000 + 10 * 60 * 1000;
    const r = validReply(await api.command(command(m, 'c1', 'ALIGN_RIDGE', ALIGN, { previewId: 'pv-1' }), OP));
    expect(r.body).toMatchObject({ code: 'NOT_FOUND', httpStatus: 404 });
    await api.command(preview(m, 'c-pv2'), OP);
    clock.t += 10 * 60 * 1000 - 1;  // one millisecond before expiry
    expect((await api.command(command(m, 'c2', 'ALIGN_RIDGE', ALIGN, { previewId: 'pv-2' }), OP)).body.status).toBe('COMMITTED');
  });

  it('D-3D109-2: the 21st preview of one (user, building) evicts the oldest -> 404', async () => {
    const m = base();
    const { api, clock } = await apiWith(m);
    for (let i = 1; i <= 21; i++) {
      clock.t = i * 100;  // 10/s, under the rate limit
      expect((await api.command(preview(m, `c-pv${i}`), OP)).httpStatus).toBe(200);
    }
    expect(api.previewCount()).toBe(20);
    expect((await api.command(command(m, 'c1', 'ALIGN_RIDGE', ALIGN, { previewId: 'pv-1' }), OP)).httpStatus).toBe(404);
    expect((await api.command(command(m, 'c2', 'ALIGN_RIDGE', ALIGN, { previewId: 'pv-21' }), OP)).httpStatus).toBe(200);
  });
});

describe('D-3D109-5: the PREVIEW reply derived from the one COMMIT run equals the kernel\'s own PREVIEW', () => {
  const opts = { toleranceProfile: PROFILE, clock: () => '2026-11-26T00:00:00Z' };
  const both = (/** @type {any} */ model, /** @type {any} */ cmd, extra = {}) => {
    const own = kernel.executeCommand(model, { ...cmd, phase: 'PREVIEW' }, { ...opts, previewId: 'pv-x', ...extra }).result;
    const done = kernel.executeCommand(model, { ...cmd, phase: 'COMMIT' }, { ...opts, ...extra });
    return { own, derived: previewOf(done.result, model.version, 'pv-x'), done };
  };

  it('an edit, a noChange edit (OFFSET_FACE 0, D-301), a refusal', () => {
    const m = base();
    for (const [op, payload] of /** @type {[string, any][]} */ ([['ALIGN_RIDGE', ALIGN], ['OFFSET_FACE', { faceId: 'f-roof-s', offsetM: 0 }],
      ['ALIGN_RIDGE', { ...ALIGN, edgeId: 'he-none' }]])) {
      const { own, derived } = both(m, command(m, 'c1', op, payload));
      expect(derived, op).toEqual(own);
      contractValid('command-result', derived);
    }
  });

  it('UNDO with the journal and the baseline (history kinds)', async () => {
    const m = base();
    const { api, history } = await apiWith(m);
    await api.command(command(m, 'c1', 'ALIGN_RIDGE', ALIGN), OP);
    const v2 = await history.readVersion(m.projectId, m.buildingId, 2);
    const extra = { history: { journal: await history.readJournal(m.projectId, m.buildingId), baseline: m, actorId: 'usr-operator' } };
    const { own, derived, done } = both(v2, command(v2, 'c2', 'UNDO', {}), extra);
    expect(done.result.status).toBe('COMMITTED');
    expect(derived).toEqual(own);
  });
});
