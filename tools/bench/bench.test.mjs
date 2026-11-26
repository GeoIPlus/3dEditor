// Bench scenes and the bench service path (3D-ADR-0006, 3D-121): the latency number is only meaningful if the scene is
// a valid model and the measured path is the shipped PREVIEW path (createCommandApi, D-357) doing the real work.
import { describe, expect, it } from 'vitest';
import { createAjv } from '../../contracts/model3d/test/load.mjs';
import { gt03, sawtooth, scenes } from './scenes.mjs';
import { createPreviewService } from './service.mjs';

const ajv = createAjv();
const validResult = /** @type {import('ajv').ValidateFunction} */ (ajv.getSchema('urn:geoiplus:schema:model3d-command-result:v1'));
const validModel = /** @type {import('ajv').ValidateFunction} */ (ajv.getSchema('urn:geoiplus:schema:model3d-building-model:v1'));
/** @param {number[]} a @param {number[]} b */
const gap = (a, b) => Math.hypot(...a.map((x, i) => x - b[i]));

describe('bench scenes and service path (3D-ADR-0006, 3D-121)', () => {
  it('sawtooth-199 has 199 faces, is a valid closed model, and its valley move through the API keeps the ridges', async () => {
    const sc = sawtooth(97, true);
    expect(sc.faces).toBe(199);
    expect(validModel(sc.model), JSON.stringify(validModel.errors?.slice(0, 2))).toBe(true);
    expect(sc.model.shells['sh-1'].isClosed).toBe(true);
    const svc = await createPreviewService({ models: [sc.model] });
    const r = JSON.parse(await svc.handle(JSON.stringify(sc.command(0))));
    expect(validResult(r), JSON.stringify(validResult.errors?.slice(0, 2))).toBe(true);
    expect(r).toMatchObject({ status: 'PREVIEW', previewId: expect.any(String), modelVersion: sc.model.version });
    const v = Object.fromEntries(r.patch.updated.filter((/** @type {any} */ u) => u.type === 'Vtx').map((/** @type {any} */ u) => [u.entity.id, u.entity.p]));
    expect(gap(v['v-s96'], [192, 0, 4.9])).toBeLessThan(1e-9);
    expect(v['v-s95'] === undefined || gap(v['v-s95'], sc.model.vertices['v-s95'].p) < 1e-9).toBe(true);
  });

  it('every scene answers its first request with a PREVIEW, stored by the API', async () => {
    const all = scenes();
    const svc = await createPreviewService({ models: all.map((s) => s.model) });
    for (const sc of all) {
      const r = JSON.parse(await svc.handle(JSON.stringify(sc.command(0))));
      expect(r.status, `${sc.id}: ${JSON.stringify(r.error ?? r.message)}`).toBe('PREVIEW');
    }
    expect(svc.api.previewCount()).toBe(all.length);
  });

  it('refuses a valley pushed below the ground: not a PREVIEW, nothing stored', async () => {
    const sc = sawtooth(97, true);
    const c = sc.command(0);
    c.payload.targetLine = [[192, 0, -1], [192, 8, -1]];
    const svc = await createPreviewService({ models: [sc.model] });
    const r = JSON.parse(await svc.handle(JSON.stringify(c)));
    expect(r.status).not.toBe('PREVIEW');
    expect(svc.api.previewCount()).toBe(0);
  });

  it('is deterministic: the same request on a fresh service gives the same reply bytes', async () => {
    const sc = gt03();
    const a = await (await createPreviewService({ models: [sc.model] })).handle(JSON.stringify(sc.command(3)));
    const b = await (await createPreviewService({ models: [sc.model] })).handle(JSON.stringify(sc.command(3)));
    expect(a).toBe(b);
  });

  it('collects every stage time of a request', async () => {
    const sc = gt03();
    const svc = await createPreviewService({ models: [sc.model] });
    /** @type {Record<string, number>} */
    const st = {};
    await svc.handle(JSON.stringify(sc.command(1)), st);
    expect(Object.keys(st).sort()).toEqual(['kernelAndApi', 'loadModel', 'parse', 'serialize', 'validateCommand', 'validateReply']);
  });
});
