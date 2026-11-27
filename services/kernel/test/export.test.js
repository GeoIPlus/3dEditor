// Export gate and batch export (3D-24; spec §11 r9; v0.3 §8.4; D-90, D-430, D-3D24-4, D-3D24-8) and the serving route
// of delivered bytes (3D-ADR-0003 §4).
import { describe, expect, it } from 'vitest';
import { readFixture } from './commit-helpers.js';
import { get, headers, json, text } from './handler-helpers.js';
import { approve, exportBatch, finalValidation, lease, qcHandler } from './qc-helpers.js';
import { SKIP } from '../src/export.js';

const ids = ['bld-gt-24-a', 'bld-gt-24-b', 'bld-gt-24-c'];
const [A, B, C] = ids.map((id) => readFixture('GT-24', `input.model.${id}.json`));
const [docA, docB, docC] = ids.map((id) => readFixture('GT-24', `input.cityjson.${id}.json`));
const p = A.projectId;

/** A handler with sources for A, B, C on `basis`. @param {any} [over] @param {any} [basis] */
async function setup(over = {}, basis = { kind: 'absent' }) {
  const h = await qcHandler([A, B, C], { over });
  for (const [m, doc] of [[A, docA], [B, docB], [C, docC]]) h.sources.set(p, m.buildingId, { cityjson: doc, saveRef: `save-${m.buildingId}`, basis });
  return h;
}

describe('export gate (spec §11 r9)', () => {
  it('skips a building without a passed FINAL_VALIDATION, an unknown one and one without a source', async () => {
    const h = await qcHandler([A, C]); // no source set for A
    h.sources.set(p, C.buildingId, { cityjson: docC, saveRef: 'save-c', basis: { kind: 'absent' } });
    await finalValidation(h.handle, A, 'tok-qa');
    const r = await exportBatch(h.handle, p, [A.buildingId, C.buildingId, 'nope'], 'tok-qa');
    expect(r.body.report).toEqual({ exported: [], skipped: [
      { buildingId: A.buildingId, state: 'VALID_SOLID', reasonKey: SKIP.NO_SOURCE },
      { buildingId: C.buildingId, state: 'VALID_SOLID', reasonKey: SKIP.NO_FINAL_VALIDATION },
      { buildingId: 'nope', reasonKey: SKIP.UNKNOWN },
    ] });
    expect(r.body.deliveries).toEqual([]);
  });

  it('exportRequiresApproval: VALID_SOLID is skipped until approved, APPROVED is exported (D-90)', async () => {
    const h = await setup({ projectSettings: () => ({ exportRequiresApproval: true }) });
    await finalValidation(h.handle, A, 'tok-qa');
    const before = await exportBatch(h.handle, p, [A.buildingId, B.buildingId], 'tok-qa');
    expect(before.body.report.skipped).toEqual([
      { buildingId: A.buildingId, state: 'VALID_SOLID', reasonKey: SKIP.NOT_APPROVED },
      { buildingId: B.buildingId, state: 'DRAFT_SOLID', reasonKey: SKIP.NOT_VALID },
    ]);
    expect((await approve(h.handle, A, 'tok-qa', A.version, lease(h.leases, A, 'usr-reviewer', 1))).status).toBe(200);
    const after = await exportBatch(h.handle, p, [A.buildingId], 'tok-qa');
    expect(after.body.report.exported).toEqual([{ buildingId: A.buildingId, modelVersion: A.version }]);
  });

  it('only a reviewer exports; an unconfigured service answers 503', async () => {
    const h = await setup();
    expect((await exportBatch(h.handle, p, [A.buildingId], 'tok-op')).body.code).toBe('FORBIDDEN');
    expect((await exportBatch(h.handle, p, [], 'tok-qa')).body.code).toBe('INVALID_PAYLOAD');
    const bare = await qcHandler([A], { over: { datasets: undefined } });
    expect((await exportBatch(bare.handle, p, [A.buildingId], 'tok-qa')).status).toBe(503);
  });
});

describe('save and delivery (D-430, D-3D24-8)', () => {
  it('a failing export skips that building only; the others are delivered', async () => {
    const h = await setup();
    for (const m of [A, C]) await finalValidation(h.handle, m, 'tok-qa');
    h.sources.set(p, A.buildingId, { cityjson: { type: 'CityJSON', CityObjects: {} }, saveRef: 'save-a', basis: { kind: 'absent' } });
    const r = await exportBatch(h.handle, p, [A.buildingId, C.buildingId], 'tok-qa');
    expect(r.body.report.skipped).toEqual([{ buildingId: A.buildingId, state: 'VALID_SOLID', reasonKey: SKIP.FAILED }]);
    expect(r.body.report.exported).toEqual([{ buildingId: C.buildingId, modelVersion: C.version }]);
  });

  it('SAVED becomes the next basis: a second export saves again with If-Match', async () => {
    const h = await setup();
    await finalValidation(h.handle, A, 'tok-qa');
    const first = await exportBatch(h.handle, p, [A.buildingId], 'tok-qa');
    const second = await exportBatch(h.handle, p, [A.buildingId], 'tok-qa');
    for (const r of [first, second]) expect(r.body.deliveries[0].save).toEqual({ status: 'SAVED' });
    expect((await h.sources.source(p, A.buildingId))?.basis).toEqual({ kind: 'tagged', entityTag: (await h.datasets.read(`save-${A.buildingId}`))?.entityTag });
    expect(second.body.deliveries[0].digest).toBe(first.body.deliveries[0].digest); // same bytes, same address (no-op)
  });

  it('412 -> KEPT: not delivered, skipped; no entity tag -> NOT_SAVED, still delivered', async () => {
    const kept = await setup({}, { kind: 'tagged', entityTag: '"0.stale"' });
    await kept.datasets.createDataset(`save-${A.buildingId}`, new Uint8Array([1]));
    await finalValidation(kept.handle, A, 'tok-qa');
    const k = await exportBatch(kept.handle, p, [A.buildingId], 'tok-qa');
    expect(k.body.report).toEqual({ exported: [], skipped: [{ buildingId: A.buildingId, state: 'VALID_SOLID', reasonKey: SKIP.SAVE_KEPT }] });
    expect(k.body.deliveries).toEqual([{ buildingId: A.buildingId, modelVersion: A.version, save: { status: 'KEPT', reason: 'PRECONDITION_FAILED' } }]);

    const untagged = await setup({}, { kind: 'untagged' });
    await finalValidation(untagged.handle, A, 'tok-qa');
    const u = await exportBatch(untagged.handle, p, [A.buildingId], 'tok-qa');
    expect(u.body.deliveries[0]).toMatchObject({ save: { status: 'NOT_SAVED', reason: 'NO_ENTITY_TAG' } });
    expect(u.body.report.exported).toHaveLength(1);
    expect(await untagged.datasets.read(`save-${A.buildingId}`)).toBeUndefined();
  });

  it('serves delivered bytes to a project role; unknown or malformed digest -> 404', async () => {
    const h = await setup();
    await finalValidation(h.handle, A, 'tok-qa');
    const { digest } = (await exportBatch(h.handle, p, [A.buildingId], 'tok-qa')).body.deliveries[0];
    const served = await h.handle(get(`/api/projects/${p}/results/${digest}`, headers('tok-op', null)));
    expect(served.status).toBe(200);
    expect(served.headers['content-type']).toBe('application/json');
    expect(Object.keys(JSON.parse(text(served.body)).CityObjects)).toEqual([A.buildingId]);
    expect((await h.handle(get(`/api/projects/${p}/results/${'0'.repeat(64)}`, headers('tok-qa', null)))).status).toBe(404);
    expect((await h.handle(get(`/api/projects/${p}/results/abc`, headers('tok-qa', null)))).status).toBe(404);
    expect(json(await h.handle(get(`/api/projects/${p}/results/${digest}`, {}))).status).toBe(401);
  });
});
