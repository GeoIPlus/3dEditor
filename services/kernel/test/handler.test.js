// createKernelHandler (3D-110): spec §11 Accept lines on the handler - stale leaseEpoch -> 403 with the model unchanged
// (D-69, D-403); a valid token with another user's actorId is executed as the token's user (spec §11 r1) - plus
// auth (401), roles (spec §11 r2), routes (D-404), the model read (v0.2 D.1) and contract-valid replies.
import { describe, expect, it } from 'vitest';
import { readFixture, command, contractValid } from './commit-helpers.js';
import { handlerWith, headers, post, get, json, LEASE } from './handler-helpers.js';

const ALIGN = { edgeId: 'he-f-roof-s-2', mode: 'KEEP_EAVES', targetLine: [[0, 4, 8.5], [10, 4, 8.5]] };
const base = () => readFixture('GT-13', 'input.model.json');
const CMDS = (/** @type {any} */ m) => `/api/projects/${m.projectId}/commands`;
/** @param {any} r */
const valid = (r) => contractValid(r.body.state ? 'command-status' : r.body.status ? 'command-result' : 'error', r.body);

describe('lease (spec §11 r11, D-69, D-403)', () => {
  it('Accept: a command with a stale leaseEpoch -> 403 FORBIDDEN, model unchanged', async () => {
    const m = base();
    const { handle, history } = await handlerWith(m);
    const before = /** @type {number} */ (await history.head(m.projectId, m.buildingId));
    for (const phase of ['COMMIT', 'PREVIEW']) {
      const r = json(await handle(post(CMDS(m), command(m, `c-stale-${phase}`, 'ALIGN_RIDGE', ALIGN, { phase }), headers('tok-op', `${LEASE.leaseRef};${LEASE.leaseEpoch - 1}`))));
      expect(r.status).toBe(403);
      expect(r.body).toMatchObject({ code: 'FORBIDDEN', httpStatus: 403 });
      valid(r);
    }
    expect(await history.head(m.projectId, m.buildingId)).toBe(before);
    expect(await history.readJournal(m.projectId, m.buildingId)).toEqual([]);
    // nothing stored either: the same commandId with the current lease runs normally
    const ok = json(await handle(post(CMDS(m), command(m, 'c-stale-COMMIT', 'ALIGN_RIDGE', ALIGN), headers('tok-op'))));
    expect(ok.body).toMatchObject({ status: 'COMMITTED', modelVersion: before + 1 });
  });

  it('missing or malformed header, other leaseRef, no current lease, another holder -> 403, nothing committed', async () => {
    const m = base();
    const { handle, history, leases } = await handlerWith(m);
    const c = command(m, 'c-1', 'ALIGN_RIDGE', ALIGN);
    for (const h of [headers('tok-op', null), headers('tok-op', 'lease-1'), headers('tok-op', 'lease-1;x'), headers('tok-op', 'lease-2;3'), headers('tok-op2')]) {
      const r = json(await handle(post(CMDS(m), c, h)));
      expect(r.status, JSON.stringify(h)).toBe(403);
    }
    leases.clear(m.projectId, m.buildingId);
    expect(json(await handle(post(CMDS(m), c, headers('tok-op')))).status).toBe(403);
    expect(await history.readJournal(m.projectId, m.buildingId)).toEqual([]);
  });
});

describe('authenticated user (spec §11 r1)', () => {
  it('Accept: a valid token with actorId of another user is executed as the token\'s user', async () => {
    const m = base();
    const { handle, history } = await handlerWith(m);
    const c = command(m, 'c-spoof', 'ALIGN_RIDGE', ALIGN, { actorId: 'usr-reviewer' });
    const r = json(await handle(post(CMDS(m), c, headers('tok-op'))));
    expect(r.status).toBe(200);
    valid(r);
    const [e] = await history.readJournal(m.projectId, m.buildingId);
    expect(e).toMatchObject({ commandId: 'c-spoof', actorId: 'usr-operator' });
    expect(e.input.actorId).toBe('usr-operator');
  });

  it('no token, unknown token, other scheme -> 401 UNAUTHENTICATED before the body is read', async () => {
    const m = base();
    const { handle } = await handlerWith(m);
    let read = false;
    const body = (async function* () { read = true; yield '{}'; })();
    for (const h of [{}, { Authorization: 'Bearer nope' }, { Authorization: 'Basic tok-op' }]) {
      const r = json(await handle({ method: 'POST', url: CMDS(m), headers: h, body }));
      expect(r.status).toBe(401);
      expect(r.body.code).toBe('UNAUTHENTICATED');
      valid(r);
    }
    expect(read).toBe(false);
  });
});

describe('roles (spec §11 r2)', () => {
  it('a reviewer or a user without a 3DQM role cannot send commands (403); a reviewer reads status and the model', async () => {
    const m = base();
    const { handle } = await handlerWith(m);
    for (const tok of ['tok-qa', 'tok-none']) {
      const r = json(await handle(post(CMDS(m), command(m, 'c-r', 'ALIGN_RIDGE', ALIGN), headers(tok))));
      expect(r.status).toBe(403);
    }
    expect(json(await handle(post(CMDS(m), command(m, 'c-r', 'ALIGN_RIDGE', ALIGN), headers('tok-op')))).status).toBe(200);
    const s = json(await handle(get(`${CMDS(m)}/c-r`, headers('tok-qa', null))));
    expect(s.status).toBe(200);
    valid(s);
    expect(s.body).toMatchObject({ commandId: 'c-r', state: 'DONE', result: { status: 'COMMITTED' } });
    const model = json(await handle(get(`/api/projects/${m.projectId}/buildings/${m.buildingId}/model`, headers('tok-qa', null))));
    expect(model.status).toBe(200);
    contractValid('building-model', model.body);
    expect(model.body.version).toBe(m.version + 1);
    expect(json(await handle(get(`/api/projects/${m.projectId}/buildings/${m.buildingId}/model`, headers('tok-none', null)))).status).toBe(403);
  });
});

describe('routes and wire (3D-ADR-0002 A.4, D-404, v0.2 D.1)', () => {
  it('command status by GET /api/projects/{p}/commands/{commandId}; unknown -> 404', async () => {
    const m = base();
    const { handle } = await handlerWith(m);
    const r = json(await handle(get(`${CMDS(m)}/nope`, headers('tok-op'))));
    expect(r.status).toBe(404);
    expect(r.body.code).toBe('NOT_FOUND');
  });

  it('model by version: baseline, unknown version 404, malformed version 400', async () => {
    const m = base();
    const { handle } = await handlerWith(m);
    const url = `/api/projects/${m.projectId}/buildings/${m.buildingId}/model`;
    const v = json(await handle(get(`${url}?version=${m.version}`, headers('tok-op'))));
    expect(v.status).toBe(200);
    expect(v.body).toEqual(m);
    expect(json(await handle(get(`${url}?version=${m.version + 5}`, headers('tok-op')))).status).toBe(404);
    expect(json(await handle(get(`${url}?version=-1`, headers('tok-op')))).status).toBe(400);
    expect(json(await handle(get(`/api/projects/${m.projectId}/buildings/nope/model`, headers('tok-op')))).status).toBe(404);
  });

  it('unknown route or method -> 404; body projectId differs from the path -> 400; invalid command -> 400', async () => {
    const m = base();
    const { handle } = await handlerWith(m);
    for (const req of [get('/api/nope', headers('tok-op')), get(CMDS(m), headers('tok-op')), get('/api/projects/%E0%A4%A/commands/x', headers('tok-op'))]) {
      expect(json(await handle(req)).status).toBe(404);
    }
    const other = json(await handle(post('/api/projects/other/commands', command(m, 'c-x', 'ALIGN_RIDGE', ALIGN), headers('tok-op'))));
    expect(other.status).toBe(400);
    const bad = json(await handle(post(CMDS(m), { ...command(m, 'c-y', 'ALIGN_RIDGE', ALIGN), operation: 'NOPE' }, headers('tok-op'))));
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('INVALID_PAYLOAD');
  });

  it('replies are JSON with no-store; a body above 1 MiB -> 413 (Content-Length or counted)', async () => {
    const m = base();
    const { handle } = await handlerWith(m);
    const r = await handle(post(CMDS(m), command(m, 'c-z', 'ALIGN_RIDGE', ALIGN), headers('tok-op')));
    expect(r.headers).toMatchObject({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    const big = 'x'.repeat(1024 * 1024 + 1);
    expect((await handle({ method: 'POST', url: CMDS(m), headers: { ...headers('tok-op'), 'Content-Length': String(big.length) }, body: big })).status).toBe(413);
    expect((await handle({ method: 'POST', url: CMDS(m), headers: headers('tok-op'), body: big })).status).toBe(413);
  });

  it('PREVIEW then COMMIT by previewId through the handler', async () => {
    const m = base();
    const { handle } = await handlerWith(m);
    const p = json(await handle(post(CMDS(m), command(m, 'c-pv', 'ALIGN_RIDGE', ALIGN, { phase: 'PREVIEW' }), headers('tok-op'))));
    expect(p.body).toMatchObject({ status: 'PREVIEW', previewId: 'pv-1' });
    const c = json(await handle(post(CMDS(m), command(m, 'c-cm', 'ALIGN_RIDGE', ALIGN, { previewId: 'pv-1' }), headers('tok-op'))));
    expect(c.body).toMatchObject({ status: 'COMMITTED', modelVersion: m.version + 1 });
    expect(c.body.patch).toEqual(p.body.patch);
  });
});
