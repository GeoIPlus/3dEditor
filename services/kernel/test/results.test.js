// Results through the `datasets` port (3D-128; 3D-ADR-0003 §4 and "Checks"): save to `progress.save` (no stored tag ->
// no `PUT`; `412` -> kept), delivered bytes and their address (https, no query string, no credential).
import { describe, expect, it, vi } from 'vitest';
import { createByteDatasets } from '../src/datasets.js';
import { createMemoryByteStore } from '../src/adapters/memory-datasets-store.js';
import { deliverResult, deliveredAddress, saveResult } from '../src/results.js';
import { sha256 } from '../src/ports/datasets.js';

const P = 'prj r/1', REF = 'progress-save/bld-1';
const enc = (/** @type {string} */ s) => new TextEncoder().encode(s);
const BASE = 'https://kernel.example.test/3dqm';

async function setup() {
  const datasets = createByteDatasets(createMemoryByteStore());
  await datasets.createDataset(REF, enc('{"input":1}'));
  const tag = /** @type {string} */ ((await datasets.read(REF))?.entityTag);
  return { datasets, tag };
}

// Fixtures: the scenarios of Operaflow@d2b679c `format/tests/scenarios/progress.json` for `location-saved-by-put`,
// `location-no-entity-tag-not-saved` and `save-not-2xx-kept`, restated on the port (the scenario's GET is the import
// read; its `etag` is the stored basis).
describe('saveResult (progress.save, whole-body PUT)', () => {
  it('location-saved-by-put: read with a strong tag -> PUT with If-Match of that tag -> SAVED', async () => {
    const { datasets, tag } = await setup();
    const save = vi.spyOn(datasets, 'save');
    const out = await saveResult({ datasets, projectId: P, ref: REF, bytes: enc('{"v":2}'), basis: { kind: 'tagged', entityTag: tag } });
    expect(save).toHaveBeenCalledWith(REF, enc('{"v":2}'), { ifMatch: tag });
    expect(out.status).toBe('SAVED');
    const r = await datasets.read(REF);
    expect(new TextDecoder().decode(r?.bytes)).toBe('{"v":2}');
    expect(out.status === 'SAVED' && out.entityTag).toBe(r?.entityTag);
  });

  it('location-saved-by-put: not read or read found none -> PUT with If-None-Match: * creates the dataset', async () => {
    const { datasets } = await setup();
    const save = vi.spyOn(datasets, 'save');
    const out = await saveResult({ datasets, projectId: P, ref: 'progress-save/bld-2', bytes: enc('{"n":1}'), basis: { kind: 'absent' } });
    expect(save).toHaveBeenCalledWith('progress-save/bld-2', enc('{"n":1}'), { ifNoneMatch: '*' });
    expect(out.status).toBe('SAVED');
    expect(await saveResult({ datasets, projectId: P, ref: REF, bytes: enc('{"n":1}'), basis: { kind: 'absent' } }))
      .toMatchObject({ status: 'KEPT' });
  });

  it('location-no-entity-tag-not-saved: read found the dataset without a strong tag -> no PUT, operator told', async () => {
    const { datasets } = await setup();
    const save = vi.spyOn(datasets, 'save');
    const before = await datasets.read(REF);
    for (const basis of [{ kind: 'untagged' }, { kind: 'tagged', entityTag: '' }, undefined]) {
      expect(await saveResult({ datasets, projectId: P, ref: REF, bytes: enc('{"v":2}'), basis: /** @type {any} */ (basis) }))
        .toEqual({ status: 'NOT_SAVED', reason: 'NO_ENTITY_TAG' });
    }
    expect(save).not.toHaveBeenCalled();
    expect(await datasets.read(REF)).toEqual(before);
  });

  it('save-not-2xx-kept: a 412 keeps the results (KEPT, bytes readable), the dataset unchanged', async () => {
    const { datasets, tag } = await setup();
    await saveResult({ datasets, projectId: P, ref: REF, bytes: enc('{"other":1}'), basis: { kind: 'tagged', entityTag: tag } });
    const before = await datasets.read(REF);
    const bytes = enc('{"mine":1}');
    const out = await saveResult({ datasets, projectId: P, ref: REF, bytes, basis: { kind: 'tagged', entityTag: tag } });
    expect(out).toEqual({ status: 'KEPT', reason: 'PRECONDITION_FAILED', digest: sha256(bytes) });
    expect(await datasets.readDelivered(P, sha256(bytes))).toEqual(bytes);
    expect(await datasets.read(REF)).toEqual(before);
  });
});

describe('delivered bytes', () => {
  it('address: https, no query string, no credential, no fragment; a second delivery is a no-op', async () => {
    const { datasets } = await setup();
    const bytes = enc('{"export":1}');
    const a = await deliverResult({ datasets, publicBase: BASE, projectId: P, bytes });
    const b = await deliverResult({ datasets, publicBase: BASE, projectId: P, bytes });
    expect(a).toMatchObject({ digest: sha256(bytes), created: true });
    expect(b).toEqual({ ...a, created: false });
    const u = new URL(a.address);
    expect(u.protocol).toBe('https:');
    expect([u.search, u.hash, u.username, u.password]).toEqual(['', '', '', '']);
    expect(a.address).toBe(`https://kernel.example.test/3dqm/api/projects/prj%20r%2F1/results/${a.digest}`);
  });

  it('refuses a base that is not https or carries a query, fragment or credential; refuses a bad digest', () => {
    const d = sha256(enc('x'));
    for (const base of ['http://k.test', 'https://u:pw@k.test', 'https://tok@k.test', 'https://k.test/?sig=1', 'https://k.test/?',
      'https://k.test/#x', 'not a url']) expect(() => deliveredAddress(base, P, d)).toThrow(TypeError);
    expect(() => deliveredAddress(BASE, P, 'abc')).toThrow(/invalid digest/);
    expect(deliveredAddress('https://k.test/', P, d)).toBe(`https://k.test/api/projects/prj%20r%2F1/results/${d}`);
  });
});
