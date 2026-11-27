// Service import (3D-133; D-3D133-1..4): GT-I1 through the handler -> version 0 VALID_SOLID + `import-report`; a
// second import -> 409, baseline unchanged; export of the imported building saves with `If-Match` = the tag of the
// import read (D-430), then with the tag of the own last save; the source survives a new handler on the same store.
import { describe, expect, it } from 'vitest';
import { contractValid, readFixture } from './commit-helpers.js';
import { get, headers, json } from './handler-helpers.js';
import { exportBatch, finalValidation } from './qc-helpers.js';
import { B, INPUT, P, SAVE, bytesOf, gtI1, importHandler, importReq, spySaves } from './import-helpers.js';

const A = readFixture('GT-I1', 'expected.json').assert;
const M = { projectId: P, buildingId: B };

/** FINAL_VALIDATION, then export of the building by the reviewer. @param {any} handle */
async function validateAndExport(handle) {
  expect((await finalValidation(handle, M, 'tok-qa')).body.isValidForTargetState).toBe(true);
  return exportBatch(handle, P, [B], 'tok-qa');
}

describe('service import of GT-I1 through the handler', () => {
  it('201 import-report; version 0 is VALID_SOLID with the GT-I1 counts', async () => {
    const { handle, leaseHeader } = await importHandler();
    const r = await importReq(handle, leaseHeader);
    expect(r.status).toBe(201);
    contractValid('import-report', r.body);
    expect(r.body).toMatchObject({ buildingId: B, modelVersion: 0, assignedState: A.state, faceCount: A.faces });
    const m = json(await handle(get(`/api/projects/${P}/buildings/${B}/model?version=0`, headers('tok-op', null))));
    expect(m.status).toBe(200);
    expect(m.body).toMatchObject({ projectId: P, buildingId: B, version: 0, state: 'VALID_SOLID' });
    expect(Object.keys(m.body.faces).length).toBe(A.faces);
    expect(Object.keys(m.body.vertices).length).toBe(A.vertices);
  });

  it('a second import -> 409 VERSION_CONFLICT; baseline and source unchanged', async () => {
    const { handle, leaseHeader, history, sources, datasets } = await importHandler();
    expect((await importReq(handle, leaseHeader)).status).toBe(201);
    const baseline = await history.readBaseline(P, B);
    const source = await sources.source(P, B);
    await datasets.save(INPUT, bytesOf({ type: 'CityJSON', changed: true }), { ifMatch: (await datasets.read(INPUT))?.entityTag ?? '' });
    const again = await importReq(handle, leaseHeader);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('VERSION_CONFLICT');
    expect(await history.readBaseline(P, B)).toEqual(baseline);
    expect(await history.head(P, B)).toBe(0);
    expect(await sources.source(P, B)).toEqual(source);
  });

  it('export saves with If-Match = the tag of the progress.save read at import, then the own last save', async () => {
    const { handle, leaseHeader, datasets } = await importHandler();
    await datasets.createDataset(SAVE, bytesOf(gtI1()));
    const importTag = (await datasets.read(SAVE))?.entityTag;
    expect((await importReq(handle, leaseHeader)).status).toBe(201);
    const calls = spySaves(datasets);
    const first = await validateAndExport(handle);
    expect(first.status).toBe(200);
    expect(first.body.report.exported).toEqual([{ buildingId: B, modelVersion: 0 }]);
    expect(first.body.deliveries[0].save).toEqual({ status: 'SAVED' });
    expect(calls).toEqual([{ ref: SAVE, pre: { ifMatch: importTag } }]);
    const savedTag = (await datasets.read(SAVE))?.entityTag;
    expect(savedTag).not.toBe(importTag);
    expect((await exportBatch(handle, P, [B], 'tok-qa')).body.deliveries[0].save).toEqual({ status: 'SAVED' });
    expect(calls[1]).toEqual({ ref: SAVE, pre: { ifMatch: savedTag } });
  });

  it('progress.save absent at import -> If-None-Match: *; progress.save = input -> the input read tag', async () => {
    const absent = await importHandler();
    expect((await importReq(absent.handle, absent.leaseHeader)).status).toBe(201);
    const c1 = spySaves(absent.datasets);
    expect((await validateAndExport(absent.handle)).body.deliveries[0].save).toEqual({ status: 'SAVED' });
    expect(c1).toEqual([{ ref: SAVE, pre: { ifNoneMatch: '*' } }]);

    const same = await importHandler({ saveRef: INPUT });
    const inputTag = (await same.datasets.read(INPUT))?.entityTag;
    expect((await importReq(same.handle, same.leaseHeader)).status).toBe(201);
    const c2 = spySaves(same.datasets);
    expect((await validateAndExport(same.handle)).body.deliveries[0].save).toEqual({ status: 'SAVED' });
    expect(c2).toEqual([{ ref: INPUT, pre: { ifMatch: inputTag } }]);
  });

  it('two concurrent imports: one 201, one 409; one baseline', async () => {
    const { handle, leaseHeader, history } = await importHandler();
    const rs = await Promise.all([importReq(handle, leaseHeader), importReq(handle, leaseHeader)]);
    expect(rs.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await history.head(P, B)).toBe(0);
  });

  it('the source survives a new handler on the same store (D-3D133-4)', async () => {
    const one = await importHandler();
    expect((await importReq(one.handle, one.leaseHeader)).status).toBe(201);
    const two = await importHandler({ store: one.store, input: null });
    const calls = spySaves(two.datasets);
    expect((await validateAndExport(two.handle)).body.report.exported).toEqual([{ buildingId: B, modelVersion: 0 }]);
    expect(calls).toEqual([{ ref: SAVE, pre: { ifNoneMatch: '*' } }]);
  });
});

describe('service import refusals change nothing', () => {
  /** @param {any} h */
  const nothing = async (h) => {
    expect(await h.history.head(P, B)).toBeUndefined();
    expect(await h.sources.source(P, B)).toBeUndefined();
  };

  it('reviewer -> 403; no lease -> 403; a member in the body -> 400', async () => {
    const h = await importHandler();
    expect((await importReq(h.handle, h.leaseHeader, 'tok-qa')).status).toBe(403);
    expect((await importReq(h.handle, null)).status).toBe(403);
    const bad = await importReq(h.handle, h.leaseHeader, 'tok-op', { inputRef: 'ds-other' });
    expect([bad.status, bad.body.code]).toEqual([400, 'INVALID_PAYLOAD']);
    await nothing(h);
  });

  it('unknown building, missing or malformed input, missing CityObject -> 404 / 400', async () => {
    const unknown = await importHandler({ over: { buildings: { locate: async () => undefined } } });
    expect((await importReq(unknown.handle, unknown.leaseHeader)).body.code).toBe('NOT_FOUND');
    const missing = await importHandler({ input: null });
    expect((await importReq(missing.handle, missing.leaseHeader)).body.code).toBe('NOT_FOUND');
    const malformed = await importHandler({ input: '{"type":' });
    expect((await importReq(malformed.handle, malformed.leaseHeader)).body.code).toBe('INVALID_PAYLOAD');
    const noObject = await importHandler({ input: { ...gtI1(), CityObjects: {} } });
    expect((await importReq(noObject.handle, noObject.leaseHeader)).body.code).toBe('NOT_FOUND');
    for (const h of [unknown, missing, malformed, noObject]) await nothing(h);
  });

  it('no buildings port -> 503 UNAVAILABLE', async () => {
    const h = await importHandler({ over: { buildings: undefined } });
    const r = await importReq(h.handle, h.leaseHeader);
    expect([r.status, r.body.code]).toEqual([503, 'UNAVAILABLE']);
  });
});
