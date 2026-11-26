// Runs the `datasets` port contract suite on the interim adapters of 3D-128 (memory, file); adds file-store specifics.
import { mkdtemp, open, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { datasetsContract } from './datasets-contract.js';
import { createByteDatasets } from '../src/datasets.js';
import { createMemoryByteStore } from '../src/adapters/memory-datasets-store.js';
import { createFileByteStore } from '../src/adapters/file-datasets-store.js';
import { entityTag } from '../src/ports/datasets.js';

const tmp = () => mkdtemp(join(tmpdir(), 'datasets-'));
/** @param {import('../src/ports/datasets.js').ByteStore} store */
const made = (store) => {
  const port = createByteDatasets(store);
  return { port, seed: port.createDataset };
};

datasetsContract('memory byte store', () => made(createMemoryByteStore()));
datasetsContract('file byte store', async () => made(createFileByteStore({ root: await tmp() })));

describe('interim datasets adapters', () => {
  it('a save keeps every earlier generation (no overwrite); createDataset is create-if-absent', async () => {
    const root = await tmp();
    const ds = createByteDatasets(createFileByteStore({ root }));
    expect(await ds.createDataset('d', new Uint8Array([1]))).toBe(true);
    expect(await ds.createDataset('d', new Uint8Array([2]))).toBe(false);
    const r = await ds.read('d');
    await ds.save('d', new Uint8Array([3]), /** @type {string} */ (r?.entityTag));
    expect(await readdir(join(root, 'ds', 'd'))).toEqual(['0.bin', '1.bin']);
    expect(entityTag.parse((await ds.read('d'))?.entityTag)?.n).toBe(1);
  });

  it('entity tags: format and parse round-trip; malformed tags do not parse', () => {
    const d = 'a'.repeat(64);
    expect(entityTag.parse(entityTag.format(7, d))).toEqual({ n: 7, digest: d });
    for (const t of [`7.${d}`, `W/"7.${d}"`, `"07.${d}"`, `"-1.${d}"`, `"7.${'A'.repeat(64)}"`, 7, undefined]) expect(entityTag.parse(t)).toBeUndefined();
  });

  it('file store: keys stay under the root; a file still being filled is re-read; a damaged one throws', async () => {
    const root = await tmp();
    const s = createFileByteStore({ root, settleMs: 50 });
    await expect(s.create('a/../../x.bin', new Uint8Array())).rejects.toThrow(/invalid key/);
    await expect(s.get('/abs')).rejects.toThrow(/invalid key/);
    expect(await s.create('empty.bin', new Uint8Array())).toBe(true);
    expect(await s.get('empty.bin')).toEqual(new Uint8Array());
    const fh = await open(join(root, 'late.bin'), 'wx');
    const reading = s.get('late.bin');
    const ok = await tmp();
    await createFileByteStore({ root: ok }).create('k.bin', new Uint8Array([9, 8]));
    await fh.writeFile(await readFile(join(ok, 'k.bin')));
    await fh.close();
    expect(await reading).toEqual(new Uint8Array([9, 8]));
    const t = await open(join(root, 'cut.bin'), 'wx');
    await t.writeFile(Buffer.from('partial'));
    await t.close();
    await expect(s.get('cut.bin')).rejects.toThrow(/not complete/);
  });
});
