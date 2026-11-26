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

describe('saveResult (progress.save, whole-body PUT + If-Match)', () => {
  it('with the stored tag of the import read -> SAVED, the dataset holds the result', async () => {
    const { datasets, tag } = await setup();
    const out = await saveResult({ datasets, projectId: P, ref: REF, bytes: enc('{"v":2}'), entityTag: tag });
    expect(out.status).toBe('SAVED');
    expect(new TextDecoder().decode((await datasets.read(REF))?.bytes)).toBe('{"v":2}');
  });

  it('without a stored entity tag the PUT is not sent; the operator is told NO_ENTITY_TAG', async () => {
    const { datasets } = await setup();
    const save = vi.spyOn(datasets, 'save');
    const before = await datasets.read(REF);
    for (const entityTag of [undefined, null, '']) {
      expect(await saveResult({ datasets, projectId: P, ref: REF, bytes: enc('{"v":2}'), entityTag }))
        .toEqual({ status: 'NOT_SAVED', reason: 'NO_ENTITY_TAG' });
    }
    expect(save).not.toHaveBeenCalled();
    expect(await datasets.read(REF)).toEqual(before);
  });

  it('a 412 keeps the result: KEPT with its digest, bytes readable, the dataset unchanged', async () => {
    const { datasets, tag } = await setup();
    await saveResult({ datasets, projectId: P, ref: REF, bytes: enc('{"other":1}'), entityTag: tag });
    const before = await datasets.read(REF);
    const bytes = enc('{"mine":1}');
    const out = await saveResult({ datasets, projectId: P, ref: REF, bytes, entityTag: tag });
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
